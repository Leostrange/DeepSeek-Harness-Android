/**
 * dsh-session-health — shared assessment core.
 *
 * One assess() feeds the /health command, the session_health tool, and (in
 * light form) the Remote service: exact token-meter measurement, model
 * window, event counts (projection snapshot preferred, sessionQuery
 * fallback), and optional git / handoff / process probes. Purely read-only —
 * no session mutation, no writes, no side effects beyond the read-only
 * probes.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Session } from '@deepseek-ai/dsh-session';
import type { ResolvedConfig } from './config.ts';
import type { PricePeriod } from './pricing.ts';
import type { HealthRecommendation, HealthSeverity } from './types.ts';
export interface HealthSignals {
    total: number | null;
    window: number | null;
    ratio: number | null;
    turns: number | null;
    userMessages: number | null;
    assistantMessages: number | null;
    compactions: number;
    /** Cache-hit ratio of the last request; null when unknown. */
    cacheHitRate: number | null;
    /** Billable-equivalent per round (uncached + cacheRead × discount); null when unknown. */
    effectivePerRound: number | null;
    /** effectivePerRound in USD (inputPricePerM basis); null when unknown. */
    effectivePerRoundUsd: number | null;
    /** effectivePerRound in CNY when an official pricing document is active; null otherwise. */
    effectivePerRoundCny: number | null;
    /** effectivePerRound × remaining rounds; null unless remainingRounds provided. */
    expectedTotalTokens: number | null;
    /** expectedTotalTokens in USD; null unless remainingRounds provided. */
    expectedTotalUsd: number | null;
    /** expectedTotalTokens in CNY when the official document is active; null otherwise. */
    expectedTotalCny: number | null;
    /** USD-normalized input price basis per 1M tokens (miss price × usdPerCny). */
    inputPricePerM: number;
    /** Official cache-miss input price per 1M in CNY; null in static mode. */
    inputMissPerMCny: number | null;
    /** Official cache-hit input price per 1M in CNY; null in static mode. */
    inputHitPerMCny: number | null;
    /** Official cache-miss input price per 1M in USD (static mode: the config value). */
    inputMissPerMUsd: number;
    /** Official cache-hit input price per 1M in USD. */
    inputHitPerMUsd: number;
    /** Current peak/off-peak period; null in static mode. */
    pricePeriod: PricePeriod;
}
export interface HandoffReadiness {
    isGitRepo: boolean | null;
    hasHandoff: boolean | null;
    runningProcesses: string[];
    /** True when the ps probe actually ran (even with zero findings). */
    processesChecked: boolean;
    /** True when git status --short is empty; null when not checked. */
    clean: boolean | null;
    /** Number of uncommitted changes; null when not checked. */
    uncommittedCount: number | null;
    /** HEAD line of `git log --oneline -1`; null when not checked. */
    lastCommit: string | null;
    /** `## branch...origin/branch [ahead N]` first line; null when not checked. */
    branchLine: string | null;
}
export interface HealthReport {
    severity: HealthSeverity;
    recommendation: HealthRecommendation;
    summary: string;
    reason: string;
    signals: HealthSignals;
    probes: string[];
    handoff: HandoffReadiness;
}
export interface AssessOptions {
    /** Core metrics only — skip every probe. */
    minimal?: boolean;
    noGit?: boolean;
    noHandoff?: boolean;
    /** User-named handoff document to check (in addition to config paths). */
    docName?: string | null;
    checkProcesses?: boolean;
    /** Model/user estimate of remaining rounds (economy refinement). */
    remainingRounds?: number | null;
    /** Work-nature self-check 1a: does the work depend on early content? */
    dependsOnEarly?: boolean;
    /** Work-nature self-check 1b: are early decisions recorded (git/docs)? */
    earlyDecisionRecorded?: boolean;
}
/** The full read-only assessment. */
export declare function assess(ctx: Context, session: Session, agentId: string | undefined, signal: AbortSignal, config: ResolvedConfig, opts?: AssessOptions): Promise<HealthReport>;
