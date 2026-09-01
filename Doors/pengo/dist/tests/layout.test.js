"use strict";
/**
 * The board fits the terminal, and the world it scrolls through is
 * exactly the arcade's 13x15.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. That fix (a 16x11 world sized to fill 80x22 exactly)
 * was superseded 2026-09-01 when the grid became the arcade's real 13x15
 * - taller than the terminal can show at once, so a camera scrolls it
 * instead of the world being sized to fit. These are the two different
 * invariants that replaces: the WORLD is the arcade's real size, and the
 * VIEW (what buildBoard actually returns, and what index.ts draws) is a
 * cropped window that fits the screen - a drive-by constant change to
 * either fails here first.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theWorldIsTheArcadesRealSize = theWorldIsTheArcadesRealSize;
exports.theWorldFitsTheScreenWidthWithNoScrolling = theWorldFitsTheScreenWidthWithNoScrolling;
exports.theWorldOutgrowsTheScreenVertically = theWorldOutgrowsTheScreenVertically;
exports.theViewFitsTheRowBudget = theViewFitsTheRowBudget;
exports.theLevelStillFitsItsBoard = theLevelStillFitsItsBoard;
const assert_1 = __importDefault(require("assert"));
const constants_1 = require("../game/constants");
/** The world is the arcade's real 13x15, not a shape picked to fit the screen. */
async function theWorldIsTheArcadesRealSize() {
    assert_1.default.strictEqual(constants_1.GRID_WIDTH, 13, 'both independent reference clones agree on 13 columns');
    assert_1.default.strictEqual(constants_1.GRID_HEIGHT, 15, 'both independent reference clones agree on 15 rows');
    assert_1.default.strictEqual(constants_1.WORLD_COLS, constants_1.GRID_WIDTH * constants_1.CELL_W);
    assert_1.default.strictEqual(constants_1.WORLD_ROWS, constants_1.GRID_HEIGHT * constants_1.CELL_H);
}
/** The world fits the screen horizontally - no camera needed on that axis. */
async function theWorldFitsTheScreenWidthWithNoScrolling() {
    assert_1.default.ok(constants_1.WORLD_COLS <= constants_1.SCREEN_WIDTH, `${constants_1.WORLD_COLS} world columns on an ${constants_1.SCREEN_WIDTH}-column screen`);
    assert_1.default.strictEqual(constants_1.BOARD_COLS, constants_1.WORLD_COLS, 'the view is exactly the world width - nothing to crop horizontally');
}
/**
 * The world does NOT fit the screen vertically - proof a camera is
 * actually earning its place here, not decoration over a board that
 * would have fit anyway.
 */
async function theWorldOutgrowsTheScreenVertically() {
    assert_1.default.ok(constants_1.WORLD_ROWS > constants_1.BOARD_ROWS, `world is ${constants_1.WORLD_ROWS} rows; a camera is pointless if the view (${constants_1.BOARD_ROWS}) already covers it`);
    assert_1.default.strictEqual(constants_1.BOARD_ROWS, constants_1.VIEW_GRID_ROWS * constants_1.CELL_H);
}
/** The ON-SCREEN board - the camera's view, not the scrollable world - fits the row budget. */
async function theViewFitsTheRowBudget() {
    assert_1.default.ok(1 + constants_1.BOARD_ROWS + 1 <= constants_1.SCREEN_HEIGHT, `HUD + ${constants_1.BOARD_ROWS} view rows + hint do not fit ${constants_1.SCREEN_HEIGHT} rows`);
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