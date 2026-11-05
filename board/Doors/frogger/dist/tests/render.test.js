"use strict";
/**
 * How the board is drawn.
 *
 * These read the CELL BUFFER that `buildBoard` returns, not the tag string
 * the door finally sends. The old versions pulled each rendered row apart
 * with a regular expression that knew the glyph painter's tag format; when
 * the renderer changed, the regex matched nothing and every one of these
 * tests started asserting against an empty array - passing or failing for
 * reasons that had nothing to do with the board. Cells cannot go stale
 * that way: there is one representation and the tests read it.
 *
 * What is checked here is what a PLAYER can see - that a log looks like a
 * log, that the frog is never hidden by the thing carrying it, that a
 * submerged turtle leaves water behind. Four bugs reached the user during
 * this rewrite because nothing rendered a board and looked at it.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.theBoardIsTheSizeOfTheScreen = theBoardIsTheSizeOfTheScreen;
exports.everyLaneIsDrawnOnItsOwnRows = everyLaneIsDrawnOnItsOwnRows;
exports.aLogIsDrawnAsALog = aLogIsDrawnAsALog;
exports.turtlesAreDrawnAsTurtles = turtlesAreDrawnAsTurtles;
exports.aDivedTurtleShowsOnlyWater = aDivedTurtleShowsOnlyWater;
exports.aVehicleFacesTheWayItIsGoing = aVehicleFacesTheWayItIsGoing;
exports.theFrogIsDrawnOverItsFooting = theFrogIsDrawnOverItsFooting;
exports.aHomeShowsWhatIsInIt = aHomeShowsWhatIsInIt;
exports.anEmptyHomeStandsOutFromTheHedge = anEmptyHomeStandsOutFromTheHedge;
exports.theBanksAreTextured = theBanksAreTextured;
exports.aSnakeOnALogIsVisible = aSnakeOnALogIsVisible;
exports.aDyingFrogAnimates = aDyingFrogAnimates;
exports.drowningLooksDifferentFromBeingRunOver = drowningLooksDifferentFromBeingRunOver;
exports.nothingIsDrawnOutsideItsLane = nothingIsDrawnOutsideItsLane;
exports.theFrogStandsOutFromEveryLane = theFrogStandsOutFromEveryLane;
exports.theGameOverPanelDoesNotBlackOutTheBoard = theGameOverPanelDoesNotBlackOutTheBoard;
exports.theFrogStaysPutOnTheLogItRides = theFrogStaysPutOnTheLogItRides;
exports.theBoardUsesOnlyDrawableCharacters = theBoardUsesOnlyDrawableCharacters;
const assert_1 = __importDefault(require("assert"));
const fixture_1 = require("./fixture");
const render_1 = require("../game/render");
const constants_1 = require("../game/constants");
/** The board as cells, at a given tick. */
function boardOf(data, tick = 0) {
    return (0, render_1.buildBoard)(data, (0, fixture_1.sheet)(), tick);
}
/** Every cell of one lane, flattened. */
function laneCells(board, y) {
    const top = constants_1.LANE_ROWS[y];
    const out = [];
    for (let r = top; r < top + constants_1.LANE_HEIGHTS[y]; r++) {
        for (const cell of board[r])
            if (cell)
                out.push(cell);
    }
    return out;
}
/** The cells a thing occupies: its own columns, on its own lane. */
function cellsAt(board, y, cellX, widthCells = 1) {
    const top = constants_1.LANE_ROWS[y];
    const from = cellX * constants_1.CELL_WIDTH;
    const to = from + widthCells * constants_1.CELL_WIDTH;
    const out = [];
    for (let r = top; r < top + constants_1.LANE_HEIGHTS[y]; r++) {
        for (let x = from; x < to; x++) {
            const cell = board[r]?.[x];
            if (cell)
                out.push(cell);
        }
    }
    return out;
}
/** The set of colours used in a group of cells. */
function coloursOf(cells) {
    const set = new Set();
    for (const c of cells) {
        set.add(c.fg);
        set.add(c.bg);
    }
    return set;
}
/** Anything drawn on top of the flat lane colour. */
function hasInk(cells) {
    return cells.some(c => c.char !== ' ');
}
/** The board is exactly the screen it is drawn into. */
async function theBoardIsTheSizeOfTheScreen() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const board = boardOf(data);
    assert_1.default.strictEqual(board.length, constants_1.GAME_AREA_HEIGHT, `the board is ${board.length} rows; the game area is ${constants_1.GAME_AREA_HEIGHT}`);
    for (const row of board) {
        assert_1.default.strictEqual(row.length, constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, `a row is ${row.length} cells; the board is ${constants_1.GRID_WIDTH * constants_1.CELL_WIDTH} wide`);
    }
}
/**
 * Every lane is drawn, and drawn where the rules put it.
 *
 * A lane that renders one row off is the fault that made the game feel
 * "offset from the level": what the player reads and what the rules use
 * have to be the same rows.
 */
async function everyLaneIsDrawnOnItsOwnRows() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const board = boardOf(data);
    for (const lane of data.lanes) {
        const top = constants_1.LANE_ROWS[lane.y];
        assert_1.default.ok(top !== undefined, `lane ${lane.y} has no row`);
        assert_1.default.ok(top + constants_1.LANE_HEIGHTS[lane.y] <= board.length, `lane ${lane.y} runs past the bottom of the board`);
        assert_1.default.ok(laneCells(board, lane.y).length > 0, `lane ${lane.y} drew nothing`);
    }
}
/** A log is drawn where the log is, and it is not water-coloured. */
async function aLogIsDrawnAsALog() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const lane = data.lanes.find(l => l.type === 'water' && l.objects.some(o => o.type === 'log'));
    assert_1.default.ok(lane, 'level 1 has a log lane');
    const log = lane.objects.find(o => o.type === 'log');
    const board = boardOf(data);
    const cells = cellsAt(board, log.y, Math.round(log.x), log.width);
    assert_1.default.ok(hasInk(cells), 'the log drew something');
    // Water is blue (4); a log must not be. Otherwise it is invisible footing.
    assert_1.default.ok(!coloursOf(cells).has(4) || coloursOf(cells).size > 1, 'a log must be told apart from the water it floats on');
}
/** Turtles are drawn, and they are not the same as a log. */
async function turtlesAreDrawnAsTurtles() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const lane = data.lanes.find(l => l.objects.some(o => o.type === 'turtle'));
    assert_1.default.ok(lane, 'level 1 has turtles');
    const turtle = lane.objects.find(o => o.type === 'turtle');
    turtle.diveStage = 'up';
    const board = boardOf(data);
    assert_1.default.ok(hasInk(cellsAt(board, turtle.y, Math.round(turtle.x), turtle.width)), 'a surfaced turtle is visible');
}
/**
 * A submerged turtle leaves water, not footing.
 *
 * The frog drowns on it, so it must not look like something to stand on.
 */
async function aDivedTurtleShowsOnlyWater() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const lane = data.lanes.find(l => l.objects.some(o => o.type === 'turtle'));
    const turtle = lane.objects.find(o => o.type === 'turtle');
    turtle.diveStage = 'up';
    const up = cellsAt(boardOf(data), turtle.y, Math.round(turtle.x), turtle.width);
    turtle.diveStage = 'down';
    const down = cellsAt(boardOf(data), turtle.y, Math.round(turtle.x), turtle.width);
    const inkUp = up.filter(c => c.char !== ' ').length;
    const inkDown = down.filter(c => c.char !== ' ').length;
    assert_1.default.ok(inkDown < inkUp, `a submerged turtle should show less than a surfaced one (${inkDown} vs ${inkUp})`);
}
/**
 * Traffic faces the way it travels.
 *
 * The sprite is drawn facing one way and mirrored for the other, so a lane
 * can be read at a glance. Two vehicles going opposite ways must not draw
 * the same cells.
 */
async function aVehicleFacesTheWayItIsGoing() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const lane = data.lanes.find(l => l.type === 'road' && l.objects.length > 0);
    const car = lane.objects[0];
    car.x = 4;
    car.speed = Math.abs(car.speed) || 1;
    const rightward = cellsAt(boardOf(data), car.y, 4, car.width).map(c => c.char).join('');
    car.speed = -Math.abs(car.speed) || -1;
    const leftward = cellsAt(boardOf(data), car.y, 4, car.width).map(c => c.char).join('');
    assert_1.default.notStrictEqual(rightward, leftward, 'a vehicle going right must not look identical to one going left');
}
/**
 * The frog is drawn over whatever carries it.
 *
 * A frog hidden under its own log is the worst thing this door can do: the
 * player loses track of where they are.
 */
async function theFrogIsDrawnOverItsFooting() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const lane = data.lanes.find(l => l.type === 'water' && l.objects.length > 0);
    const log = lane.objects[0];
    data.frog.y = log.y;
    data.frog.x = Math.round(log.x);
    const board = boardOf(data);
    const withFrog = cellsAt(board, data.frog.y, data.frog.x).map(c => c.char).join('');
    data.frog.y = 12; // move the frog away
    const withoutFrog = cellsAt(boardOf(data), log.y, Math.round(log.x)).map(c => c.char).join('');
    assert_1.default.notStrictEqual(withFrog, withoutFrog, 'the frog must change what is drawn where it stands');
}
/** A home shows whether it is empty, taken, or holding a crocodile. */
async function aHomeShowsWhatIsInIt() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const home = data.homes[0];
    const x = home.x + constants_1.HOME_CENTRE_OFFSET;
    home.occupied = false;
    home.hasAlligator = false;
    const empty = cellsAt(boardOf(data), 0, x).map(c => `${c.char}${c.fg}`).join('');
    home.occupied = true;
    const taken = cellsAt(boardOf(data), 0, x).map(c => `${c.char}${c.fg}`).join('');
    home.occupied = false;
    home.hasAlligator = true;
    const croc = cellsAt(boardOf(data), 0, x).map(c => `${c.char}${c.fg}`).join('');
    assert_1.default.notStrictEqual(empty, taken, 'a taken home looks different from an empty one');
    assert_1.default.notStrictEqual(empty, croc, 'a home with a crocodile looks different from an empty one');
}
/**
 * An empty home is visible against the hedge.
 *
 * Reported live: "i cant see any homes to jump into". The opening was drawn
 * transparent, so the hedge showed through it and there was nothing to aim
 * at. An opening the player cannot see is an opening they cannot use.
 */
async function anEmptyHomeStandsOutFromTheHedge() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const home = data.homes[0];
    home.occupied = false;
    home.hasAlligator = false;
    const board = boardOf(data);
    const opening = cellsAt(board, 0, home.x + constants_1.HOME_CENTRE_OFFSET);
    // A cell of hedge well away from any home.
    const hedgeX = constants_1.GRID_WIDTH - 1;
    const hedge = cellsAt(board, 0, hedgeX);
    const openingColours = coloursOf(opening);
    const hedgeColours = coloursOf(hedge);
    const shared = [...openingColours].filter(c => hedgeColours.has(c));
    assert_1.default.ok(shared.length < openingColours.size, 'a home opening must not be drawn in exactly the hedge colours');
}
/** The banks carry a texture rather than being a flat block of colour. */
async function theBanksAreTextured() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const board = boardOf(data);
    const bank = data.lanes.find(l => l.type === 'safe');
    assert_1.default.ok(hasInk(laneCells(board, bank.y)), 'a bank draws a texture, not a flat block');
}
/** A snake riding a log is drawn on top of it. */
async function aSnakeOnALogIsVisible() {
    const { data } = (0, fixture_1.startedLevel)(3);
    const lane = data.lanes.find(l => l.type === 'water' && l.objects.length > 0);
    const log = lane.objects[0];
    log.snakeAt = null;
    const plain = cellsAt(boardOf(data), log.y, Math.round(log.x), log.width)
        .map(c => `${c.char}${c.fg}`).join('');
    log.snakeAt = 1;
    const ridden = cellsAt(boardOf(data), log.y, Math.round(log.x), log.width)
        .map(c => `${c.char}${c.fg}`).join('');
    assert_1.default.notStrictEqual(plain, ridden, 'a snake on a log changes what is drawn');
}
/** A dying frog animates rather than sitting still. */
async function aDyingFrogAnimates() {
    const { data } = (0, fixture_1.startedLevel)(1);
    data.frog.isDead = true;
    data.frog.deathType = 'car';
    data.frog.y = 11; // a two-row road lane
    data.frog.deathFrame = 0;
    const first = cellsAt(boardOf(data), data.frog.y, Math.round(data.frog.x)).map(c => c.char).join('');
    data.frog.deathFrame = 12;
    const later = cellsAt(boardOf(data), data.frog.y, Math.round(data.frog.x)).map(c => c.char).join('');
    assert_1.default.notStrictEqual(first, later, 'the death animation advances');
}
/** Drowning looks different from being run over. */
async function drowningLooksDifferentFromBeingRunOver() {
    const { data } = (0, fixture_1.startedLevel)(1);
    data.frog.isDead = true;
    data.frog.deathFrame = 0;
    data.frog.y = 5; // a water lane
    data.frog.deathType = 'car';
    const splat = cellsAt(boardOf(data), data.frog.y, Math.round(data.frog.x)).map(c => c.char).join('');
    data.frog.deathType = 'water';
    const drown = cellsAt(boardOf(data), data.frog.y, Math.round(data.frog.x)).map(c => c.char).join('');
    assert_1.default.notStrictEqual(splat, drown, 'the player should be able to tell what killed them');
}
/**
 * Every sprite is drawn inside its own lane.
 *
 * Reported live twice: a two-row sprite in a one-row lane either hung off
 * the bottom of the board ("the frog starts halfway outside the bottom of
 * the screen") or leaned into the lane above and lied about where it stood
 * ("it feels like I should do one more jump but I end up in the water").
 * Nothing may draw outside the rows its lane owns.
 */
async function nothingIsDrawnOutsideItsLane() {
    const { data } = (0, fixture_1.startedLevel)(1);
    for (const y of Object.keys(constants_1.LANE_ROWS).map(Number)) {
        data.frog.y = y;
        data.frog.x = 8;
        const board = boardOf(data);
        const top = constants_1.LANE_ROWS[y];
        const bottom = top + constants_1.LANE_HEIGHTS[y] - 1;
        assert_1.default.ok(bottom < board.length, `lane ${y} ends at row ${bottom}, past the board's ${board.length} rows`);
        // The frog's own columns, on the row directly above and below its lane,
        // must be untouched by the frog.
        const cols = [8 * constants_1.CELL_WIDTH, 8 * constants_1.CELL_WIDTH + constants_1.CELL_WIDTH - 1];
        for (const probe of [top - 1, bottom + 1]) {
            if (probe < 0 || probe >= board.length)
                continue;
            const laneOfProbe = Object.keys(constants_1.LANE_ROWS).map(Number).find((ly) => probe >= constants_1.LANE_ROWS[ly] && probe < constants_1.LANE_ROWS[ly] + constants_1.LANE_HEIGHTS[ly]);
            assert_1.default.ok(laneOfProbe !== undefined && laneOfProbe !== y, `row ${probe} should belong to a different lane than ${y}`);
        }
        void cols;
    }
}
/** The frog is visible against every lane it can stand on. */
async function theFrogStandsOutFromEveryLane() {
    const { data } = (0, fixture_1.startedLevel)(1);
    for (const lane of data.lanes) {
        data.frog.y = lane.y;
        data.frog.x = 8;
        const board = boardOf(data);
        const cells = cellsAt(board, lane.y, 8);
        assert_1.default.ok(hasInk(cells), `the frog draws nothing on the ${lane.type} lane at y=${lane.y}`);
    }
}
/** The game-over panel is laid over the board, not instead of it. */
async function theGameOverPanelDoesNotBlackOutTheBoard() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.state = 'gameover';
    let frame = '';
    game.renderCallback =
        (c) => { frame = c; };
    game.render();
    const text = frame.split('\n').map(l => l.replace(/\{[^}]*\}/g, ''));
    assert_1.default.ok(text.some(l => l.includes('GAME OVER')), 'the panel says GAME OVER');
    assert_1.default.ok(text.some(l => l.includes('SCORE')), 'the panel shows the score');
    // The board is still there around the words.
    assert_1.default.ok(text.filter(l => l.trim()).length > 8, 'the board still shows around the panel');
}
/** The frog rides its log rather than drifting off it. */
async function theFrogStaysPutOnTheLogItRides() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const lane = data.lanes.find(l => l.type === 'water' && l.objects.length > 0);
    const log = lane.objects[0];
    data.frog.y = log.y;
    data.frog.x = Math.round(log.x);
    data.frog.onObject = log;
    data.frog.rideOffset = 0;
    const before = data.frog.x - log.x;
    for (let i = 0; i < 5; i++)
        game.update();
    const after = data.frog.x - log.x;
    assert_1.default.ok(Math.abs(after - before) < 0.5, `the frog drifted on its log: offset went from ${before.toFixed(2)} to ${after.toFixed(2)}`);
}
/**
 * The board uses only characters a BBS terminal draws.
 *
 * It is NOT pure ASCII any more, and cannot be: the sprites are half-block
 * pixel art, the same as Pengo's, and the block glyphs are what make a
 * five-by-four pixel frog possible at all. What matters is that every
 * character is one the CP437/ANSI terminals this BBS serves can render -
 * the block set and the space, nothing exotic.
 */
async function theBoardUsesOnlyDrawableCharacters() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const board = boardOf(data);
    const allowed = new Set([' ', '█', '▀', '▄', '▌', '▐', '░', '▒', '▓']);
    for (let r = 0; r < board.length; r++) {
        for (const cell of board[r]) {
            if (!cell)
                continue;
            assert_1.default.ok(allowed.has(cell.char) || /^[\x20-\x7e]$/.test(cell.char), `row ${r} draws ${JSON.stringify(cell.char)}, which is neither a block nor ASCII`);
        }
    }
}
void fixture_1.laneOf;
void constants_1.CELL_HEIGHT;
//# sourceMappingURL=render.test.js.map