# dsh-batch-tool-calls

> DSH（DeepSeek Harness）插件：让 Agent 在**一个步骤**里批量发起互不依赖的工具调用 —— 步数更少，
> 提示缓存重读量更小，同样的任务更省钱。

仓库：<https://github.com/liancha22/dsh-batch-tool-calls>

一个步骤 = 一次模型调用。每一步都会把整个对话上下文重新发一遍（**命中提示缓存同样计费**），
所以「一步多做几件事」直接决定的不是速度，而是账单。

## 问题（实测，不是感觉）

用仓库自带的 `scripts/step-report.mjs` 读真实会话日志：

| 会话（standard 预设） | 步数 | 工具调用 | 平均/步 | 每步 1 次调用的步数 | 单条命令独占一步 |
| --- | --- | --- | --- | --- | --- |
| 初始化仓库技能配置与标签调色盘（4 轮） | 60 | 90 | **1.50** | 27 | 26 |
| 一个长编码会话 | 244 | 307 | **1.26** | 172 | 136 |

同一批会话的 token 账（会话投影里的 `tokenUsage`）：第一个会话 **缓存命中读 5,664,640 token**、
未命中输入 82,149、输出 92,174 —— 平均 **94,411 token/步**。步数就是钱。

这些单调用步骤里，绝大多数是彼此独立的侦查动作（`read` / `grep` / 只读 `bash`），
本可以放进同一个步骤一起发出去。

## 这个插件做什么

往宿主的 **systemPrompt** 注册一段**静态**提示段（默认 `order: 100`，位于人格前缀之后、
`plan:policy` 之前），告诉 Agent：

- 互不依赖的侦查调用一次发齐（默认建议 3–6 个），不要一个一个来；
- 多条独立 shell 命令合并成一次 `bash`（`a && b`；都要跑用 `a; b`）；
- 只有后一个调用需要前一个的结果时才拆到下一步；
- 同一文件的多次 `edit`、「先 read 再 edit」必须串行；
- 依赖链 / 破坏性操作 / 需要用户确认的动作照旧一步一步来，不为省步数牺牲正确性。

**不改变工具清单、不改变并发上限、不碰缓存策略** —— 只是在系统提示里把「一步多发」写成明确规则。

## 为什么是宿主平面 + 静态段

- `systemPrompt` 是进程级注册表。注册在**宿主组合**（host composition）意味着
  **所有预设（standard / ptc / minimal / cordis）的所有 Agent，含子代理**都带上这段约定，装一次就够。
- 段文本是**常量**：内容稳定 → 提示前缀不变 → 缓存命中率不受影响（每步只多约 250 token）。
  用动态文本（按会话拼接）反而会把缓存前缀打散，得不偿失。
- 不发布任何服务、只消费 `systemPrompt`，所以不存在「预设里裸放服务」的 realm 问题，也不需要隔离域。
- 预设若想用自己的措辞替换它，注册同名 section `batch-tool-calls:policy` 即可覆盖（scoped 覆盖 global）。

## 安装

**A. 从 GitHub（已发布，推荐）**

```bash
# 应用内：插件页 → 从 GitHub 安装 → 填 liancha22/dsh-batch-tool-calls
python3 "$DSH_HOME/plugin-manager.py" github liancha22 dsh-batch-tool-calls
# 装完重启该 profile 生效
```

仓库根就是插件根（`package.json` 里声明 `dsh.bundle.patch`），安装器会把该 ref 解析成
commit SHA 后下载，装到的是**固定版本**；换版本时重跑一次上面的命令即可。

> ⚠️ 在本机那份带 `.git` 的开发目录上跑这条命令，会把它整体替换成下载版（`.git` 随之消失）。
> 本机自测请用下面的 C，或先把开发目录另存一份。

**B. 从 npm（发布后）**

```bash
dsh plugin --profile <profile> add dsh-batch-tool-calls
# 重启该 profile 生效
```

包内声明了 `dsh.bundle.patch`，`dsh plugin add` 会自动把下面这行插进 profile 组合，`remove` 自动移除：

```yaml
- insert:
    - id: batch-tool-calls
      name: 'dsh-batch-tool-calls'
      config:
        enabled: true
        language: auto
```

**C. 本地目录（开发 / 未发布）**

```bash
git clone <this-repo> ~/.dsh/plugin-src/dsh-batch-tool-calls
ln -s ~/.dsh/plugin-src/dsh-batch-tool-calls <profile>/node_modules/dsh-batch-tool-calls
# 然后在 <profile>/package.json 里加：
#   dependencies:  "dsh-batch-tool-calls": "link:/abs/path/to/dsh-batch-tool-calls"
#   dsh.profile.bundles: [ ..., "dsh-batch-tool-calls" ]
```

`@deepseek-ai/schemastery` 由 DSH 运行时提供（profile 的共享 node_modules 里就有），无需自己安装依赖。

**D. 手工合并**：把 `cordis.patch.yml` 里的 `insert` 段落合并进 profile 的 `cordis.patch.yml`（用户补丁层在 bundle 层之后生效）。

## 配置

| 键 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | `false` = 完全不注册这一段 |
| `language` | `auto`\|`zh`\|`en` | `auto` | `auto` 跟随部署语言（`DSH_UI_LANGUAGE` / `DSHA_UI_LANGUAGE` / `LC_ALL` / `LANG`） |
| `order` | number | `100` | 提示段排序：人格前缀 `0` 之后、`plan:policy` `500` 之前 |
| `minCalls` / `maxCalls` | number | `3` / `6` | 写进提示的「每步几个」区间（`maxCalls < minCalls` 时自动夹紧） |
| `mentionShell` | boolean | `true` | 是否包含「独立 shell 命令合并成一次 bash」这条 |
| `extra` | string | `''` | 追加自己的约定（另起一段；不能含 `{{...}}`，那是提示变量语法） |

## 验证

```bash
npm install                               # 唯一依赖：@deepseek-ai/schemastery（插件配置 schema）
npm test                                  # verify(25 项) + integration(真实 systemPrompt 服务，6 项)
node test/verify.mjs                      # 模块形状 / 配置解析 / 注册行为 / 文本生成
node test/integration.mjs                 # 在真实 systemPrompt 上注册 → 组装 → 断言段落出现且顺序正确
node scripts/step-report.mjs <会话日志>    # 装前装后对比：步数、每步调用数分布、单调用步数
```

`integration.mjs` 在没有 DSH 运行时包的机器上会打印 `SKIP` 并以 0 退出（`npm test` 因此可移植）。
`step-report.mjs` 需要带 zstd 的 Node（22.15+ / 23+），只用 `node:zlib`，无第三方依赖。
会话日志路径形如 `~/.dsh/sessions/<workspace>/session-<id>/session.v3.jsonl.zstd`；
它自己扫描 zstd 帧边界（Node 一次性 API 只解第一帧，拼接日志必须逐帧解）。

装进 profile 后还可以用部署自带的启动观察器做静态校验（不启动服务、不建会话）：

```bash
DSHA_STARTUP_PROFILE=<profile> DSH_HOME=$DSH_HOME node $DSH_HOME/startup-observer.cjs
# 期望：插件清单里出现 dsh-batch-tool-calls，且没有任何 issue 行
```

## 常见误解

- **「设置里的『并行工具调用数』太小了」**：那个是 `agent-loop` 的 `maxParallelToolCalls`（默认 10），
  只限制**同一步内同时运行**几个调用，不限制模型一步**发起**几个。默认值通常不是瓶颈，
  本插件也不改它。
- **「某个模式限制了一步只能调两个工具」**：标准/PTC/极简预设都只是工具清单 + 人格，
  没有每步调用数限制。一步发几个是模型自己的决定 —— 这正是本插件要影响的。
- **「有 `~/.dsh/AGENTS.md` 就够了」**：那是「工作区指令」，属于软提示、按会话注入；
  本插件走系统提示的固定段落，随插件生命周期管理、可被预设覆盖、对所有预设一致生效。
  两者可以叠加，也可以只留一个。

## 局限（诚实说明）

- 这是**提示层**的约束：模型仍可能不照做。它提高概率，不做强制。
- 不会替模型判断哪些调用真的独立 —— 规则写在提示里，判断仍由模型完成。
- 想把「一步顶很多步」做成硬机制，看上层的 PTC 模式（用一个 TypeScript 程序组合多步操作）。

## 卸载

```bash
dsh plugin --profile <profile> remove dsh-batch-tool-calls
```

提示段随这一行卸载自动撤销（`systemPrompt.section()` 返回的 disposer 由 Cordis 生命周期接管）。

## License

MIT
