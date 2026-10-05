/**
 * dsh-session-health — small shared helpers.
 */
/** Compact token formatting: 123456 -> 123K, 1234567 -> 1.2M, 10000000 -> 10M. */
export declare function formatCompact(n: number): string;
/** Hit rate display: integer percent, Math.round — matches the core input-bar stats line. */
export declare function formatHitRate(rate: number): string;
/** USD formatting for per-round cost: >= $100 rounded, else 2 decimals ($0.02, $1.25, $45.00 -> $45). */
export declare function formatUsd(v: number): string;
/** CNY formatting: ¥0.15 (2 decimals, money convention). */
export declare function formatCny(v: number): string;
/** Peak/valley period labels used by the money notes. */
export declare const PERIOD_LABEL: Record<'peak' | 'offpeak', string>;
