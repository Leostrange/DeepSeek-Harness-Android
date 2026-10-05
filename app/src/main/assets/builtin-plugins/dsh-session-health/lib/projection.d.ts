/**
 * dsh-session-health — the sessionHealth projection unit.
 *
 * A pure event fold with zero dependencies on other units: turns / messages /
 * compaction count from session events, plus last-wins provider pressure and
 * context window (the same events token-meter's units listen to). The view
 * applies the config thresholds and emits the severity + advice the badge
 * renders reactively — no polling, no per-refresh RPC.
 *
 * The pressure figure is the raw provider-anchored prompt-side sample
 * (input + cache traffic, no output), NOT the compaction-aware repricing
 * token-meter's contextPressure projection computes. When both units are
 * mounted the client prefers `contextPressure.projectedTokens` for the
 * occupancy bar and uses this unit for the verdict + counts.
 */
import type { SessionEvent } from '@deepseek-ai/dsh-session';
import type { ProjectionDefinition } from '@deepseek-ai/dsh-session-projection';
import type { SessionHealthProjection } from './types.ts';
import type { ResolvedConfig } from './config.ts';
import type { ResolvedPricing } from './pricing.ts';
/** Fold state (plain JSON per the unit contract — persisted-cache precondition). */
export interface SessionHealthState {
    turns: number;
    lastTurn: number | null;
    userMessages: number;
    assistantMessages: number;
    compactions: number;
    pressureTokens?: number;
    contextWindow?: number;
    /** Buckets of the most recent usage report (per-round money math). */
    lastUsage?: {
        inputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
    };
}
/** Pure transition: previous state + one committed event → next state. */
export declare function applyHealthEvent(state: SessionHealthState, event: SessionEvent): SessionHealthState;
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
export declare function healthView(state: SessionHealthState, config: ResolvedConfig, price?: ResolvedPricing): SessionHealthProjection;
/** Build the unit for one registration; the fold functions close over config. */
export declare function sessionHealthProjectionDefinition(config: ResolvedConfig, pricing?: {
    get(model?: string): ResolvedPricing;
}, modelOf?: () => string): ProjectionDefinition<'sessionHealth', SessionHealthState>;
