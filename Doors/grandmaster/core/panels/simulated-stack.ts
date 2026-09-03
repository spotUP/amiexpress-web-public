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

export class SimulatedStack {
  readonly outgoingGarbage = new GarbageQueue(true);
  readonly incomingGarbage = new GarbageQueue();
  attackEngine?: AttackEngine;
  healthEngine?: Health;

  clock = 0;
  stopWatch = 0;
  stopWatchIsRunning = true;
  /** Frames of burial left. Stays at 1 forever when there is no health model. */
  health = 1;
  gameOverClock = 0;

  onGameOver?: () => void;

  constructor(options: SimulatedStackOptions = {}) {
    if (options.attackSettings) {
      this.attackEngine = new AttackEngine(options.attackSettings, this.outgoingGarbage);
    }
    if (options.healthSettings) {
      this.healthEngine = new Health(options.healthSettings);
      this.health = options.healthSettings.framesToppedOutToLose;
    }
  }

  gameEnded(): boolean {
    return this.gameOverClock > 0 && this.clock >= this.gameOverClock;
  }

  /** How buried the opponent is, for the danger bar. Zero without health. */
  getTopOutPercentage(): number {
    return this.healthEngine ? this.healthEngine.getTopOutPercentage() : 0;
  }

  run(): void {
    if (this.stopWatchIsRunning) this.runPhysics();
    this.clock += 1;
  }

  private runPhysics(): void {
    this.attackEngine?.run();
    this.outgoingGarbage.processStagedGarbageForClock(this.stopWatch);

    if (this.healthEngine) {
      // Garbage lands on it immediately rather than dropping onto a board -
      // there is no board - so the queue is drained every frame.
      while (this.incomingGarbage.len() > 0) {
        const garbage = this.incomingGarbage.pop();
        if (garbage) this.healthEngine.receiveGarbage(garbage);
      }
      this.health = this.healthEngine.run();
    }

    if (this.health <= 0) this.setGameOver();

    this.stopWatch += 1;
  }

  setGameOver(): void {
    if (this.gameOverClock > 0) return;
    this.gameOverClock = this.clock;
    this.onGameOver?.();
  }

  /** Take garbage sent by the player. */
  receiveGarbage(garbage: Parameters<GarbageQueue['pushTable']>[0]): void {
    this.incomingGarbage.pushTable(garbage);
  }
}
