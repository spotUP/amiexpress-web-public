"use strict";
/**
 * How the board is drawn.
 *
 * Blocks of background colour rather than ASCII sprites, the way Grandmaster
 * and Super Qix draw theirs, with each logical cell CELL_WIDTH characters
 * wide so a cell comes out roughly square.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.everyRowIsAFullWidthOfCells = everyRowIsAFullWidthOfCells;
exports.aCellIsWiderThanOneCharacter = aCellIsWiderThanOneCharacter;
exports.theBoardCarriesNoAsciiSprites = theBoardCarriesNoAsciiSprites;
exports.theGroundIsPaintedByLaneType = theGroundIsPaintedByLaneType;
exports.aCarIsPaintedInTheCarColour = aCarIsPaintedInTheCarColour;
exports.eachKindOfTrafficIsToldApartByColour = eachKindOfTrafficIsToldApartByColour;
exports.theFrogIsDrawnOverItsFooting = theFrogIsDrawnOverItsFooting;
exports.aCrocodileShowsWhichEndIsItsMouth = aCrocodileShowsWhichEndIsItsMouth;
exports.aDivedTurtleLooksLikeWater = aDivedTurtleLooksLikeWater;
exports.aHomeShowsWhatIsInIt = aHomeShowsWhatIsInIt;
exports.theHedgeBetweenHomesIsSolid = theHedgeBetweenHomesIsSolid;
exports.aSnakeOnALogIsVisible = aSnakeOnALogIsVisible;
exports.aDyingFrogBlinks = aDyingFrogBlinks;
const assert_1 = __importDefault(require("assert"));
const fixture_1 = require("./fixture");
const constants_1 = require("../game/constants");
/** Render once and hand back the frame. */
function frameOf(game) {
    let frame = '';
    game.renderCallback =
        (c) => { frame = c; };
    game.render();
    return frame.split('\n');
}
/** The background colour of every cell of one row. */
function rowColours(line) {
    const cells = [];
    const re = /\{([a-z]+)-bg\}( +)\{\/[a-z]+-bg\}/g;
    let m;
    while ((m = re.exec(line)) !== null) {
        const count = m[2].length / constants_1.CELL_WIDTH;
        for (let i = 0; i < count; i++)
            cells.push(m[1]);
    }
    return cells;
}
/** Every board row is the full width, in cells and in characters. */
async function everyRowIsAFullWidthOfCells() {
    const { game } = (0, fixture_1.startedLevel)(1);
    const rows = frameOf(game).slice(0, constants_1.GRID_HEIGHT);
    assert_1.default.strictEqual(rows.length, constants_1.GRID_HEIGHT, 'one line per lane');
    for (let y = 0; y < rows.length; y++) {
        const visible = rows[y].replace(/\{[^}]*\}/g, '');
        assert_1.default.strictEqual(visible.length, constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, `row ${y} should be ${constants_1.GRID_WIDTH * constants_1.CELL_WIDTH} characters wide`);
        assert_1.default.strictEqual(rowColours(rows[y]).length, constants_1.GRID_WIDTH, `row ${y} cell count`);
    }
}
/** A cell is drawn wider than one character, so it is not a tall sliver. */
async function aCellIsWiderThanOneCharacter() {
    assert_1.default.ok(constants_1.CELL_WIDTH >= 2, 'a cell needs to be at least two characters wide');
}
/** The board is colour, not text: no ASCII sprites are left in it. */
async function theBoardCarriesNoAsciiSprites() {
    const { game } = (0, fixture_1.startedLevel)(3);
    const rows = frameOf(game).slice(0, constants_1.GRID_HEIGHT);
    const visible = rows.join('').replace(/\{[^}]*\}/g, '');
    assert_1.default.strictEqual(visible.trim(), '', 'every board cell should be a coloured space, not a character');
    assert_1.default.ok(rows.every(r => r.includes('-bg}')), 'every row is painted with backgrounds');
}
/** Open water is water-coloured; the road is road-coloured. */
async function theGroundIsPaintedByLaneType() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const water = (0, fixture_1.laneOf)(data, 'water', 3);
    water.objects = [];
    const road = (0, fixture_1.laneOf)(data, 'road', 2);
    road.objects = [];
    const rows = frameOf(game);
    assert_1.default.ok(rowColours(rows[water.y]).every(c => c === constants_1.BG_COLORS.water), 'empty water should be all water');
    assert_1.default.ok(rowColours(rows[road.y]).every(c => c === constants_1.BG_COLORS.road), 'empty road should be all road');
}
/** A car is drawn in the car colour, across its whole width. */
async function aCarIsPaintedInTheCarColour() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const road = (0, fixture_1.laneOf)(data, 'road', 1);
    road.objects = [{
            id: 1, type: 'car', x: 10, y: road.y, lane: road.lane, width: 2,
            speed: road.speed,
        }];
    const colours = rowColours(frameOf(game)[road.y]);
    assert_1.default.strictEqual(colours[10], constants_1.BG_COLORS.car);
    assert_1.default.strictEqual(colours[11], constants_1.BG_COLORS.car);
    assert_1.default.strictEqual(colours[12], constants_1.BG_COLORS.road, 'and no wider than it is');
}
/** Each kind of traffic has its own colour. */
async function eachKindOfTrafficIsToldApartByColour() {
    const distinct = new Set([constants_1.BG_COLORS.car, constants_1.BG_COLORS.truck, constants_1.BG_COLORS.racecar]);
    assert_1.default.strictEqual(distinct.size, 3, 'cars, trucks and racecars differ');
    assert_1.default.notStrictEqual(constants_1.BG_COLORS.log, constants_1.BG_COLORS.water, 'a log stands out from the water');
    assert_1.default.notStrictEqual(constants_1.BG_COLORS.turtle, constants_1.BG_COLORS.water, 'so does a turtle');
    assert_1.default.notStrictEqual(constants_1.BG_COLORS.frog, constants_1.BG_COLORS.log, 'and the frog from its footing');
}
/** The frog is drawn on top of whatever it is standing on. */
async function theFrogIsDrawnOverItsFooting() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const water = (0, fixture_1.laneOf)(data, 'water', 3);
    const log = water.objects[0];
    log.x = 8;
    data.frog.y = water.y;
    data.frog.x = 9;
    const colours = rowColours(frameOf(game)[water.y]);
    assert_1.default.strictEqual(colours[9], constants_1.BG_COLORS.frog, 'the frog wins the cell');
    assert_1.default.strictEqual(colours[8], constants_1.BG_COLORS.log, 'the log either side of it');
}
/**
 * A crocodile's mouth is a different colour from its back, because one is
 * footing and the other is fatal.
 */
async function aCrocodileShowsWhichEndIsItsMouth() {
    const { game, data } = (0, fixture_1.startedLevel)(5);
    const lane = (0, fixture_1.laneOf)(data, 'water', 5);
    const croc = lane.objects[0];
    croc.x = 12;
    const colours = rowColours(frameOf(game)[lane.y]);
    const cells = colours.slice(12, 12 + croc.width);
    assert_1.default.ok(cells.includes(constants_1.BG_COLORS.crocodileMouth), `the mouth should be marked, got ${cells.join(',')}`);
    assert_1.default.ok(cells.includes(constants_1.BG_COLORS.crocodile), 'and the back should not be');
    // Lane 5 runs right to left, so the mouth is the leading, leftmost cell.
    assert_1.default.strictEqual(cells[0], constants_1.BG_COLORS.crocodileMouth);
}
/** A turtle that has dived is drawn as water: there is nothing to stand on. */
async function aDivedTurtleLooksLikeWater() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const turtle = lane.objects.find(t => t.canDive);
    turtle.x = 6;
    turtle.isDiving = true;
    const colours = rowColours(frameOf(game)[lane.y]);
    assert_1.default.strictEqual(colours[6], constants_1.BG_COLORS.turtleDiving, 'a turtle under the surface should not look like footing');
    assert_1.default.strictEqual(constants_1.BG_COLORS.turtleDiving, constants_1.BG_COLORS.water);
}
/** A home shows what is in it. */
async function aHomeShowsWhatIsInIt() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    data.homes[0].occupied = true;
    data.homes[1].hasFly = true;
    data.homes[2].hasAlligator = true;
    const colours = rowColours(frameOf(game)[0]);
    assert_1.default.strictEqual(colours[data.homes[0].x + constants_1.HOME_CENTRE_OFFSET], constants_1.BG_COLORS.homeOccupied);
    assert_1.default.strictEqual(colours[data.homes[1].x + constants_1.HOME_CENTRE_OFFSET], constants_1.BG_COLORS.homeFly);
    assert_1.default.strictEqual(colours[data.homes[2].x + constants_1.HOME_CENTRE_OFFSET], constants_1.BG_COLORS.homeCrocodile);
    assert_1.default.strictEqual(colours[data.homes[3].x + constants_1.HOME_CENTRE_OFFSET], constants_1.BG_COLORS.homeEmpty);
}
/** The hedge between the homes is not an opening. */
async function theHedgeBetweenHomesIsSolid() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const colours = rowColours(frameOf(game)[0]);
    const between = data.homes[0].x + 5; // between home 1 and home 2
    assert_1.default.strictEqual(colours[between], constants_1.BG_COLORS.hedge);
}
/** A snake riding a log is drawn over it. */
async function aSnakeOnALogIsVisible() {
    const { game, data } = (0, fixture_1.startedLevel)(3);
    const lane = (0, fixture_1.laneOf)(data, 'water', 3);
    const log = lane.objects[0];
    log.x = 5;
    log.snakeAt = 2;
    const colours = rowColours(frameOf(game)[lane.y]);
    assert_1.default.strictEqual(colours[7], constants_1.BG_COLORS.snake, 'the snake shows on the log');
    assert_1.default.strictEqual(colours[5], constants_1.BG_COLORS.log, 'the rest of the log does not');
}
/** A dying frog blinks rather than sitting there. */
async function aDyingFrogBlinks() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.frog.isDead = true;
    data.frog.x = 20;
    data.frog.y = 10;
    data.frog.deathFrame = 0;
    const on = rowColours(frameOf(game)[10])[20];
    data.frog.deathFrame = 3;
    const off = rowColours(frameOf(game)[10])[20];
    assert_1.default.strictEqual(on, constants_1.BG_COLORS.frogDying, 'showing on one frame');
    assert_1.default.notStrictEqual(off, constants_1.BG_COLORS.frogDying, 'and gone on the next');
}
//# sourceMappingURL=render.test.js.map