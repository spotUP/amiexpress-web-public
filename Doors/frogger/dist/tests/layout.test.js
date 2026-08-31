"use strict";
/**
 * Screen layout.
 *
 * Reported live 2026-08-31 with a screenshot: every second row of the board
 * was black, and the bottom edge of a panel border showed across the top of
 * the screen.
 *
 * One cause behind both. `blessed.box()` in this SDK returns a Panel, and
 * Panel injects `{type:'line', fg:'blue'}` whenever `border` is absent from
 * the options - unlike real blessed, where a box has no border. So:
 *
 *   - the game area lost two columns to a border nobody asked for, leaving
 *     78 for an 80-column board. Every row then wrapped, inserting a blank
 *     line after each real one: the "every second line is black";
 *   - the HUD is one row tall, so its injected border WAS the whole box, and
 *     what showed at the top of the screen was that border's bottom edge.
 *
 * Super Qix hit this exact fault first; this is the same fix and the same
 * check, for the same reason.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aDefaultBoxStillComesWithAnUnwantedBorder = aDefaultBoxStillComesWithAnUnwantedBorder;
exports.theGameAreaFitsTheBoardExactly = theGameAreaFitsTheBoardExactly;
exports.theBoardFillsTheScreenWidth = theBoardFillsTheScreenWidth;
exports.theHudKeepsItsSingleRow = theHudKeepsItsSingleRow;
exports.theThreePanesTileTheScreen = theThreePanesTileTheScreen;
const assert_1 = __importDefault(require("assert"));
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const constants_1 = require("../game/constants");
function makeScreen() {
    return blessed_1.default.screen({
        smartCSR: true,
        dockBorders: true,
        fullUnicode: false,
        output: () => { },
        input: null,
    });
}
/**
 * The defect itself, pinned: a box built the way the door used to build one
 * comes out with a border and too little room for the board. If this stops
 * being true, Panel's default has changed and the workaround can go.
 */
async function aDefaultBoxStillComesWithAnUnwantedBorder() {
    const screen = makeScreen();
    const box = blessed_1.default.box({
        parent: screen, top: 1, left: 0, width: '100%', height: constants_1.GAME_AREA_HEIGHT,
    });
    assert_1.default.strictEqual(box.hasBorder(), true, 'Panel no longer injects a default border - the door can stop working around it');
    assert_1.default.ok(box.iwidth < constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, `a default box offers ${box.iwidth} columns, which is why the board wrapped`);
}
/** The game area as the door builds it holds a board row exactly. */
async function theGameAreaFitsTheBoardExactly() {
    const screen = makeScreen();
    const gameArea = blessed_1.default.box({
        fixed: true,
        parent: screen,
        top: 1,
        left: 0,
        width: '100%',
        height: constants_1.GAME_AREA_HEIGHT,
        tags: true,
        wrap: false,
        border: undefined,
        style: { bg: 'black' },
    });
    assert_1.default.strictEqual(gameArea.hasBorder(), false, 'the game area must have no border');
    assert_1.default.strictEqual(gameArea.iwidth, constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, `a board row is ${constants_1.GRID_WIDTH * constants_1.CELL_WIDTH} columns; the game area offers ${gameArea.iwidth}`);
    assert_1.default.ok(gameArea.iheight >= constants_1.GRID_HEIGHT, `the board is ${constants_1.GRID_HEIGHT} rows; the game area offers ${gameArea.iheight}`);
}
/** The board fills the screen width, so nothing is left to wrap. */
async function theBoardFillsTheScreenWidth() {
    assert_1.default.strictEqual(constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, constants_1.SCREEN_WIDTH, 'the board should be exactly as wide as the screen');
}
/** A one-row HUD keeps its row. */
async function theHudKeepsItsSingleRow() {
    const screen = makeScreen();
    const hud = blessed_1.default.box({
        parent: screen, top: 0, left: 0, width: '100%', height: 1,
        tags: true, border: undefined, content: 'HUD',
    });
    assert_1.default.strictEqual(hud.hasBorder(), false);
    assert_1.default.strictEqual(hud.iheight, 1, 'the HUD lost its only row to a border');
    assert_1.default.strictEqual(hud.iwidth, constants_1.SCREEN_WIDTH);
}
/** The panes tile the screen: HUD, board, footer, with nothing overlapping. */
async function theThreePanesTileTheScreen() {
    const hudRows = 1;
    const footerRows = 3;
    assert_1.default.ok(hudRows + constants_1.GAME_AREA_HEIGHT + footerRows <= constants_1.SCREEN_HEIGHT, `the panes need ${hudRows + constants_1.GAME_AREA_HEIGHT + footerRows} rows of ${constants_1.SCREEN_HEIGHT}`);
}
//# sourceMappingURL=layout.test.js.map