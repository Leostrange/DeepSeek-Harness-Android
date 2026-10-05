/**
 * dsh-session-health — runtime schemas (host-only).
 *
 * The zod schema validates the projection value before every push. Nothing in
 * this module is imported by the client bundle.
 *
 * NOTE: no Typert Remote here. Community plugins cannot expose a Remote to
 * the browser client — the client mounts a fixed, build-time generated list
 * of remotes (api-remotes), so an injected `remote.sessionHealth` would stay
 * pending forever. The projection seam is the plugin's client data path.
 */
import { z as zod } from 'zod';
import type { SessionHealthProjection } from './types.ts';
/** Wire schema for the projection value (validated before every push). */
export declare const sessionHealthProjectionSchema: zod.ZodType<SessionHealthProjection>;
