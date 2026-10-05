window.__ModuleLoader__.load({ id: "dsh-session-health", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  mergePressure: () => mergePressure,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var React = __toESM(require("react"), 1);

// src/usage.ts
function cacheHitRateOf(usage) {
  if (usage === void 0) return null;
  const denominator = (usage.uncachedInputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
  return denominator > 0 ? (usage.cacheReadTokens ?? 0) / denominator : null;
}

// src/client.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var CSS = `
.sh-wrap{position:relative;display:inline-flex}
.sh-badge{display:inline-flex;align-items:center;justify-content:center;height:32px;padding:6px 12px;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-color:var(--sh-accent,var(--dsw-alias-border-l2));border-radius:18px;color:var(--dsw-alias-label-secondary);background:transparent;font-size:13px;font-weight:400;line-height:20px;box-sizing:border-box;cursor:pointer;user-select:none;white-space:nowrap}
.sh-badge:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-badge:focus-visible{outline:2px solid var(--dsw-alias-state-primary);outline-offset:2px}
.sh-badge .sh-dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--sh-accent,var(--dsw-alias-label-secondary))}
/* Severity palette — three theme-adaptive roles per tier:
   --sh-accent (dot/border/bar), --sh-ink (severity text), --sh-tint (chip bg).
   Light themes deepen the hues for contrast on pale surfaces; dark themes
   lighten them for contrast on the dark overlay. All text ratios >= 3:1 in
   both themes (WCAG AA for graphical objects / emphasis); hue separation
   between the four tiers is kept wide in both themes. */
.sh-sev-green{--sh-accent:color-mix(in srgb,var(--dsw-alias-state-success-primary) 30%,black);--sh-ink:color-mix(in srgb,var(--dsw-alias-state-success-primary) 42%,black);--sh-tint:color-mix(in srgb,var(--dsw-alias-state-success-primary) 13%,transparent)}
.sh-sev-blue{--sh-accent:var(--dsw-static-blue-600);--sh-ink:var(--dsw-static-blue-600);--sh-tint:color-mix(in srgb,var(--dsw-static-blue-500) 13%,transparent)}
.sh-sev-yellow{--sh-accent:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 30%,black);--sh-ink:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 42%,black);--sh-tint:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 14%,transparent)}
.sh-sev-red{--sh-accent:var(--dsw-alias-state-error-primary);--sh-ink:var(--dsw-alias-state-error-primary);--sh-tint:color-mix(in srgb,var(--dsw-alias-state-error-primary) 13%,transparent)}
body[data-ds-dark-theme] .sh-sev-green{--sh-accent:color-mix(in srgb,var(--dsw-alias-state-success-primary) 40%,white);--sh-ink:color-mix(in srgb,var(--dsw-alias-state-success-primary) 55%,white)}
body[data-ds-dark-theme] .sh-sev-blue{--sh-accent:color-mix(in srgb,var(--dsw-static-blue-500) 50%,white);--sh-ink:color-mix(in srgb,var(--dsw-static-blue-500) 55%,white)}
body[data-ds-dark-theme] .sh-sev-yellow{--sh-accent:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 45%,white);--sh-ink:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 55%,white)}
body[data-ds-dark-theme] .sh-sev-red{--sh-accent:color-mix(in srgb,var(--dsw-alias-state-error-primary) 35%,white);--sh-ink:color-mix(in srgb,var(--dsw-alias-state-error-primary) 55%,white)}
.sh-tip{position:absolute;top:calc(100% + 8px);right:0;min-width:280px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;font-size:12px;box-shadow:0 6px 20px rgba(0,0,0,.22);z-index:50;text-align:left}
.sh-tip-title{font-size:13px;color:var(--dsw-alias-label-secondary);margin-bottom:8px}
.sh-tip-title .sh-sev-label{color:var(--sh-ink,var(--dsw-alias-label-secondary));font-weight:600}
.sh-tip-advice{font-size:13px;line-height:1.6;padding:8px 10px;border-radius:8px;font-weight:600;color:var(--sh-ink,var(--dsw-alias-label-primary));background:var(--sh-tint,transparent);margin-bottom:8px}
.sh-tip-row{display:flex;align-items:center;gap:10px;line-height:2}
.sh-tip-row .sh-k{color:var(--dsw-alias-label-secondary);flex:none}
.sh-tip-row .sh-v{color:var(--dsw-alias-label-secondary);margin-left:auto;font-variant-numeric:tabular-nums}
.sh-cost-toggle{cursor:pointer;border-radius:4px}
.sh-cost-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-cost-toggle:focus-visible{outline:2px solid var(--dsw-alias-state-primary);outline-offset:1px}
.sh-bar{flex:1;height:6px;border-radius:3px;background:var(--dsw-alias-bg-layer-2);overflow:hidden;max-width:110px}
.sh-bar-fill{height:100%;border-radius:3px;display:block;background:var(--sh-accent,var(--dsw-alias-label-secondary))}
.sh-tip-hint{margin-top:8px;padding-top:8px;border-top:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:11px}
/* Invisible bridge over the badge↔tooltip gap: the mouse path into the
   tooltip never leaves the wrapper, so the popover stays clickable. */
.sh-tip::before{content:'';position:absolute;top:-8px;left:0;right:0;height:8px}
.sh-tip{animation:sh-tip-in .15s ease-out}
@keyframes sh-tip-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.sh-tip{animation:none}}
/* Sidebar footer action (multi-session overview opener): mirrors the
   settings trigger row — wide shows dot + label, the 56px rail shows the dot
   only. Theme tokens throughout; severity palette classes reused below. */
.sh-fa{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 10px;border:none;background:transparent;color:var(--dsw-alias-label-secondary);border-radius:8px;font-size:13px;line-height:20px;box-sizing:border-box;cursor:pointer;user-select:none;white-space:nowrap}
.sh-fa:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-fa:focus-visible{outline:2px solid var(--dsw-alias-state-primary);outline-offset:2px}
.sh-fa .sh-fa-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--dsw-alias-label-tertiary)}
/* Overview panel: frame-wide scrim + centered card. The shell.overlay layer
   is click-through by default — the panel opts back into pointer events. */
.sh-scrim{position:fixed;inset:0;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1) 55%,transparent);display:flex;align-items:center;justify-content:center;padding:32px;pointer-events:auto;z-index:60;animation:sh-fade-in .15s ease-out}
body:has([data-mobile-nav="backdrop"]) .sh-scrim{background:transparent}
@keyframes sh-fade-in{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion: reduce){.sh-scrim{animation:none}}
.sh-panel{width:min(760px,100%);max-height:min(76vh,720px);display:flex;flex-direction:column;background:var(--dsw-alias-bg-overlay);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.3);overflow:hidden}
.sh-panel-head{display:flex;align-items:baseline;gap:10px;padding:14px 16px 10px;border-bottom:1px solid var(--dsw-alias-border-l1)}
.sh-panel-title{font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary)}
.sh-panel-sub{font-size:12px;color:var(--dsw-alias-label-tertiary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sh-panel-close{flex:none;width:28px;height:28px;border:none;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;cursor:pointer}
.sh-panel-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-panel-close:focus-visible{outline:2px solid var(--dsw-alias-state-primary);outline-offset:1px}
.sh-panel-legend{display:flex;flex-wrap:wrap;gap:4px 14px;padding:8px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-tertiary)}
.sh-panel-legend .sh-legend-item{display:inline-flex;align-items:center;gap:5px}
.sh-panel-legend .sh-legend-dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--sh-accent,var(--dsw-alias-label-tertiary))}
.sh-panel-list{overflow-y:auto;padding:8px;flex:1}
.sh-panel-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:none;border-radius:10px;background:transparent;color:var(--dsw-alias-label-secondary);text-align:left;cursor:pointer;box-sizing:border-box}
.sh-panel-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.sh-panel-row:focus-visible{outline:2px solid var(--dsw-alias-state-primary);outline-offset:1px}
.sh-panel-row .sh-row-dot{width:10px;height:10px;border-radius:50%;flex:none;background:var(--sh-accent,var(--dsw-alias-label-tertiary))}
.sh-panel-row .sh-row-main{flex:1;min-width:0}
.sh-panel-row .sh-row-title{font-size:13px;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sh-panel-row .sh-row-meta{font-size:11px;color:var(--dsw-alias-label-tertiary);margin-top:1px;font-variant-numeric:tabular-nums}
.sh-panel-row .sh-row-sev{flex:none;font-size:12px;color:var(--sh-ink,var(--dsw-alias-label-secondary));font-weight:600}
.sh-panel-row .sh-row-right{flex:none;text-align:right;font-size:12px;color:var(--dsw-alias-label-secondary);font-variant-numeric:tabular-nums}
.sh-panel-empty{padding:28px 16px;text-align:center;font-size:13px;color:var(--dsw-alias-label-tertiary)}
.sh-panel-foot{padding:8px 16px;border-top:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-tertiary)}
@media(max-width:767px){
 .sh-scrim{padding:12px}
 .sh-panel{max-height:calc(100dvh - 24px)}
 .sh-panel-head{flex-wrap:wrap;align-items:center}
 .sh-panel-title{flex:1;min-width:0}
 .sh-panel-row{flex-wrap:wrap}
 .sh-row-right{margin-left:auto}
 .sh-tip{position:fixed;top:90px;right:12px;min-width:0;width:calc(100vw - 24px);max-height:calc(100dvh - 114px);overflow:auto;box-sizing:border-box}
}
`;
function compact(n) {
  if (n === null || n === void 0) return "Неизвестно";
  if (n >= 1e6) {
    const v = n / 1e6;
    return (v >= 10 ? Math.round(v) : Math.round(v * 10) / 10) + "M";
  }
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n);
}
function pctOf(rate) {
  return `${Math.round(rate * 100)}%`;
}
function formatUsd(v) {
  return v >= 100 ? `$${Math.round(v)}` : `$${v.toFixed(2)}`;
}
var SEVERITY_LABEL = {
  green: "Можно продолжать",
  blue: "Продолжать с осторожностью",
  yellow: "Следите за контекстом",
  red: "Рекомендуется завершить"
};
var SEVERITY_ARIA = {
  green: "Зелёный: можно продолжать",
  blue: "Синий: следите за контекстом",
  yellow: "Жёлтый: требуется внимание",
  red: "Красный: завершите работу"
};
function mergePressure(proj, pressure) {
  const total = proj?.total ?? pressure?.pressureTokens ?? pressure?.projectedTokens ?? null;
  const window2 = proj?.window ?? pressure?.contextWindow ?? null;
  const ratio = total !== null && window2 !== null && window2 > 0 ? total / window2 : null;
  const projected = pressure?.projectedTokens ?? null;
  return { total, window: window2, ratio, projected };
}
function HealthBadge(props) {
  const [proj, setProj] = React.useState(void 0);
  const [pressure, setPressure] = React.useState(void 0);
  const [usage, setUsage] = React.useState(void 0);
  const [hover, setHover] = React.useState(false);
  const [costAsTokens, setCostAsTokens] = React.useState(() => {
    try {
      return window.localStorage.getItem("dsh-session-health/costDisplay") === "tokens";
    } catch {
      return false;
    }
  });
  const hoverTimer = React.useRef(null);
  const showTip = () => {
    if (hoverTimer.current !== null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    setHover(true);
  };
  const hideTip = () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = window.setTimeout(() => setHover(false), 250);
  };
  React.useEffect(() => () => {
    if (hoverTimer.current !== null) window.clearTimeout(hoverTimer.current);
  }, []);
  React.useEffect(() => {
    let alive = true;
    const binding = props.sessions.binding?.(props.sessionId)?.session?.projections;
    const face = binding?.faceOf?.("sessionHealth");
    const pressureFace = binding?.faceOf?.("contextPressure");
    const usageFace = binding?.faceOf?.("tokenUsage");
    if (face === void 0 && pressureFace === void 0 && usageFace === void 0) return () => {
      alive = false;
    };
    const readHealth = () => {
      if (!alive) return;
      const v = face?.getSnapshot();
      if (v !== void 0 && v !== null) setProj(v);
    };
    const readPressure = () => {
      if (!alive) return;
      const v = pressureFace?.getSnapshot();
      if (v !== void 0 && v !== null) setPressure(v);
    };
    const readUsage = () => {
      if (!alive) return;
      const v = usageFace?.getSnapshot();
      if (v !== void 0 && v !== null) setUsage(v);
    };
    readHealth();
    readPressure();
    readUsage();
    const offs = [
      face !== void 0 ? face.subscribe(readHealth) : () => {
      },
      pressureFace !== void 0 ? pressureFace.subscribe(readPressure) : () => {
      },
      usageFace !== void 0 ? usageFace.subscribe(readUsage) : () => {
      }
    ];
    return () => {
      alive = false;
      for (const off of offs) off();
    };
  }, [props.sessionId]);
  const merged = mergePressure(proj, pressure);
  const severity = proj?.severity ?? "unknown";
  const pct = merged.ratio !== null ? Math.min(Math.round(merged.ratio * 100), 100) : null;
  const runHealth = () => {
    try {
      void props.commands.execute(props.sessionId, "/health");
    } catch {
    }
  };
  const toggleCost = () => {
    setCostAsTokens((v) => {
      const next = !v;
      try {
        window.localStorage.setItem("dsh-session-health/costDisplay", next ? "tokens" : "money");
      } catch {
      }
      return next;
    });
  };
  const onCostKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleCost();
    }
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      runHealth();
    }
  };
  const state = severity === "unknown" ? "unknown" : severity;
  const text = "Здоровье сессии" + (pct !== null ? ` ${pct}%` : "");
  let tip = null;
  if (hover) {
    const color = severity === "unknown" ? null : severity;
    const label = severity === "unknown" ? "Ожидание данных" : SEVERITY_LABEL[severity];
    const advice = proj?.advice ?? "Получение данных о здоровье сессии…";
    const bar = /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-bar", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-bar-fill", style: { width: `${pct !== null ? Math.min(pct, 100) : 0}%` } }) });
    tip = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: `sh-tip${color !== null ? ` sh-sev-${color}` : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-title", children: [
        "Здоровье сессии: ",
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-sev-label", children: label })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-tip-advice", children: advice }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-k", children: "Заполнение контекста" }),
        bar,
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-v", children: pct !== null ? `${pct}%` : "Неизвестно" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-k", children: "Вход за виток" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-v", children: [
          "Около ",
          compact(merged.total),
          " token",
          (() => {
            const rate = cacheHitRateOf(usage);
            return rate !== null ? ` (из кэша ${pctOf(rate)}）` : "";
          })()
        ] })
      ] }),
      merged.projected !== null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-k", children: "Ожидаемый следующий запрос" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-v", children: proj?.cacheReadTokens !== null && proj?.cacheReadTokens !== void 0 ? `Около ${compact(Math.max(0, merged.projected - proj.cacheReadTokens))} токенов без кэша / всего ${compact(merged.projected)}` : `Около ${compact(merged.projected)} token` })
      ] }) : null,
      (() => {
        const isZh = (props.locale?.snapshot?.active ?? "zh") === "zh";
        const cny = proj?.effectivePerRoundCny;
        const usd = proj?.effectivePerRoundUsd;
        const money = isZh && cny !== null && cny !== void 0 ? `\xA5${cny.toFixed(2)}` : usd !== null && usd !== void 0 ? formatUsd(usd) : null;
        const effective = proj?.effectivePerRound;
        if (money === null && effective === null) return null;
        const period = proj?.pricePeriod === "peak" ? " (пиковый тариф)" : proj?.pricePeriod === "offpeak" ? " (льготный тариф)" : "";
        return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "div",
          {
            className: "sh-tip-row sh-cost-toggle",
            role: "button",
            tabIndex: 0,
            title: costAsTokens ? "Показать стоимость" : "Показать количество токенов",
            "aria-label": costAsTokens ? "Ожидаемые токены; нажмите, чтобы показать стоимость" : "Ожидаемая стоимость; нажмите, чтобы показать токены",
            onClick: toggleCost,
            onKeyDown: onCostKeyDown,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-k", children: [
                "Ожидаемая стоимость",
                costAsTokens ? "（token）" : ""
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-v", children: costAsTokens ? effective !== null ? `Около ${compact(effective)} token/виток (оплачиваемый эквивалент)` : `Около ${money ?? "Неизвестно"}/виток (с учётом скидки кэша)${period}` : money !== null ? `Около ${money}/виток (с учётом скидки кэша)${period}` : `Около ${compact(effective ?? 0)} token/виток (оплачиваемый эквивалент)` })
            ]
          }
        );
      })(),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-row", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-k", children: "Окно модели" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-v", children: compact(merged.window) })
      ] }),
      proj !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-k", children: "Размер сессии" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-v", children: [
            proj.turns,
            " витков / ",
            proj.userMessages + proj.assistantMessages,
            " сообщений"
          ] })
        ] }),
        proj.compactions > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-tip-row", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-k", children: "Сжатий" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-v", children: [
            proj.compactions,
            " (ранние подробности сокращены)"
          ] })
        ] }) : null
      ] }) : null,
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-tip-hint", children: "Нажмите для полного отчёта /health. Нажмите на стоимость, чтобы переключить деньги и токены" })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "span",
    {
      className: "sh-wrap",
      onMouseEnter: showTip,
      onMouseLeave: hideTip,
      onFocus: showTip,
      onBlur: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) hideTip();
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
          "span",
          {
            className: `sh-badge${state !== "unknown" ? ` sh-sev-${state}` : ""}`,
            role: "button",
            tabIndex: 0,
            "aria-label": `Здоровье сессии: ${severity === "unknown" ? "Неизвестно" : SEVERITY_ARIA[severity]}`,
            onClick: runHealth,
            onKeyDown,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-dot" }),
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: text })
            ]
          }
        ),
        tip
      ]
    }
  );
}
var PANEL_REFRESH_MS = 5e3;
var OverviewStore = class {
  open = false;
  listeners = /* @__PURE__ */ new Set();
  subscribe = (listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getOpen = () => this.open;
  setOpen(open) {
    if (this.open === open) return;
    this.open = open;
    for (const listener of [...this.listeners]) listener();
  }
};
var SEVERITY_RANK = { red: 0, yellow: 1, blue: 2, green: 3 };
function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const ra = a.health === null ? 4 : SEVERITY_RANK[a.health.severity] ?? 4;
    const rb = b.health === null ? 4 : SEVERITY_RANK[b.health.severity] ?? 4;
    if (ra !== rb) return ra - rb;
    return (b.createdAt ?? 0) - (a.createdAt ?? 0);
  });
}
function moneyOf(proj, isZh) {
  if (proj === null) return null;
  const cny = proj.effectivePerRoundCny;
  const usd = proj.effectivePerRoundUsd;
  if (isZh && cny !== null && cny !== void 0) return `\xA5${cny.toFixed(2)}/виток`;
  if (usd !== null && usd !== void 0) return `${formatUsd(usd)}/виток`;
  return null;
}
function OverviewAction(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "button",
    {
      type: "button",
      className: "sh-fa",
      onClick: () => props.store.setOpen(true),
      "aria-label": "Открыть здоровье всех сессий",
      title: "Здоровье всех сессий",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-fa-dot" }),
        props.wide ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: "Здоровье сессий" }) : null
      ]
    }
  );
}
function OverviewPanel(props) {
  const open = React.useSyncExternalStore(props.store.subscribe, props.store.getOpen);
  if (!open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewBody, { ...props });
}
function OverviewBody(props) {
  const [rows, setRows] = React.useState(null);
  const [loadError, setLoadError] = React.useState(null);
  const closeRef = React.useRef(null);
  React.useEffect(() => {
    let alive = true;
    let timer = null;
    const load = async () => {
      try {
        const res = await fetch("/session-health-rpc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ method: "overview" })
        });
        const json = await res.json();
        if (!alive) return;
        if (json.ok === true && Array.isArray(json.result?.sessions)) {
          setRows(sortRows(json.result.sessions));
          setLoadError(null);
        } else {
          setLoadError(json.error ?? "Неизвестная ошибка");
        }
      } catch {
        if (alive) setLoadError("Не удалось подключиться к /session-health-rpc");
      }
    };
    void load();
    timer = window.setInterval(() => {
      void load();
    }, PANEL_REFRESH_MS);
    return () => {
      alive = false;
      if (timer !== null) window.clearInterval(timer);
    };
  }, []);
  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") props.store.setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    closeRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [props.store]);
  const close = () => props.store.setOpen(false);
  const openSession = (id) => {
    try {
      props.navigation.openSession(id);
    } catch {
    }
    try {
      void props.commands.execute(id, "/health");
    } catch {
    }
    close();
  };
  const isZh = (props.locale?.snapshot?.active ?? "zh") === "zh";
  const redCount = rows === null ? 0 : rows.filter((r) => r.health?.severity === "red").length;
  const yellowCount = rows === null ? 0 : rows.filter((r) => r.health?.severity === "yellow").length;
  const sub = rows === null ? "Загрузка…" : `${rows.length} сессий${redCount > 0 ? ` \xB7 Красный ${redCount}` : ""}${yellowCount > 0 ? ` \xB7 Жёлтый ${yellowCount}` : ""}`;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-scrim", onClick: close, children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
    "div",
    {
      className: "sh-panel",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": "Здоровье всех сессий",
      onClick: (e) => e.stopPropagation(),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-panel-head", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-panel-title", children: "Здоровье всех сессий" }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-panel-sub", children: sub }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
            "button",
            {
              type: "button",
              ref: closeRef,
              className: "sh-panel-close",
              "aria-label": "Закрыть обзор здоровья сессий",
              onClick: close,
              children: "\xD7"
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-panel-legend", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-legend-item sh-sev-red", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-legend-dot" }),
            "Рекомендуется завершить"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-legend-item sh-sev-yellow", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-legend-dot" }),
            "Следите за контекстом"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-legend-item sh-sev-blue", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-legend-dot" }),
            "Продолжать с осторожностью"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-legend-item sh-sev-green", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-legend-dot" }),
            "Можно продолжать"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-legend-item", children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-legend-dot" }),
            "Нет данных"
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-panel-list", children: rows === null && loadError === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-panel-empty", children: "Загружаются данные здоровья сессий…" }) : rows === null ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "sh-panel-empty", children: [
          "Не удалось загрузить: ",
          loadError
        ] }) : rows.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-panel-empty", children: "Нет сессий для отображения" }) : rows.map((row) => {
          const health = row.health;
          const severity = health?.severity ?? "unknown";
          const pct = health?.ratio !== null && health?.ratio !== void 0 ? Math.min(Math.round(health.ratio * 100), 100) : null;
          const money = moneyOf(health, isZh);
          const metaBits = [
            pct !== null ? `Заполнение ${pct}%` : "Заполнение неизвестно",
            health?.effectivePerRound !== null && health?.effectivePerRound !== void 0 ? `Около ${compact(health.effectivePerRound)} token/виток` : null,
            health !== null ? `${health.turns} витков / ${health.userMessages + health.assistantMessages} сообщений` : null,
            health !== null && health.compactions > 0 ? `Сжатий ${health.compactions} раз` : null,
            row.live ? "Открыта" : "Сохранена"
          ].filter((v) => v !== null);
          const ariaSev = severity === "unknown" ? "Неизвестно" : SEVERITY_ARIA[severity];
          return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "button",
            {
              type: "button",
              className: `sh-panel-row${severity !== "unknown" ? ` sh-sev-${severity}` : ""}`,
              onClick: () => openSession(row.id),
              "aria-label": `Здоровье сессии: ${ariaSev}。${row.title ?? "Без названия"}。${metaBits.join("，")}. Нажмите для открытия и отчёта /health`,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-row-dot" }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "sh-row-main", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-row-title", children: row.title ?? `Без названия（${row.id.slice(0, 8)}…）` }),
                  /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-row-meta", children: metaBits.join(" \xB7 ") })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-row-sev", children: severity === "unknown" ? "Нет данных" : SEVERITY_LABEL[severity] }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "sh-row-right", children: money ?? "" })
              ]
            },
            row.id
          );
        }) }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "sh-panel-foot", children: "Обновление каждые 5 секунд · Нажмите на сессию для отчёта /health · Esc — закрыть" })
      ]
    }
  ) });
}
var name = "dsh-session-health";
var inject = ["slots", "sessions", "remote", "remote.commands", "locale", "uiWorkspace"];
function injectStyles() {
  if (typeof document === "undefined") return;
  const tagId = "dsh-session-health/badge";
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(tagId)}]`) !== null) return;
  const tag = document.createElement("style");
  tag.dataset.plugin = name;
  tag.dataset.pluginCss = tagId;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}
function apply(ctx) {
  injectStyles();
  const sessions = ctx.sessions;
  const commands = ctx.remote.commands;
  const locale = ctx.locale;
  ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register(
    { name: "conversation.session.header.utilities", id: "session-health-dot", order: 10,
      inject: (sessionId) => ({ sessionId }) },
    (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      HealthBadge,
      {
        sessionId: props.sessionId,
        sessions,
        commands,
        locale
      }
    )
  ));
  const overviewStore = new OverviewStore();
  ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register(
    { name: "sidebar.footer.action", id: "session-health-overview", order: 10 },
    (props) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(OverviewAction, { wide: props.wide, store: overviewStore })
  ));
  ctx.slots.inject("shell.overlay", () => ctx.slots.register(
    { name: "shell.overlay", id: "session-health-overview-panel", order: 10 },
    () => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      OverviewPanel,
      {
        store: overviewStore,
        sessions,
        navigation: ctx.uiWorkspace,
        commands,
        locale
      }
    )
  ));
}
return module.exports; } });
//# sourceMappingURL=client.js.map
