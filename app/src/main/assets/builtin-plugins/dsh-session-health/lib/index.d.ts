/**
 * dsh-session-health — Host half.
 *
 * One plugin, three surfaces, one shared read-only assessment core:
 * - `sessionHealth` projection unit — reactive badge data (push frames, no
 *   polling, no Remote: community plugins cannot expose a Remote to the
 *   browser client — the client mounts a fixed generated list, see schemas.ts)
 * - `session_health` tool — model-callable self-check in long tasks
 * - `/health` command — user-initiated full textual report
 *
 * Data sources (all read-only, all real):
 * - ctx.tokenMeter.measure(session) — exact per-round input pressure
 * - llm.resolveModelInfo — model context window
 * - sessionQuery / sessionProjections — message/turn/compaction counts
 * - fs + sandboxPolicy — optional git / handoff-doc probes
 * - ctx.subprocess — optional read-only process probe
 */
import { Context } from '@deepseek-ai/cordis';
import { Config, type Config as ConfigType } from './config.ts';
export { Config } from './config.ts';
export { sessionHealthProjectionDefinition, applyHealthEvent, healthView } from './projection.ts';
export { assess, type HealthReport, type AssessOptions } from './assess.ts';
export { healthCommandDefinition, buildCommandText } from './command.ts';
export { sessionHealthTool } from './tool.ts';
export { buildOverview, sortOverviewRows, rankOf, handleOverviewRpc, type OverviewRow } from './overview.ts';
export type * from './types.ts';
export declare const name = "dsh-session-health";
/**
 * Cordis plugin — OBJECT form (never a factory).
 *
 * The loader mounts `module.default` directly through `ctx.plugin()`: a
 * FUNCTION default is treated as the plugin body and invoked as
 * `(ctx, config)`, so a factory that merely RETURNS `{ apply }` is silently
 * ignored — no error, entry shows ACTIVE, apply never runs. The default
 * export must BE the plugin object (knowledge-sqlite hit this exact pitfall
 * on mount; fixed the same way).
 */
declare const _default: {
    name: string;
    Config: import("@deepseek-ai/schemastery").default<Config>;
    apply(ctx: Context, config?: ConfigType): void;
};
export default _default;
