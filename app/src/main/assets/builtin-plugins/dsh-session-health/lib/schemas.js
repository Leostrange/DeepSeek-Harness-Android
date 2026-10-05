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
/** Wire schema for the projection value (validated before every push). */
export const sessionHealthProjectionSchema = zod.object({
    severity: zod.enum(['green', 'blue', 'yellow', 'red']),
    advice: zod.string(),
    ratio: zod.number().nullable(),
    total: zod.number().nullable(),
    window: zod.number().nullable(),
    turns: zod.number().int().nonnegative(),
    userMessages: zod.number().int().nonnegative(),
    assistantMessages: zod.number().int().nonnegative(),
    compactions: zod.number().int().nonnegative(),
    uncachedInputTokens: zod.number().int().nonnegative().nullable(),
    cacheReadTokens: zod.number().int().nonnegative().nullable(),
    effectivePerRound: zod.number().nonnegative().nullable(),
    effectivePerRoundUsd: zod.number().nonnegative().nullable(),
    effectivePerRoundCny: zod.number().nonnegative().nullable(),
    pricePeriod: zod.enum(['peak', 'offpeak']).nullable(),
}).strict();
