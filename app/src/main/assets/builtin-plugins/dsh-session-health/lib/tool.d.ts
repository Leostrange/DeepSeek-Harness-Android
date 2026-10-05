/**
 * dsh-session-health — the session_health tool.
 *
 * Model-callable read-only assessment: the model self-checks the work-nature
 * questions (1a dependsOnEarly / 1b earlyDecisionRecorded / 4 remainingRounds)
 * while the host measures everything else exactly. Returns a structured
 * verdict + signals + handoff readiness; a full markdown report rides along
 * when the threshold tier is reached. No ask-gating, no side effects.
 */
import type { Context } from '@deepseek-ai/cordis';
import { type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ResolvedConfig } from './config.ts';
/** Build the model-facing tool (config closed over at mount time). */
export declare function sessionHealthTool(ctx: Context, config: ResolvedConfig): ToolDefinition;
