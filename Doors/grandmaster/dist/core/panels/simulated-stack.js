"use strict";
/**
 * The opponent that has no board, ported from common/engine/SimulatedStack.lua.
 *
 * Two halves, and which ones are present decides what mode you are playing:
 *
 *   TRAINING   an attack engine only. No health, so it never dies and never
 *              stops - a punching bag that throws garbage at you forever.
 *   CHALLENGE  an attack engine AND a health model. Now it can be killed, and
 *              the garbage you send back is what kills it.
 *
 * It runs on the same frame clock as a real stack and speaks the same garbage
 * queues, so from the outside a match cannot tell it is not a player.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimulatedStack = void 0;
const attack_engine_1 = require("./attack-engine");
const health_1 = require("./health");
const garbage_queue_1 = require("./garbage-queue");
class SimulatedStack {
    constructor(options = {}) {
        this.outgoingGarbage = new garbage_queue_1.GarbageQueue(true);
        this.incomingGarbage = new garbage_queue_1.GarbageQueue();
        this.clock = 0;
        this.stopWatch = 0;
        this.stopWatchIsRunning = true;
        /** Frames of burial left. Stays at 1 forever when there is no health model. */
        this.health = 1;
        this.gameOverClock = 0;
        if (options.attackSettings) {
            this.attackEngine = new attack_engine_1.AttackEngine(options.attackSettings, this.outgoingGarbage);
        }
        if (options.healthSettings) {
            this.healthEngine = new health_1.Health(options.healthSettings);
            this.health = options.healthSettings.framesToppedOutToLose;
        }
    }
    gameEnded() {
        return this.gameOverClock > 0 && this.clock >= this.gameOverClock;
    }
    /** How buried the opponent is, for the danger bar. Zero without health. */
    getTopOutPercentage() {
        return this.healthEngine ? this.healthEngine.getTopOutPercentage() : 0;
    }
    run() {
        if (this.stopWatchIsRunning)
            this.runPhysics();
        this.clock += 1;
    }
    runPhysics() {
        this.attackEngine?.run();
        this.outgoingGarbage.processStagedGarbageForClock(this.stopWatch);
        if (this.healthEngine) {
            // Garbage lands on it immediately rather than dropping onto a board -
            // there is no board - so the queue is drained every frame.
            while (this.incomingGarbage.len() > 0) {
                const garbage = this.incomingGarbage.pop();
                if (garbage)
                    this.healthEngine.receiveGarbage(garbage);
            }
            this.health = this.healthEngine.run();
        }
        if (this.health <= 0)
            this.setGameOver();
        this.stopWatch += 1;
    }
    setGameOver() {
        if (this.gameOverClock > 0)
            return;
        this.gameOverClock = this.clock;
        this.onGameOver?.();
    }
    /** Take garbage sent by the player. */
    receiveGarbage(garbage) {
        this.incomingGarbage.pushTable(garbage);
    }
}
exports.SimulatedStack = SimulatedStack;
//# sourceMappingURL=simulated-stack.js.map