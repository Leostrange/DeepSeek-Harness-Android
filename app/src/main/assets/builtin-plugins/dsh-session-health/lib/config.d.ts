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
export interface ThresholdsConfig {
    /** Window-ratio floor of the "留意" (blue) tier. Default 0.3. */
    windowMid: number;
    /** Window-ratio floor of the "留意/收尾" (yellow) tier. Default 0.5. */
    windowHigh: number;
    /** Window-ratio floor of the "危险区" (red) tier. Default 0.8. */
    windowCritical: number;
    /**
     * Billable-equivalent (cache-discounted) tokens per round that make the
     * economy dimension expensive. Default 50000. The effective floor is
     * max(economyTokenFloor, economyWindowRatio × contextWindow) when the
     * window is known — the absolute default was calibrated for ~128K-window
     * models, so it must scale up on larger windows or every session crosses
     * it at single-digit occupancy.
     */
    economyTokenFloor: number;
    /**
     * Window-ratio component of the economy floor (see economyTokenFloor).
     * Default 0.3: on a 1M-window model the economy tier needs ~300K
     * billable-equivalent per round before it outranks the ratio tiers.
     */
    economyWindowRatio: number;
    /** Remaining rounds at which economy cost accumulates. Default 10. */
    economyRoundFloor: number;
    /** Message-count proxy for context bloat. Default 800. */
    messageCountProxy: number;
}
export interface ChecksConfig {
    git: {
        enabled: boolean;
        workspaceRoot?: string;
    };
    handoff: {
        enabled: boolean;
        paths: string[];
    };
    sessionResume: {
        enabled: boolean;
    };
    processes: {
        enabled: boolean;
    };
}
export interface ProjectionConfig {
    /** Fold the sessionHealth projection unit (badge becomes reactive, no polling). Default true. */
    enabled: boolean;
}
export interface CostConfig {
    /**
     * Cache-hit token price as a fraction of a full-price input token (e.g.
     * DeepSeek-style 0.1 = 1/10). Used for the per-round billable-equivalent
     * figure ("计费预期") in the projection, /health, and the tool. Default 0.1.
     */
    cacheHitDiscount: number;
    /**
     * Full-price input price in USD per 1M tokens (cache hits bill at
     * cacheHitDiscount × this). Static fallback AND the value used when
     * priceSource is 'static'. Default 0.28 (DeepSeek-class pricing).
     */
    inputPricePerM: number;
    /**
     * 'auto' (default): periodically fetch the price from priceUrl and use the
     * last good document (falling back to the static values on failure).
     * 'static': never fetch; use inputPricePerM / cacheHitDiscount directly.
     */
    priceSource: 'auto' | 'static';
    /**
     * Primary JSON pricing document URL for priceSource 'auto'. Default: the
     * jsdelivr CDN mirror of the dsh-plugins repo's pricing/deepseek.json —
     * GitHub raw is unreachable on many CN networks and a failed fetch silently
     * degrades the whole money display to static USD (no CNY).
     */
    priceUrl: string;
    /**
     * Fallback URL tried in the same refresh cycle when the primary fails.
     * Default: the canonical GitHub raw location (covers CDN outages / stale
     * mirrors; whichever URL succeeds first wins).
     */
    priceFallbackUrl: string;
    /** Refresh cadence for priceSource 'auto', in hours. Default 24. */
    priceRefreshHours: number;
}
/** Untrusted plugin configuration after Loader normalization; every field optional. */
export interface Config {
    thresholds?: ThresholdsConfig;
    checks?: ChecksConfig;
    projection?: ProjectionConfig;
    cost?: CostConfig;
}
/** Schemastery schema: documents the shape for the Loader and settings UI. */
export declare const Config: z<Config>;
export interface ResolvedConfig {
    thresholds: ThresholdsConfig;
    checks: ChecksConfig;
    projection: ProjectionConfig;
    cost: CostConfig;
}
export declare function resolveConfig(config?: Config): ResolvedConfig;
