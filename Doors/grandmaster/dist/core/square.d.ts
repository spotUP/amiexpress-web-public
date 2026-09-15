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
import type { Board } from './types';
/** 0 = none, 1 = a square, 2 = a gold one. */
export type SquareResult = 0 | 1 | 2;
/** Is there a 4x4 square with its top-left corner here? */
export declare function checkSquare(board: Board, x: number, y: number, gold: boolean): boolean;
/**
 * Find and mark every square on the board.
 *
 * Returns the BEST result found, the way `makeSquare` does: 2 if any gold
 * square was made, 1 if any plain one was, 0 otherwise.
 */
export declare function makeSquares(board: Board): SquareResult;
//# sourceMappingURL=square.d.ts.map