/**
 * TetriNET line clearing.
 *
 * Reported live 2026-08-25: "there is a bug in TetriNET, it doesn't clear
 * lines correctly."
 *
 * The rows were removed one at a time, DESCENDING, by shifting everything
 * above down into the gap. That is backwards: clearing rows 20 and 21 removed
 * 21 first, which slid row 20 down into 21 - so removing "20" next took the
 * untouched row 19 and left a completed row sitting on the board. Every
 * double, triple and quadruple was wrong.
 *
 * The main modes had the identical bug in core/board.ts (see
 * board-clear.test.ts). This is its TetriNET twin.
 */

import assert from 'assert';
import { createTetriNetBoard, clearLinesWithSpecials } from '../core/tetrinet/tetrinet-board';

/** Fill a whole row so it counts as complete, tagged by colour. */
function fillRow(board: any, y: number, color: string): void {
  for (let x = 0; x < board.width; x++) {
    board.grid[y][x] = { filled: true, color, locked: true, special: undefined };
  }
}

/** Put a single block in a row, so the row is identifiable but incomplete. */
function markRow(board: any, y: number, color: string): void {
  board.grid[y][0] = { filled: true, color, locked: true, special: undefined };
}

function rowColor(board: any, y: number): string | null {
  return board.grid[y][0]?.filled ? board.grid[y][0].color : null;
}

function filledRowCount(board: any): number {
  return board.grid.filter((row: any[]) => row.some(c => c.filled)).length;
}

export async function clearingTwoRowsRemovesBothOfThem(): Promise<void> {
  const board: any = createTetriNetBoard();
  const bottom = board.height - 1;

  fillRow(board, bottom, 'red');
  fillRow(board, bottom - 1, 'green');
  markRow(board, bottom - 2, 'blue');

  clearLinesWithSpecials(board, [bottom - 1, bottom]);

  assert.strictEqual(filledRowCount(board), 1, 'only the untouched row should remain');
  assert.strictEqual(rowColor(board, bottom), 'blue', 'the untouched row should fall to the floor');
}

export async function clearingKeepsTheRowsItWasNotAskedToClear(): Promise<void> {
  // The exact failure: the row ABOVE the cleared pair used to be eaten, and
  // one of the completed rows survived.
  const board: any = createTetriNetBoard();
  const bottom = board.height - 1;

  fillRow(board, bottom, 'red');
  fillRow(board, bottom - 1, 'green');
  markRow(board, bottom - 2, 'blue');
  markRow(board, bottom - 3, 'cyan');

  clearLinesWithSpecials(board, [bottom - 1, bottom]);

  assert.strictEqual(rowColor(board, bottom), 'blue');
  assert.strictEqual(rowColor(board, bottom - 1), 'cyan');
}

export async function clearingASingleRowStillWorks(): Promise<void> {
  const board: any = createTetriNetBoard();
  const bottom = board.height - 1;

  fillRow(board, bottom, 'red');
  markRow(board, bottom - 1, 'blue');

  clearLinesWithSpecials(board, [bottom]);

  assert.strictEqual(rowColor(board, bottom), 'blue');
  assert.strictEqual(filledRowCount(board), 1);
}

export async function clearingFourRowsAtOnceRemovesFour(): Promise<void> {
  const board: any = createTetriNetBoard();
  const bottom = board.height - 1;
  const rows = [bottom, bottom - 1, bottom - 2, bottom - 3];

  for (const y of rows) fillRow(board, y, 'red');
  markRow(board, bottom - 4, 'blue');

  clearLinesWithSpecials(board, rows);

  assert.strictEqual(filledRowCount(board), 1, 'a tetris should clear all four rows');
  assert.strictEqual(rowColor(board, bottom), 'blue');
}

export async function theBoardKeepsItsShape(): Promise<void> {
  const board: any = createTetriNetBoard();
  const height = board.height;
  const bottom = height - 1;

  fillRow(board, bottom, 'red');
  fillRow(board, bottom - 1, 'green');

  clearLinesWithSpecials(board, [bottom - 1, bottom]);

  assert.strictEqual(board.grid.length, height, 'the board must not change height');
  for (const row of board.grid) {
    assert.strictEqual(row.length, board.width, 'every row must keep its width');
  }
}

export async function specialsOnClearedRowsAreCollected(): Promise<void> {
  const board: any = createTetriNetBoard();
  const bottom = board.height - 1;

  fillRow(board, bottom, 'red');
  board.grid[bottom][3].special = 'A';

  const collected = clearLinesWithSpecials(board, [bottom]);

  assert.deepStrictEqual(collected, ['A']);
}
