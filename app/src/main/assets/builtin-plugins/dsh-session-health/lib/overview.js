const SEVERITY_RANK = { red: 0, yellow: 1, blue: 2, green: 3 };
/** Sort rank: red first, then yellow / blue / green, unknown last. */
export function rankOf(health) {
    if (health === undefined || health === null)
        return 4;
    return SEVERITY_RANK[health.severity] ?? 4;
}
/** Stable sort: severity tier first (red on top), newest session first inside a tier. */
export function sortOverviewRows(rows) {
    return [...rows].sort((a, b) => {
        const ra = rankOf(a.health);
        const rb = rankOf(b.health);
        if (ra !== rb)
            return ra - rb;
        return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    });
}
/**
 * Build the overview rows for every known session. Never throws on a single
 * bad session — per-record failures degrade to `health: null` / `title: null`
 * so one broken record cannot blank the whole panel. Returns [] when the
 * sessionQuery service is absent (headless assemblies keep working).
 */
export async function buildOverview(ctx, signal) {
    const sessionQuery = ctx.get('sessionQuery');
    if (sessionQuery === undefined)
        return [];
    let records;
    try {
        records = await sessionQuery.listSessions(signal);
    }
    catch {
        return [];
    }
    if (!Array.isArray(records) || records.length === 0)
        return [];
    const sessionsStore = ctx.get('sessions');
    const projections = ctx.get('sessionProjections');
    const cache = ctx.get('sessionProjectionCache');
    const titleSvc = ctx.get('sessionTitle');
    const rows = [];
    const pendingTitles = [];
    for (const rec of records) {
        const id = rec.header?.id;
        if (typeof id !== 'string' || id === '')
            continue;
        const createdAt = typeof rec.header.createdAt === 'number' ? rec.header.createdAt : 0;
        // Health value: live projection snapshot first, then the persisted cache
        // (sync read), then an async cold load for a persisted session.
        let health = null;
        const liveSession = rec.live === true ? sessionsStore?.get(id) : undefined;
        if (liveSession !== undefined && projections !== undefined) {
            try {
                const values = projections.snapshot(liveSession).values ?? {};
                const value = values.sessionHealth;
                if (value !== undefined && value !== null)
                    health = value;
            }
            catch { /* fall through to the cache */ }
        }
        if (health === null && cache !== undefined) {
            try {
                const snap = cache.cachedSnapshot(rec.header);
                const value = snap?.values?.sessionHealth;
                if (value !== undefined && value !== null)
                    health = value;
            }
            catch { /* fall through to cold load */ }
        }
        if (health === null && cache?.coldSnapshot !== undefined && rec.persisted === true) {
            try {
                const snap = await cache.coldSnapshot(id, signal);
                const value = snap?.values?.sessionHealth;
                if (value !== undefined && value !== null)
                    health = value;
            }
            catch { /* keep null */ }
        }
        // Title: live log-backed fold first, batch query for the rest.
        let title = null;
        if (liveSession !== undefined && titleSvc !== undefined) {
            try {
                title = titleSvc.get(liveSession)?.title ?? null;
            }
            catch { /* batch below */ }
        }
        if (title === null)
            pendingTitles.push(id);
        rows.push({ id, title, live: rec.live === true, createdAt, health });
    }
    // Batch title observation for sessions without a live fold (cold sessions).
    if (pendingTitles.length > 0 && sessionQuery.readTitleSnapshots !== undefined) {
        try {
            const observations = await sessionQuery.readTitleSnapshots(pendingTitles, signal);
            const byId = new Map(rows.map(r => [r.id, r]));
            for (const o of observations) {
                if (o.status !== 'fulfilled')
                    continue;
                const row = byId.get(o.sessionId);
                if (row !== undefined && o.value?.title?.title)
                    row.title = o.value.title.title;
            }
        }
        catch { /* titles stay null */ }
    }
    return sortOverviewRows(rows);
}
/** Loopback-only guard for the RPC route (the panel data stays on the machine). */
function isLoopback(req) {
    const addr = req.socket?.remoteAddress;
    if (addr === undefined)
        return true;
    return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
function sendJson(res, status, value) {
    const body = JSON.stringify(value);
    res.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
    });
    res.end(body);
}
async function readBody(req) {
    const chunks = [];
    for await (const chunk of req)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
}
/**
 * Full HTTP handler for POST /session-health-rpc. Methods:
 *   { method: 'overview' } → { ok: true, result: { sessions: OverviewRow[] } }
 * Loopback-only (panel data is private to the machine); 405 on non-POST,
 * 400 on malformed JSON, 403 on non-loopback peers, 500 on service failure.
 */
export async function handleOverviewRpc(req, res, ctx) {
    if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'POST only' });
        return;
    }
    if (!isLoopback(req)) {
        sendJson(res, 403, { ok: false, error: 'loopback only' });
        return;
    }
    let call;
    try {
        call = JSON.parse(await readBody(req));
    }
    catch {
        sendJson(res, 400, { ok: false, error: 'invalid json' });
        return;
    }
    if (call.method !== 'overview') {
        sendJson(res, 400, { ok: false, error: `unknown method: ${String(call.method)}` });
        return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        const sessions = await buildOverview(ctx, controller.signal);
        sendJson(res, 200, { ok: true, result: { sessions } });
    }
    catch (e) {
        sendJson(res, 500, { ok: false, error: e instanceof Error ? e.message : String(e) });
    }
    finally {
        clearTimeout(timeout);
    }
}
