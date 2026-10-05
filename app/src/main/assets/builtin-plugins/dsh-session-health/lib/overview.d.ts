/**
 * dsh-session-health — multi-session overview (panel data).
 *
 * Host side of the 多会话健康一览面板: one read-only snapshot of every
 * session's health verdict for the browser panel (`sidebar.footer.action`
 * opens it, `shell.overlay` renders it).
 *
 * Data path: `sessionQuery.listSessions()` → per-record health value
 * (live sessions cut the projection registry's O(1) snapshot; cold sessions
 * read the persisted projection cache, falling back to an async cold load)
 * and titles (live sessions cut the log-backed title fold; the rest are
 * batch-read). Everything is read-only — the panel never mutates sessions,
 * projections, or caches.
 *
 * Transport: same-origin JSON RPC (POST /session-health-rpc, loopback-only),
 * the same pattern dsh-imgdraw established for bundle clients — a bundle
 * client cannot expose a plugin Remote, so browser↔host calls ride the
 * webServer route seam.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SessionHealthProjection } from './types.ts';
/** One session row in the overview panel. */
export interface OverviewRow {
    id: string;
    /** Best-known title; null when no title event exists yet. */
    title: string | null;
    /** True when the session is currently materialized in ctx.sessions. */
    live: boolean;
    /** Session creation time (Unix epoch ms) — secondary sort key. */
    createdAt: number;
    /** The health verdict; null when no projection value exists (cold + no cache row). */
    health: SessionHealthProjection | null;
}
/** Sort rank: red first, then yellow / blue / green, unknown last. */
export declare function rankOf(health: SessionHealthProjection | null | undefined): number;
/** Stable sort: severity tier first (red on top), newest session first inside a tier. */
export declare function sortOverviewRows(rows: OverviewRow[]): OverviewRow[];
/**
 * Build the overview rows for every known session. Never throws on a single
 * bad session — per-record failures degrade to `health: null` / `title: null`
 * so one broken record cannot blank the whole panel. Returns [] when the
 * sessionQuery service is absent (headless assemblies keep working).
 */
export declare function buildOverview(ctx: Context, signal: AbortSignal): Promise<OverviewRow[]>;
/**
 * Full HTTP handler for POST /session-health-rpc. Methods:
 *   { method: 'overview' } → { ok: true, result: { sessions: OverviewRow[] } }
 * Loopback-only (panel data is private to the machine); 405 on non-POST,
 * 400 on malformed JSON, 403 on non-loopback peers, 500 on service failure.
 */
export declare function handleOverviewRpc(req: IncomingMessage, res: ServerResponse, ctx: Context): Promise<void>;
