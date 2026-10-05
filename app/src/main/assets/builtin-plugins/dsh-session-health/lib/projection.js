import { sessionHealthProjectionSchema } from "./schemas.js";
import { z } from "zod";
import { formatCompact } from "./util.js";
function init() {
    return { turns: 0, lastTurn: null, userMessages: 0, assistantMessages: 0, compactions: 0 };
}
/** Prompt-side pressure of one usage report: input plus cache traffic, no output. */
function pressureOf(usage) {
    return usage.inputTokens + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
}
/** The last-wins bucket record of one usage report. */
function bucketsOf(usage) {
    return {
        inputTokens: usage.inputTokens,
        cacheReadTokens: usage.cacheReadTokens ?? 0,
        cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    };
}
/** Pure transition: previous state + one committed event → next state. */
export function applyHealthEvent(state, event) {
    // Compaction events are appended by the compaction plugin and are not part
    // of the dsh-session union, so they are matched by name (same approach as
    // token-meter's surface fold).
    if (event.type === 'compaction/end') {
        return { ...state, compactions: state.compactions + 1 };
    }
    switch (event.type) {
        case 'step/end': {
            // Distinct turns only (step/end is the step lifecycle authority).
            if (state.lastTurn === event.data.turn)
                return state;
            return { ...state, turns: state.turns + 1, lastTurn: event.data.turn };
        }
        case 'user/message':
            return { ...state, userMessages: state.userMessages + 1 };
        case 'assistant/message': {
            const next = { ...state, assistantMessages: state.assistantMessages + 1 };
            if (event.data.usage === undefined)
                return next;
            return {
                ...next,
                pressureTokens: pressureOf(event.data.usage),
                lastUsage: bucketsOf(event.data.usage),
            };
        }
        case 'assistant/chunk': {
            if (event.data.chunk.type !== 'usage')
                return state;
            return {
                ...state,
                pressureTokens: pressureOf(event.data.chunk.usage),
                lastUsage: bucketsOf(event.data.chunk.usage),
            };
        }
        case 'request/context': {
            if (event.data.contextWindow === undefined)
                return state;
            return { ...state, contextWindow: event.data.contextWindow };
        }
        default:
            return state;
    }
}
/**
 * State → wire payload: severity + advice from the config thresholds.
 *
 * Priority mirrors the skill: economy (per-round billable cost, paid every
 * round) outranks capacity (window ratio); the message-count proxy annotates
 * only at the bottom tier (green → blue). The economy trigger bills the same
 * cache-discounted figure the badge displays (`effectivePerRound`), and its
 * floor scales with the model window — the 50K absolute default was
 * calibrated for ~128K-window models and would otherwise fire at single-digit
 * occupancy on 1M windows. The exact threshold values live in config, never
 * here.
 */
export function healthView(state, config, price) {
    const total = state.pressureTokens ?? null;
    const window = state.contextWindow ?? null;
    const ratio = total !== null && window !== null && window > 0 ? total / window : null;
    const t = config.thresholds;
    // Last-request buckets for the per-round money math. The cache-hit RATE is
    // deliberately NOT computed here: it lives in src/usage.ts and both the
    // badge and /health read the core `tokenUsage` projection (the same value
    // the input-bar stats line shows) — one data source, one algorithm spot.
    const lastUsage = state.lastUsage;
    const uncachedInputTokens = lastUsage?.inputTokens ?? null;
    const cacheReadTokens = lastUsage?.cacheReadTokens ?? null;
    // Money math: with an official pricing document the cache-hit ratio comes
    // from the official USD pair and each currency uses its own official miss
    // price (zh docs: CNY, en docs: USD — no conversion); static mode uses the
    // config's flat USD values.
    const missPerMUsd = price !== undefined ? price.missPerMUsd : config.cost.inputPricePerM;
    const hitPerMUsd = price !== undefined ? price.hitPerMUsd : missPerMUsd * config.cost.cacheHitDiscount;
    const discount = missPerMUsd > 0 ? hitPerMUsd / missPerMUsd : config.cost.cacheHitDiscount;
    const effectivePerRound = lastUsage !== undefined
        ? lastUsage.inputTokens + lastUsage.cacheReadTokens * discount
        : null;
    const effectivePerRoundUsd = effectivePerRound !== null
        ? effectivePerRound * missPerMUsd / 1_000_000
        : null;
    const effectivePerRoundCny = effectivePerRound !== null && price?.missPerMCny !== null && price?.missPerMCny !== undefined
        ? effectivePerRound * price.missPerMCny / 1_000_000
        : null;
    const pricePeriod = price?.period ?? null;
    // Severity ladder. Economy = billable-equivalent per round (what the badge
    // money row shows) against a floor that grows with the window:
    // max(economyTokenFloor, economyWindowRatio × window).
    const capacityHigh = ratio !== null && ratio >= t.windowHigh;
    const economyFloor = window !== null && window > 0
        ? Math.max(t.economyTokenFloor, window * t.economyWindowRatio)
        : t.economyTokenFloor;
    const economy = effectivePerRound !== null && effectivePerRound >= economyFloor;
    let severity = 'green';
    if (ratio !== null && ratio >= t.windowCritical)
        severity = 'red';
    else if (capacityHigh || economy)
        severity = 'yellow';
    else if (ratio !== null && ratio >= t.windowMid)
        severity = 'blue';
    // Message-count proxy (dimension-A annotation): a very long message history
    // means early detail is likely summarized even when occupancy looks low —
    // bottom-tier sessions escalate to "Внимание" instead of "Можно продолжать".
    const messages = state.userMessages + state.assistantMessages;
    const proxyHit = messages >= t.messageCountProxy;
    if (severity === 'green' && proxyHit)
        severity = 'blue';
    const pct = ratio !== null ? Math.round(ratio * 100) : null;
    const compacted = state.compactions > 0 ? ` (Сжатий ${state.compactions})` : '';
    let advice;
    switch (severity) {
        case 'red':
            advice = `Контекст занимает ${pct}%${compacted}, завершите текущий этап и подготовьте передачу контекста.`;
            break;
        case 'yellow':
            advice = capacityHigh
                ? `Контекст занимает ${pct}%${compacted}, завершите этап. Для большого остатка работы новая сессия дешевле.`
                : `Стоимость витка: около ${formatCompact(effectivePerRound ?? 0)} токенов с учётом скидки кэша. Для большого остатка работы новая сессия дешевле.`;
            break;
        case 'blue':
            advice = proxyHit && ratio !== null && ratio < t.windowMid
                ? `Число сообщений: ${messages}. Ранний контекст может быть сжат. Следите за заполнением окна.`
                : `Заполнение контекста ${pct}% (средний уровень), следите за заполнением окна.`;
            break;
        default:
            advice = ratio !== null ? `Места достаточно (Заполнение ${pct}%). Можно продолжать.` : 'Показатели в норме, можно продолжать.';
    }
    return {
        severity,
        advice,
        ratio,
        total,
        window,
        turns: state.turns,
        userMessages: state.userMessages,
        assistantMessages: state.assistantMessages,
        compactions: state.compactions,
        uncachedInputTokens,
        cacheReadTokens,
        effectivePerRound,
        effectivePerRoundUsd,
        effectivePerRoundCny,
        pricePeriod,
    };
}
/** Build the unit for one registration; the fold functions close over config. */
export function sessionHealthProjectionDefinition(config, pricing, modelOf) {
    return {
        key: 'sessionHealth',
        stateSchema: z.object({
            turns: z.number().int().nonnegative(),
            lastTurn: z.union([z.string(), z.number()]).nullable(),
            userMessages: z.number().int().nonnegative(),
            assistantMessages: z.number().int().nonnegative(),
            compactions: z.number().int().nonnegative(),
            pressureTokens: z.number().nonnegative().optional(),
            contextWindow: z.number().nonnegative().optional(),
            lastUsage: z.object({ inputTokens: z.number().nonnegative(), cacheReadTokens: z.number().nonnegative(), cacheWriteTokens: z.number().nonnegative() }).optional(),
        }),
        init,
        apply: applyHealthEvent,
        // The fold stays event-pure; only the money view reads the live price
        // cache (falls back to the static config when no cache is mounted).
        wire: {
            viewSchema: sessionHealthProjectionSchema,
            view: state => healthView(state, config, pricing?.get(modelOf?.() ?? '')),
        },
        // v7: cache-hit rate removed from this unit — it now reads the core
        // tokenUsage projection via src/usage.ts (single data source, single
        // algorithm location shared with the input-bar stats line).
        stateVersion: 8,
    };
}
