# dsh-subagent-model-picker

Model-chosen subagent delegation for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). The shipped `subagent` tool inherits the parent's model route; this plugin adds a sibling tool that lets the delegating model pick the child's LLM **provider**, **model**, and **output cap** per call — while everything else about the delegation (depth accounting, delegation policy, continuable background children, results) stays exactly on the standard `ctx.subagents` seam.

## Tools

| Tool | Purpose |
|---|---|
| `subagent_model` | Delegate a task to a subagent with per-call `provider` / `model` / `max_tokens`. Omitted fields inherit the calling agent's route. Pass `model: "auto"` to delegate model choice to the built-in auto policy. |
| `subagent_models` | Read-only catalog of the live LLM provider routes (`ctx.llm.listProviders()`) and each provider's advertised model listing. |

### How model selection works

- **`provider`** is hard-validated against the routes registered on `ctx.llm` (e.g. `deepseek-official`, or any pi-ai route your settings declare). An unknown route fails immediately with the list of registered ones.
- **`model`** is passed through untouched. The harness treats model catalogs as advisory: the DeepSeek adapter accepts arbitrary model ids, while a pi-ai route rejects models its profile does not configure — so the provider itself owns model rejection, exactly as it does for your own session. `subagent_models` exists to make an informed choice possible.
- **`max_tokens`** caps the child's output (positive integer), forwarded as `agentOptions.maxTokens`.
- The child is created through `ctx.subagents.start()` / `startContinuable()` with `agentOptions = { provider, model, maxTokens }`. `resolveChildAgentOptions` in the harness merges per-child overrides over the parent's route, so an omitted field inherits.

### Auto selection (`model: "auto"`)

Delegating model choice to a deterministic, auditable policy — no extra LLM calls:

1. **Resolve the provider**: the explicit `provider` argument, else the calling agent's own route (`parent.options.provider`). Requires the `llm` service.
2. **Classify the task** into a tier: `trivial` (short task, ≤160 chars, no heavy markers), `complex` (≥1200 chars, or code fences / structured-output asks / reasoning verbs like analyze, design, debug, refactor, evaluate), else `standard`.
3. **Pick a model** from the provider's advertised catalog by naming score: +1 for strong signals (`pro` / `max` / `reason` / `think` / `ultra` / `code` / `turbo` / `large` / `deep`), −1 for cheap signals (`flash` / `mini` / `lite` / `fast` / `small` / `quick` / `nano` / `light`). `trivial` takes the lowest score, `complex` the highest, `standard` the first neutral-scoring id (ties keep catalog order).
4. **Audit**: every auto call records `auto: { provider, model, tier, reason }` on the tool result, and the rendered text carries a `[auto]` line with the reason — you can always ask why that model.
5. **Escalate on failure** (`autoEscalate`, foreground calls only): if the run fails, retry once with the next tier up (`trivial → standard → complex`); the retry result reports `escalatedFrom`. Background/continuable calls skip escalation (the failure is not visible to the call site), and a provider whose catalog has no distinct next-tier model escalates to nothing.

The policy is deliberately conservative: it defaults to a strong model whenever the task looks substantive, saves the cheap model for obviously trivial work, and never hides its reasoning.

## Install

```bash
dsh plugin add dsh-subagent-model-picker
```

The bundle inserts one composition row (`subagent-model-picker`). It consumes the host `tools` / `subagents` / `llm` registries and publishes nothing, so it belongs on the host plane (or in a preset's loose rows) and needs no isolate realm.

## Configuration

All fields optional, via the composition row's `config`:

| Field | Default | Meaning |
|---|---|---|
| `subagentProvider` | `spawn` | The `ctx.subagents` provider that starts children. |
| `toolName` | `subagent_model` | Model-facing delegation tool name. |
| `modelsToolName` | `subagent_models` | Model-facing catalog tool name. |
| `enableRunInBackground` | `true` | Expose `run_in_background` on the delegation tool. |
| `backgroundMode` | `one-shot` | `one-shot` defaults calls to foreground; `continuable` defaults them to background, returns durable child ids, and requires a provider with the `prepareContinuable` capability. |
| `enableModelList` | `true` | Register the `subagent_models` catalog tool. |
| `enableAuto` | `true` | Accept `model: "auto"` on the delegation tool. |
| `autoEscalate` | `true` | After a failed foreground run, retry once on the next auto tier. |
| `maxDepth` | `3` | Child depth cap; `'provider-managed'` sends no cap (requires the provider's `depthLimit` capability for numeric values). |

Example row:

```yaml
- id: subagent-model-picker
  name: 'dsh-subagent-model-picker'
  config:
    subagentProvider: spawn
    toolName: subagent_model
    backgroundMode: one-shot
```

## Example model flow

1. `subagent_models` → lists `deepseek-official` (with its catalog) and any pi-ai routes.
2. `subagent_model` with `{ description: "compare pricing", prompt: "...", provider: "deepseek-official", model: "deepseek-r1", max_tokens: 4000 }` → runs the child on that exact route and returns its output.
3. `subagent_model` with `{ description: "say hi", prompt: "hi", provider: "deepseek-official", model: "auto" }` → the auto policy picks the cheapest catalog model for the trivial task and records `[auto] ...` with its reason.
4. Omit `provider`/`model` to keep the child on your own route.

## Development

```bash
pnpm install
pnpm test       # vitest: schema shape, route validation, agentOptions pass-through, catalog tool, auto policy + escalation
pnpm run build  # tsc -> lib/
```

The test suite drives the real plugin body on a real `ToolRuntime` + `SubagentRuntime` with a scripted subagent provider and a faked `llm` route registry; no network or credentials are touched.

## License

MIT
