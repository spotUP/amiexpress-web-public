import type { Board, PieceType } from './types';
/**
 * Lock a piece's cells into the board, stamped with the time.
 *
 * `lockTime` is what the credit roll fades against, and `shadowFrames` is
 * HIDDEN's own timer, started the moment the cell locks
 * (gamestart.c:16224-16225). A run with HIDDEN off leaves it undefined, and
 * the cell is drawn for ever.
 */
export declare function placePieceWithTimestamp(board: Board, shape: number[][], x: number, y: number, pieceType: PieceType, lockTime: number, hidden: boolean): void;
/**
 * Stamp an item id onto every cell of a just-locked piece.
 *
 * gamestart.c:16230/16317: `fldi[bx2+by2*w+pl*220] = item[player]` inside the
 * same 4-cell loop that locks the piece into fld[] - the whole piece carries
 * the item, not one cell of it.
 */
export declare function stampItemOnPiece(board: Board, shape: number[][], x: number, y: number, itemId: number): void;
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
export declare function collectItemFromLines(board: Board, rows: number[]): number | null;
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
export declare function mirrorBoard(board: Board): void;
//# sourceMappingURL=board-writes.d.ts.map