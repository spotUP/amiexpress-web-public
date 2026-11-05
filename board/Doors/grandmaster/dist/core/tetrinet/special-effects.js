"use strict";
/**
 * TetriNET Special Effects
 *
 * Implements all 16 special block effects that can be used on boards.
 * Effects are applied to TetriNET boards and modify their state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyAddLine = applyAddLine;
exports.applyClearLine = applyClearLine;
exports.applyNuke = applyNuke;
exports.applyRandomClear = applyRandomClear;
exports.applySwitchFields = applySwitchFields;
exports.applyClearSpecials = applyClearSpecials;
exports.applyGravity = applyGravity;
exports.applyQuake = applyQuake;
exports.applyBlockBomb = applyBlockBomb;
exports.applyClearColumn = applyClearColumn;
exports.applyZebraField = applyZebraField;
exports.applyLeftGravity = applyLeftGravity;
exports.applySpecialEffect = applySpecialEffect;
const tetrinet_board_1 = require("./tetrinet-board");
/**
 * Apply Add Line effect - adds a garbage line to the board
 */
function applyAddLine(board, holeColumn) {
    holeColumn;
    (0, tetrinet_board_1.addGarbageLines)(board, 1, 'addline');
    return {
        success: true,
        message: 'Added 1 garbage line',
        linesAffected: 1,
    };
}
/**
 * Apply Clear Line effect - removes the bottom line
 */
function applyClearLine(board) {
    // Clear bottom line and shift everything down
    for (let y = board.height - 1; y > 0; y--) {
        board.grid[y] = board.grid[y - 1];
    }
    board.grid[0] = [];
    for (let x = 0; x < board.width; x++) {
        board.grid[0][x] = {
            filled: false,
            color: null,
            locked: false,
            special: undefined,
        };
    }
    return {
        success: true,
        message: 'Cleared line',
        linesAffected: 1,
    };
}
/**
 * Apply Nuke effect - clears the entire board
 */
function applyNuke(board) {
    let cellsCleared = 0;
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled) {
                cellsCleared++;
                board.grid[y][x] = {
                    filled: false,
                    color: null,
                    locked: false,
                    special: undefined,
                };
            }
        }
    }
    return {
        success: true,
        message: 'NUKED! Board cleared',
        cellsAffected: cellsCleared,
    };
}
/**
 * Apply Random Clear effect - removes 10-25% of random blocks
 */
function applyRandomClear(board) {
    const filledCells = [];
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled) {
                filledCells.push({ x, y });
            }
        }
    }
    if (filledCells.length === 0) {
        return {
            success: false,
            message: 'No blocks to clear',
            cellsAffected: 0,
        };
    }
    const countToClear = Math.min(10, filledCells.length);
    for (let i = filledCells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [filledCells[i], filledCells[j]] = [filledCells[j], filledCells[i]];
    }
    for (let i = 0; i < countToClear; i++) {
        const { x, y } = filledCells[i];
        board.grid[y][x] = {
            filled: false,
            color: null,
            locked: false,
            special: undefined,
        };
    }
    return {
        success: true,
        message: `Cleared ${countToClear} random blocks`,
        cellsAffected: countToClear,
    };
}
/**
 * Apply Switch Fields effect - swaps two boards
 * Returns the boards with swapped contents
 */
function applySwitchFields(board1, board2) {
    // Clone both boards
    const temp1 = (0, tetrinet_board_1.cloneTetriNetBoard)(board1);
    const temp2 = (0, tetrinet_board_1.cloneTetriNetBoard)(board2);
    // Swap grid contents
    for (let y = 0; y < board1.height; y++) {
        for (let x = 0; x < board1.width; x++) {
            board1.grid[y][x] = temp2.grid[y][x];
            board2.grid[y][x] = temp1.grid[y][x];
        }
    }
    return {
        board1,
        board2,
        result: {
            success: true,
            message: 'Fields switched!',
        },
    };
}
/**
 * Apply Clear Specials effect - removes all special blocks from board
 */
function applyClearSpecials(board) {
    let cleared = 0;
    const colors = ['I', 'J', 'L', 'O', 'S'];
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            const cell = board.grid[y][x];
            if (cell.special) {
                cell.special = undefined;
                cell.filled = true;
                cell.color = colors[Math.floor(Math.random() * colors.length)];
                cell.locked = true;
                cleared++;
            }
        }
    }
    return {
        success: true,
        message: `Cleared ${cleared} special blocks`,
        cellsAffected: cleared,
    };
}
/**
 * Apply Gravity effect - blocks fall to fill holes
 */
function applyGravity(board) {
    let cellsMoved = 0;
    // Process each column
    for (let x = 0; x < board.width; x++) {
        // Collect all filled cells in this column
        const filledCells = [];
        for (let y = 0; y < board.height; y++) {
            if (board.grid[y][x].filled) {
                filledCells.push({ ...board.grid[y][x] });
            }
        }
        // Clear the column
        for (let y = 0; y < board.height; y++) {
            if (board.grid[y][x].filled) {
                cellsMoved++;
            }
            board.grid[y][x] = {
                filled: false,
                color: null,
                locked: false,
                special: undefined,
            };
        }
        // Place cells at bottom
        let targetY = board.height - 1;
        for (let i = filledCells.length - 1; i >= 0; i--) {
            board.grid[targetY][x] = filledCells[i];
            targetY--;
        }
    }
    return {
        success: true,
        message: 'Gravity applied - holes filled',
        cellsAffected: cellsMoved,
    };
}
/**
 * Apply Quake effect - shift rows randomly left/right
 */
function applyQuake(board) {
    let rowsAffected = 0;
    for (let y = 0; y < board.height; y++) {
        let hasBlocks = false;
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled) {
                hasBlocks = true;
                break;
            }
        }
        if (!hasBlocks)
            continue;
        let shift = 0;
        const roll = Math.floor(Math.random() * 22);
        if (roll < 1)
            shift++;
        if (roll < 4)
            shift++;
        if (roll < 11)
            shift++;
        if (Math.floor(Math.random() * 2))
            shift = -shift;
        if (shift === 0)
            continue;
        rowsAffected++;
        const originalRow = [...board.grid[y]];
        if (shift > 0) {
            for (let x = board.width - 1; x >= shift; x--) {
                board.grid[y][x] = originalRow[x - shift];
            }
            for (let x = 0; x < shift; x++) {
                board.grid[y][x] = { filled: false, color: null, locked: false, special: undefined };
            }
        }
        else {
            const offset = Math.abs(shift);
            for (let x = 0; x < board.width - offset; x++) {
                board.grid[y][x] = originalRow[x + offset];
            }
            for (let x = board.width - offset; x < board.width; x++) {
                board.grid[y][x] = { filled: false, color: null, locked: false, special: undefined };
            }
        }
    }
    return {
        success: true,
        message: `Quake! ${rowsAffected} rows shifted`,
        linesAffected: rowsAffected,
    };
}
/**
 * Apply Block Bomb effect - detonate cells marked as bombs
 * In TetriNET, bomb blocks explode in a cross pattern
 */
function applyBlockBomb(board) {
    const bombs = [];
    for (let y = 0; y < board.height; y++) {
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].special === 'block_bomb') {
                bombs.push({ x, y });
            }
        }
    }
    if (bombs.length === 0) {
        return {
            success: false,
            message: 'No bomb blocks to detonate',
            cellsAffected: 0,
        };
    }
    let cellsCleared = 0;
    const scattered = [];
    for (const bomb of bombs) {
        const ax = [-1, 0, 1, 1, 1, 0, -1, -1];
        const ay = [-1, -1, -1, 0, 1, 1, 1, 0];
        if (board.grid[bomb.y][bomb.x].filled) {
            board.grid[bomb.y][bomb.x] = { filled: false, color: null, locked: false, special: undefined };
            cellsCleared++;
        }
        for (let i = 0; i < 8; i++) {
            const x = bomb.x + ax[i];
            const y = bomb.y + ay[i];
            if (x < 0 || x >= board.width || y < 0 || y >= board.height)
                continue;
            const cell = board.grid[y][x];
            if (!cell.filled)
                continue;
            if (cell.special === 'block_bomb') {
                board.grid[y][x] = { filled: false, color: null, locked: false, special: undefined };
            }
            else {
                scattered.push({ ...cell, special: undefined });
                board.grid[y][x] = { filled: false, color: null, locked: false, special: undefined };
            }
            cellsCleared++;
        }
    }
    for (const cell of scattered) {
        const y = Math.floor(Math.random() * (board.height - 6)) + 6;
        const x = Math.floor(Math.random() * board.width);
        board.grid[y][x] = { ...cell, special: undefined };
    }
    return {
        success: true,
        message: `BOOM! ${cellsCleared} blocks destroyed`,
        cellsAffected: cellsCleared,
    };
}
/**
 * Apply Clear Column effect - removes a random column
 */
function applyClearColumn(board) {
    // Pick a random column
    const column = Math.floor(Math.random() * board.width);
    let cellsCleared = 0;
    for (let y = 0; y < board.height; y++) {
        if (board.grid[y][column].filled) {
            cellsCleared++;
            board.grid[y][column] = {
                filled: false,
                color: null,
                locked: false,
                special: undefined,
            };
        }
    }
    return {
        success: true,
        message: `Cleared column ${column + 1}`,
        cellsAffected: cellsCleared,
    };
}
/**
 * Apply Zebra Field effect - fill board with alternating pattern
 */
function applyZebraField(board) {
    let cellsFilled = 0;
    for (let y = 4; y < board.height; y++) { // Start from visible area
        for (let x = 0; x < board.width; x++) {
            // Alternating pattern
            const shouldFill = (x + y) % 2 === 0;
            if (shouldFill && !board.grid[y][x].filled) {
                cellsFilled++;
                board.grid[y][x] = {
                    filled: true,
                    color: 'I', // Gray color
                    locked: true,
                    special: undefined,
                };
            }
            else if (!shouldFill && board.grid[y][x].filled) {
                board.grid[y][x] = {
                    filled: false,
                    color: null,
                    locked: false,
                    special: undefined,
                };
            }
        }
    }
    return {
        success: true,
        message: 'Zebra pattern applied!',
        cellsAffected: cellsFilled,
    };
}
/**
 * Apply Left Gravity effect - blocks shift left instead of down
 */
function applyLeftGravity(board) {
    let cellsMoved = 0;
    // Process each row
    for (let y = 0; y < board.height; y++) {
        // Collect all filled cells in this row
        const filledCells = [];
        for (let x = 0; x < board.width; x++) {
            if (board.grid[y][x].filled) {
                filledCells.push({ ...board.grid[y][x] });
                cellsMoved++;
            }
        }
        // Clear the row
        for (let x = 0; x < board.width; x++) {
            board.grid[y][x] = {
                filled: false,
                color: null,
                locked: false,
                special: undefined,
            };
        }
        // Place cells at left side
        for (let i = 0; i < filledCells.length; i++) {
            board.grid[y][i] = filledCells[i];
        }
    }
    return {
        success: true,
        message: 'Left gravity applied',
        cellsAffected: cellsMoved,
    };
}
/**
 * Apply a special effect by type
 */
function applySpecialEffect(type, targetBoard, sourceBoard) {
    switch (type) {
        case 'add_line':
            return applyAddLine(targetBoard);
        case 'clear_line':
            return applyClearLine(targetBoard);
        case 'nuke':
            return applyNuke(targetBoard);
        case 'random_clear':
            return applyRandomClear(targetBoard);
        case 'switch':
            if (sourceBoard) {
                const result = applySwitchFields(targetBoard, sourceBoard);
                return result.result;
            }
            return { success: false, message: 'Switch requires two boards' };
        case 'clear_specials':
            return applyClearSpecials(targetBoard);
        case 'gravity':
            return applyGravity(targetBoard);
        case 'quake':
            return applyQuake(targetBoard);
        case 'block_bomb':
            return applyBlockBomb(targetBoard);
        case 'clear_column':
            return applyClearColumn(targetBoard);
        case 'zebra':
            return applyZebraField(targetBoard);
        case 'left_gravity':
            return applyLeftGravity(targetBoard);
        // Continuous effects - these don't modify boards directly
        case 'immunity':
        case 'darkness':
        case 'confusion':
        case 'mutation':
            return { success: true, message: `${type} effect started` };
        default:
            return { success: false, message: `Unknown effect: ${type}` };
    }
}
//# sourceMappingURL=special-effects.js.map