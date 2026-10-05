import { assess } from "./assess.js";
import { PERIOD_LABEL, formatCny, formatCompact, formatHitRate, formatUsd } from "./util.js";
const SEVERITY_LABEL = {
    green: 'Зелёный',
    blue: 'Синий',
    yellow: 'Жёлтый',
    red: 'Красный',
};
const FIRST_LINE = {
    green: '**Можно продолжать**',
    blue: '**Продолжайте, следите за контекстом**',
    yellow: '**Завершите текущий этап**',
    red: '**Завершите работу и подготовьте передачу контекста**',
};
/** Project the assessment into the user-facing report text. */
export function buildCommandText(report, opts) {
    const s = report.signals;
    const lines = [
        FIRST_LINE[report.severity] + ` (здоровье: **${SEVERITY_LABEL[report.severity]}**）`,
        '',
        report.reason,
        '',
        'Подробности: ',
    ];
    if (s.turns !== null) {
        lines.push(`- Размер сессии：${s.turns} витков / ${s.userMessages ?? 0} сообщений / ${s.assistantMessages ?? 0} ответов`);
    }
    if (s.total !== null) {
        lines.push(`- Вход за виток: около ${formatCompact(s.total)} token${s.ratio !== null ? `（窗口 ${Math.round(s.ratio * 100)}%）` : ''}${s.window !== null ? `；窗口 ${formatCompact(s.window)}` : ''}`);
    }
    if (s.cacheHitRate !== null) {
        lines.push(`- Доля из кэша ${formatHitRate(s.cacheHitRate)} (последний запрос; высокий кэш снижает стоимость, сжатие его сбрасывает)`);
    }
    if (s.effectivePerRoundCny !== null && s.effectivePerRoundCny !== undefined && s.effectivePerRoundUsd !== null && s.effectivePerRoundUsd !== undefined) {
        lines.push(`- Ожидаемая стоимость：Около ${formatCny(s.effectivePerRoundCny)}/виток（≈${formatUsd(s.effectivePerRoundUsd)}; вход ¥${s.inputMissPerMCny ?? 0}/M / $${s.inputMissPerMUsd ?? 0} ${s.pricePeriod !== null ? PERIOD_LABEL[s.pricePeriod] : ''}, кэш ¥${s.inputHitPerMCny ?? 0}/M / $${s.inputHitPerMUsd ?? 0}, без выхода)`);
    }
    else if (s.effectivePerRoundUsd !== null && s.effectivePerRoundUsd !== undefined) {
        lines.push(`- Ожидаемая стоимость：Около ${formatUsd(s.effectivePerRoundUsd)}/виток (цена входа $${s.inputPricePerM ?? 0}/млн, кэш со скидкой, без выхода)`);
    }
    if (s.expectedTotalCny !== null && s.expectedTotalCny !== undefined && s.expectedTotalUsd !== null && s.expectedTotalUsd !== undefined && s.expectedTotalTokens !== null && s.expectedTotalTokens !== undefined) {
        lines.push(`- Ожидаемая стоимость оставшихся витков ≈ ${formatCny(s.expectedTotalCny)}（≈${formatUsd(s.expectedTotalUsd)}；Около ${formatCompact(s.expectedTotalTokens)} оплачиваемых токенов)`);
    }
    else if (s.expectedTotalUsd !== null && s.expectedTotalUsd !== undefined && s.expectedTotalTokens !== null && s.expectedTotalTokens !== undefined) {
        lines.push(`- Ожидаемая стоимость оставшихся витков ≈ ${formatUsd(s.expectedTotalUsd)}（Около ${formatCompact(s.expectedTotalTokens)} оплачиваемых токенов)`);
    }
    if (s.compactions > 0) {
        lines.push(`- Сжатий ${s.compactions} раз: ранние подробности сокращены, сохранены в Git`);
    }
    lines.push(...report.probes.map(p => '- ' + p));
    if (report.recommendation === 'danger-zone') {
        lines.push('- **Внимание:** перед переходом сохраните ранние решения в документе и коммите');
    }
    if (opts.minimal)
        lines.push('Режим minimal: основные показатели');
    if (report.severity === 'yellow' || report.severity === 'red') {
        const h = report.handoff;
        const commitItem = h.uncommittedCount !== null
            ? h.uncommittedCount === 0
                ? `- [x] Несохранённых изменений: 0 (последний коммит ${h.lastCommit ?? 'Неизвестно'}）`
                : `- [ ] Несохранённых изменений: ${h.uncommittedCount} (последний коммит ${h.lastCommit ?? 'Неизвестно'}）`
            : '- [ ] Не удалось проверить несохранённые изменения: Git или запуск процессов недоступен';
        const pushItem = h.branchLine !== null
            ? /ahead \d+/.test(h.branchLine)
                ? `- [ ] Коммиты отправлены: ${h.branchLine}`
                : `- [x] Ветка синхронизирована с сервером (${h.branchLine}）`
            : '- [ ] Отправка коммитов: требуется ручная проверка';
        const handoffItem = h.hasHandoff === true
            ? '- [x] Документ передачи готов'
            : h.hasHandoff === false
                ? '- [ ] Указанный документ передачи не найден'
                : '- [ ] Документ передачи не задан или недоступен';
        const processItem = h.runningProcesses.length > 0
            ? `- [x] Запущенные процессы: ${h.runningProcesses.join('、')} (проверьте перед переходом)`
            : h.processesChecked
                ? '- [x] Процессы проекта не обнаружены'
                : '- [ ] Процессы не проверены: проверьте сервер разработки и тесты вручную';
        lines.push('', 'Перед переходом в новую сессию: ', commitItem, pushItem, handoffItem, processItem);
    }
    return lines.join('\n');
}
/** Build the command definition (config closed over at mount time). */
export function healthCommandDefinition(ctx, config) {
    return {
        name: 'health',
        description: 'Оценить здоровье сессии и целесообразность продолжения. Параметры: minimal / no-git / no-handoff / doc=<файл передачи> / remaining=<оставшиеся витки> / processes',
        input: { hint: 'minimal | no-git | no-handoff | doc=<файл> | remaining=<витки> | processes' },
        handler: async (invocation) => {
            const session = invocation.agent.session;
            if (session === undefined)
                return { kind: 'error', text: 'Текущая сессия не найдена.' };
            const arg = (invocation.rawInput || '').trim();
            const minimal = arg === 'minimal';
            const noGit = minimal || arg.includes('no-git');
            const noHandoff = minimal || arg.includes('no-handoff');
            const docMatch = arg.match(/doc=(\S+)/);
            const remMatch = arg.match(/remaining=(\d+)/);
            const remaining = remMatch ? Number(remMatch[1]) : null;
            const report = await assess(ctx, session, invocation.agent.id, invocation.signal, config, {
                minimal,
                noGit,
                noHandoff,
                docName: docMatch ? docMatch[1] : null,
                checkProcesses: !minimal && (arg.includes('processes') || config.checks.processes.enabled),
                remainingRounds: remaining,
            });
            return { kind: 'success', text: buildCommandText(report, { minimal }) };
        },
    };
}
