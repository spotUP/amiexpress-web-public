"use strict";
/**
 * The board as cells: pure in (data, sheet, tick).
 *
 * The same shape Pengo's renderer takes, for the same reason. The old
 * painter decided colour by matching characters in a string it had just
 * built; here what a thing looks like is decided by which sprite was
 * blitted, so the class of bug where a log is coloured like a car because
 * its glyph happened to match cannot recur.
 *
 * Layer order is meaning, bottom to top:
 *
 *   1. the lanes themselves - road, water, banks, hedge
 *   2. the homes cut into the hedge
 *   3. whatever floats or drives in a lane: logs, turtles, crocodiles, cars
 *   4. riders - a snake or the lady frog sitting on a log
 *   5. the snakes patrolling the median
 *   6. the frog, last, so nothing can ever hide it
 *
 * A frog you cannot see is the worst thing this door can do, so it is drawn
 * over everything including the thing carrying it.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildBoard = buildBoard;
exports.boardToLines = boardToLines;
const cell_art_1 = require("@amiexpress/bbs-door-sdk/engines/graphics/cell-art");
const constants_1 = require("./constants");
/**
 * The lane colours, as cell-art palette indices.
 *
 * The old renderer named blessed colours ('blue', 'magenta'); a CellBuffer
 * carries numbers, so the names are resolved here once. The values are the
 * same colours the door already used, including the magenta banks - they
 * were green once, and a green frog standing on a green bank was invisible.
 */
const LANE_COLOUR = {
    road: 0, // black
    water: 4, // blue
    bank: 5, // magenta
    hedge: 2, // green
};
/** A solid block of one colour, used to lay a lane down before anything else. */
function fill(buffer, top, height, colour) {
    for (let row = top; row < top + height && row < buffer.length; row++) {
        for (let x = 0; x < buffer[row].length; x++) {
            buffer[row][x] = { char: ' ', fg: 7, bg: colour };
        }
    }
}
/**
 * Blit a sprite at a lane and a grid column, optionally mirrored.
 *
 * Not `blitSprite`: that one multiplies the position by the sprite's own
 * cellW and cellH, which assumes every sprite is exactly one grid cell.
 * Frogger's are not - a truck is two cells and a long log is four - so the
 * position is worked out here in characters and the frame is blitted
 * directly. The lane's top row comes from LANE_ROWS because lanes are not
 * all the same height, so this is the one place that knows how a lane maps
 * onto rows.
 *
 * `flip` mirrors the frame left to right, which is how a car going one way
 * is told apart from a car going the other without drawing it twice.
 */
function blitAtLane(board, sprite, animation, tick, laneY, charX, flip = false) {
    if (!sprite)
        return;
    const laneTop = constants_1.LANE_ROWS[laneY];
    if (laneTop === undefined)
        return;
    const anim = sprite.animations[animation];
    if (!anim)
        return;
    const frame = (0, cell_art_1.frameAt)(anim, tick);
    // A sprite never leaves its own lane.
    //
    // It used to be allowed to lean up into the lane above when it did not
    // fit, which put the frog's body in the water while it was still safely
    // on the median: "it feels like I should do one more jump but I end up
    // in the water". A lane is a place in this game - the row a thing is
    // drawn on IS the row the rules put it on - so a sprite taller than its
    // lane is CLIPPED to it rather than allowed to borrow a neighbour's row
    // and lie about where it stands.
    const laneHeight = constants_1.LANE_HEIGHTS[laneY] ?? frame.length;
    const rows = Math.min(frame.length, laneHeight, board.length - laneTop);
    const clipped = rows < frame.length ? frame.slice(0, rows) : frame;
    (0, cell_art_1.blitCells)(board, flip ? (0, cell_art_1.flipCellsH)(clipped) : clipped, charX, laneTop);
}
/**
 * A moving thing's position, in CHARACTERS.
 *
 * Traffic and logs move in fractional cells - a lane speed of 0.6 cells a
 * step - and collision uses that fractional position. Rounding to whole
 * cells before drawing makes them jump five characters at a time and puts
 * the picture up to two and a half characters away from where the rules
 * say the thing is: a car looks clear of the frog and kills it anyway.
 * Reported as "offset from the level and enemies", and it got worse when a
 * cell went from two characters wide to five.
 *
 * So moving things are placed to the character, which is as fine as this
 * display gets. The frog is placed the same way because when it rides a
 * log its position IS the log's.
 */
function charPos(x) {
    return Math.round(x * constants_1.CELL_WIDTH);
}
/** A static thing sits on its cell, where the frog can land on it. */
function cellPos(cellX) {
    return cellX * constants_1.CELL_WIDTH;
}
/** Which sprite draws a thing in the river or on the road. */
function spriteNameFor(obj) {
    switch (obj.type) {
        case 'log':
            return obj.width >= 4 ? 'log-long' : obj.width >= 3 ? 'log-medium' : 'log-short';
        case 'turtle': return 'turtle';
        case 'crocodile':
        case 'alligator':
        case 'otter': return 'crocodile';
        case 'truck': return 'truck';
        case 'racecar': return 'racecar';
        default: return 'car';
    }
}
/**
 * Which animation a turtle is showing.
 *
 * The three states are the ones the game already drives on its own timers,
 * so the animation follows the rules rather than running a second clock
 * beside them - a turtle that LOOKS submerged is a turtle the frog drowns
 * on, because both read the same flag.
 */
function turtleAnimation(obj) {
    if (obj.diveStage === 'down' || obj.isDiving)
        return 'under';
    if (obj.diveStage === 'sinking')
        return 'sinking';
    return 'up';
}
function buildBoard(data, sheet, tick) {
    const board = (0, cell_art_1.createBuffer)(constants_1.GRID_WIDTH * constants_1.CELL_WIDTH, constants_1.GAME_AREA_HEIGHT);
    // 1. The lanes.
    for (const lane of data.lanes) {
        const top = constants_1.LANE_ROWS[lane.y];
        const height = constants_1.LANE_HEIGHTS[lane.y];
        if (top === undefined)
            continue;
        const colour = lane.type === 'road' ? LANE_COLOUR.road :
            lane.type === 'water' ? LANE_COLOUR.water :
                lane.type === 'safe' ? LANE_COLOUR.bank :
                    LANE_COLOUR.hedge;
        fill(board, top, height, colour);
        // The banks carry a texture, the way the reference art does: a flat
        // block of colour reads as a gap in the game rather than as ground.
        if (lane.type === 'safe') {
            for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
                blitAtLane(board, sheet['bank'], 'idle', tick, lane.y, cellPos(x));
            }
        }
    }
    // 2. The homes.
    for (const home of data.homes) {
        const animation = home.occupied ? 'occupied' :
            home.hasAlligator ? 'crocodile' :
                'empty';
        blitAtLane(board, sheet['home'], animation, tick, 0, cellPos(home.x + constants_1.HOME_CENTRE_OFFSET));
        // A fly sits in the opening until something takes it.
        if (home.hasFly && !home.occupied && !home.hasAlligator) {
            blitAtLane(board, sheet['fly'], 'idle', tick, 0, cellPos(home.x + constants_1.HOME_CENTRE_OFFSET));
        }
    }
    // 3. Everything travelling in a lane.
    for (const lane of data.lanes) {
        for (const raw of lane.objects) {
            const obj = raw;
            const x = charPos(obj.x);
            const name = spriteNameFor(obj);
            const animation = obj.type === 'turtle' ? turtleAnimation(obj) :
                name === 'crocodile' ? (obj.mouthWidth ? 'mouth-open' : 'mouth-closed') :
                    'idle';
            // Sprites are drawn facing LEFT; anything travelling right is the
            // same frame mirrored. Which way the traffic is coming is real
            // information in this game - the player reads a lane before hopping
            // into it - so it is worth a flip rather than a symmetric blob.
            blitAtLane(board, sheet[name], animation, tick, obj.y, x, obj.speed > 0);
            // 4. Riders sit on top of whatever carries them.
            if (obj.snakeAt !== null && obj.snakeAt !== undefined) {
                blitAtLane(board, sheet['snake'], 'idle', tick, obj.y, x + cellPos(obj.snakeAt));
            }
            if (obj.ladyFrogAt !== null && obj.ladyFrogAt !== undefined) {
                blitAtLane(board, sheet['lady-frog'], 'idle', tick, obj.y, x + cellPos(obj.ladyFrogAt));
            }
        }
    }
    // 5. The snakes patrolling the median.
    for (const snake of data.snakes) {
        blitAtLane(board, sheet['snake'], 'idle', tick, snake.y, charPos(snake.x));
    }
    // 6. The frog, over everything.
    //
    // Two sprites, one frog: the tall one for the ten lanes that are two
    // rows, and a squat one-row version for the start bank and the home row.
    // Clipping the tall frog to a thin lane cut its legs off; letting it
    // lean into the lane above put it in the water while it stood on land.
    // A sprite that fits is the only version that neither lies nor truncates.
    const frog = data.frog;
    const frogSheet = (constants_1.LANE_HEIGHTS[frog.y] ?? constants_1.CELL_HEIGHT) < constants_1.CELL_HEIGHT
        ? sheet['frog-sit'] ?? sheet['frog']
        : sheet['frog'];
    const frogX = charPos(frog.x);
    if (frog.isDead) {
        // Which death it was decides which animation plays: drowning and being
        // run over look nothing alike in the arcade, and the player should be
        // able to tell what killed them without replaying it.
        const drowned = frog.deathType === 'water' || frog.deathType === 'crocodile';
        const animation = drowned ? 'death-drown' : 'death-splat';
        blitAtLane(board, frogSheet, animation, frog.deathFrame, frog.y, frogX);
    }
    else {
        blitAtLane(board, frogSheet, frogAnimation(data), tick, frog.y, frogX);
    }
    return board;
}
/**
 * Which way the frog is facing, and whether it is mid-hop.
 *
 * Both come from state the game already keeps - `direction` is the way the
 * last move went and `isJumping` is true while the hop is in progress - so
 * the animation follows the rules rather than running a clock beside them.
 * Nothing was added to the game to make the frog animate.
 */
function frogAnimation(data) {
    const frog = data.frog;
    if (!frog.isJumping)
        return 'idle';
    return `hop-${frog.direction}`;
}
/**
 * The board as blessed tag rows, one string per terminal row.
 *
 * The engine's own converter, not a local one: a Cell carries colours as
 * palette INDICES, and blessed wants names, so a hand-rolled version emits
 * `{4-bg}` where blessed expects `{blue-bg}` - tags that are silently
 * ignored, leaving a board drawn in whatever colour happened to be current.
 *
 * The fallback is the water blue rather than black: a transparent cell on
 * this board is a hole in a lane, and a hole should look like the lane.
 */
function boardToLines(board) {
    return (0, cell_art_1.bufferToTags)(board, { char: ' ', fg: 7, bg: LANE_COLOUR.water });
}
//# sourceMappingURL=render.js.map