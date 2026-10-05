/**
 * dsh-subagent-model-picker — model-chosen subagent delegation for DeepSeek Harness.
 *
 * The shipped `subagent` tool inherits the parent's model route (or a static
 * `agentOptions` in the composition row). This plugin registers a sibling tool
 * (`subagent_model`, name configurable) that lets the delegating model pick the
 * child's LLM provider route, model id, and output cap per call:
 *
 *   - `provider`  — an LLM provider route registered on `ctx.llm` (hard-validated
 *                   against `ctx.llm.listProviders()`; omitted → inherit parent).
 *   - `model`     — any model id the chosen provider accepts (passed through:
 *                   the harness treats catalogs as advisory — the DeepSeek
 *                   adapter accepts arbitrary ids, pi-ai validates configured
 *                   ones — so the provider itself owns model rejection).
 *   - `max_tokens`— per-child output cap (positive integer).
 *   - `model: "auto"`— built-in auto selection: the tool classifies the task
 *                   (trivial / standard / complex), picks a model from the
 *                   provider's catalog, records the decision with its reason
 *                   on the result, and retries once on the next tier after a
 *                   failed foreground run (`enableAuto` / `autoEscalate`).
 *
 * The child still runs through the ordinary `ctx.subagents` seam
 * (`resolveChildAgentOptions` merges per-child overrides over the parent's
 * route), so spawn/fork/in-process composition, depth accounting, delegation
 * policy, and continuable background children all behave exactly as they do
 * for the shipped tool. A companion read-only `subagent_models` tool lists the
 * live provider routes and their model catalogs so the model can make an
 * informed choice.
 *
 * 组合位置：host 平面（与 tool-subagent 相同 —— 它消费 host 的 `tools` /
 * `subagents` / `llm` 注册表，不发布服务，因此无需 isolate realm）。
 */
import type { Context } from '@deepseek-ai/cordis';
/** Plugin config; every field optional with a sane default. */
export interface ModelPickerConfig {
    /** The `ctx.subagents` provider name to start runs on (default `spawn`). */
    subagentProvider?: string;
    /** Model-facing delegation tool name (default `subagent_model`). */
    toolName?: string;
    /** Model-facing catalog tool name (default `subagent_models`). */
    modelsToolName?: string;
    /** Expose `run_in_background` on the delegation tool (default true). */
    enableRunInBackground?: boolean;
    /** Background policy (default `one-shot`); `continuable` needs the provider's `prepareContinuable`. */
    backgroundMode?: 'one-shot' | 'continuable';
    /** Register the `subagent_models` catalog tool (default true). */
    enableModelList?: boolean;
    /** Accept `model: "auto"` on the delegation tool (default true). */
    enableAuto?: boolean;
    /** After a failed foreground run, retry once on the next auto tier (default true). */
    autoEscalate?: boolean;
    /** Child depth cap (default 3; `'provider-managed'` sends no cap). */
    maxDepth?: number | 'provider-managed';
}
export declare const name = "dsh-subagent-model-picker";
export declare const inject: string[];
export declare const defaultConfig: {
    subagentProvider: string;
    toolName: string;
    modelsToolName: string;
    enableRunInBackground: true;
    backgroundMode: "one-shot";
    enableModelList: true;
    enableAuto: true;
    autoEscalate: true;
    maxDepth: number;
};
export declare function resolveConfig(config: ModelPickerConfig): Required<ModelPickerConfig>;
export declare function apply(ctx: Context, config?: ModelPickerConfig): void;
declare const _default: {
    name: string;
    inject: string[];
    apply: typeof apply;
};
export default _default;
