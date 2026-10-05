/**
 * dsh-session-health — plugin configuration.
 *
 * Every threshold mirrors the community session-health skill's
 * two-dimensional continue-vs-new decision model, but as host-side defaults a
 * deployment can override. The exported schemastery `Config` documents the
 * shape for the Loader / settings UI; resolveConfig() defensively defaults so
 * partial configs (and tests) always yield a complete ResolvedConfig.
 */
import z from '@deepseek-ai/schemastery';
/** Schemastery schema: documents the shape for the Loader and settings UI. */
export const Config = z.object({
    thresholds: z.object({
        windowMid: z.number().min(0).max(1).default(0.3),
        windowHigh: z.number().min(0).max(1).default(0.5),
        windowCritical: z.number().min(0).max(1).default(0.8),
        economyTokenFloor: z.number().min(0).default(50000),
        economyWindowRatio: z.number().min(0).max(1).default(0.3),
        economyRoundFloor: z.number().min(0).default(10),
        messageCountProxy: z.number().min(0).default(800),
    }),
    checks: z.object({
        git: z.object({
            enabled: z.boolean().default(true),
            workspaceRoot: z.string(),
        }),
        handoff: z.object({
            enabled: z.boolean().default(true),
            /** User-named handoff documents; the concept is yours, the names are yours. */
            paths: z.array(z.string()).default([]),
        }),
        sessionResume: z.object({ enabled: z.boolean().default(true) }),
        processes: z.object({ enabled: z.boolean().default(true) }),
    }),
    projection: z.object({ enabled: z.boolean().default(true) }),
    cost: z.object({
        cacheHitDiscount: z.number().min(0).max(1).default(0.1),
        inputPricePerM: z.number().min(0).default(0.28),
        priceSource: z.union([z.const('auto'), z.const('static')]).default('auto'),
        priceUrl: z.string().default('https://cdn.jsdelivr.net/gh/NinjaSln-labs/dsh-plugins@main/pricing/deepseek.json'),
        priceFallbackUrl: z.string().default('https://raw.githubusercontent.com/NinjaSln-labs/dsh-plugins/main/pricing/deepseek.json'),
        priceRefreshHours: z.number().min(1).max(24 * 30).default(24),
    }),
});
export function resolveConfig(config = {}) {
    const thresholds = {
        windowMid: config.thresholds?.windowMid ?? 0.3,
        windowHigh: config.thresholds?.windowHigh ?? 0.5,
        windowCritical: config.thresholds?.windowCritical ?? 0.8,
        economyTokenFloor: config.thresholds?.economyTokenFloor ?? 50000,
        economyWindowRatio: config.thresholds?.economyWindowRatio ?? 0.3,
        economyRoundFloor: config.thresholds?.economyRoundFloor ?? 10,
        messageCountProxy: config.thresholds?.messageCountProxy ?? 800,
    };
    const checks = {
        git: {
            enabled: config.checks?.git?.enabled ?? true,
            workspaceRoot: config.checks?.git?.workspaceRoot,
        },
        handoff: {
            enabled: config.checks?.handoff?.enabled ?? true,
            paths: config.checks?.handoff?.paths ?? [],
        },
        sessionResume: { enabled: config.checks?.sessionResume?.enabled ?? true },
        processes: { enabled: config.checks?.processes?.enabled ?? true },
    };
    const projection = { enabled: config.projection?.enabled ?? true };
    const cost = {
        cacheHitDiscount: config.cost?.cacheHitDiscount ?? 0.1,
        inputPricePerM: config.cost?.inputPricePerM ?? 0.28,
        priceSource: config.cost?.priceSource ?? 'auto',
        priceUrl: config.cost?.priceUrl ?? 'https://cdn.jsdelivr.net/gh/NinjaSln-labs/dsh-plugins@main/pricing/deepseek.json',
        priceFallbackUrl: config.cost?.priceFallbackUrl ?? 'https://raw.githubusercontent.com/NinjaSln-labs/dsh-plugins/main/pricing/deepseek.json',
        priceRefreshHours: config.cost?.priceRefreshHours ?? 24,
    };
    return { thresholds, checks, projection, cost };
}
