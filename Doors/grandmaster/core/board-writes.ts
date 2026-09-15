/**
 * The three writes that put a locked piece INTO the board.
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15), when the mission work
 * pushed that file back to its 2000-line cap. They belong together and they
 * belong away from the engine: each one is a loop over a shape and a board
 * with no engine state behind it, which is also what makes them testable
 * without starting a game.
 */
import { HARD_BLOCK_ITEM } from './items';
import { SHADOW_TIMER_FRAMES } from './hidden';
import type { Board, PieceType } from './types';

/**
 * Lock a piece's cells into the board, stamped with the time.
 *
 * `lockTime` is what the credit roll fades against, and `shadowFrames` is
 * HIDDEN's own timer, started the moment the cell locks
 * (gamestart.c:16224-16225). A run with HIDDEN off leaves it undefined, and
 * the cell is drawn for ever. `pieceId` is the reference's `flds`: one value
 * for the four cells of one placement, which is how SQUARE tells a
 * free-standing block from a piece that reaches outside it.
 */
export function placePieceWithTimestamp(
  board: Board,
  shape: number[][],
  x: number,
  y: number,
  pieceType: PieceType,
  lockTime: number,
  hidden: boolean,
  pieceId?: number,
): void {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col]) {
        const boardX = x + col;
        const boardY = y + row;

        if (boardY >= 0 && boardY < board.height) {
          board.grid[boardY][boardX] = {
            filled: true,
            color: pieceType,
            locked: true,
            lockTime,
            shadowFrames: hidden ? SHADOW_TIMER_FRAMES : undefined,
            // The four cells of one placement share an id, which is what
            // SQUARE is judged on (core/square.ts).
            pieceId,
          };
        }
      }
    }
  }
}

/**
 * Stamp an item id onto every cell of a just-locked piece.
 *
 * gamestart.c:16230/16317: `fldi[bx2+by2*w+pl*220] = item[player]` inside the
 * same 4-cell loop that locks the piece into fld[] - the whole piece carries
 * the item, not one cell of it.
 */
export function stampItemOnPiece(
  board: Board,
  shape: number[][],
  x: number,
  y: number,
  itemId: number,
): void {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (!shape[row][col]) continue;
      const boardX = x + col;
      const boardY = y + row;
      if (boardY >= 0 && boardY < board.height && board.grid[boardY]?.[boardX]) {
        board.grid[boardY][boardX].item = itemId;
      }
    }
  }
}

/**
 * Scan a set of about-to-clear rows for a collectible item.
 *
 * gamestart.c:10127-10138: for each cleared row, ascending column, the LAST
 * item cell found wins (item_waiting is overwritten each hit); across
 * multiple simultaneously-cleared rows the loop runs row-ascending too, so
 * the bottom-most cleared row's item wins ties. Hard block cells never reach
 * here since getClearableLines() already excluded their whole row (see
 * core/board.ts) - a simplification of an edge case in the reference where a
 * hard block elsewhere in an otherwise-cancelled row could still leave an
 * item_waiting write before the row-level cancellation landed.
 */
export function collectItemFromLines(board: Board, rows: number[]): number | null {
  let found: number | null = null;
  for (const y of [...rows].sort((a, b) => a - b)) {
    const row = board.grid[y];
    for (let x = 0; x < row.length; x++) {
      const item = row[x].item;
      if (item && item !== HARD_BLOCK_ITEM) {
        found = item;
      }
    }
  }
  return found;
}

/**
 * Flip the stack left to right.
 *
 * MIRROR (reference type 15, `mission.c:1362-1366`). The reference animates
 * it a column at a time (`gamestart.c:9039`+) and fires it after EVERY piece
 * in MISSION mode (`gamestart.c:9055`); the flip itself is this, and the
 * animation is the part a terminal cannot afford - a door repainting over a
 * modem would spend the whole run drawing the transition.
 *
 * The live piece is NOT mirrored: the reference flips the field, and a piece
 * in the air keeps the column the player put it in.
 */
export function mirrorBoard(board: Board): void {
  for (let y = 0; y < board.height; y++) {
    board.grid[y].reverse();
  }
}
