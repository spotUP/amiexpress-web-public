"use strict";
/**
 * Board geometry for the sprite pass.
 *
 * Frogger's board was 40 columns of 2 characters, every lane exactly one
 * terminal row tall. Animated cell-art sprites need the room Pengo's have:
 * 5 characters wide and 2 rows tall per cell. Thirteen lanes at two rows
 * each would be 26 rows and does not fit, so the two static banks - the
 * start bank and the home row - stay one row tall and the eleven lanes that
 * carry moving things get two:
 *
 *     start bank                    1
 *     5 road + median + 5 water     22
 *     home row                      1
 *                                   --
 *     board                         24   + 1 status line = 25
 *
 * These tests pin that arithmetic. They are about the BOARD, not about any
 * sprite: a sprite that renders wrong is Task 3's problem, but a lane that
 * overlaps its neighbour or a home the frog cannot reach is a geometry
 * fault, and it would otherwise only show up as a visual oddity nobody can
 * trace back to a number.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theBoardFillsTheScreenWidth = theBoardFillsTheScreenWidth;
exports.aCellIsPengoSized = aCellIsPengoSized;
exports.onlyTheStaticBanksAreOneRowTall = onlyTheStaticBanksAreOneRowTall;
exports.everyMovingLaneIsTwoRowsTall = everyMovingLaneIsTwoRowsTall;
exports.lanesTileTheBoardWithoutOverlap = lanesTileTheBoardWithoutOverlap;
exports.theScoreLineAndBoardFillTheScreen = theScoreLineAndBoardFillTheScreen;
exports.theFiveHomesSitOnReachableColumns = theFiveHomesSitOnReachableColumns;
exports.everyHomeCentreIsAColumnTheFrogCanReach = everyHomeCentreIsAColumnTheFrogCanReach;
exports.noObjectIsWiderThanTheBoard = noObjectIsWiderThanTheBoard;
exports.relativeSizesSurviveTheRescale = relativeSizesSurviveTheRescale;
const assert_1 = __importDefault(require("assert"));
const constants_1 = require("../game/constants");
/** The board fills the terminal's width exactly, with no partial cell. */
async function theBoardFillsTheScreenWidth() {
    assert_1.default.strictEqual(constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, constants_1.SCREEN_WIDTH, `${constants_1.GRID_WIDTH} columns of ${constants_1.CELL_WIDTH} chars must fill ${constants_1.SCREEN_WIDTH}`);
}
/** A cell is Pengo's cell: 5 wide, 2 tall, so sprite work transfers. */
async function aCellIsPengoSized() {
    assert_1.default.strictEqual(constants_1.CELL_WIDTH, 5);
    assert_1.default.strictEqual(constants_1.CELL_HEIGHT, 2);
}
/** Every lane has a height, and only the two static banks are short. */
async function onlyTheStaticBanksAreOneRowTall() {
    assert_1.default.strictEqual(constants_1.LANE_CONFIG.length, constants_1.GRID_HEIGHT);
    for (const lane of constants_1.LANE_CONFIG) {
        const h = constants_1.LANE_HEIGHTS[lane.y];
        assert_1.default.ok(h === 1 || h === constants_1.CELL_HEIGHT, `lane at y=${lane.y} has height ${h}; expected 1 or ${constants_1.CELL_HEIGHT}`);
    }
    const short = constants_1.LANE_CONFIG.filter((l) => constants_1.LANE_HEIGHTS[l.y] === 1);
    assert_1.default.strictEqual(short.length, 2, 'exactly two lanes are one row tall: the start bank and the home row');
    for (const lane of short) {
        assert_1.default.ok(lane.type === 'safe' || lane.type === 'home', `a short lane must be scenery, not ${lane.type}`);
    }
}
/** Road and water lanes - the ones that animate - are all two rows. */
async function everyMovingLaneIsTwoRowsTall() {
    for (const lane of constants_1.LANE_CONFIG) {
        if (lane.type !== 'road' && lane.type !== 'water')
            continue;
        assert_1.default.strictEqual(constants_1.LANE_HEIGHTS[lane.y], constants_1.CELL_HEIGHT, `${lane.type} lane at y=${lane.y} must be ${constants_1.CELL_HEIGHT} rows tall`);
    }
}
/** Lanes tile the board: integer rows, no gap, no overlap. */
async function lanesTileTheBoardWithoutOverlap() {
    const rows = [];
    for (const lane of constants_1.LANE_CONFIG) {
        const top = constants_1.LANE_ROWS[lane.y];
        const height = constants_1.LANE_HEIGHTS[lane.y];
        assert_1.default.ok(Number.isInteger(top), `lane y=${lane.y} top row ${top} is not an integer`);
        assert_1.default.ok(Number.isInteger(height), `lane y=${lane.y} height ${height} is not an integer`);
        for (let r = top; r < top + height; r++)
            rows.push(r);
    }
    rows.sort((a, b) => a - b);
    assert_1.default.strictEqual(rows.length, constants_1.GAME_AREA_HEIGHT, `lanes cover ${rows.length} rows; the board is ${constants_1.GAME_AREA_HEIGHT}`);
    for (let i = 0; i < rows.length; i++) {
        assert_1.default.strictEqual(rows[i], i, `row ${i} is covered ${rows[i] === i ? 'once' : 'wrongly'}`);
    }
}
/**
 * The board, the score line above it and the status line below it are the
 * whole screen.
 *
 * The permanent logo used to sit over the board for the whole session and
 * cost six rows; the arcade shows no logo while you play, and those rows
 * are what the two-row lanes are made of. If the logo ever comes back
 * during play this assertion is what will catch it.
 */
async function theScoreLineAndBoardFillTheScreen() {
    const scoreRow = 1;
    assert_1.default.strictEqual(scoreRow + constants_1.GAME_AREA_HEIGHT, constants_1.SCREEN_HEIGHT, `score ${scoreRow} + board ${constants_1.GAME_AREA_HEIGHT} must equal ${constants_1.SCREEN_HEIGHT} - ` +
        'a board one row too tall loses its BOTTOM lane, which is where the player starts');
}
/** Five homes, on real columns, evenly spaced, inside the board. */
async function theFiveHomesSitOnReachableColumns() {
    assert_1.default.strictEqual(constants_1.HOME_POSITIONS.length, 5);
    for (const x of constants_1.HOME_POSITIONS) {
        assert_1.default.ok(Number.isInteger(x), `home column ${x} is not an integer`);
        assert_1.default.ok(x >= 0 && x + constants_1.HOME_WIDTH <= constants_1.GRID_WIDTH, `home at ${x} (width ${constants_1.HOME_WIDTH}) falls outside 0..${constants_1.GRID_WIDTH}`);
    }
    const gaps = constants_1.HOME_POSITIONS.slice(1).map((x, i) => x - constants_1.HOME_POSITIONS[i]);
    assert_1.default.ok(gaps.every((g) => g === gaps[0]), `homes must be evenly spaced; gaps are ${gaps.join(',')}`);
}
/**
 * The frog can land dead centre in a home.
 *
 * FAQ 7: "You must hit exact center or your frog will die." The frog moves
 * in whole cells, so the centre of a home must BE a cell the frog can stand
 * on - otherwise the rule is unsatisfiable and the row becomes impossible.
 */
async function everyHomeCentreIsAColumnTheFrogCanReach() {
    for (const x of constants_1.HOME_POSITIONS) {
        const centre = x + constants_1.HOME_CENTRE_OFFSET;
        assert_1.default.ok(Number.isInteger(centre), `home centre ${centre} is not a whole column`);
        assert_1.default.ok(centre >= 0 && centre < constants_1.GRID_WIDTH, `home centre ${centre} is off the board`);
    }
}
/** Nothing is wider than the board it drives across. */
async function noObjectIsWiderThanTheBoard() {
    for (const [name, width] of Object.entries(constants_1.OBJECT_WIDTHS)) {
        assert_1.default.ok(Number.isInteger(width), `${name} width ${width} is not an integer`);
        assert_1.default.ok(width >= 1, `${name} width ${width} must be at least one cell`);
        assert_1.default.ok(width < constants_1.GRID_WIDTH, `${name} is ${width} cells wide on a ${constants_1.GRID_WIDTH}-cell board`);
    }
}
/** A truck is still bigger than a car, and a long log than a short one. */
async function relativeSizesSurviveTheRescale() {
    assert_1.default.ok(constants_1.OBJECT_WIDTHS.truck > constants_1.OBJECT_WIDTHS.car, 'a truck must still read as bigger than a car');
    assert_1.default.ok(constants_1.OBJECT_WIDTHS.longLog > constants_1.OBJECT_WIDTHS.mediumLog, 'a long log must still be longer than a medium one');
    assert_1.default.ok(constants_1.OBJECT_WIDTHS.mediumLog > constants_1.OBJECT_WIDTHS.shortLog, 'a medium log must still be longer than a short one');
}
//# sourceMappingURL=geometry.test.js.map