import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** Owner share of one action beside Settings at the sidebar foot. */
        'sidebar.footer.action': {
            kind: 'list';
            scope: 'root';
            owner: {
                wide: boolean;
            };
        };
        /** Frame-wide floating layer (list slot, no owner props). */
        'shell.overlay': {
            kind: 'list';
            scope: 'root';
        };
    }
}
import type { SessionHealthProjection } from './types.ts';
/**
 * token-meter's contextPressure projection value (the harness core publishes
 * it alongside sessionHealth; compaction-aware).
 */
export interface ContextPressureLike {
    /** Provider-reported prompt size of the most recent request. */
    pressureTokens?: number;
    /** What the NEXT request's prompt would cost (reacts to compaction). */
    projectedTokens?: number;
    /** Newest known route capacity. */
    contextWindow?: number;
}
/**
 * Merge the sessionHealth verdict with token-meter's compaction-aware
 * contextPressure numbers: the occupancy figure the badge displays should be
 * "what the next request costs", not a stale pre-compaction sample. Pure.
 */
export declare function mergePressure(proj: SessionHealthProjection | undefined, pressure: ContextPressureLike | undefined): {
    total: number | null;
    window: number | null;
    ratio: number | null;
    projected: number | null;
};
/** Package id — must match package.json `name` and the ModuleLoader handoff. */
export declare const name = "dsh-session-health";
/**
 * Required client services. Cordis forbids `ctx.remote` / `ctx.sessions` /
 * `ctx.slots` property reads unless they appear here (topology-sensitive
 * proxy; "cannot get property X without inject"). Both the `remote` root and
 * the `remote.commands` sub-service are injected, mirroring the in-tree
 * convention (ui-goal: ['slots','sessions','remote','remote.goals',...]).
 * There is deliberately NO `remote.sessionHealth`: plugin Remotes never mount
 * client-side, and an injected one would leave the entry pending forever.
 */
export declare const inject: string[];
/** Client entry: register the badge + the multi-session overview panel seats. */
export declare function apply(ctx: ClientContext): void;
