"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GarbageQueue = void 0;
const consts_1 = require("./consts");
/** Ordering between two chains: unfinalised last, then newest first. */
function orderChainGarbage(a, b) {
    if (a.finalized === b.finalized)
        return a.frameEarned > b.frameEarned;
    return !a.finalized;
}
/**
 * Ordering between two combos: WIDER FIRST, and for equal widths the newer one
 * goes ahead - upstream notes this deviation deliberately, because it refreshes
 * the older piece's release time.
 */
function orderComboGarbage(a, b) {
    if (a.width !== b.width)
        return a.width > b.width;
    return a.frameEarned < b.frameEarned;
}
/** True if `a` sorts before `b`. Priority INCREASES with index. */
function garbageComesFirst(a, b, treatMetalAsCombo) {
    if (a.isChain === b.isChain) {
        if (a.isChain)
            return orderChainGarbage(a, b);
        if (a.isMetal === b.isMetal)
            return orderComboGarbage(a, b);
        // A combo and a shock. Normally a combo queues BEFORE shock, so shock pops
        // first; treatMetalAsCombo merges them, which some attack patterns want.
        if (treatMetalAsCombo)
            return orderComboGarbage(a, b);
        return a.isMetal;
    }
    // A chain outranks a combo, so it sorts after it.
    return !a.isChain;
}
class GarbageQueue {
    constructor(allowIllegalStuff = false, treatMetalAsCombo = false) {
        /** Waiting to be sent. Lowest priority first, highest LAST. */
        this.stagedGarbage = [];
        /** In flight, keyed by the clock it may land on. */
        this.garbageInTransit = new Map();
        /** Everything ever pushed, in order. Exists for tests and score reports. */
        this.history = [];
        /** Delivery clocks, oldest first. */
        this.transitTimers = [];
        /** The chain currently being grown, if any. */
        this.currentChain = null;
        this.illegalStuffIsAllowed = allowIllegalStuff;
        this.treatMetalAsCombo = treatMetalAsCombo;
    }
    sort() {
        // Lua's table.sort is unstable and JavaScript's is stable, which can only
        // narrow the possible orderings, never widen them: for equal elements the
        // comparator has no opinion either way.
        this.stagedGarbage.sort((a, b) => {
            if (garbageComesFirst(a, b, this.treatMetalAsCombo))
                return -1;
            if (garbageComesFirst(b, a, this.treatMetalAsCombo))
                return 1;
            return 0;
        });
    }
    /**
     * Combo garbage taller than one row is relabelled as a chain when illegal
     * stuff is allowed, which lets an attack pattern queue several chains on one
     * frame. Real play never reaches this.
     */
    correctChainingFlag(garbage) {
        if (garbage.height > 1 && this.illegalStuffIsAllowed) {
            garbage.isChain = true;
            garbage.finalized = true;
        }
    }
    /** Queue one piece. For chains use addChainLink instead. */
    push(garbage) {
        this.correctChainingFlag(garbage);
        this.stagedGarbage.push(garbage);
        this.history.push(garbage);
        this.sort();
        this.onGarbagePushed?.(garbage);
    }
    pushTable(garbageArray) {
        if (!garbageArray)
            return;
        for (const garbage of garbageArray)
            this.push(garbage);
    }
    /** The next piece that would leave, without removing it. */
    peek() {
        return this.stagedGarbage[this.stagedGarbage.length - 1];
    }
    pop() {
        return this.stagedGarbage.pop();
    }
    len() {
        return this.stagedGarbage.length;
    }
    getOldestFinishedTransitTime() {
        return this.transitTimers[0];
    }
    /**
     * Take the garbage due to land at `clock`.
     *
     * A real queue may only pop the exact clock asked for. An attack engine may
     * also pop something that should have landed EARLIER, which is how a
     * simulated opponent stays on schedule when the player's board is busy.
     */
    popFinishedTransitsAt(clock) {
        const next = this.transitTimers[0];
        if (next === undefined)
            return undefined;
        if (next === clock) {
            this.transitTimers.shift();
            return this.garbageInTransit.get(clock);
        }
        if (this.illegalStuffIsAllowed && next < clock) {
            const due = this.transitTimers.shift();
            return this.garbageInTransit.get(due);
        }
        return undefined;
    }
    /**
     * Move everything that has served its staging time into transit.
     *
     * Walks from the HIGHEST priority end and stops at the first piece that is
     * not ready: order is preserved, so a newer high-priority piece cannot
     * overtake an older one that is still waiting. A chain that has not ended
     * blocks the walk, because its size is still changing.
     */
    processStagedGarbageForClock(clock) {
        let popped;
        for (let i = this.stagedGarbage.length - 1; i >= 0; i--) {
            const garbage = this.stagedGarbage[i];
            const notReady = garbage.isChain
                ? (!garbage.finalized || garbage.frameEarned + consts_1.STAGING_DURATION > clock)
                : (garbage.frameEarned + consts_1.STAGING_DURATION > clock);
            if (notReady)
                break;
            if (!popped)
                popped = [];
            popped.push(this.stagedGarbage.pop());
        }
        if (popped) {
            const deliveryTime = clock + consts_1.GARBAGE_DELAY_LAND_TIME;
            this.garbageInTransit.set(deliveryTime, popped);
            this.transitTimers.push(deliveryTime);
        }
    }
    /**
     * Grow the chain being built, or start one.
     *
     * A chain sends ONE 6-wide block whose height is the number of links, not a
     * block per link - so the whole chain arrives together when it ends. Capped
     * at twelve rows: see MAX_CHAIN_GARBAGE_HEIGHT for why we diverge from
     * panel-attack here.
     */
    addChainLink(frameEarned, row, column) {
        if (this.currentChain === null) {
            this.currentChain = {
                width: 6,
                height: 1,
                isMetal: false,
                isChain: true,
                frameEarned,
                finalized: false,
                links: new Map([[frameEarned, { rowEarned: row, colEarned: column }]]),
                linkTimes: [frameEarned],
            };
            this.push(this.currentChain);
        }
        else {
            const chain = this.currentChain;
            chain.height = Math.min(chain.height + 1, consts_1.MAX_CHAIN_GARBAGE_HEIGHT);
            chain.frameEarned = frameEarned;
            chain.links?.set(frameEarned, { rowEarned: row, colEarned: column });
            chain.linkTimes?.push(frameEarned);
        }
        this.onNewChainLink?.(this.currentChain);
    }
    /** The chain has ended, so its garbage may now start its staging clock. */
    finalizeCurrentChain(clock) {
        if (!this.currentChain)
            return;
        this.currentChain.finalized = true;
        this.currentChain.finalizedClock = clock;
        this.onChainEnded?.(this.currentChain);
        this.currentChain = null;
    }
    /**
     * Where a piece sits from the TELEGRAPH's point of view - which numbers from
     * the next piece to pop, while the array is ordered the other way.
     */
    getGarbageIndex(garbage) {
        const count = this.stagedGarbage.length;
        for (let i = 0; i < count; i++) {
            if (this.stagedGarbage[i] === garbage)
                return count - 1 - i;
        }
        throw new Error('garbage is not in the queue it claims to be in');
    }
}
exports.GarbageQueue = GarbageQueue;
//# sourceMappingURL=garbage-queue.js.map