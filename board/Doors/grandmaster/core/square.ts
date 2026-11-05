/**
 * SQUARE and GOLD SQUARE: a free-standing 4x4 block of locked pieces.
 *
 * Reference types 40 and 41 (`mission.c:1451-1455`, scan at
 * `gamestart.c:10506-10541`, predicate at `10453-10503`). A square counts
 * when:
 *
 *   - all sixteen cells are filled by LOCKED PIECES - not garbage, not the
 *     field a mission started with, and not cells already counted into
 *     another square (the reference's `flds <= 0`);
 *   - no piece inside the square reaches OUTSIDE it. That is the clever part
 *     of the reference's test: it compares the piece id of each edge cell
 *     with its neighbour one step out, and a match means the same placement
 *     straddles the border, so the block is not free-standing;
 *   - and for GOLD, all sixteen are the same colour.
 *
 * The scan runs top-down, left-to-right, tries GOLD first at each position,
 * and marks the cells it counts so they cannot be counted again.
 */
import type { Board, Cell } from './types';

/** 0 = none, 1 = a square, 2 = a gold one. */
export type SquareResult = 0 | 1 | 2;

/** A cell that can belong to a square: a locked piece, not yet counted. */
function pieceAt(board: Board, x: number, y: number): Cell | null {
  if (x < 0 || x >= board.width || y < 0 || y >= board.height) return null;
  const cell = board.grid[y][x];
  if (!cell.filled || cell.squared || cell.pieceId === undefined) return null;
  return cell;
}

/** The piece id at a position, or null - the reference's getFieldBlockS. */
function idAt(board: Board, x: number, y: number): number | null {
  const cell = pieceAt(board, x, y);
  return cell === null ? null : cell.pieceId!;
}

/** Is there a 4x4 square with its top-left corner here? */
export function checkSquare(board: Board, x: number, y: number, gold: boolean): boolean {
  const first = pieceAt(board, x, y);
  if (!first) return false;

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const cell = pieceAt(board, x + i, y + j);
      if (!cell) return false;
      if (gold && cell.color !== first.color) return false;
    }
  }

  // Nothing inside may be the same PIECE as the cell just outside it.
  for (let i = 0; i < 4; i++) {
    if (idAt(board, x + i, y) === idAt(board, x + i, y - 1)) return false;
    if (idAt(board, x + i, y + 3) === idAt(board, x + i, y + 4)) return false;
  }
  for (let j = 0; j < 4; j++) {
    if (idAt(board, x, y + j) === idAt(board, x - 1, y + j)) return false;
    if (idAt(board, x + 3, y + j) === idAt(board, x + 4, y + j)) return false;
  }

  return true;
}

/**
 * Find and mark every square on the board.
 *
 * Returns the BEST result found, the way `makeSquare` does: 2 if any gold
 * square was made, 1 if any plain one was, 0 otherwise.
 */
export function makeSquares(board: Board): SquareResult {
  let result: SquareResult = 0;

  for (let y = 0; y <= board.height - 4; y++) {
    for (let x = 0; x <= board.width - 4; x++) {
      const gold = checkSquare(board, x, y, true);
      if (!gold && !checkSquare(board, x, y, false)) continue;
      if (gold) result = 2;
      else if (result < 1) result = 1;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          board.grid[y + j][x + i].squared = true;
        }
      }
    }
  }

  return result;
}
