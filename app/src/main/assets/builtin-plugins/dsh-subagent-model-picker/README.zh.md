# dsh-subagent-model-picker

让 subagent 自由选用模型的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件。自带的 `subagent` 工具只会继承父级模型路由；本插件新增一个姊妹工具，让委派模型在每次调用时自行挑选子代理的 LLM **provider**、**model** 与 **输出上限** —— 而委派的其他一切（深度核算、委派策略、continuable 后台子代理、结果收集）仍然完全走标准的 `ctx.subagents` 通道。

## 工具

| 工具 | 用途 |
|---|---|
| `subagent_model` | 委派任务给子代理，并在本次调用中指定 `provider` / `model` / `max_tokens`。省略的字段继承调用方代理的路由。传 `model: "auto"` 可把模型选择交给内置自动策略。 |
| `subagent_models` | 只读目录：列出当前 `ctx.llm` 上注册的 provider 路由（`listProviders()`）及每个 provider 广告的模型列表。 |

### 模型选择如何工作

- **`provider`** 会与 `ctx.llm` 上注册的路由（如 `deepseek-official`，或你在 settings 里声明的任意 pi-ai 路由）做硬校验；未知路由立即报错并列出已注册路由。
- **`model`** 原样透传。Harness 把模型目录视为「参考性」信息：DeepSeek 适配器接受任意模型 id，而 pi-ai 路由会拒绝未配置的模型 —— 所以模型有效性由 provider 自己裁决，与你自己会话的行为完全一致。`subagent_models` 的存在就是为了让模型能做出有依据的选择。
- **`max_tokens`** 限制子代理输出（正整数），透传为 `agentOptions.maxTokens`。
- 子代理通过 `ctx.subagents.start()` / `startContinuable()` 创建，携带 `agentOptions = { provider, model, maxTokens }`；harness 的 `resolveChildAgentOptions` 会把本次覆盖与父级路由合并，因此省略的字段自动继承。

### 自动选择（`model: "auto"`）

把模型选择交给一个确定性、可审计的策略 —— 不引入额外 LLM 调用：

1. **确定 provider**：显式 `provider` 参数优先，否则取调用方代理自己的路由（`parent.options.provider`）。需要 `llm` 服务。
2. **任务分档**：`trivial`（短任务，≤160 字符且无重标记）、`complex`（≥1200 字符，或含代码块 / 结构化输出诉求 / 推理动词如 analyze、design、debug、refactor、evaluate），其余为 `standard`。
3. **从目录选模型**：按命名打分 —— 强信号（`pro` / `max` / `reason` / `think` / `ultra` / `code` / `turbo` / `large` / `deep`）+1，廉价信号（`flash` / `mini` / `lite` / `fast` / `small` / `quick` / `nano` / `light`）−1。`trivial` 取最低分，`complex` 取最高分，`standard` 取第一个 0 分 id（同分保持目录顺序）。
4. **可审计**：每次 auto 调用都会在工具结果里记录 `auto: { provider, model, tier, reason }`，渲染文本带 `[auto]` 行与理由 —— 随时可以问「为什么选它」。
5. **失败升级**（`autoEscalate`，仅前台调用）：运行失败后用下一档重试一次（`trivial → standard → complex`），重试结果记录 `escalatedFrom`。后台/continuable 调用不升级（调用点看不到失败结果）；目录里没有可区分的高一档模型时不升级。

策略刻意保守：任务看起来有实质内容就默认上强模型，只有明显琐碎的任务才用廉价模型，并且从不隐藏自己的决策理由。

## 安装

```bash
dsh plugin add dsh-subagent-model-picker
```

bundle 只插入一行组合（`subagent-model-picker`）。它消费 host 的 `tools` / `subagents` / `llm` 注册表且不发布任何服务，所以属于 host 平面（或 preset 的自由行），不需要 isolate realm。

## 配置

全部可选，写在组合行的 `config` 里：

| 字段 | 默认 | 含义 |
|---|---|---|
| `subagentProvider` | `spawn` | 启动子代理的 `ctx.subagents` provider。 |
| `toolName` | `subagent_model` | 面向模型的委派工具名。 |
| `modelsToolName` | `subagent_models` | 面向模型的目录工具名。 |
| `enableRunInBackground` | `true` | 是否暴露 `run_in_background` 参数。 |
| `backgroundMode` | `one-shot` | `one-shot` 默认前台等待；`continuable` 默认后台执行、返回持久子代理 id，并要求 provider 具备 `prepareContinuable` 能力。 |
| `enableModelList` | `true` | 是否注册 `subagent_models` 目录工具。 |
| `enableAuto` | `true` | 是否接受委派工具上的 `model: "auto"`。 |
| `autoEscalate` | `true` | 前台运行失败后是否用高一档自动重试一次。 |
| `maxDepth` | `3` | 子代理深度上限；`'provider-managed'` 表示不设上限（数值上限要求 provider 具备 `depthLimit` 能力）。 |

示例行：

```yaml
- id: subagent-model-picker
  name: 'dsh-subagent-model-picker'
  config:
    subagentProvider: spawn
    toolName: subagent_model
    backgroundMode: one-shot
```

## 典型模型流程

1. `subagent_models` → 列出 `deepseek-official`（含其目录）与所有 pi-ai 路由。
2. `subagent_model` 传 `{ description: "对比定价", prompt: "...", provider: "deepseek-official", model: "deepseek-r1", max_tokens: 4000 }` → 子代理在该路由上运行并返回结果。
3. `subagent_model` 传 `{ description: "say hi", prompt: "hi", provider: "deepseek-official", model: "auto" }` → 自动策略为琐碎任务挑选目录中最便宜的模型，并记录 `[auto] ...` 及其理由。
4. 省略 `provider`/`model` 即让子代理沿用你自己的路由。

## 开发

```bash
pnpm install
pnpm test       # vitest：schema 形态、路由校验、agentOptions 透传、目录工具、auto 策略与升级
pnpm run build  # tsc -> lib/
```

测试套件在真实的 `ToolRuntime` + `SubagentRuntime` 上驱动真实插件体，使用脚本化子代理 provider 与伪造的 `llm` 路由注册表；不触网、不用凭据。

## License

MIT
