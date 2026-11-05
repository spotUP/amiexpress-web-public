"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelMatch = void 0;
const consts_1 = require("./consts");
class PanelMatch {
    constructor(options) {
        this.clock = 0;
        this.aborted = false;
        this.desyncError = false;
        this.stacks = options.stacks;
        this.timeLimit = options.timeLimit ?? null;
        this.garbageTargets = options.garbageTargets
            ?? this.stacks.map((_, index) => this.stacks.map((__, i) => i).filter((i) => i !== index));
    }
    /** Who sends garbage TO this stack. The inverse of garbageTargets. */
    sourcesFor(targetIndex) {
        const sources = [];
        this.garbageTargets.forEach((targets, sourceIndex) => {
            if (targets.includes(targetIndex))
                sources.push(this.stacks[sourceIndex]);
        });
        return sources;
    }
    /**
     * Hand over anything due to land on this stack right now.
     *
     * A queue only releases garbage for the EXACT frame asked for, so a stack
     * that is behind simply is not offered anything yet - which is the whole
     * mechanism by which the 151-frame flight stays honest.
     */
    pushGarbageTo(targetIndex) {
        const target = this.stacks[targetIndex];
        for (const source of this.sourcesFor(targetIndex)) {
            const oldest = source.outgoingGarbage.getOldestFinishedTransitTime();
            if (oldest === undefined)
                continue;
            const delivery = source.outgoingGarbage.popFinishedTransitsAt(target.stopWatch);
            if (delivery)
                this.receive(target, delivery);
        }
    }
    receive(stack, garbage) {
        stack.incomingGarbage.pushTable(garbage);
    }
    /** One frame for every stack. */
    run() {
        if (this.hasEnded())
            return;
        for (let i = 0; i < this.stacks.length; i++) {
            this.pushGarbageTo(i);
            this.stacks[i].run();
        }
        this.clock += 1;
        if (this.isIrrecoverablyBehind()) {
            this.desyncError = true;
            this.aborted = true;
        }
    }
    /**
     * Has one stack fallen further behind than the flight time can absorb?
     *
     * Unreachable while both run in one loop, and kept because it is the honest
     * failure for a real network path: upstream does not try to recover, it
     * aborts.
     */
    isIrrecoverablyBehind() {
        for (let target = 0; target < this.stacks.length; target++) {
            for (const source of this.sourcesFor(target)) {
                if (source.clock + consts_1.MAX_LAG < this.stacks[target].clock)
                    return true;
            }
        }
        return false;
    }
    /** Stacks still playing. */
    aliveStacks() {
        return this.stacks.filter((stack) => !stack.gameEnded());
    }
    hasEnded() {
        if (this.aborted)
            return true;
        if (this.timeLimit !== null && this.clock >= this.timeLimit)
            return true;
        // A two-player match is over when only one is left standing.
        return this.aliveStacks().length <= 1;
    }
    /**
     * Who won.
     *
     * The last one standing; or, if the clock ran out or both died on the same
     * frame, everyone still alive - which is how a draw is expressed.
     */
    getWinners() {
        const alive = this.aliveStacks();
        if (alive.length > 0)
            return alive;
        // Everyone died: whoever lasted longest.
        const latest = Math.max(...this.stacks.map((s) => s.gameOverClock));
        return this.stacks.filter((s) => s.gameOverClock === latest);
    }
}
exports.PanelMatch = PanelMatch;
//# sourceMappingURL=match.js.map