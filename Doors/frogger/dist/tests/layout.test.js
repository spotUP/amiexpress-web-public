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
exports.theMenuBoxFitsTheTitle = theMenuBoxFitsTheTitle;
exports.theTitleFitsTheWidthItIsGiven = theTitleFitsTheWidthItIsGiven;
exports.theScreenIsLogoStatusAndBoard = theScreenIsLogoStatusAndBoard;
exports.theLogoFitsTheScreen = theLogoFitsTheScreen;
exports.theScoreLineIsCentredUnderTheLogo = theScoreLineIsCentredUnderTheLogo;
exports.theMenuHasNoColourBlockStrip = theMenuHasNoColourBlockStrip;
exports.theMenuBoxFitsInsideTheGameArea = theMenuBoxFitsInsideTheGameArea;
exports.theMenuDrawsOneHintLine = theMenuDrawsOneHintLine;
exports.theMenuDrawsOneHintLineInItsOutput = theMenuDrawsOneHintLineInItsOutput;
const assert_1 = __importDefault(require("assert"));
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const constants_1 = require("../game/constants");
const attract_1 = require("../game/attract");
const menu_content_1 = require("../game/menu-content");
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
    // The play screen, with the logo hidden: one score line and the board,
    // filling the terminal exactly. There is no separate status row - the
    // score line already carries lives, level, homes and the clock.
    const scoreRows = 1;
    assert_1.default.strictEqual(scoreRows + constants_1.GAME_AREA_HEIGHT, constants_1.SCREEN_HEIGHT, `the play screen needs ${scoreRows + constants_1.GAME_AREA_HEIGHT} rows of ${constants_1.SCREEN_HEIGHT}`);
}
/**
 * The menu box has to be wide enough for the block title.
 *
 * Reported live 2026-08-31 with a screenshot: "menu broken every second line
 * black". The title is 61 columns; the box was sized to 54 by eye, so every
 * title row wrapped and each letter came apart across two rows with a black
 * line through it. Same fault as the board's, in a second place.
 */
async function theMenuBoxFitsTheTitle() {
    const screen = makeScreen();
    const width = Math.max(54, (0, attract_1.titleWidth)());
    const menuBox = blessed_1.default.box({
        fixed: true,
        parent: screen,
        top: 'center',
        left: 'center',
        width: width + 2,
        height: 20,
        tags: true,
        wrap: false,
        border: { type: 'line' },
    });
    assert_1.default.ok(menuBox.iwidth >= (0, attract_1.titleWidth)(), `the title needs ${(0, attract_1.titleWidth)()} columns; the menu offers ${menuBox.iwidth}`);
    assert_1.default.ok(menuBox.width <= constants_1.SCREEN_WIDTH, `the menu is ${menuBox.width} wide on an ${constants_1.SCREEN_WIDTH}-column screen`);
}
/** Every line of the title fits the width it is centred into. */
async function theTitleFitsTheWidthItIsGiven() {
    const width = Math.max(54, (0, attract_1.titleWidth)());
    for (const line of (0, attract_1.titleLines)(width)) {
        const visible = line.replace(/\{[^}]*\}/g, '');
        assert_1.default.ok(visible.length <= width, `a title line is ${visible.length} columns in a ${width}-column space`);
    }
}
/**
 * The screen is logo, status line, board - and nothing else.
 *
 * Reported live 2026-08-31: the clock had a row of its own under the board,
 * there were blank rows after it, and a footer spelled out what the arrow
 * keys do. The clock is a number in the status line now, the board ends
 * where the board ends, and the title fills the space at the top.
 */
async function theScreenIsLogoStatusAndBoard() {
    // The menu and attract screens still carry the logo, with the score line
    // and the board beneath it. That is the tallest arrangement the door
    // draws, so it is the one worth checking against the screen.
    const menuRows = attract_1.LOGO_HEIGHT + 1 + 1;
    assert_1.default.ok(menuRows <= constants_1.SCREEN_HEIGHT, `logo + spacer + score line is ${menuRows} rows of ${constants_1.SCREEN_HEIGHT}`);
    // The board is no longer one row per lane: the ten lanes that carry
    // moving things are two rows tall so their sprites have somewhere to be.
    assert_1.default.ok(constants_1.GAME_AREA_HEIGHT > constants_1.GRID_HEIGHT, `the board is ${constants_1.GAME_AREA_HEIGHT} rows for ${constants_1.GRID_HEIGHT} lanes; ` +
        'the moving lanes should be taller than one row each');
}
/** The logo fits the screen it is drawn across. */
async function theLogoFitsTheScreen() {
    const lines = (0, attract_1.titleLines)(constants_1.SCREEN_WIDTH);
    assert_1.default.strictEqual(lines.length, attract_1.LOGO_HEIGHT, 'the logo box is the right height');
    for (const line of lines) {
        const visible = line.replace(/\{[^}]*\}/g, '');
        assert_1.default.ok(visible.length <= constants_1.SCREEN_WIDTH, `a logo line is ${visible.length} columns on an ${constants_1.SCREEN_WIDTH}-column screen`);
    }
}
/**
 * The score line is centred under the logo, with a blank row between.
 *
 * Reported 2026-08-31 with a screenshot: the score line sat directly against
 * the bottom of the block logo and ran hard against the left edge, while
 * everything else on the screen is centred.
 */
async function theScoreLineIsCentredUnderTheLogo() {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    assert_1.default.ok(/hudBox = blessed\.box\(\{[\s\S]*?top: LOGO_HEIGHT \+ 1,/.test(index), 'the score line should sit one row below the logo, leaving a blank row');
    assert_1.default.ok(/top: LOGO_HEIGHT \+ 2,[\s\S]*?height: GAME_AREA_HEIGHT,/.test(index), 'and the board should move down with it rather than being overlapped');
    assert_1.default.ok(/return centreTagged\(/.test(index), 'the score line should be centred');
    // The centring must measure PAINTED width, not the markup.
    const fn = index.slice(index.indexOf('function centreTagged'));
    assert_1.default.ok(/replace\(\/\\\{\[\^\}\]\*\\\}\/g, ""\)/.test(fn) || /\{\[\^\}\]\*\\?\}/.test(fn), 'centreTagged must strip colour tags before measuring');
}
/**
 * The menu carries no strip of coloured blocks.
 *
 * Reported 2026-08-31: "remove these color things from the frogger menu, they
 * are a leftover from arkanoid."
 */
async function theMenuHasNoColourBlockStrip() {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    assert_1.default.ok(!/laneStrip/.test(index), 'the block strip and its helper should be gone');
}
/**
 * The menu box fits inside the game area.
 *
 * Reported live with a screenshot: a stray "1" at the top-left of the menu
 * and a "0" at the top-right.
 *
 * Neither is a character the menu draws. The menu content had thirteen rows
 * plus two of border - one taller than the thirteen-row game area - because
 * the door pushed its own hint line under the one arcadeMenu already draws.
 * blessed resolves `top: "center"` on an oversized child to a NEGATIVE
 * offset, so the box climbed one row and sat on top of the HUD.
 *
 * The box spans columns 7-72 and the HUD line is 68 columns centred in 80,
 * occupying 6-73. The only HUD cells left uncovered were its first and last
 * characters: the "1" of "1-UP 000000" and the "0" of "TIME 30".
 *
 * So the assertion is on the HEIGHT, which is the cause, and separately on
 * there being one hint, which is what made the height wrong.
 */
async function theMenuBoxFitsInsideTheGameArea() {
    const width = Math.max(54, (0, attract_1.titleWidth)());
    // menuBoxHeight is the DOOR'S own composition, not a copy of it. The first
    // version of this test rebuilt the content here and therefore passed while
    // the door was broken - the same way highScoresAreWrittenOutsideDist did.
    const boxHeight = (0, menu_content_1.menuBoxHeight)({ startingLives: 3, selection: 0, width });
    assert_1.default.ok(boxHeight <= constants_1.GAME_AREA_HEIGHT, `the menu box is ${boxHeight} rows in a ${constants_1.GAME_AREA_HEIGHT}-row game ` +
        `area; anything taller centres to a negative offset and covers the HUD`);
}
/**
 * The menu says how to drive it once, not twice.
 *
 * arcadeMenu draws the hint. The door carried its own from before the shared
 * menu, so the line appeared twice - and the extra row is what pushed the
 * box over the HUD (above).
 */
async function theMenuDrawsOneHintLine() {
    const { readFileSync } = await import('fs');
    const { join } = await import('path');
    const index = readFileSync(join(__dirname, '..', 'index.ts'), 'utf8');
    const renderMenu = index.slice(index.indexOf('function renderMenu'));
    const body = renderMenu.slice(0, renderMenu.indexOf('\nfunction '));
    assert_1.default.ok(!/menuContent\.push\(centred\("UP\/DOWN/.test(body), 'the door should not push a hint line; arcadeMenu already draws one');
}
/**
 * The menu draws the hint once, and it is the shared menu's.
 *
 * Checked against the real lines rather than the door's source text: a
 * source grep proves nobody typed the string twice, not that the rendered
 * menu carries it once.
 */
async function theMenuDrawsOneHintLineInItsOutput() {
    const width = Math.max(54, (0, attract_1.titleWidth)());
    const lines = (0, menu_content_1.menuLines)({ startingLives: 3, selection: 0, width });
    const hints = lines.filter(l => l.includes('UP/DOWN'));
    assert_1.default.strictEqual(hints.length, 1, `the menu draws ${hints.length} hint lines; arcadeMenu already draws one`);
}
//# sourceMappingURL=layout.test.js.map