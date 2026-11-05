/**
 * A two-player match over the wire.
 *
 * LOCKSTEP ON INPUTS. Each side simulates BOTH boards and only one input
 * character per frame per player ever crosses. No board state, no garbage
 * packets, no positions: the engine is deterministic, so the same seed and the
 * same inputs give both machines the same game. That is why the bit-exact PRNG
 * mattered twice - once for replays, and again here, because one divergent
 * panel means two people are playing different games and neither finds out
 * until the garbage stops adding up.
 *
 * THE RULE THAT MAKES IT WORK: a frame runs only when EVERY player's input for
 * it has arrived. A side that ran ahead on its own input would have to be
 * rolled back when the other's arrived, and rollback is the thing this design
 * exists to avoid. Waiting is a stutter; running ahead is a desync.
 *
 * Nothing recovers a desync and upstream does not try. A match aborts when one
 * side falls more than MAX_LAG frames behind, which on this board - where both
 * players run in the same backend process - essentially cannot happen, and is
 * kept because it is the honest failure for a real network path.
 */
import { Stack } from '../core/panels/stack';
import { PanelMatch } from '../core/panels/match';
import type { PanelTransport, PanelMatchSetup } from './panel-transport';
/** What the session did with a call to step(). */
export type NetplayStep = 
/** Every input was present; a frame ran. */
'ran'
/** Somebody's input has not arrived; nothing ran and nothing was lost. */
 | 'waiting'
/** The match is over, by a board topping out or by an abort. */
 | 'ended';
export interface PanelNetplayOptions {
    transport: PanelTransport;
    setup: PanelMatchSetup;
}
export declare class PanelNetplaySession {
    readonly stacks: Stack[];
    readonly match: PanelMatch;
    /** Index of this node's own board in `stacks`. */
    readonly localIndex: number;
    private readonly transport;
    private readonly setup;
    /** Inputs received per player, oldest first, not yet consumed. */
    private readonly queues;
    private readonly unsubscribe;
    private frame;
    private aborted;
    constructor(options: PanelNetplayOptions);
    /** A remote player's input, queued until its frame comes round. */
    private receive;
    /**
     * Offer this node's input for the next frame and run it if everyone's is in.
     *
     * The local input is queued through the SAME path as a remote one rather
     * than being applied directly. It costs nothing and it means the local board
     * cannot accidentally run a frame ahead of the boards it is being compared
     * against.
     */
    step(localInput: string): NetplayStep;
    /**
     * Has one side fallen further behind than the flight time can absorb?
     *
     * Measured in frames of input owed, not in wall time: a slow machine that is
     * still sending is fine, and a machine that has stopped sending is not,
     * however fast it was.
     */
    private isIrrecoverablyBehind;
    hasEnded(): boolean;
    /** True when the match ended because a side stopped talking. */
    desynced(): boolean;
    /** This node's own board. */
    localStack(): Stack;
    /** The other board, for a two-player match. */
    remoteStack(): Stack;
    /** Did the local player win? Undefined while the match is still running. */
    localWon(): boolean | undefined;
    dispose(): void;
}
//# sourceMappingURL=panel-netplay-session.d.ts.map