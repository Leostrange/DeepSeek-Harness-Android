function isPair(value) {
    return Array.isArray(value)
        && value.length === 2
        && typeof value[0] === 'number' && typeof value[1] === 'number'
        && value[0] >= 0 && value[1] > value[0] && value[1] <= 24;
}
function isPeriodPrice(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const p = value;
    for (const key of ['inputMissPerMCny', 'inputHitPerMCny', 'inputMissPerMUsd', 'inputHitPerMUsd']) {
        const n = p[key];
        if (typeof n !== 'number' || !Number.isFinite(n) || n < 0)
            return false;
    }
    if (p.inputMissPerMCny <= 0 || p.inputMissPerMUsd <= 0)
        return false;
    return true;
}
function isModelPrice(value) {
    if (typeof value !== 'object' || value === null)
        return false;
    const v = value;
    return isPeriodPrice(v.peak) && isPeriodPrice(v.offpeak);
}
function validDocument(value) {
    if (typeof value !== 'object' || value === null)
        return null;
    const doc = value;
    if (!Array.isArray(doc.peakHours) || doc.peakHours.length === 0 || !doc.peakHours.every(isPair))
        return null;
    if (typeof doc.models !== 'object' || doc.models === null)
        return null;
    const models = {};
    let found = false;
    for (const [name, price] of Object.entries(doc.models)) {
        if (!isModelPrice(price))
            return null;
        models[name] = price;
        found = true;
    }
    if (!found)
        return null;
    return {
        peakHours: doc.peakHours,
        models,
    };
}
/** Beijing wall-clock minutes from an epoch-millis instant (fixed UTC+8, DST-free). */
function beijingMinutes(nowMs) {
    const bj = new Date(nowMs + 8 * 3_600_000);
    return bj.getUTCHours() * 60 + bj.getUTCMinutes();
}
/** DeepSeek peak/valley: peak when Beijing time falls inside a peak window. */
export function periodAt(peakHours, nowMs) {
    const t = beijingMinutes(nowMs);
    for (const [start, end] of peakHours) {
        if (t >= start * 60 && t < end * 60)
            return 'peak';
    }
    return 'offpeak';
}
/** Static-mode resolved pricing (flat USD, no period, no CNY). */
export function staticPricing(inputPricePerM, cacheHitDiscount) {
    return {
        missPerMUsd: inputPricePerM,
        hitPerMUsd: inputPricePerM * cacheHitDiscount,
        missPerMCny: null,
        hitPerMCny: null,
        period: null,
    };
}
/** Live pricing cache: static values until a successful fetch replaces them. */
export class PriceCache {
    fallback;
    doc = null;
    constructor(fallback) {
        this.fallback = fallback;
    }
    /**
     * Current resolved pricing for one model (unknown models use the doc's
     * "*" entry; no doc or no matching entry → the static fallback). The
     * period is evaluated against the current Beijing time on every call.
     */
    get(model) {
        if (this.doc === null)
            return this.fallback;
        const entry = (model !== undefined && model !== '' ? this.doc.models[model] : undefined) ?? this.doc.models['*'];
        if (entry === undefined)
            return this.fallback;
        const period = periodAt(this.doc.peakHours, Date.now());
        const p = entry[period];
        return {
            missPerMUsd: p.inputMissPerMUsd,
            hitPerMUsd: p.inputHitPerMUsd,
            missPerMCny: p.inputMissPerMCny,
            hitPerMCny: p.inputHitPerMCny,
            period,
        };
    }
    /** One refresh attempt; false (and unchanged state) on any failure. */
    async refresh(url, fetchImpl = fetch, timeoutMs = 10_000) {
        try {
            const response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok)
                return false;
            const doc = validDocument(await response.json());
            if (doc === null)
                return false;
            this.doc = doc;
            return true;
        }
        catch {
            return false;
        }
    }
    /** Try the URLs in order; the first successful fetch wins. */
    async refreshAny(urls, fetchImpl = fetch, timeoutMs = 10_000) {
        for (const url of urls) {
            if (await this.refresh(url, fetchImpl, timeoutMs))
                return true;
        }
        return false;
    }
}
function intervalDisposer(ctx, fn, delayMs) {
    // cordis-plugin-timer when mounted; a raw interval otherwise (both cleaned
    // up through the effect, so the fiber never leaks the timer).
    const timer = ctx.get('timer');
    if (timer !== undefined) {
        return timer.setInterval(fn, delayMs);
    }
    const id = setInterval(fn, delayMs);
    return () => clearInterval(id);
}
/**
 * Start the periodic price refresh: one immediate fire-and-forget fetch (with
 * the fallback URL in the same cycle), then `priceRefreshHours` cadence.
 * Failures are silent (the cache keeps the last good price / the static
 * fallback). Disposal rides the calling fiber.
 * @returns the disposer.
 */
export function startPricingRefresh(ctx, config, cache) {
    if (config.priceSource !== 'auto')
        return () => { };
    const urls = [...new Set([config.priceUrl, config.priceFallbackUrl].filter(Boolean))];
    const refresh = () => void cache.refreshAny(urls);
    refresh();
    return ctx.effect(() => intervalDisposer(ctx, refresh, config.priceRefreshHours * 3_600_000), 'dsh-session-health: pricing refresh');
}
