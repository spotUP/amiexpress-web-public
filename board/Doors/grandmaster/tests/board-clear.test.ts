/**
 * Line-clearing regression tests.
 *
 * Found 2026-08-25 while differential-testing a rewritten AI evaluator
 * against the original: the two disagreed on 264 of 14,400 board states,
 * always by an exact multiple of the holes weight. The AI was right and the
 * ENGINE was wrong.
 *
 * clearLines() spliced completed rows by their ORIGINAL indices in ascending
 * order, so every splice shifted the rows after it up by one and the next
 * splice removed the wrong row. Clearing rows 20+21 removed row 20 and then
 * original row 22 - leaving a completed row sitting on the board and
 * deleting an untouched partial row instead. Every double, triple and
 * tetris in the game was affected.
 */

import assert from 'assert';
import { createBoard, getCompleteLines, clearLines } from '../core/board';

function filledCount(row: any[]): number {
  return row.filter((c: any) => c.filled).length;
}

function board(): any {
  return createBoard(10, 24);
}

function fill(b: any, y: number, xs: number[]): void {
  for (const x of xs) {
    b.grid[y][x].filled = true;
    b.grid[y][x].color = 'I';
    b.grid[y][x].locked = true;
  }
}

const ALL = Array.from({ length: 10 }, (_, i) => i);

export async function doubleClearKeepsPartialRows(): Promise<void> {
  const b = board();
  fill(b, 20, ALL);        // complete
  fill(b, 21, ALL);        // complete
  fill(b, 22, [0, 1, 2]);  // partial - must survive
  fill(b, 23, [5]);        // partial - must survive

  clearLines(b, getCompleteLines(b));

  const surviving = b.grid.map(filledCount).filter((n: number) => n > 0);
  assert.deepStrictEqual(surviving, [3, 1],
    `expected the 3-cell and 1-cell partial rows to survive, got ${JSON.stringify(surviving)}`);
}

export async function noCompletedRowSurvivesAClear(): Promise<void> {
  const b = board();
  fill(b, 19, ALL);
  fill(b, 20, ALL);
  fill(b, 21, ALL);
  fill(b, 22, [4]);

  clearLines(b, getCompleteLines(b));

  const rows = b.grid.map(filledCount);
  assert.ok(!rows.includes(10), `a completed row survived the clear: ${JSON.stringify(rows.filter((n: number) => n > 0))}`);
}

export async function tetrisClearsExactlyFourRows(): Promise<void> {
  const b = board();
  for (const y of [20, 21, 22, 23]) fill(b, y, ALL);
  fill(b, 19, [7]);

  const complete = getCompleteLines(b);
  assert.strictEqual(complete.length, 4);
  clearLines(b, complete);

  const surviving = b.grid.map(filledCount).filter((n: number) => n > 0);
  assert.deepStrictEqual(surviving, [1], 'only the single marker cell should remain');
  assert.strictEqual(b.grid.length, 24, 'board height must be preserved');
}

export async function nonAdjacentClearsRemoveTheRightRows(): Promise<void> {
  // Gaps between cleared rows are where index shifting did the most damage.
  const b = board();
  fill(b, 18, ALL);        // complete
  fill(b, 19, [1, 2]);     // partial
  fill(b, 20, ALL);        // complete
  fill(b, 21, [8]);        // partial

  clearLines(b, getCompleteLines(b));

  const surviving = b.grid.map(filledCount).filter((n: number) => n > 0);
  assert.deepStrictEqual(surviving, [2, 1],
    `both partial rows must survive in order, got ${JSON.stringify(surviving)}`);
}
