/**
 * A match: two or more boards, and the garbage that travels between them.
 * Ports the routing half of common/engine/Match.lua.
 *
 * The only thing a match actually does is move garbage. Each stack sends into
 * its own outgoing queue; every frame the match asks whether anything in a
 * sender's queue is due to LAND on its target at that target's current frame,
 * and hands it over. Nothing else crosses.
 *
 * NO ROLLBACK HERE, and that is a deliberate simplification with a reason.
 * Upstream rolls a stack back when garbage arrives for a frame it has already
 * run past, which happens when two machines drift apart on a network. On this
 * board both players run in the same process on the same backend and are
 * stepped by the same loop, so their clocks cannot drift - the condition that
 * triggers a rollback is unreachable. If a real network path is ever added,
 * this is where rollback goes, and MAX_LAG is the abort threshold.
 *
 * A SimulatedStack can stand in for a player anywhere here: it speaks the same
 * two garbage queues, which is what lets Challenge Mode reuse all of this.
 */
import type { Stack } from './stack';
import type { SimulatedStack } from './simulated-stack';
/** Either kind of board. A match does not care which it is talking to. */
export type MatchStack = Stack | SimulatedStack;
export interface PanelMatchOptions {
    stacks: MatchStack[];
    /**
     * Who each stack sends to, by index. Defaults to "everyone else", which for
     * two players is simply the other one.
     */
    garbageTargets?: number[][];
    /** Frames after which the match ends regardless, for timed modes. */
    timeLimit?: number | null;
}
export declare class PanelMatch {
    readonly stacks: MatchStack[];
    /** Indices of the stacks each stack sends garbage to. */
    readonly garbageTargets: number[][];
    readonly timeLimit: number | null;
    clock: number;
    aborted: boolean;
    desyncError: boolean;
    constructor(options: PanelMatchOptions);
    /** Who sends garbage TO this stack. The inverse of garbageTargets. */
    private sourcesFor;
    /**
     * Hand over anything due to land on this stack right now.
     *
     * A queue only releases garbage for the EXACT frame asked for, so a stack
     * that is behind simply is not offered anything yet - which is the whole
     * mechanism by which the 151-frame flight stays honest.
     */
    private pushGarbageTo;
    private receive;
    /** One frame for every stack. */
    run(): void;
    /**
     * Has one stack fallen further behind than the flight time can absorb?
     *
     * Unreachable while both run in one loop, and kept because it is the honest
     * failure for a real network path: upstream does not try to recover, it
     * aborts.
     */
    private isIrrecoverablyBehind;
    /** Stacks still playing. */
    aliveStacks(): MatchStack[];
    hasEnded(): boolean;
    /**
     * Who won.
     *
     * The last one standing; or, if the clock ran out or both died on the same
     * frame, everyone still alive - which is how a draw is expressed.
     */
    getWinners(): MatchStack[];
}
//# sourceMappingURL=match.d.ts.map