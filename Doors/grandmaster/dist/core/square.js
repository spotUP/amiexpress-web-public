"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSquare = checkSquare;
exports.makeSquares = makeSquares;
/** A cell that can belong to a square: a locked piece, not yet counted. */
function pieceAt(board, x, y) {
    if (x < 0 || x >= board.width || y < 0 || y >= board.height)
        return null;
    const cell = board.grid[y][x];
    if (!cell.filled || cell.squared || cell.pieceId === undefined)
        return null;
    return cell;
}
/** The piece id at a position, or null - the reference's getFieldBlockS. */
function idAt(board, x, y) {
    const cell = pieceAt(board, x, y);
    return cell === null ? null : cell.pieceId;
}
/** Is there a 4x4 square with its top-left corner here? */
function checkSquare(board, x, y, gold) {
    const first = pieceAt(board, x, y);
    if (!first)
        return false;
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const cell = pieceAt(board, x + i, y + j);
            if (!cell)
                return false;
            if (gold && cell.color !== first.color)
                return false;
        }
    }
    // Nothing inside may be the same PIECE as the cell just outside it.
    for (let i = 0; i < 4; i++) {
        if (idAt(board, x + i, y) === idAt(board, x + i, y - 1))
            return false;
        if (idAt(board, x + i, y + 3) === idAt(board, x + i, y + 4))
            return false;
    }
    for (let j = 0; j < 4; j++) {
        if (idAt(board, x, y + j) === idAt(board, x - 1, y + j))
            return false;
        if (idAt(board, x + 3, y + j) === idAt(board, x + 4, y + j))
            return false;
    }
    return true;
}
/**
 * Find and mark every square on the board.
 *
 * Returns the BEST result found, the way `makeSquare` does: 2 if any gold
 * square was made, 1 if any plain one was, 0 otherwise.
 */
function makeSquares(board) {
    let result = 0;
    for (let y = 0; y <= board.height - 4; y++) {
        for (let x = 0; x <= board.width - 4; x++) {
            const gold = checkSquare(board, x, y, true);
            if (!gold && !checkSquare(board, x, y, false))
                continue;
            if (gold)
                result = 2;
            else if (result < 1)
                result = 1;
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    board.grid[y + j][x + i].squared = true;
                }
            }
        }
    }
    return result;
}
//# sourceMappingURL=square.js.map