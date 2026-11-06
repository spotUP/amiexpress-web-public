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
  // The row pushed off the top becomes the new bottom row. Writing into the
  // old bottom array instead would leave it shared with the row above it.
  const row = board.grid[0];
  for (let y = 0; y < board.height - 1; y++) {
    board.grid[y] = board.grid[y + 1];
  }
  board.grid[board.height - 1] = row;
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
 * The most rows a GARBAGE mission raises at its start: mission.c:1415-1416
 * clamps `upLines` to 18 whatever the pack asks for.
 */
export const MAX_SEEDED_GARBAGE_ROWS = 18;

/**
 * DS-RANDOM moves the hole when a 0..9 roll is ABOVE this. The reference's
 * test is `gameRand(10) > 6 - (4 + (repversw >= 55)) * (gameMode == 8)`
 * (gamestart.c:8497): 6 outside MISSION, 1 inside it at the current replay
 * version (66) - the "8 in 10" its comment names.
 */
const MISSION_HOLE_MOVES_ABOVE = 1;

/**
 * Raise the stack by one DS-RANDOM row (upLineT 2, gamestart.c:8464-8502):
 * a solid row with a hole at `hole.column`, after which the hole moves to a
 * DIFFERENT column 8 times in 10 and stays put otherwise.
 *
 * The hole is state that outlives the row - the reference keeps it in
 * `hole[player]`, set once when the game starts (gamestart.c:4909) - which is
 * what makes this a type of its own: two rows in three share nothing, but one
 * in five lines up under the last and the stack grows wells.
 */
export function riseDsRandomRow(board: Board, hole: { column: number }, rng: () => number): void {
  riseRowOnto(board, Array.from({ length: board.width }, (_, x) => ({
    filled: x !== hole.column,
    color: null,
    locked: true,
  })));
  if (board.width < 2 || Math.floor(rng() * 10) <= MISSION_HOLE_MOVES_ABOVE) return;
  let next: number;
  do {
    next = Math.floor(rng() * board.width);
  } while (next === hole.column);
  hole.column = next;
}

/**
 * A GARBAGE mission's starting stack (type 21, mission.c:1407-1418): up to
 * 18 rows raised through the DS-RANDOM rise, which the reference pins for the
 * run (`upLineT[0] = 2`). Raised, not painted, so whatever the field already
 * holds goes up with them.
 */
export function seedGarbageRows(board: Board, rows: number, rng: () => number = Math.random): void {
  const hole = { column: Math.floor(rng() * board.width) };
  const count = Math.min(rows, MAX_SEEDED_GARBAGE_ROWS, board.height);
  for (let i = 0; i < count; i++) riseDsRandomRow(board, hole, rng);
}
