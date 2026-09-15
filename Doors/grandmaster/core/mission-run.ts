/**
 * MISSION mode - judging one mission while it is played.
 *
 * The reference counts a mission's progress inside its own frame handler and
 * ends the stage the moment the norm is met (mission.c). This door does the
 * same through two inputs and nothing else: a LockEvent per locked piece, and
 * the run clock. Keeping the judge here - rather than in the engine or the
 * screen - is what lets every objective be tested without a terminal.
 */

import type { Mission, MissionObjective, RequiredPiece } from './mission-types';
import type { PieceType } from './types';

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
  /** True when the clear was a T-Spin of ANY kind, a mini included. */
  tSpin: boolean;
  /**
   * True only for the 3-CORNER T-Spin.
   *
   * MISSION mode in the reference forces `tspin_flag` through the 3-corner
   * check, so it is 2 or 0 there and a mini counts for nothing
   * (`ars.c:545-552`, the `gameMode == 8` clause). The engine has always
   * known which kind it was - `detectTSpin()` returns 'full' | 'mini' |
   * 'none' - and only this event flattened the two together.
   */
  tSpinFull: boolean;
  /** True when the board was left completely empty. */
  allClear: boolean;
  /** The combo counter AFTER this lock. */
  combo: number;
  /**
   * The combo counter a SINGLE does not advance (the reference's `combo2`,
   * `gamestart.c:10256`), which is what a COMBO mission counts when its
   * NOT1LINE option is set. A lock that clears nothing breaks both.
   */
  comboIgnoringSingles: number;
  /** Total pieces locked so far. */
  piecesPlaced: number;
  /** The run's level after this lock. */
  level: number;
  /** Which piece locked. The ORDER objectives are about the piece itself. */
  pieceType: PieceType;
  /**
   * It came out of HOLD (the reference's `dhold2` + `hold_used >= 2`,
   * `mission.c:996`). An ORDER mission can insist on that.
   */
  cameFromHold: boolean;
  /**
   * Which ROWS this lock cleared, top-down. The SPLIT objectives are about
   * the gap between them, so a count cannot answer them
   * (`mission.c:1053-1098`).
   */
  clearedRows: number[];
  /**
   * What the SQUARE scan found on this lock: 0 for nothing, 1 for a square,
   * 2 for a gold one (`gamestart.c:10506-10541`). Always 0 unless the
   * mission asked for the scan.
   */
  square: 0 | 1 | 2;
  /**
   * How many MARKED rows this lock claimed: rows the ERASER mission had
   * marked, that the locked piece sat in, and that were cleared
   * (`mission.c:905-947`). Always 0 unless the mission marks rows.
   */
  markedRowsCleared: number;
}

/**
 * Does the locked piece answer what the mission asked for?
 *
 * The reference's `mission_opt_3` is 0..6 for one piece, 7 for "L or J" and
 * 8 for "S or Z" (`mission.c:354-362`).
 */
function pieceMatches(required: RequiredPiece | undefined, piece: PieceType): boolean {
  if (required === undefined) return true;
  if (required === 'LJ') return piece === 'L' || piece === 'J';
  if (required === 'SZ') return piece === 'S' || piece === 'Z';
  return required === piece;
}

/**
 * The UNCLEARED rows lying between the cleared ones.
 *
 * The reference walks the field top-down and counts the rows it passes
 * between the first cleared row and the last (`mission.c:1053-1066`); with
 * the row indices to hand that is the span minus the rows that cleared.
 */
function gapBetween(rows: number[]): number {
  if (rows.length < 2) return 0;
  const first = rows[0];
  const last = rows[rows.length - 1];
  return last - first - (rows.length - 1);
}

/** The ORDER family, and how each counts a lock (mission.c:989-1116). */
const ORDER_CLEAR: Partial<Record<MissionObjective, number | 'any'>> = {
  blockOrder: 'any',
  singleOrder: 1,
  doubleOrder: 2,
  tripleOrder: 3,
  reTripleOrder: 3,
};

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
  // mission_info_en[28]: "Erase 4 lines at once %d times! Do not erase 3 or
  // less lines!" - four lines, and a smaller clear does not merely fail to
  // count, it resets. That is 'exactOrReset' of four, so the objective is
  // expressed through the strictness rather than as a branch of its own.
  b2bTetris: 4,
};

/** Objectives whose strictness is part of what they ARE, not an option. */
const FORCED_STRICTNESS: Partial<Record<MissionObjective, 'exactOrReset'>> = {
  b2bTetris: 'exactOrReset',
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
    // 'cycle' counts DISTINCT clear sizes, and the reference compares that
    // count against mission_norm like every other type (mission.c:874-879) -
    // it does not hardcode four. A pack asking for two of the four sizes was
    // being judged as asking for all four; the loader keeps the norm inside
    // 1..4, because a fifth size does not exist.
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
      /*
       * The GRADE option (mission_opt_1, mission.c:841-866). 'exact' is the
       * default and what every pack meant before the field existed;
       * 'atLeast' takes the bigger clear too; 'exactOrReset' takes the exact
       * one and throws the count away on any other clear.
       */
      const strictness = FORCED_STRICTNESS[objective] ?? this.mission.strictness ?? 'exact';
      const counts = strictness === 'atLeast'
        ? event.lineCount >= exact
        : event.lineCount === exact;
      if (counts) this.current++;
      else if (strictness === 'exactOrReset' && event.lineCount > 0) this.current = 0;
    } else if (objective === 'cycle') {
      if (event.lineCount > 0) this.cycleSeen.add(event.lineCount);
      this.current = this.cycleSeen.size;
    } else if (objective === 'tspin') {
      // mission.c:955-957, with tspin_flag forced 3-corner in MISSION mode.
      if (event.tSpinFull && event.lineCount > 0) this.current++;
    } else if (objective === 'tspinDouble') {
      // mission.c:1101-1103 is `tspin_flag == 2 && lines >= 2`, so a T-spin
      // TRIPLE counts too. It did not here, which made the objective harder
      // than the one it is named after.
      if (event.tSpinFull && event.lineCount >= 2) this.current++;
    } else if (ORDER_CLEAR[objective] !== undefined) {
      /*
       * The ORDER family (mission.c:989-1116). Each wants a clear of its own
       * size made BY a named piece - and RE TRIPLE ORDER wants a triple made
       * by any piece EXCEPT it, unless the pack named a pair, in which case
       * the reference counts every triple (mission.c:1044-1048).
       */
      const want = ORDER_CLEAR[objective]!;
      const required = this.mission.requiredPiece;
      const sizeOk = want === 'any'
        ? event.lineCount > 0
        : (objective === 'doubleOrder' && this.mission.strictness === 'atLeast'
            ? event.lineCount >= want
            : event.lineCount === want);
      const held = !this.mission.requireHold || event.cameFromHold;
      const isPair = required === 'LJ' || required === 'SZ';
      const pieceOk = objective === 'reTripleOrder'
        ? (isPair ? true : !pieceMatches(required, event.pieceType))
        : pieceMatches(required, event.pieceType);
      if (sizeOk && pieceOk && held) {
        // BLOCKORDER counts the LINES; the rest count the clears.
        this.current += want === 'any' ? event.lineCount : 1;
      }
    } else if (objective === 'splitDouble' || objective === 'splitTriple'
      || objective === 'splitDouble2') {
      /*
       * The SPLIT family (mission.c:1053-1098): a clear whose rows are not
       * all touching. SPLIT DOUBLE2 wants the gap to be exactly two.
       */
      const rows = event.clearedRows;
      const wantedCount = objective === 'splitTriple' ? 3 : 2;
      const gap = gapBetween(rows);
      const gapOk = objective === 'splitDouble2' ? gap === 2 : gap !== 0;
      if (rows.length === wantedCount && gapOk) this.current++;
    } else if (objective === 'eraser' || objective === 'eraserHeboris') {
      /*
       * ERASER counts the MARKED rows this piece claimed. The engine does the
       * marking and the matching, because it also draws them; the judge's
       * question is only how many were claimed - and, for ERASER HEBORIS,
       * whether the clear was a four-liner, since only a Heboris may claim a
       * marked row there (mission.c:905-906).
       */
      if (objective === 'eraser' || event.lineCount >= 4) {
        this.current += event.markedRowsCleared;
      }
    } else if (objective === 'square') {
      // Any square counts (gamestart.c:8678: `>= 1`).
      if (event.square >= 1) this.current++;
    } else if (objective === 'goldSquare') {
      // Only the gold one, which is sixteen cells of ONE colour
      // (gamestart.c:8680/10023: the scan's result must be 2).
      if (event.square === 2) this.current++;
    } else if (objective === 'combo') {
      // "Do %d combo(s)" - the highest combo reached, not a running total.
      // With NOT1LINE it is the counter singles do not advance that is read.
      const reached = this.mission.ignoreSingles
        ? event.comboIgnoringSingles
        : event.combo;
      this.current = Math.max(this.current, reached);
    } else if (objective === 'allClear') {
      if (event.allClear) this.current++;
    } else if (objective === 'pieces') {
      this.current = event.piecesPlaced;
    } else if (objective === 'level') {
      this.current = event.level;
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
        return `ALL CLEAR SIZES  ${this.current}/${norm}`;
      case 'combo':
        return `COMBO ${norm}  BEST ${this.current}`;
      case 'level':
        return `REACH LEVEL ${norm}  ${this.current}/${norm}`;
      case 'blockOrder':
      case 'singleOrder':
      case 'doubleOrder':
      case 'tripleOrder': {
        const piece = this.mission.requiredPiece ?? '?';
        const held = this.mission.requireHold ? ' HELD' : '';
        return `${objective.toUpperCase()} ${piece}${held}  ${this.current}/${norm}`;
      }
      case 'reTripleOrder': {
        const piece = this.mission.requiredPiece ?? '?';
        const anyPiece = piece === 'LJ' || piece === 'SZ';
        return anyPiece
          ? `TRIPLES  ${this.current}/${norm}`
          : `TRIPLE NOT ${piece}  ${this.current}/${norm}`;
      }
      case 'splitDouble2':
        return `SPLIT DOUBLE GAP 2  ${this.current}/${norm}`;
      default: {
        // 'atLeast' is a different mission from 'exact' and the player has to
        // be told which one they are playing: "DOUBLE 4" and "DOUBLE 4+" are
        // not the same ask.
        const plus = (this.mission.strictness ?? 'exact') === 'atLeast' ? '+' : '';
        return `${objective.toUpperCase()} ${norm}${plus}  ${this.current}/${norm}`;
      }
    }
  }
}
