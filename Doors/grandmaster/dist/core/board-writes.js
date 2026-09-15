"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.placePieceWithTimestamp = placePieceWithTimestamp;
exports.stampItemOnPiece = stampItemOnPiece;
exports.collectItemFromLines = collectItemFromLines;
/**
 * The three writes that put a locked piece INTO the board.
 *
 * Lifted out of `core/game.ts` unchanged (2026-09-15), when the mission work
 * pushed that file back to its 2000-line cap. They belong together and they
 * belong away from the engine: each one is a loop over a shape and a board
 * with no engine state behind it, which is also what makes them testable
 * without starting a game.
 */
const items_1 = require("./items");
const hidden_1 = require("./hidden");
/**
 * Lock a piece's cells into the board, stamped with the time.
 *
 * `lockTime` is what the credit roll fades against, and `shadowFrames` is
 * HIDDEN's own timer, started the moment the cell locks
 * (gamestart.c:16224-16225). A run with HIDDEN off leaves it undefined, and
 * the cell is drawn for ever.
 */
function placePieceWithTimestamp(board, shape, x, y, pieceType, lockTime, hidden) {
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
                        shadowFrames: hidden ? hidden_1.SHADOW_TIMER_FRAMES : undefined,
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
function stampItemOnPiece(board, shape, x, y, itemId) {
    for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
            if (!shape[row][col])
                continue;
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
function collectItemFromLines(board, rows) {
    let found = null;
    for (const y of [...rows].sort((a, b) => a - b)) {
        const row = board.grid[y];
        for (let x = 0; x < row.length; x++) {
            const item = row[x].item;
            if (item && item !== items_1.HARD_BLOCK_ITEM) {
                found = item;
            }
        }
    }
    return found;
}
//# sourceMappingURL=board-writes.js.map