"use strict";
/**
 * The board fills the terminal.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. The whole point of the sprite work is a 75x20 board;
 * these are the numbers that hold it, measured from the door's constants
 * so a drive-by constant change fails here first.
 *
 * The row budget: HUD 1 (row 0) + board 20 (rows 1-20) + hint 1 (row 23).
 * Anything taller than 20 board rows overflows the way Frogger's menu box
 * climbed onto its HUD.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theBoardFillsTheScreenWidth = theBoardFillsTheScreenWidth;
exports.theBoardFitsTheRowBudget = theBoardFitsTheRowBudget;
exports.theLevelStillFitsItsBoard = theLevelStillFitsItsBoard;
const assert_1 = __importDefault(require("assert"));
const constants_1 = require("../game/constants");
async function theBoardFillsTheScreenWidth() {
    assert_1.default.strictEqual(constants_1.BOARD_COLS, constants_1.GRID_WIDTH * constants_1.CELL_W);
    assert_1.default.ok(constants_1.BOARD_COLS <= constants_1.SCREEN_WIDTH, `${constants_1.BOARD_COLS} columns on an ${constants_1.SCREEN_WIDTH}-column screen`);
    assert_1.default.ok(constants_1.BOARD_COLS >= constants_1.SCREEN_WIDTH - 6, `${constants_1.BOARD_COLS} columns is not "the full terminal"`);
}
async function theBoardFitsTheRowBudget() {
    assert_1.default.strictEqual(constants_1.BOARD_ROWS, constants_1.GRID_HEIGHT * constants_1.CELL_H);
    assert_1.default.ok(1 + constants_1.BOARD_ROWS + 1 <= constants_1.SCREEN_HEIGHT, `HUD + ${constants_1.BOARD_ROWS} board rows + hint do not fit ${constants_1.SCREEN_HEIGHT} rows`);
}
async function theLevelStillFitsItsBoard() {
    // 60 ice blocks was 42% of the old 13x11 interior. The interior is now
    // 13x8 = 104 cells; the counts scale to keep the density, or level one
    // is a solid wall of ice.
    for (let level = 1; level <= 8; level++) {
        const config = (0, constants_1.getLevelConfig)(level);
        const interior = (constants_1.GRID_WIDTH - 2) * (constants_1.GRID_HEIGHT - 2);
        const occupied = config.iceBlocks + 3 /* diamonds */ + config.enemies + config.eggs + 1;
        assert_1.default.ok(occupied < interior * 0.7, `level ${level}: ${occupied} things in ${interior} interior cells`);
    }
}
//# sourceMappingURL=layout.test.js.map