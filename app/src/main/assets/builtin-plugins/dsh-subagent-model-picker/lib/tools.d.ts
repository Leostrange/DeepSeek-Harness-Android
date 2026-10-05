/**
 * dsh-subagent-model-picker — model-facing tools.
 *
 * `subagent_model`: delegation with per-call provider / model / max_tokens.
 * Passing `model: "auto"` delegates model choice to the built-in auto policy:
 * the task is classified into a tier (trivial / standard / complex), a model
 * is picked from the resolved provider's catalog, and the decision with its
 * reason is recorded on the tool result. Foreground calls retry once on the
 * next tier up after a failed run (`autoEscalate`).
 * `subagent_models`: read-only catalog of live LLM provider routes and their
 * model listings (advisory; catalog membership never gates requests — it only
 * informs the delegating model).
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ModelPickerConfig } from './index.ts';
/**
 * Register the model-facing tools into `ctx.tools`. Returns the disposer that
 * unregisters both, owned by the caller's fiber.
 */
export declare function registerModelPickerTools(ctx: Context, config: Required<ModelPickerConfig>): () => void;
