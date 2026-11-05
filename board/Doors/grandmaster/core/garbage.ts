/**
 * Garbage rows - the two ways this door puts blocks on the field that the
 * player did not place.
 *
 * Both are board transforms with nothing else behind them, which is why they
 * live here rather than in the engine: a rise is testable without a game, and
 * a mission's seeded stack is the same operation without the shift.
 */

import type { Board, Cell } from './types';

/** One garbage row with a single hole, at a random column. */
function garbageRow(width: number, rng: () => number): Board['grid'][number] {
  const hole = Math.floor(rng() * width);
  return Array(width).fill(0).map((_, x) => ({
    filled: x !== hole,
    color: null,
    locked: true,
  }));
}

/**
 * Shirase's piece-spawn rise (HeborisCE's DEVIL garbage, gamestart.c's
 * devil_rise tables): the whole stack moves up one row and a new garbage row
 * arrives at the bottom.
 */
/**
 * Push one GIVEN row onto the floor, everything else up.
 *
 * The same lift `riseGarbageRow` does, with the row supplied instead of
 * invented: a TARGET stage carries the rows its floor rises with
 * (`gamestart.c:8348-8360` copies them from `tomoyo_rise_fld`), and a random
 * garbage row would be a different mode.
 */
export function riseRowOnto(board: Board, cells: Cell[]): void {
  for (let y = 0; y < board.height - 1; y++) {
    board.grid[y] = board.grid[y + 1];
  }
  const row = board.grid[board.height - 1];
  for (let x = 0; x < board.width; x++) {
    row[x] = cells[x] ?? { filled: false, color: null, locked: false };
  }
}

export function riseGarbageRow(board: Board, rng: () => number = Math.random): void {
  for (let y = 0; y < board.height - 1; y++) {
    board.grid[y] = board.grid[y + 1];
  }
  board.grid[board.height - 1] = garbageRow(board.width, rng);
}

/**
 * Fill the bottom `rows` rows before a run starts (HeborisCE's mission_erase,
 * mission.c:226-236). Each row gets its own hole, so the result is a stack to
 * dig through rather than a solid wall.
 */
export function seedGarbageRows(board: Board, rows: number, rng: () => number = Math.random): void {
  for (let i = 0; i < rows; i++) {
    const y = board.height - 1 - i;
    if (y < 0) break;
    board.grid[y] = garbageRow(board.width, rng);
  }
}
