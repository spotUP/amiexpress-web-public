"use strict";
/**
 * How the board is drawn.
 *
 * Coloured lanes with character sprites over them, in the style of Philippe
 * Majerus's Frogger ANSI: a log has rounded ends and a grain, a turtle is
 * `:O:`, a car has a nose pointing the way it is going. Each logical cell is
 * CELL_WIDTH characters wide, so a cell is roughly square and forty of them
 * fill the eighty-column screen.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.everyRowIsAFullScreenWide = everyRowIsAFullScreenWide;
exports.aCellIsWiderThanOneCharacter = aCellIsWiderThanOneCharacter;
exports.theBoardIsDrawnWithCharacters = theBoardIsDrawnWithCharacters;
exports.aLogIsDrawnAsALog = aLogIsDrawnAsALog;
exports.turtlesAreDrawnAsTurtles = turtlesAreDrawnAsTurtles;
exports.aDivedTurtleShowsOnlyWater = aDivedTurtleShowsOnlyWater;
exports.aVehiclePointsWhereItIsGoing = aVehiclePointsWhereItIsGoing;
exports.aVehicleGoingLeftPointsLeft = aVehicleGoingLeftPointsLeft;
exports.eachKindOfTrafficHasItsOwnColour = eachKindOfTrafficHasItsOwnColour;
exports.theFrogIsDrawnOverItsFooting = theFrogIsDrawnOverItsFooting;
exports.aCrocodileShowsItsJaws = aCrocodileShowsItsJaws;
exports.aHomeShowsWhatIsInIt = aHomeShowsWhatIsInIt;
exports.theHedgeIsTextured = theHedgeIsTextured;
exports.theBanksAreTextured = theBanksAreTextured;
exports.aSnakeOnALogIsVisible = aSnakeOnALogIsVisible;
exports.aDyingFrogBlinks = aDyingFrogBlinks;
exports.theBoardIsPureAscii = theBoardIsPureAscii;
exports.theFrogStandsOutFromEveryLane = theFrogStandsOutFromEveryLane;
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
/** Pull one row apart into its characters and their colours. */
function paintedRow(line) {
    const cells = [];
    const re = /\{([a-z]+)-bg\}\{([a-z]+)-fg\}(.*?)\{\/[a-z]+-fg\}\{\/[a-z]+-bg\}/g;
    let m;
    while ((m = re.exec(line)) !== null) {
        for (const ch of m[3])
            cells.push({ ch, fg: m[2], bg: m[1] });
    }
    return cells;
}
/** The characters of a row, as a plain string. */
function textOf(line) {
    return paintedRow(line).map(c => c.ch).join('');
}
/** Every board row is the full width, character for character. */
async function everyRowIsAFullScreenWide() {
    const { game } = (0, fixture_1.startedLevel)(1);
    const rows = frameOf(game).slice(0, constants_1.GRID_HEIGHT);
    assert_1.default.strictEqual(rows.length, constants_1.GRID_HEIGHT, 'one line per lane');
    for (let y = 0; y < rows.length; y++) {
        assert_1.default.strictEqual(paintedRow(rows[y]).length, constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, `row ${y} should be ${constants_1.GRID_WIDTH * constants_1.CELL_WIDTH} characters wide`);
    }
}
/** A cell is wider than one character, so it is not a tall sliver. */
async function aCellIsWiderThanOneCharacter() {
    assert_1.default.ok(constants_1.CELL_WIDTH >= 2, 'a cell needs to be at least two characters wide');
}
/**
 * The board is drawn with characters, not just colour. This is the whole
 * point of the ANSI style, and the reason it was reported: a board of solid
 * blocks reads as coloured bars rather than as a game.
 */
async function theBoardIsDrawnWithCharacters() {
    const { game } = (0, fixture_1.startedLevel)(3);
    const rows = frameOf(game).slice(0, constants_1.GRID_HEIGHT);
    const drawn = rows.map(textOf).join('').replace(/ /g, '');
    assert_1.default.ok(drawn.length > 100, `the board should be full of sprites, found ${drawn.length} characters`);
}
/** A log has rounded ends and a grain along it. */
async function aLogIsDrawnAsALog() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const lane = (0, fixture_1.laneOf)(data, 'water', 2);
    const log = lane.objects[0];
    log.x = 4;
    const row = paintedRow(frameOf(game)[lane.y]);
    const span = log.width * constants_1.CELL_WIDTH;
    const sprite = row.slice(4 * constants_1.CELL_WIDTH, 4 * constants_1.CELL_WIDTH + span);
    const text = sprite.map(c => c.ch).join('');
    assert_1.default.strictEqual(text[0], constants_1.LOG_END_LEFT, 'a rounded left end');
    assert_1.default.strictEqual(text[text.length - 1], constants_1.LOG_END_RIGHT, 'and a rounded right end');
    assert_1.default.ok(text.includes('-'), 'with a grain along it');
    assert_1.default.ok(sprite.every(c => c.bg === constants_1.BG_COLORS.log), 'on wood, not on water');
}
/** A turtle set is drawn as turtles. */
async function turtlesAreDrawnAsTurtles() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const turtle = lane.objects[0];
    turtle.x = 6;
    turtle.isDiving = false;
    const row = paintedRow(frameOf(game)[lane.y]);
    const text = row.slice(6 * constants_1.CELL_WIDTH, 6 * constants_1.CELL_WIDTH + turtle.width * constants_1.CELL_WIDTH)
        .map(c => c.ch).join('');
    assert_1.default.ok(text.includes(constants_1.TURTLE_GLYPH), `expected a turtle in "${text}"`);
}
/** A turtle that has dived shows nothing: there is nothing to stand on. */
async function aDivedTurtleShowsOnlyWater() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const turtle = lane.objects.find(t => t.canDive);
    turtle.x = 6;
    turtle.isDiving = true;
    const row = paintedRow(frameOf(game)[lane.y]);
    const cells = row.slice(6 * constants_1.CELL_WIDTH, 6 * constants_1.CELL_WIDTH + turtle.width * constants_1.CELL_WIDTH);
    assert_1.default.strictEqual(cells.map(c => c.ch).join('').trim(), '', 'a turtle under the surface should not be drawn');
    assert_1.default.ok(cells.every(c => c.bg === constants_1.BG_COLORS.water), 'only water is left');
}
/** A vehicle points the way it is travelling. */
async function aVehiclePointsWhereItIsGoing() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const road = (0, fixture_1.laneOf)(data, 'road', 1);
    road.objects = [{
            id: 1, type: 'car', x: 10, y: road.y, lane: road.lane, width: 2,
            speed: Math.abs(road.speed), // travelling right
        }];
    const row = paintedRow(frameOf(game)[road.y]);
    const text = row.slice(10 * constants_1.CELL_WIDTH, 10 * constants_1.CELL_WIDTH + 2 * constants_1.CELL_WIDTH)
        .map(c => c.ch).join('');
    assert_1.default.strictEqual(text[text.length - 1], '>', `a nose on the right, got "${text}"`);
    assert_1.default.ok(row[10 * constants_1.CELL_WIDTH].fg === constants_1.SPRITE_FG.car, 'painted in the car colour');
}
/** ...and the other way when it is going the other way. */
async function aVehicleGoingLeftPointsLeft() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const road = (0, fixture_1.laneOf)(data, 'road', 1);
    road.objects = [{
            id: 1, type: 'car', x: 10, y: road.y, lane: road.lane, width: 2,
            speed: -Math.abs(road.speed),
        }];
    const text = paintedRow(frameOf(game)[road.y])
        .slice(10 * constants_1.CELL_WIDTH, 10 * constants_1.CELL_WIDTH + 2 * constants_1.CELL_WIDTH)
        .map(c => c.ch).join('');
    assert_1.default.strictEqual(text[0], '<', `a nose on the left, got "${text}"`);
}
/** Each kind of traffic is told apart by colour. */
async function eachKindOfTrafficHasItsOwnColour() {
    const distinct = new Set([constants_1.SPRITE_FG.car, constants_1.SPRITE_FG.truck, constants_1.SPRITE_FG.racecar]);
    assert_1.default.strictEqual(distinct.size, 3, 'cars, trucks and racecars differ');
}
/** The frog is drawn on top of whatever it is standing on. */
async function theFrogIsDrawnOverItsFooting() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const water = (0, fixture_1.laneOf)(data, 'water', 3);
    const log = water.objects[0];
    log.x = 8;
    data.frog.y = water.y;
    data.frog.x = 9;
    const row = paintedRow(frameOf(game)[water.y]);
    const cell = row[9 * constants_1.CELL_WIDTH];
    assert_1.default.strictEqual(cell.ch, constants_1.FROG_GLYPH, 'the frog wins its cell');
    assert_1.default.strictEqual(cell.fg, constants_1.SPRITE_FG.frog);
    assert_1.default.strictEqual(cell.bg, constants_1.BG_COLORS.log, 'standing on the log');
}
/** A crocodile shows its jaws at the end it swims towards. */
async function aCrocodileShowsItsJaws() {
    const { game, data } = (0, fixture_1.startedLevel)(5);
    const lane = (0, fixture_1.laneOf)(data, 'water', 5);
    const croc = lane.objects[0];
    croc.x = 12;
    const row = paintedRow(frameOf(game)[lane.y]);
    const span = croc.width * constants_1.CELL_WIDTH;
    const sprite = row.slice(12 * constants_1.CELL_WIDTH, 12 * constants_1.CELL_WIDTH + span);
    const text = sprite.map(c => c.ch).join('');
    assert_1.default.ok(text.includes(constants_1.MOUTH_GLYPH), `jaws somewhere in "${text}"`);
    // Lane 5 runs right to left, so the jaws lead on the left.
    assert_1.default.strictEqual(text.slice(0, constants_1.MOUTH_GLYPH.length), constants_1.MOUTH_GLYPH);
    assert_1.default.strictEqual(sprite[0].fg, constants_1.SPRITE_FG.crocodileMouth, 'and they are marked');
    assert_1.default.strictEqual(sprite[span - 1].fg, constants_1.SPRITE_FG.crocodile, 'while the back is not');
}
/** A home shows what is sitting in it. */
async function aHomeShowsWhatIsInIt() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    data.homes[0].occupied = true;
    data.homes[1].hasFly = true;
    data.homes[2].hasAlligator = true;
    const row = paintedRow(frameOf(game)[0]);
    // The cell the frog has to land in is where the occupant is drawn.
    const middleOf = (i) => row[(data.homes[i].x + constants_1.HOME_CENTRE_OFFSET) * constants_1.CELL_WIDTH];
    assert_1.default.strictEqual(middleOf(0).ch, constants_1.FROG_GLYPH, 'a frog safely home');
    assert_1.default.strictEqual(middleOf(1).ch, constants_1.FLY_GLYPH, 'a fly to be had');
    assert_1.default.strictEqual(middleOf(2).ch, constants_1.MOUTH_GLYPH[0], 'a crocodile lying in wait');
    assert_1.default.strictEqual(middleOf(3).ch, ' ', 'and an empty home');
}
/** The hedge between the homes is textured, not a flat block. */
async function theHedgeIsTextured() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const row = paintedRow(frameOf(game)[0]);
    const between = row[(data.homes[0].x + 5) * constants_1.CELL_WIDTH];
    assert_1.default.notStrictEqual(between.ch, ' ', 'the hedge should have a texture');
    assert_1.default.strictEqual(between.bg, constants_1.BG_COLORS.hedge);
}
/** The banks and the median are textured too. */
async function theBanksAreTextured() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const bank = data.lanes.find(l => l.type === 'safe');
    const row = paintedRow(frameOf(game)[bank.y]);
    // Counted, not merely "something is drawn": the frog stands on the bottom
    // bank, so one glyph proves nothing about the texture.
    const textured = row.filter(c => constants_1.BANK_TEXTURE.includes(c.ch)).length;
    assert_1.default.ok(textured > row.length / 2, `most of the bank should be textured, found ${textured} of ${row.length}`);
    assert_1.default.ok(row.every(c => c.bg === constants_1.BG_COLORS.bank));
}
/** A snake riding a log is drawn over it. */
async function aSnakeOnALogIsVisible() {
    const { game, data } = (0, fixture_1.startedLevel)(3);
    const lane = (0, fixture_1.laneOf)(data, 'water', 3);
    const log = lane.objects[0];
    log.x = 5;
    log.snakeAt = 2;
    const row = paintedRow(frameOf(game)[lane.y]);
    assert_1.default.strictEqual(row[7 * constants_1.CELL_WIDTH].ch, constants_1.SNAKE_GLYPH, 'the snake shows on the log');
    assert_1.default.strictEqual(row[7 * constants_1.CELL_WIDTH].fg, constants_1.SPRITE_FG.snake);
}
/** A dying frog blinks. */
async function aDyingFrogBlinks() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.frog.isDead = true;
    data.frog.x = 20;
    data.frog.y = 10;
    data.frog.deathFrame = 0;
    const on = paintedRow(frameOf(game)[10])[20 * constants_1.CELL_WIDTH];
    data.frog.deathFrame = 3;
    const off = paintedRow(frameOf(game)[10])[20 * constants_1.CELL_WIDTH];
    assert_1.default.strictEqual(on.ch, constants_1.FROG_GLYPH, 'showing on one frame');
    assert_1.default.strictEqual(on.fg, constants_1.SPRITE_FG.frogDying, 'in the dying colour');
    assert_1.default.notStrictEqual(off.ch, constants_1.FROG_GLYPH, 'and gone on the next');
}
/**
 * Nothing outside 7-bit ASCII is ever drawn.
 *
 * Reported live 2026-08-31: "we cant use unicode characters in frogger".
 * The board goes through blessed with fullUnicode off, so a Unicode glyph
 * arrives mangled or not at all - the sprites showed as nothing.
 */
async function theBoardIsPureAscii() {
    for (const level of [1, 3, 5, 7]) {
        const { game, data } = (0, fixture_1.startedLevel)(level);
        data.snakes.push({ id: 1, x: 5, y: 6, direction: 1, speed: 1 });
        const frame = frameOf(game).join('\n');
        const offenders = [...frame].filter(ch => ch.charCodeAt(0) > 126);
        assert_1.default.strictEqual(offenders.length, 0, `level ${level} drew non-ASCII: ${[...new Set(offenders)].join(' ')}`);
    }
}
/**
 * The frog is never the same colour as the ground it stands on.
 *
 * Reported live: "i cant see the grog when i stand on green as the grog is
 * the same green."
 */
async function theFrogStandsOutFromEveryLane() {
    for (const ground of [constants_1.BG_COLORS.bank, constants_1.BG_COLORS.water, constants_1.BG_COLORS.road, constants_1.BG_COLORS.log]) {
        assert_1.default.notStrictEqual(constants_1.SPRITE_FG.frog, ground, `the frog would be invisible on ${ground}`);
    }
}
//# sourceMappingURL=render.test.js.map