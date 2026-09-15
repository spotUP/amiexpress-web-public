/**
 * What a MISSION does to the board after a piece locks.
 *
 * Four of the reference's mission types change the board itself once the
 * clears are settled, and they all happen in the same breath: ERASER claims
 * the marked rows the piece sat in, TARGET notices an emptied stage and lays
 * out the next, MIRROR flips the stack, and DEVIL 800's floor comes up. Kept
 * together here, out of `core/game.ts`, because each is a RULE rather than
 * engine machinery - and because the order they run in matters and is easier
 * to see in one place than spread through a 2000-line lock.
 */
import { chooseMarkedRows, claimMarkedRows, type EraserPattern } from './eraser';
import { mirrorBoard } from './board-writes';
import { riseGarbageRow } from './garbage';
import { makeSquares, type SquareResult } from './square';
import { applyStage, platinumLeft, riseRow, type Stage } from './stage';
import { riseRowOnto } from './garbage';
import type { Board } from './types';
import type { MissionModifiers } from './mission-types';

/** Everything the hooks need from the run they belong to. */
export interface MissionHookContext {
  board: Board;
  modifiers: MissionModifiers | undefined;
  /** The rows the piece that just locked sat in. */
  occupiedRows: number[];
  /** The rows this lock cleared. */
  clearedRows: number[];
  /** How many pieces have been locked, for the rising floor. */
  piecesPlaced: number;
  /** ERASER's marks, its pattern, and how many rows the mission still needs. */
  markedRows: number[];
  eraserPattern: EraserPattern | null;
  eraserRemaining: number;
  /** TARGET's stages, which one is up, and how far its floor has risen. */
  stages: Stage[];
  stageIndex: number;
  riseIndex: number;
  /** SQUARE scans only when the mission is judged on it. */
  squareMode: boolean;
}

/** What the lock event carries, and what the engine has to keep. */
export interface MissionHookResult {
  markedRowsCleared: number;
  markedRows: number[];
  eraserRemaining: number;
  stageCleared: boolean;
  stageIndex: number;
  /** How many rows of the stage's rising field have been spent. */
  riseIndex: number;
  square: SquareResult;
}

export function afterLock(ctx: MissionHookContext): MissionHookResult {
  const result: MissionHookResult = {
    markedRowsCleared: 0,
    markedRows: ctx.markedRows,
    eraserRemaining: ctx.eraserRemaining,
    stageCleared: false,
    stageIndex: ctx.stageIndex,
    riseIndex: ctx.riseIndex,
    square: 0,
  };

  /*
   * ERASER: a marked row is claimed when the piece that just locked SAT IN it
   * and it was cleared (mission.c:905-947). A fresh pattern appears once every
   * marked row has gone and the norm is not met.
   */
  if (ctx.markedRows.length > 0) {
    const claim = claimMarkedRows(ctx.markedRows, ctx.occupiedRows, ctx.clearedRows);
    result.markedRowsCleared = claim.claimed.length;
    result.markedRows = claim.remaining;
    result.eraserRemaining = Math.max(0, ctx.eraserRemaining - claim.claimed.length);
    if (result.markedRows.length === 0 && ctx.eraserPattern && result.eraserRemaining > 0) {
      result.markedRows = chooseMarkedRows(
        ctx.eraserPattern, result.eraserRemaining, ctx.board.height
      );
    }
  }

  /*
   * TARGET: the stage is cleared the moment its last platinum block goes, and
   * the next is laid out over a wiped field (mission.c:882-902). Checked after
   * the line clears, because clearing a line is how a platinum block leaves.
   */
  if (ctx.stages.length > 0 && platinumLeft(ctx.board) === 0) {
    result.stageCleared = true;
    result.stageIndex = ctx.stageIndex + 1;
    result.riseIndex = 0;
    const next = ctx.stages[result.stageIndex];
    if (next) applyStage(ctx.board, next);
  }

  /*
   * SQUARE runs after the clears too, so a square broken up by the line that
   * completed it does not count (gamestart.c:8678-8683).
   */
  if (ctx.squareMode) result.square = makeSquares(ctx.board);

  // MIRROR flips the stack after EVERY piece in MISSION mode
  // (gamestart.c:9055) - not on a timer, which is what makes it a mode.
  if (ctx.modifiers?.mirror) mirrorBoard(ctx.board);

  /*
   * THE FLOOR COMES UP, and WHAT comes up depends on who asked.
   *
   * A TARGET stage carries the rows its own floor rises with, and spends them
   * in order (`gamestart.c:8348-8360` copies from `tomoyo_rise_fld`, tracking
   * how far it has got): those rows are part of the stage's design, so a
   * random garbage row would be a different puzzle. DEVIL 800 asks for the
   * garbage instead (mission.c:1394-1399).
   *
   * Both are counted in PIECES LOCKED - the reference spends the stage's
   * interval inside `statBlock`, its per-piece handler (gamestart.c:6908) -
   * so a player's only clock is their own placing.
   */
  const stage = ctx.stages[result.stageIndex];
  const stageRise = stage?.riseEveryPieces ?? 0;
  const modifierRise = ctx.modifiers?.riseEveryPieces ?? 0;
  const due = (interval: number) =>
    interval > 0 && ctx.piecesPlaced > 0 && ctx.piecesPlaced % interval === 0;

  if (stage && stageRise > 0 && due(stageRise)) {
    const row = riseRow(stage, result.riseIndex);
    // A stage whose rows have all been spent stops rising rather than
    // repeating them.
    if (row) {
      riseRowOnto(ctx.board, row);
      result.riseIndex += 1;
    }
  } else if (due(modifierRise)) {
    riseGarbageRow(ctx.board);
  }

  return result;
}
