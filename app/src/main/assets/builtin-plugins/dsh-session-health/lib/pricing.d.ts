/**
 * dsh-session-health — pricing resolution.
 *
 * Money display needs input prices. The harness carries none, so the plugin
 * resolves them through a live cache driven by the OFFICIAL DeepSeek pricing
 * document (the default `priceUrl` is the dsh-plugins repo's
 * `pricing/deepseek.json`, synced from api-docs.deepseek.com/quick_start/pricing):
 * - peak/off-peak periods are evaluated against BEIJING wall time on every
 *   read (DeepSeek peak hours 9–12 and 14–18 Beijing; everything else is
 *   off-peak at half price)
 * - per-model prices picked by the current model name (models["*"] fallback)
 * - the document is CNY-denominated; USD is derived through its `usdPerCny`
 *   rate, so the client can display either currency by locale
 * - `priceSource: 'static'` never fetches and resolves the config values
 *   (USD-denominated, flat) with no period
 *
 * The projection unit's view and assess() read the same cache through
 * `ctx.sessionHealthPricing` (the fold stays event-pure).
 */
import type { Context } from '@deepseek-ai/cordis';
export type PricePeriod = 'peak' | 'offpeak' | null;
/**
 * One resolved price the money math runs on. Both official currencies ride
 * along (the zh docs publish CNY, the en docs USD — no conversion): static
 * mode carries USD only.
 */
export interface ResolvedPricing {
    /** Full-price (cache-miss) input price per 1M tokens, USD. */
    missPerMUsd: number;
    /** Cache-hit input price per 1M tokens, USD. */
    hitPerMUsd: number;
    /** Full-price (cache-miss) input price per 1M tokens, CNY; null in static mode. */
    missPerMCny: number | null;
    /** Cache-hit input price per 1M tokens, CNY; null in static mode. */
    hitPerMCny: number | null;
    /** Current period; null in static mode. */
    period: PricePeriod;
}
/** DeepSeek peak/valley: peak when Beijing time falls inside a peak window. */
export declare function periodAt(peakHours: readonly (readonly [number, number])[], nowMs: number): 'peak' | 'offpeak';
/** Static-mode resolved pricing (flat USD, no period, no CNY). */
export declare function staticPricing(inputPricePerM: number, cacheHitDiscount: number): ResolvedPricing;
/** Live pricing cache: static values until a successful fetch replaces them. */
export declare class PriceCache {
    private readonly fallback;
    private doc;
    constructor(fallback: ResolvedPricing);
    /**
     * Current resolved pricing for one model (unknown models use the doc's
     * "*" entry; no doc or no matching entry → the static fallback). The
     * period is evaluated against the current Beijing time on every call.
     */
    get(model?: string): ResolvedPricing;
    /** One refresh attempt; false (and unchanged state) on any failure. */
    refresh(url: string, fetchImpl?: typeof fetch, timeoutMs?: number): Promise<boolean>;
    /** Try the URLs in order; the first successful fetch wins. */
    refreshAny(urls: readonly string[], fetchImpl?: typeof fetch, timeoutMs?: number): Promise<boolean>;
}
/**
 * Start the periodic price refresh: one immediate fire-and-forget fetch (with
 * the fallback URL in the same cycle), then `priceRefreshHours` cadence.
 * Failures are silent (the cache keeps the last good price / the static
 * fallback). Disposal rides the calling fiber.
 * @returns the disposer.
 */
export declare function startPricingRefresh(ctx: Context, config: {
    priceSource: 'auto' | 'static';
    priceUrl: string;
    priceFallbackUrl: string;
    priceRefreshHours: number;
}, cache: PriceCache): () => void;
