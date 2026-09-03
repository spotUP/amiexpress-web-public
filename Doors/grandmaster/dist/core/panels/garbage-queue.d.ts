/**
 * The garbage queue, ported from common/engine/GarbageQueue.lua (@ c80668e).
 *
 * Garbage does not go from one board to the other immediately - it spends 151
 * frames in flight, and that delay is the game. Three stages:
 *
 *   STAGED     91 frames. This is what the telegraph shows above the receiver,
 *              and it is why you can see an attack coming and clear space for
 *              it. Chain garbage additionally will not leave until the chain
 *              that is building it has ENDED.
 *   TRANSIT    60 more frames after leaving staging, during which nothing is
 *              drawn. Deliberate slack: it is what lets a laggy opponent's
 *              garbage still arrive on the right frame.
 *   LANDED     the receiver drops it when its board is calm enough.
 *
 * PRIORITY IS BY POSITION, and the array is ordered so that the HIGHEST
 * priority sits at the END - popping from the end costs nothing, popping from
 * the front would shift every element. So the ordering comparator reads
 * backwards from what you would expect. Chains outrank combos; wider combos
 * outrank narrower ones; combos queue before shock.
 *
 * ONE DELIBERATE DIVERGENCE, the same one consts.ts documents: a chain's
 * garbage stops growing at twelve rows. panel-attack grows it without limit;
 * the SNES original caps it, per both the manual FAQ and panel-pop.
 */
export interface Garbage {
    /** Columns, 1 to the receiving stack's width. */
    width: number;
    /** Rows, at least 1. */
    height: number;
    /** Shock/metal garbage. Mutually exclusive with isChain. */
    isMetal: boolean;
    isChain: boolean;
    /** The clock this piece was earned at; the staging timer counts from it. */
    frameEarned: number;
    /** Where the attack graphic starts from. Chains track this per link. */
    rowEarned?: number;
    colEarned?: number;
    /** Has the chain that is growing this stopped? Until then it cannot leave. */
    finalized?: boolean;
    finalizedClock?: number;
    links?: Map<number, {
        rowEarned: number;
        colEarned: number;
    }>;
    linkTimes?: number[];
}
export declare class GarbageQueue {
    /** Waiting to be sent. Lowest priority first, highest LAST. */
    stagedGarbage: Garbage[];
    /** In flight, keyed by the clock it may land on. */
    garbageInTransit: Map<number, Garbage[]>;
    /** Everything ever pushed, in order. Exists for tests and score reports. */
    history: Garbage[];
    /** Delivery clocks, oldest first. */
    transitTimers: number[];
    /** The chain currently being grown, if any. */
    currentChain: Garbage | null;
    /** Attack engines may queue combos as chains; real stacks may not. */
    illegalStuffIsAllowed: boolean;
    treatMetalAsCombo: boolean;
    onGarbagePushed?: (garbage: Garbage) => void;
    onNewChainLink?: (chain: Garbage) => void;
    onChainEnded?: (chain: Garbage) => void;
    constructor(allowIllegalStuff?: boolean, treatMetalAsCombo?: boolean);
    private sort;
    /**
     * Combo garbage taller than one row is relabelled as a chain when illegal
     * stuff is allowed, which lets an attack pattern queue several chains on one
     * frame. Real play never reaches this.
     */
    private correctChainingFlag;
    /** Queue one piece. For chains use addChainLink instead. */
    push(garbage: Garbage): void;
    pushTable(garbageArray: Garbage[] | null | undefined): void;
    /** The next piece that would leave, without removing it. */
    peek(): Garbage | undefined;
    pop(): Garbage | undefined;
    len(): number;
    getOldestFinishedTransitTime(): number | undefined;
    /**
     * Take the garbage due to land at `clock`.
     *
     * A real queue may only pop the exact clock asked for. An attack engine may
     * also pop something that should have landed EARLIER, which is how a
     * simulated opponent stays on schedule when the player's board is busy.
     */
    popFinishedTransitsAt(clock: number): Garbage[] | undefined;
    /**
     * Move everything that has served its staging time into transit.
     *
     * Walks from the HIGHEST priority end and stops at the first piece that is
     * not ready: order is preserved, so a newer high-priority piece cannot
     * overtake an older one that is still waiting. A chain that has not ended
     * blocks the walk, because its size is still changing.
     */
    processStagedGarbageForClock(clock: number): void;
    /**
     * Grow the chain being built, or start one.
     *
     * A chain sends ONE 6-wide block whose height is the number of links, not a
     * block per link - so the whole chain arrives together when it ends. Capped
     * at twelve rows: see MAX_CHAIN_GARBAGE_HEIGHT for why we diverge from
     * panel-attack here.
     */
    addChainLink(frameEarned: number, row: number, column: number): void;
    /** The chain has ended, so its garbage may now start its staging clock. */
    finalizeCurrentChain(clock: number): void;
    /**
     * Where a piece sits from the TELEGRAPH's point of view - which numbers from
     * the next piece to pop, while the array is ordered the other way.
     */
    getGarbageIndex(garbage: Garbage): number;
}
//# sourceMappingURL=garbage-queue.d.ts.map