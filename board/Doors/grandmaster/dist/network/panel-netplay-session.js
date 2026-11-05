"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PanelNetplaySession = void 0;
const stack_1 = require("../core/panels/stack");
const match_1 = require("../core/panels/match");
const generator_source_1 = require("../core/panels/generator-source");
const consts_1 = require("../core/panels/consts");
class PanelNetplaySession {
    constructor(options) {
        this.frame = 0;
        this.aborted = false;
        this.transport = options.transport;
        this.setup = options.setup;
        // Board order is the order in playerIds, on BOTH machines. Deriving it
        // from who is local would put the two boards in opposite slots on the two
        // screens, and garbage would appear to cross the wrong way.
        this.stacks = options.setup.playerIds.map((_id, index) => {
            const stack = new stack_1.Stack({
                levelData: options.setup.levelData,
                // One seed, offset per board: the same two boards on both machines,
                // and not the same board twice.
                panelSource: new generator_source_1.GeneratorSource(options.setup.seed + index, true),
                engineVersion: options.setup.engineVersion,
                cursorWaitTime: options.setup.cursorWaitTime,
                doCountdown: true,
            });
            stack.startingState();
            return stack;
        });
        this.localIndex = Math.max(0, options.setup.playerIds.indexOf(options.transport.localId()));
        this.queues = options.setup.playerIds.map(() => []);
        this.match = new match_1.PanelMatch({ stacks: this.stacks });
        this.unsubscribe = this.transport.onInput((packet) => this.receive(packet));
    }
    /** A remote player's input, queued until its frame comes round. */
    receive(packet) {
        const index = this.setup.playerIds.indexOf(packet.from);
        if (index < 0)
            return; // not in this match
        for (const character of packet.input)
            this.queues[index].push(character);
    }
    /**
     * Offer this node's input for the next frame and run it if everyone's is in.
     *
     * The local input is queued through the SAME path as a remote one rather
     * than being applied directly. It costs nothing and it means the local board
     * cannot accidentally run a frame ahead of the boards it is being compared
     * against.
     */
    step(localInput) {
        if (this.hasEnded())
            return 'ended';
        this.queues[this.localIndex].push(localInput);
        this.transport.sendInput({
            from: this.transport.localId(),
            input: localInput,
            frame: this.frame,
        });
        if (!this.queues.every((queue) => queue.length > 0)) {
            if (this.isIrrecoverablyBehind()) {
                this.aborted = true;
                return 'ended';
            }
            return 'waiting';
        }
        for (let index = 0; index < this.stacks.length; index++) {
            this.stacks[index].receiveConfirmedInput(this.queues[index].shift());
        }
        this.match.run();
        this.frame += 1;
        return this.hasEnded() ? 'ended' : 'ran';
    }
    /**
     * Has one side fallen further behind than the flight time can absorb?
     *
     * Measured in frames of input owed, not in wall time: a slow machine that is
     * still sending is fine, and a machine that has stopped sending is not,
     * however fast it was.
     */
    isIrrecoverablyBehind() {
        const owed = Math.max(...this.queues.map((queue) => queue.length));
        return owed > consts_1.MAX_LAG;
    }
    hasEnded() {
        return this.aborted || this.match.hasEnded();
    }
    /** True when the match ended because a side stopped talking. */
    desynced() {
        return this.aborted;
    }
    /** This node's own board. */
    localStack() {
        return this.stacks[this.localIndex];
    }
    /** The other board, for a two-player match. */
    remoteStack() {
        return this.stacks[this.localIndex === 0 ? 1 : 0];
    }
    /** Did the local player win? Undefined while the match is still running. */
    localWon() {
        if (!this.match.hasEnded())
            return undefined;
        return this.match.getWinners().includes(this.localStack());
    }
    dispose() {
        this.unsubscribe();
    }
}
exports.PanelNetplaySession = PanelNetplaySession;
//# sourceMappingURL=panel-netplay-session.js.map