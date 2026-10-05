/**
 * dsh-session-health — small shared helpers.
 */
/** Compact token formatting: 123456 -> 123K, 1234567 -> 1.2M, 10000000 -> 10M. */
export function formatCompact(n) {
    if (n >= 1_000_000) {
        const v = n / 1_000_000;
        return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + 'M';
    }
    if (n >= 1000)
        return Math.round(n / 1000) + 'K';
    return String(n);
}
/** Hit rate display: integer percent, Math.round — matches the core input-bar stats line. */
export function formatHitRate(rate) {
    return `${Math.round(rate * 100)}%`;
}
/** USD formatting for per-round cost: >= $100 rounded, else 2 decimals ($0.02, $1.25, $45.00 -> $45). */
export function formatUsd(v) {
    return v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`;
}
/** CNY formatting: ¥0.15 (2 decimals, money convention). */
export function formatCny(v) {
    return `¥${v.toFixed(2)}`;
}
/** Peak/valley period labels used by the money notes. */
export const PERIOD_LABEL = { peak: 'Пиковый тариф', offpeak: 'Льготный тариф' };
