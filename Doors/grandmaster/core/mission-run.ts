/**
 * MISSION mode - judging one mission while it is played.
 *
 * The reference counts a mission's progress inside its own frame handler and
 * ends the stage the moment the norm is met (mission.c). This door does the
 * same through two inputs and nothing else: a LockEvent per locked piece, and
 * the run clock. Keeping the judge here - rather than in the engine or the
 * screen - is what lets every objective be tested without a terminal.
 */

import type { Mission, MissionObjective } from './mission-types';

/**
 * Is the NEXT preview hidden - by the item's timer, or because a mission
 * switched it off for the whole run? Both renderers ask this rather than
 * testing one of the two and forgetting the other.
 */
export function nextIsHidden(state: {
  hideNextFrames: number;
  missionModifiers?: { hideNext?: boolean };
}): boolean {
  return state.hideNextFrames > 0 || state.missionModifiers?.hideNext === true;
}

/** What the engine reports when a piece finishes locking. */
export interface LockEvent {
  /** Lines this lock cleared (0-4). */
  lineCount: number;
  /** True when the clear was a confirmed T-Spin. */
  tSpin: boolean;
  /** True when the board was left completely empty. */
  allClear: boolean;
  /** The combo counter AFTER this lock. */
  combo: number;
  /** Total pieces locked so far. */
  piecesPlaced: number;
  /** The run's level after this lock. */
  level: number;
}

export type MissionOutcome = 'playing' | 'cleared' | 'failed';

export interface MissionProgress {
  outcome: MissionOutcome;
  /** How far along, in the objective's own units. */
  current: number;
  /** What is needed. 0 for 'survive', which is judged by the clock. */
  target: number;
  /** Set when the run failed: why. */
  failure?: 'topped out' | 'out of time';
}

/** Line counts that count toward each "exactly N lines" objective. */
const EXACT_CLEAR: Partial<Record<MissionObjective, number>> = {
  single: 1, double: 2, triple: 3, tetris: 4,
};

export class MissionRun {
  private current = 0;
  private outcome: MissionOutcome = 'playing';
  private failure?: MissionProgress['failure'];
  /** For 'cycle': which clear sizes have been seen. */
  private cycleSeen = new Set<number>();

  constructor(private readonly mission: Mission) {}

  getMission(): Mission {
    return this.mission;
  }

  getProgress(): MissionProgress {
    return {
      outcome: this.outcome,
      current: this.current,
      target: this.target(),
      failure: this.failure,
    };
  }

  /** 'survive' has no count to reach; everything else has its norm. */
  private target(): number {
    if (this.mission.objective === 'survive') return 0;
    if (this.mission.objective === 'cycle') return 4;   // one of each clear size
    return this.mission.norm;
  }

  /** The engine locked a piece. Returns the outcome after judging it. */
  onLock(event: LockEvent): MissionOutcome {
    if (this.outcome !== 'playing') return this.outcome;

    const objective = this.mission.objective;
    const exact = EXACT_CLEAR[objective];

    if (objective === 'lines') {
      this.current += event.lineCount;
    } else if (exact !== undefined) {
      if (event.lineCount === exact) this.current++;
    } else if (objective === 'cycle') {
      if (event.lineCount > 0) this.cycleSeen.add(event.lineCount);
      this.current = this.cycleSeen.size;
    } else if (objective === 'tspin') {
      if (event.tSpin && event.lineCount > 0) this.current++;
    } else if (objective === 'tspinDouble') {
      if (event.tSpin && event.lineCount === 2) this.current++;
    } else if (objective === 'combo') {
      // "Do %d combo(s)" - the highest combo reached, not a running total.
      this.current = Math.max(this.current, event.combo);
    } else if (objective === 'allClear') {
      if (event.allClear) this.current++;
    } else if (objective === 'pieces') {
      this.current = event.piecesPlaced;
    } else if (objective === 'level') {
      this.current = event.level;
    } else if (objective === 'b2bTetris') {
      // mission_info_en[28]: "Erase 4 lines at once %d times! Do not erase 3
      // or less lines!" - a smaller clear does not just fail to count, it
      // resets what has been counted.
      if (event.lineCount === 4) this.current++;
      else if (event.lineCount > 0) this.current = 0;
    }

    if (objective !== 'survive' && this.current >= this.target()) {
      this.outcome = 'cleared';
    }
    return this.outcome;
  }

  /**
   * The clock moved. A timed mission that is not 'survive' fails when the
   * clock runs out; 'survive' is cleared by exactly the same moment.
   */
  onTime(elapsedSeconds: number): MissionOutcome {
    if (this.outcome !== 'playing') return this.outcome;
    const limit = this.mission.timeLimitSeconds;
    if (limit <= 0) return this.outcome;

    if (this.mission.objective === 'survive') {
      this.current = Math.min(elapsedSeconds, limit);
      if (elapsedSeconds >= limit) this.outcome = 'cleared';
      return this.outcome;
    }

    if (elapsedSeconds >= limit) {
      this.outcome = 'failed';
      this.failure = 'out of time';
    }
    return this.outcome;
  }

  /** The stack topped out. Every mission fails on that, including 'survive'. */
  onTopOut(): MissionOutcome {
    if (this.outcome === 'playing') {
      this.outcome = 'failed';
      this.failure = 'topped out';
    }
    return this.outcome;
  }

  /** One line for the HUD: what to do, and how far along. */
  describe(): string {
    const { objective, norm, timeLimitSeconds } = this.mission;
    switch (objective) {
      case 'survive':
        return `SURVIVE ${timeLimitSeconds}s  ${Math.floor(this.current)}/${timeLimitSeconds}`;
      case 'cycle':
        return `ALL CLEAR SIZES  ${this.current}/4`;
      case 'combo':
        return `COMBO ${norm}  BEST ${this.current}`;
      case 'level':
        return `REACH LEVEL ${norm}  ${this.current}/${norm}`;
      default:
        return `${objective.toUpperCase()} ${norm}  ${this.current}/${norm}`;
    }
  }
}
