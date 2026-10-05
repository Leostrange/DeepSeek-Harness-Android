/**
 * dsh-session-health — shared cache-hit computation.
 *
 * SINGLE algorithm location for the cache-hit rate. Both display surfaces of
 * this plugin (the badge tooltip client and the /health + session_health host
 * paths) call {@link cacheHitRateOf} on the SAME value the core input-bar
 * stats line reads — the core `tokenUsage` projection's session totals — so
 * every surface always shows one number.
 *
 * The formula mirrors the core UI's cacheHitPercent
 * (packages/client/ui-conversation/src/client/chat/StatsLine.tsx):
 *   cacheRead / (uncachedInput + cacheRead + cacheWrite)
 * The core keeps its own one-line copy operating on the same totals; if the
 * core formula ever changes, update it here once (and vice versa).
 */
/**
 * Cache-hit share of prompt-side input, over the WHOLE durable log — same
 * formula as the core input-bar stats line.
 * @param usage - the core tokenUsage projection value.
 * @returns the ratio 0..1, or null when no input was billed / value absent.
 */
export function cacheHitRateOf(usage) {
    if (usage === undefined)
        return null;
    const denominator = (usage.uncachedInputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
    return denominator > 0 ? (usage.cacheReadTokens ?? 0) / denominator : null;
}
