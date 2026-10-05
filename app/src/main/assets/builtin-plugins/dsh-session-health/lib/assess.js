import { healthView } from "./projection.js";
import { cacheHitRateOf } from "./usage.js";
import { formatCompact, formatHitRate, formatUsd } from "./util.js";
import { PERIOD_LABEL, formatCny } from "./util.js";
/** Exact per-round input pressure through the token meter. */
function measureTokens(ctx, session) {
    const tokenMeter = ctx.get('tokenMeter');
    if (tokenMeter === undefined)
        return null;
    try {
        const m = tokenMeter.measure(session);
        return typeof m === 'object' && m !== null && typeof m.totalTokens === 'number' ? m.totalTokens : null;
    }
    catch {
        return null;
    }
}
/** Read the current model's context window through the session's route. */
async function resolveWindow(ctx, session) {
    const agentDefaultModel = ctx.get('agentDefaultModel');
    const llm = ctx.get('llm');
    if (agentDefaultModel === undefined || llm === undefined)
        return null;
    try {
        const sel = agentDefaultModel.currentSelection();
        const info = await llm.resolveModelInfo(sel.provider, sel.model);
        const window = info?.context?.contextWindow;
        return typeof window === 'number' && window > 0 ? window : null;
    }
    catch {
        return null;
    }
}
/** Event counts + core projection values: sessionHealth snapshot (O(1)) preferred, sessionQuery fallback. */
async function readCounts(ctx, session, agentId, signal) {
    const registry = ctx.get('sessionProjections');
    if (registry !== undefined) {
        try {
            const values = registry.snapshot(session).values;
            const value = values.sessionHealth;
            if (value !== undefined) {
                return {
                    counts: { turns: value.turns, user: value.userMessages, assistant: value.assistantMessages },
                    compactions: value.compactions,
                    snapshot: value,
                    // The cache-hit rate rides the CORE tokenUsage projection — the
                    // same value the input-bar stats line shows (src/usage.ts formula).
                    tokenUsage: values.tokenUsage,
                };
            }
        }
        catch { /* fall through to sessionQuery */ }
    }
    const sessionQuery = ctx.get('sessionQuery');
    if (sessionQuery === undefined || agentId === undefined) {
        return { counts: { turns: null, user: null, assistant: null }, compactions: 0 };
    }
    try {
        const events = await sessionQuery.listEvents(agentId, { signal });
        let turns = 0;
        let user = 0;
        let assistant = 0;
        for (const e of events) {
            const t = e.type ?? e.event?.type ?? '';
            if (t === 'turn/start')
                turns++;
            else if (t === 'user/message')
                user++;
            else if (t === 'assistant/message')
                assistant++;
        }
        return { counts: { turns, user, assistant }, compactions: 0 };
    }
    catch {
        return { counts: { turns: null, user: null, assistant: null }, compactions: 0 };
    }
}
/** Workspace root for probes: sandboxPolicy → session header cwd. */
function workspaceCwd(ctx, session) {
    const sandboxPolicy = ctx.get('sandboxPolicy');
    if (sandboxPolicy !== undefined) {
        const root = sandboxPolicy.workspaceRoot;
        if (typeof root === 'string' && root.length > 0)
            return root;
    }
    try {
        const cwd = session.header?.cwd;
        return typeof cwd === 'string' && cwd.length > 0 ? cwd : null;
    }
    catch {
        return null;
    }
}
/** Read-only `.git` existence probe through the fs service. */
async function probeGit(ctx, cwd, signal, probes) {
    const fs = ctx.get('fs');
    if (fs === undefined) {
        probes.push('Проверка Git пропущена: файловая система недоступна');
        return null;
    }
    try {
        const t = await fs.resolve('.git', { cwd, signal });
        const stat = await fs.stat(t, signal);
        const found = stat !== undefined;
        probes.push(found ? 'Репозиторий Git: ранняя работа сохранена' : 'В папке нет Git: восстановление по журналу сессии DSH');
        return found;
    }
    catch {
        probes.push('Проверка Git не удалась');
        return null;
    }
}
/**
 * Read-only git worktree probe through ctx.subprocess (whitelisted argv only:
 * `git status --short`, `git log --oneline -1`, `git status -sb`). Feeds the
 * handoff checklist's commit/push items with real state. Returns null when
 * the subprocess seam is absent, the repo is not a git worktree, or a
 * command fails (sandbox denial included) — the checklist then reports the
 * item as unchecked with a note, never as done.
 */
async function probeGitState(ctx, cwd, signal, probes) {
    const subprocess = ctx.get('subprocess');
    if (subprocess === undefined)
        return null;
    const run = async (argv) => {
        try {
            const handle = subprocess.spawn({
                argv: ['git', ...argv],
                cwd,
                stdio: { stdout: 'collect', stderr: 'collect' },
                graceMs: 5000,
                signal,
            });
            const outcome = await handle.done;
            if (outcome.exitCode !== 0)
                return null;
            return handle.collected?.stdout?.readFrom(0)?.text ?? '';
        }
        catch {
            return null;
        }
    };
    const [status, log, branch] = await Promise.all([
        run(['status', '--short']),
        run(['log', '--oneline', '-1']),
        run(['status', '-sb']),
    ]);
    if (status === null || log === null || branch === null) {
        probes.push('Не удалось проверить рабочую копию Git: запуск процесса недоступен');
        return null;
    }
    const uncommitted = status.trim() === '' ? 0 : status.trim().split('\n').length;
    const lastCommit = log.trim() || null;
    const branchLine = branch.split('\n')[0]?.trim() || null;
    probes.push(uncommitted === 0
        ? `Рабочая копия Git чиста (последний коммит ${lastCommit ?? 'Неизвестно'}）`
        : `Рабочая копия Git: ${uncommitted} несохранённых изменений (последний коммит ${lastCommit ?? 'Неизвестно'}）`);
    if (branchLine !== null && /ahead \d+/.test(branchLine)) {
        probes.push(`Ветка Git: ${branchLine} (перед переходом отправьте коммиты)`);
    }
    return { clean: uncommitted === 0, uncommitted, lastCommit, branchLine };
}
/** Handoff-document probe: only names the user configured or passed inline. */
async function probeHandoff(ctx, cwd, signal, config, docName, probes) {
    const fs = ctx.get('fs');
    if (fs === undefined) {
        probes.push('Проверка документа передачи пропущена: файловая система недоступна');
        return null;
    }
    const candidates = [...(docName !== null ? [docName] : []), ...config.checks.handoff.paths];
    if (candidates.length === 0) {
        probes.push('Путь документа передачи не задан. Укажите checks.handoff.paths или /health doc=файл');
        return null;
    }
    for (const name of candidates) {
        try {
            const t = await fs.resolve(name, { cwd, signal });
            const stat = await fs.stat(t, signal);
            if (stat !== undefined) {
                probes.push('Документ передачи готов');
                return true;
            }
        }
        catch { /* keep probing */ }
    }
    probes.push(`Документ передачи не найден (проверены: ${candidates.join('、')}）`);
    return false;
}
/** Read-only process probe: ps via ctx.subprocess, filtered to the workspace. */
async function probeProcesses(ctx, cwd, signal, probes) {
    const subprocess = ctx.get('subprocess');
    if (subprocess === undefined) {
        probes.push('Проверка процессов пропущена: запуск процессов недоступен');
        return [];
    }
    try {
        const handle = subprocess.spawn({
            argv: ['ps', '-axo', 'pid=,command='],
            cwd,
            stdio: { stdout: 'collect', stderr: 'collect' },
            graceMs: 5000,
            signal,
        });
        const outcome = await handle.done;
        if (outcome.exitCode !== 0)
            throw new Error(`ps exited with ${String(outcome.exitCode)}`);
        const text = handle.collected?.stdout?.readFrom(0)?.text ?? '';
        const base = cwd.split(/[\\/]/).pop() ?? '';
        const markers = ['vite', 'webpack', 'tsc --watch', 'nodemon', 'next', 'astro', 'esbuild', 'dev-server', 'dsh dev'];
        const found = new Set();
        for (const line of text.split('\n')) {
            const cmd = line.replace(/^\s*\d+\s+/, '').trim();
            if (cmd === '' || cmd.startsWith('ps '))
                continue;
            const hit = (base.length > 2 && cmd.includes(base)) || markers.some(m => cmd.includes(m));
            if (!hit)
                continue;
            const first = cmd.split(' ')[0]?.split('/').pop();
            if (first !== undefined && first.length > 0 && !found.has(first))
                found.add(first);
            if (found.size >= 5)
                break;
        }
        const running = [...found];
        probes.push(running.length > 0
            ? `Обнаружено ${running.length} процессов проекта (${running.join('、')}）`
            : 'Процессы проекта не обнаружены');
        return running;
    }
    catch {
        probes.push('Не удалось проверить процессы');
        return [];
    }
}
/** The full read-only assessment. */
export async function assess(ctx, session, agentId, signal, config, opts = {}) {
    const probes = [];
    const cwd = workspaceCwd(ctx, session);
    const total = measureTokens(ctx, session);
    const window = await resolveWindow(ctx, session);
    const ratio = total !== null && window !== null && window > 0 ? total / window : null;
    const { counts, compactions, snapshot, tokenUsage } = await readCounts(ctx, session, agentId, signal);
    // Live pricing (ctx-provided cache when mounted; static config otherwise) —
    // resolved before the view so the severity bills the same cache-discounted
    // figure the projection unit uses.
    const pricingCache = ctx.get('sessionHealthPricing');
    const model = (() => {
        try {
            const sel = ctx.get('agentDefaultModel')?.currentSelection();
            return sel?.model ?? '';
        }
        catch {
            return '';
        }
    })();
    const price = pricingCache !== undefined ? pricingCache.get(model) : null;
    // Severity via the exact same view the projection unit uses (config thresholds).
    // The projection's usage buckets ride its pushed value; reconstruct the fold
    // state's lastUsage so the economy dimension bills the same effectivePerRound.
    const usage = snapshot !== undefined && snapshot.uncachedInputTokens !== null && snapshot.uncachedInputTokens !== undefined
        && snapshot.cacheReadTokens !== null && snapshot.cacheReadTokens !== undefined
        ? { inputTokens: snapshot.uncachedInputTokens, cacheReadTokens: snapshot.cacheReadTokens, cacheWriteTokens: 0 }
        : null;
    const state = {
        turns: counts.turns ?? 0,
        lastTurn: null,
        userMessages: counts.user ?? 0,
        assistantMessages: counts.assistant ?? 0,
        compactions,
        ...(total !== null ? { pressureTokens: total } : {}),
        ...(window !== null ? { contextWindow: window } : {}),
        ...(usage !== null ? { lastUsage: usage } : {}),
    };
    const view = healthView(state, config, price ?? undefined);
    // Work-nature (dimension B) folding into the recommendation.
    let recommendation;
    switch (view.severity) {
        case 'red':
        case 'yellow':
            recommendation = opts.dependsOnEarly === true && opts.earlyDecisionRecorded !== true
                ? 'danger-zone'
                : 'suggest-switch';
            break;
        case 'blue':
            recommendation = 'continue-with-note';
            break;
        default:
            recommendation = 'continue';
    }
    // Probes (skipped in minimal mode / by flags / by config).
    const gitEnabled = config.checks.git.enabled && !opts.noGit && !opts.minimal;
    const handoffEnabled = config.checks.handoff.enabled && !opts.noHandoff && !opts.minimal;
    const processEnabled = config.checks.processes.enabled && opts.checkProcesses === true && !opts.minimal;
    let isGitRepo = null;
    let hasHandoff = null;
    let runningProcesses = [];
    let processesChecked = false;
    let clean = null;
    let uncommittedCount = null;
    let lastCommit = null;
    let branchLine = null;
    if (cwd !== null) {
        if (gitEnabled) {
            isGitRepo = await probeGit(ctx, cwd, signal, probes);
            // Automate the handoff checklist's commit/push items with real state.
            if (isGitRepo === true) {
                const gitState = await probeGitState(ctx, cwd, signal, probes);
                if (gitState !== null) {
                    clean = gitState.clean;
                    uncommittedCount = gitState.uncommitted;
                    lastCommit = gitState.lastCommit;
                    branchLine = gitState.branchLine;
                }
            }
        }
        else if (opts.noGit)
            probes.push('Проверка Git пропущена');
        if (handoffEnabled)
            hasHandoff = await probeHandoff(ctx, cwd, signal, config, opts.docName ?? null, probes);
        else if (opts.noHandoff)
            probes.push('Проверка документа передачи пропущена');
        if (processEnabled) {
            runningProcesses = await probeProcesses(ctx, cwd, signal, probes);
            processesChecked = true;
        }
    }
    else {
        probes.push('Папка проекта неизвестна: проверки Git, документа передачи и процессов пропущены');
    }
    if (!opts.minimal && config.checks.sessionResume.enabled) {
        probes.push('DSH автоматически сохраняет сессии; их можно восстановить из списка');
    }
    // Cache-hit accounting + cost expectation. The cache-hit RATE rides the
    // core tokenUsage projection (single algorithm in src/usage.ts — same
    // value the input-bar stats line shows); the money buckets ride the
    // sessionHealth projection snapshot read above (the exact tokenMeter
    // measurement stays the primary pressure source).
    const cacheHitRate = cacheHitRateOf(tokenUsage);
    let effectivePerRound = null;
    let effectivePerRoundUsd = null;
    let effectivePerRoundCny = null;
    let pricePeriodFromProjection = null;
    if (snapshot !== undefined) {
        // `?? null`: a snapshot missing a newer field must read as null, not
        // undefined — `!== null` checks elsewhere would then treat it as known.
        effectivePerRound = snapshot.effectivePerRound ?? null;
        effectivePerRoundUsd = snapshot.effectivePerRoundUsd ?? null;
        effectivePerRoundCny = snapshot.effectivePerRoundCny ?? null;
        pricePeriodFromProjection = snapshot.pricePeriod ?? null;
    }
    if (cacheHitRate !== null) {
        probes.push(`Доля из кэша ${formatHitRate(cacheHitRate)} (за сессию, совпадает со статистикой под полем ввода)`);
    }
    const expectedTotalTokens = effectivePerRound !== null
        && opts.remainingRounds !== null && opts.remainingRounds !== undefined
        ? effectivePerRound * opts.remainingRounds
        : null;
    const expectedTotalUsd = effectivePerRoundUsd !== null
        && opts.remainingRounds !== null && opts.remainingRounds !== undefined
        ? effectivePerRoundUsd * opts.remainingRounds
        : null;
    const expectedTotalCny = effectivePerRoundCny !== null
        && opts.remainingRounds !== null && opts.remainingRounds !== undefined
        ? effectivePerRoundCny * opts.remainingRounds
        : null;
    // Human-readable verdict. Yellow's reason branches on the same driver the
    // projection unit used: capacity (ratio ≥ windowHigh) or economy (billable-
    // equivalent per round, cache-discounted, against the window-scaled floor).
    const pct = ratio !== null ? Math.round(ratio * 100) : null;
    const capacityHigh = ratio !== null && ratio >= config.thresholds.windowHigh;
    const pricePeriod = price?.period ?? pricePeriodFromProjection;
    const inputMissPerMCny = price !== null ? price.missPerMCny : null;
    const inputHitPerMCny = price !== null ? price.hitPerMCny : null;
    const inputMissPerMUsd = price !== null ? price.missPerMUsd : config.cost.inputPricePerM;
    const inputHitPerMUsd = price !== null ? price.hitPerMUsd : inputMissPerMUsd * config.cost.cacheHitDiscount;
    const costNote = effectivePerRoundCny !== null && effectivePerRoundUsd !== null
        ? `Ожидаемая стоимость: около ${formatCny(effectivePerRoundCny)}/виток（≈${formatUsd(effectivePerRoundUsd)}; вход ¥${inputMissPerMCny ?? 0}/M / $${inputMissPerMUsd} ${pricePeriod !== null ? PERIOD_LABEL[pricePeriod] : ''}, кэш ¥${inputHitPerMCny ?? 0}/M / $${inputHitPerMUsd}, без выхода)`
        : effectivePerRoundUsd !== null
            ? `Ожидаемая стоимость: около ${formatUsd(effectivePerRoundUsd)}/виток (цена входа $${config.cost.inputPricePerM}/млн, кэш оплачивается по ${Math.round(config.cost.cacheHitDiscount * 100)}%, выход не включён)`
            : '';
    const remainingNote = opts.remainingRounds !== null && opts.remainingRounds !== undefined
        && opts.remainingRounds >= config.thresholds.economyRoundFloor
        ? `（剩余Около ${opts.remainingRounds} витков：${expectedTotalCny !== null
            ? `Ожидаемая стоимость входа ≈ ${formatCny(expectedTotalCny)}（≈${formatUsd(expectedTotalUsd ?? 0)}）`
            : expectedTotalUsd !== null
                ? `Ожидаемая стоимость входа ≈ ${formatUsd(expectedTotalUsd)}`
                : `При ${formatCompact(effectivePerRound ?? total ?? 0)} token/виток стоимость заметно накапливается`}）`
        : '';
    let reason;
    switch (view.severity) {
        case 'red':
            reason = `Контекст занимает ${pct}%: опасный уровень. Завершите этап и сохраните документ передачи и коммит.`;
            break;
        case 'yellow':
            reason = capacityHigh
                ? `Контекст занимает ${pct}%, ранний контекст сжимается. Для большого остатка работы новая сессия дешевле.${remainingNote}`
                : `Стоимость витка: около ${formatCompact(effectivePerRound ?? 0)} токенов с учётом скидки кэша. Для большого остатка работы новая сессия дешевле.${remainingNote}`;
            break;
        case 'blue':
            reason = `Заполнение контекста ${pct}% (средний уровень). Можно продолжать. Перед переходом сохраните контекст.`;
            break;
        default:
            reason = ratio !== null
                ? `Контекст занимает ${pct}%: места достаточно, переход не требуется.`
                : `Вход за виток: около ${formatCompact(total ?? 0)} токенов. Расход небольшой, переход не требуется.`;
    }
    if (recommendation === 'danger-zone') {
        reason += ' Работа зависит от раннего контекста, а решения не записаны. Перед переходом подготовьте передачу контекста.';
    }
    if (costNote !== '' && view.severity !== 'green')
        reason += ` ${costNote}`;
    const summary = {
        'danger-zone': 'Работа зависит от незаписанного раннего контекста. Сначала сохраните документ и коммит для передачи',
        'suggest-switch': 'Завершите текущий этап. Для большого остатка работы новая сессия дешевле',
        'continue-with-note': 'Можно продолжать, следите за заполнением контекста',
        continue: 'Можно продолжать',
    }[recommendation];
    return {
        severity: view.severity,
        recommendation,
        summary,
        reason,
        signals: {
            total,
            window,
            ratio,
            turns: counts.turns,
            userMessages: counts.user,
            assistantMessages: counts.assistant,
            compactions,
            cacheHitRate,
            effectivePerRound,
            effectivePerRoundUsd,
            effectivePerRoundCny,
            expectedTotalTokens,
            expectedTotalUsd,
            expectedTotalCny,
            inputPricePerM: inputMissPerMUsd,
            inputMissPerMCny,
            inputHitPerMCny,
            inputMissPerMUsd,
            inputHitPerMUsd,
            pricePeriod,
        },
        probes,
        handoff: {
            isGitRepo,
            hasHandoff,
            runningProcesses,
            processesChecked,
            clean,
            uncommittedCount,
            lastCommit,
            branchLine,
        },
    };
}
