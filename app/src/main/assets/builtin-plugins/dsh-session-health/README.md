# dsh-session-health

[English](README.md) | [中文](README.zh.md)

Session health for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): a real-data "continue vs new session" indicator.

- **Header badge** — colored dot + border (green/blue/yellow/red) next to the Session log button, styled with DSH theme tokens. **Reactive**: driven entirely by the host-computed `sessionHealth` projection (push frames — the one wire path community plugins own; client Remotes are a fixed generated list, so no Remote, no polling). Hover shows advice, window-ratio bar, per-round token cost with **cache-hit rate** (hit rate reflects context stability; compactions reset it), compaction-aware **next-input estimate (cache hits excluded)**, **per-round cost in money** (CNY for the zh locale, USD otherwise — official DeepSeek peak/off-peak pricing, `忙时价/闲时价` tagged), model window, session scale, and compaction count. **Click runs `/health`** for the full report. Keyboard-accessible.
- **`/health` command** — full textual report with optional probes:
  - `/health` — everything (git / handoff / process probes, configurable)
  - `/health minimal` — core metrics only (token / window / scale)
  - `/health no-git` / `/health no-handoff` — skip a probe
  - `/health doc=<your-file>` — check your own handoff document (no preset filename; the concept is yours, the name is yours)
  - `/health remaining=<rounds>` — cost expectation in USD: `per-round cost × remaining rounds ≈ expected input spend` (cache-discounted)
  - `/health processes` — force the process probe
- **`session_health` tool** — model-callable read-only assessment for long tasks: structured verdict (`severity`, `recommendation`, `signals`, `cost`, `handoffReady`) plus a full markdown report at yellow/red tiers. The model self-checks the work-nature questions (`dependsOnEarly` / `earlyDecisionRecorded` / `remainingRounds`); the host measures everything else.
- **`sessionHealth` projection** — durable host-computed fold (turns, messages, compactions, last-wins pressure/window, last-request cache buckets, severity + advice) pushed to every client; survives replay and page reloads.
- **Multi-session health overview panel** (v0.6.0) — a "健康一览" action beside Settings at the sidebar foot opens a frame-wide panel (`shell.overlay`) listing **every session's** verdict. Data comes from a same-origin host RPC (`/session-health-rpc`, loopback-only): live sessions cut the projection registry snapshot, cold sessions read the persisted projection cache (async cold load fallback); titles come from the log-backed fold / batch query. Rows are sorted red → yellow → blue → green → unknown (newest first inside a tier), refreshed every 5 s while open; clicking a row opens that session and runs `/health` for it. Esc / backdrop click close; keyboard- and screen-reader-accessible (severity is never color-only).

## Handoff checklist (automated)

When yellow/red, `/health` appends a **real-state checklist** instead of static prose: `git status --short` / `git log --oneline -1` / `git status -sb` (read-only whitelisted argv via `ctx.subprocess`) drive the commit/push items, the handoff probe drives the doc item, and the process probe drives the process item. Uncheckable items are marked `[ ]` with the reason — never silently "done".

## Decision model

Two-dimensional continue-vs-switch (community session-health methodology), parameterized in plugin config:

| Severity | Condition (defaults) | Advice |
|---|---|---|
| Green | window ratio < 30%, per-round billable < 50K | keep going |
| Blue | ratio 30–50%, or messages ≥ 800 (proxy) | keep going, watch the window |
| Yellow | ratio ≥ 50%, or per-round billable ≥ max(50K, 30% × window) | wrap at the next task boundary |
| Red | ratio ≥ 80% | wrap up soon, hand off |

Economy (per-round **billable-equivalent**, cache-hit discounted) outranks capacity (window ratio), per the methodology. The economy floor scales with the window (`economyWindowRatio`): the 50K absolute default was calibrated for ~128K-window models, and using it raw on a 1M window flagged yellow at single-digit occupancy — the billable threshold no longer fires there. The tool escalates to `danger-zone` when the work depends on early content that was never recorded (git/docs) — never suggest a blind switch there.

## Configuration

```ts
// thresholds: decision-model parameters
thresholds: {
  windowMid: 0.3, windowHigh: 0.5, windowCritical: 0.8,   // window-ratio tiers
  economyTokenFloor: 50000, economyWindowRatio: 0.3,      // economy: billable ≥ max(50K, 30%×window) turns yellow
  economyRoundFloor: 10,                                  // remaining-rounds threshold (cost-expectation copy)
  messageCountProxy: 800,                                  // context-bloat proxy
}
// checks: probe switches (all read-only)
checks: {
  git: { enabled: true, workspaceRoot?: string },          // .git existence probe
  handoff: { enabled: true, paths: [] },                   // your handoff doc names
  sessionResume: { enabled: true },                        // DSH persistence note
  processes: { enabled: true },                            // ps probe via ctx.subprocess
}
projection: { enabled: true }                              // reactive badge unit
cost: {
  cacheHitDiscount: 0.1,       // cache-hit price fraction
  inputPricePerM: 0.28,        // static fallback: USD per 1M input tokens
  priceSource: 'auto',         // 'auto': periodic fetch; 'static': never fetch
  priceUrl: 'https://cdn.jsdelivr.net/gh/NinjaSln-labs/dsh-plugins@main/pricing/deepseek.json',   // primary (jsdelivr, CN-reachable)
  priceFallbackUrl: 'https://raw.githubusercontent.com/NinjaSln-labs/dsh-plugins/main/pricing/deepseek.json', // same-cycle fallback (GitHub raw)
  priceRefreshHours: 24,
}
```

## Pricing (money display)

The harness carries no pricing, so the money figures resolve through a live
cache driven by the **official DeepSeek pricing document** (default
`priceUrl` = the jsdelivr CDN mirror, `priceFallbackUrl` = GitHub raw in the
same refresh cycle; the document is the dsh-plugins repo's maintained
[`pricing/deepseek.json`](../../../pricing/deepseek.json), synced from
[api-docs.deepseek.com](https://api-docs.deepseek.com/zh-cn/quick_start/pricing/)).
If the primary source is unreachable (e.g. GitHub raw blocked on CN
networks) the fallback is tried automatically, instead of silently degrading
the money display to static USD.

- **Peak/off-peak (峰谷定价)**: evaluated against **Beijing wall time** on
  every read — peak 9:00–12:00 / 14:00–18:00 Beijing (01–04 / 06–10 UTC),
  everything else is off-peak at half price. The badge tags the row
  `忙时价/闲时价`.
- **Per model**: prices picked by the current model name (`models."*"` is the
  fallback). Both official currencies ride along — CNY from the zh docs,
  **USD straight from the en docs** (no exchange-rate conversion):
  deepseek-v4-flash off-peak ¥1.5/M / $0.22/M miss, ¥0.05/M / $0.007/M hit;
  peak ¥3.0/M / $0.44/M miss, ¥0.10/M / $0.014/M hit.
- **Currency by region**: the badge shows **CNY when the app locale is zh,
  USD otherwise**; /health lists both.
- Refresh every `priceRefreshHours` (default 24h); failures keep the last
  good document; static `inputPricePerM` / `cacheHitDiscount` (flat USD, no
  period) apply until the first success or with `priceSource: 'static'`.

Document shape (per period, both currencies required):
`{ "peakHours": [[9,12],[14,18]], "models": { "<model>": { "peak": { "inputMissPerMCny": 3.0, "inputHitPerMCny": 0.10, "inputMissPerMUsd": 0.44, "inputHitPerMUsd": 0.014 }, "offpeak": { ... } }, "*": { ... } } }`

## Why real data

Every signal comes from the harness itself — nothing is estimated:

| Signal | Source |
|---|---|
| Per-round input tokens | `ctx.tokenMeter.measure` (exact, snapshot caliber) |
| Context window | `llm.resolveModelInfo` (e.g. 1M for deepseek-v4-pro) |
| Messages / turns / compactions / cache buckets | `sessionHealth` projection fold (sessionQuery fallback) |
| Next-request occupancy | token-meter `contextPressure.projectedTokens` (compaction-aware) |
| Git repo + worktree state | `fs` probe + read-only git subcommands |
| Handoff doc | `fs` probe of the name *you* provide |
| Running processes | `ctx.subprocess` read-only `ps` probe, workspace-filtered |

## Install

```sh
dsh plugin add dsh-session-health
# then restart / reload the profile that mounts it
```

Or add to a profile overlay:

```yaml
# your profile cordis.patch.yml
- insert:
    - id: session-health
      name: 'dsh-session-health'
```

## Development

```sh
npm run build      # tsc → lib/ + esbuild client bundle
npm run typecheck  # strict typecheck
npm run smoke      # logic smoke tests (stub services)
npm run mount      # real-cordis mount test (command + tool + projection)
npm run build:client && node scripts/client-mount.mjs  # browser-boot path test
```

## Design

Methodology derived from the community session-health skill (two-dimensional continue-vs-switch model); the harness version upgrades the data layer from estimation to exact measurement. The full design note (signal mapping, decision model, configurable checks, phase-2 roadmap) lives in the plugin development workspace at `research/session-health-plugin/DESIGN.md`.

## License

MIT
