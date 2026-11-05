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
import { AttackEngine, AttackSettings } from './attack-engine';
import { Health, HealthSettings } from './health';
import { GarbageQueue } from './garbage-queue';
export interface SimulatedStackOptions {
    attackSettings?: AttackSettings;
    /** Omit for Training: without health the opponent is immortal. */
    healthSettings?: HealthSettings;
}
export declare class SimulatedStack {
    readonly outgoingGarbage: GarbageQueue;
    readonly incomingGarbage: GarbageQueue;
    attackEngine?: AttackEngine;
    healthEngine?: Health;
    clock: number;
    stopWatch: number;
    stopWatchIsRunning: boolean;
    /** Frames of burial left. Stays at 1 forever when there is no health model. */
    health: number;
    gameOverClock: number;
    onGameOver?: () => void;
    constructor(options?: SimulatedStackOptions);
    gameEnded(): boolean;
    /** How buried the opponent is, for the danger bar. Zero without health. */
    getTopOutPercentage(): number;
    run(): void;
    private runPhysics;
    setGameOver(): void;
    /** Take garbage sent by the player. */
    receiveGarbage(garbage: Parameters<GarbageQueue['pushTable']>[0]): void;
}
//# sourceMappingURL=simulated-stack.d.ts.map