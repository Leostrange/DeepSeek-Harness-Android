import { Config, resolveConfig } from "./config.js";
import { sessionHealthProjectionDefinition } from "./projection.js";
import { healthCommandDefinition } from "./command.js";
import { sessionHealthTool } from "./tool.js";
import { PriceCache, startPricingRefresh, staticPricing } from "./pricing.js";
import { handleOverviewRpc } from "./overview.js";
export { Config } from "./config.js";
export { sessionHealthProjectionDefinition, applyHealthEvent, healthView } from "./projection.js";
export { assess } from "./assess.js";
export { healthCommandDefinition, buildCommandText } from "./command.js";
export { sessionHealthTool } from "./tool.js";
export { buildOverview, sortOverviewRows, rankOf, handleOverviewRpc } from "./overview.js";
export const name = 'dsh-session-health';
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
export default {
    name,
    Config,
    apply(ctx, config = {}) {
        const resolved = resolveConfig(config);
        // Live pricing cache: periodic fetch when priceSource is 'auto',
        // static config otherwise. Provided on the context so assess() and the
        // projection view share one resolved price.
        const pricing = new PriceCache(staticPricing(resolved.cost.inputPricePerM, resolved.cost.cacheHitDiscount));
        ctx.provide('sessionHealthPricing', pricing);
        startPricingRefresh(ctx, resolved.cost, pricing);
        // Current model name for per-model prices ('' falls back to the doc's "*").
        const modelOf = () => {
            try {
                const sel = ctx.get('agentDefaultModel')?.currentSelection();
                return sel?.model ?? '';
            }
            catch {
                return '';
            }
        };
        // Reactive badge data (optional child: headless assemblies without the
        // projection registry just lose the push path, not the plugin).
        if (resolved.projection.enabled) {
            ctx.inject(['sessionProjections'], (projectionCtx) => {
                projectionCtx.sessionProjections.register(sessionHealthProjectionDefinition(resolved, pricing, modelOf));
            });
        }
        // Model-callable self-check (optional child).
        ctx.inject(['tools'], (toolCtx) => {
            toolCtx.tools.register(sessionHealthTool(toolCtx, resolved));
        });
        // User-initiated report (optional child).
        ctx.inject(['commands'], (commandCtx) => {
            commandCtx.commands.register(healthCommandDefinition(commandCtx, resolved));
        });
        // Multi-session overview panel data (optional child): same-origin RPC
        // route for the browser panel — bundle clients cannot mount a plugin
        // Remote, so browser↔host calls ride the webServer seam (imgdraw pattern).
        // ctx.inject waits for the service: bundles apply before webServer
        // activates at boot and ctx.get would silently return undefined.
        ctx.inject(['webServer'], (wsCtx) => {
            const webServer = wsCtx.webServer;
            const dispose = webServer.register({
                kind: 'exact',
                path: '/session-health-rpc',
                handler: (req, res) => handleOverviewRpc(req, res, wsCtx),
            });
            ctx.effect(() => () => { try {
                dispose();
            }
            catch { /* ignore */ } });
        });
    },
};
