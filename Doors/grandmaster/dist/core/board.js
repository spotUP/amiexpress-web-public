"use strict";
/**
 * Board Management
 *
 * Handles:
 * - Collision detection
 * - Line clearing
 * - Piece placement
 * - Ghost piece calculation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBoard = createBoard;
exports.checkCollision = checkCollision;
exports.placePiece = placePiece;
exports.getGhostY = getGhostY;
exports.getCompleteLines = getCompleteLines;
exports.clearLines = clearLines;
exports.isTopOut = isTopOut;
exports.isPerfectClear = isPerfectClear;
exports.getBoardHeight = getBoardHeight;
exports.getColumnHeight = getColumnHeight;
exports.countHoles = countHoles;
exports.getBumpiness = getBumpiness;
exports.addGarbage = addGarbage;
exports.addGarbageLines = addGarbageLines;
exports.cloneBoard = cloneBoard;
/**
 * Create empty board
 */
function createBoard(width = 10, height = 24) {
    const grid = [];
    for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
            grid[y][x] = {
                filled: false,
                color: null,
                locked: false,
                lockTime: undefined,
            };
        }
    }
    return { width, height, grid };
}
/**
 * Check if piece collides with board
 */
function checkCollision(board, shape, x, y) {
    for (let row = 0; row < shape.length; row++) {
        for (let col = 0; col < shape[row].length; col++) {
            if (shape[row][col]) {
                const boardX = x + col;
                const boardY = y + row;
                // Out of bounds
                if (boardX < 0 || boardX >= board.width || boardY >= board.height) {
                    return true;
                }
                // Above board (valid during spawn)
                if (boardY < 0) {
                    continue;
                }
                // Collision with locked cell
                if (board.grid[boardY][boardX].filled) {
                    return true;
                }
            }
        }
    }
    return false;
}
/**
 * Place piece on board (lock it in)
 */
function placePiece(board, shape, x, y, pieceType) {
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
                        lockTime: Date.now(), // Track when piece was locked for visual effects
                    };
                }
            }
        }
    }
}
/**
 * Get ghost piece Y position (hard drop preview)
 */
function getGhostY(board, shape, x, startY) {
    let y = startY;
    while (!checkCollision(board, shape, x, y + 1)) {
        y++;
    }
    return y;
}
/**
 * Check for complete lines and return their indices
 */
function getCompleteLines(board) {
    const completeLines = [];
    for (let y = 0; y < board.height; y++) {
        let complete = true;
        for (let x = 0; x < board.width; x++) {
            if (!board.grid[y][x].filled) {
                complete = false;
                break;
            }
        }
        if (complete) {
            completeLines.push(y);
        }
    }
    return completeLines;
}
/**
 * Clear completed lines from board
 */
function clearLines(board, lines) {
    // Sort lines from top to bottom
    const sorted = [...lines].sort((a, b) => a - b);
    // Remove lines
    for (const lineY of sorted) {
        board.grid.splice(lineY, 1);
    }
    // Add new empty lines at top
    for (let i = 0; i < lines.length; i++) {
        const newLine = [];
        for (let x = 0; x < board.width; x++) {
            newLine.push({
                filled: false,
                color: null,
                locked: false,
                lockTime: undefined,
            });
        }
        board.grid.unshift(newLine);
    }
}
/**
 * Check if board is topped out (game over)
 */
function isTopOut(board) {
    // Check top 4 rows for any locked cells
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled && board.grid[y][x].locked) {
                return true;
            }
        }
    }
    return false;
}
/**
 * Check if perfect clear (all cells empty)
 */
function isPerfectClear(board) {
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled) {
                return false;
            }
        }
    }
    return true;
}
/**
 * Get board height (highest filled cell)
 */
function getBoardHeight(board) {
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled) {
                return board.height - y;
            }
        }
    }
    return 0;
}
/**
 * Get column height
 */
function getColumnHeight(board, x) {
    for (let y = 0; y < board.height; y++) {
        if (board.grid[y][x].filled) {
            return board.height - y;
        }
    }
    return 0;
}
/**
 * Count holes in board (empty cell with filled cell above)
 */
function countHoles(board) {
    let holes = 0;
    for (let x = 0; x < board.width; x++) {
        let foundBlock = false;
        for (let y = 0; y < board.height; y++) {
            if (board.grid[y][x].filled) {
                foundBlock = true;
            }
            else if (foundBlock) {
                holes++;
            }
        }
    }
    return holes;
}
/**
 * Get bumpiness (sum of height differences between adjacent columns)
 */
function getBumpiness(board) {
    let bumpiness = 0;
    for (let x = 0; x < board.width - 1; x++) {
        bumpiness += Math.abs(getColumnHeight(board, x) - getColumnHeight(board, x + 1));
    }
    return bumpiness;
}
/**
 * Add garbage lines to bottom of board
 */
function addGarbage(board, lines, holePosition) {
    // Remove top lines to make space
    board.grid.splice(0, lines);
    // Add garbage lines at bottom
    for (let i = 0; i < lines; i++) {
        const garbageLine = [];
        for (let x = 0; x < board.width; x++) {
            if (x === holePosition) {
                garbageLine.push({
                    filled: false,
                    color: null,
                    locked: false,
                    lockTime: undefined,
                });
            }
            else {
                garbageLine.push({
                    filled: true,
                    color: null, // Gray garbage blocks (null color renders as gray)
                    locked: true,
                    lockTime: Date.now(),
                });
            }
        }
        board.grid.push(garbageLine);
    }
}
/**
 * Pre-fill the bottom N rows with garbage for Dig mode.
 * Each row has exactly one random hole position.
 */
function addGarbageLines(board, count) {
    const { width, height, grid } = board;
    // Shift existing rows up
    for (let y = 0; y < height - count; y++) {
        grid[y] = grid[y + count];
    }
    // Fill bottom rows with garbage
    for (let y = height - count; y < height; y++) {
        const hole = Math.floor(Math.random() * width);
        grid[y] = Array.from({ length: width }, (_, x) => ({
            filled: x !== hole,
            color: 'gray',
            locked: true,
        }));
    }
}
/**
 * Clone board for simulation
 */
function cloneBoard(board) {
    return {
        width: board.width,
        height: board.height,
        grid: board.grid.map(row => row.map(cell => ({ ...cell }))),
    };
}
//# sourceMappingURL=board.js.map