/**
 * dsh-session-health — the /health command.
 *
 * User-initiated full textual report: first-line action + severity, reason,
 * details (scale, per-round cost, window ratio, compaction, probes), and a
 * switch-readiness checklist when yellow/red. No emoji (cross-platform
 * consistent), no HTML — the renderer emits markdown text.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CommandDefinition } from '@deepseek-ai/dsh-commands';
import type { ResolvedConfig } from './config.ts';
import { type HealthReport } from './assess.ts';
/** Project the assessment into the user-facing report text. */
export declare function buildCommandText(report: HealthReport, opts: {
    minimal: boolean;
}): string;
/** Build the command definition (config closed over at mount time). */
export declare function healthCommandDefinition(ctx: Context, config: ResolvedConfig): CommandDefinition;
