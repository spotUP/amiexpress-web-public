"use strict";
/**
 * What kills the frog, what it can ride, and what turns up in a home.
 *
 * Covers FAQ-6.4d, FAQ-6.4i, FAQ-6.4l, FAQ-6.4m, FAQ-6.4n, FAQ-7f, FAQ-7h,
 * FAQ-7i, FAQ-7j, FAQ-7k, FAQ-7m, FAQ-7n, FAQ-7o and FAQ-7p.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ahomeIsEnteredAtItsExactCentreOnly = ahomeIsEnteredAtItsExactCentreOnly;
exports.aCrocodileInAHomeKillsTheFrogThatEntersIt = aCrocodileInAHomeKillsTheFrogThatEntersIt;
exports.noCrocodileVisitsAHomeOnLevelOne = noCrocodileVisitsAHomeOnLevelOne;
exports.aCrocodileVisitsAHomeFromLevelTwo = aCrocodileVisitsAHomeFromLevelTwo;
exports.aFlyAppearsInAHome = aFlyAppearsInAHome;
exports.theMedianSnakeKillsTheFrog = theMedianSnakeKillsTheFrog;
exports.aSnakeOnALogKillsTheFrogRidingIt = aSnakeOnALogKillsTheFrogRidingIt;
exports.aCrocodilesBackCarriesYouAndItsMouthDoesNot = aCrocodilesBackCarriesYouAndItsMouthDoesNot;
exports.anOtterAppearsOnAWaterLane = anOtterAppearsOnAWaterLane;
exports.crossingTheLadyFrogPicksHerUp = crossingTheLadyFrogPicksHerUp;
exports.aLadyFrogAppearsOnALaneTwoLog = aLadyFrogAppearsOnALaneTwoLog;
exports.theLadyFrogOnlyRidesLaneTwo = theLadyFrogOnlyRidesLaneTwo;
exports.theRiverSpeedsUpWhenYouDawdle = theRiverSpeedsUpWhenYouDawdle;
exports.laneFourPicksUpSpeedAfterAWhile = laneFourPicksUpSpeedAfterAWhile;
exports.aLaneAlreadyFastDoesNotSpeedUpTwice = aLaneAlreadyFastDoesNotSpeedUpTwice;
exports.ridingOffTheEdgeKillsTheFrog = ridingOffTheEdgeKillsTheFrog;
exports.aDivingTurtleDrownsTheFrog = aDivingTurtleDrownsTheFrog;
exports.aTurtleSetIsThreeCellsWide = aTurtleSetIsThreeCellsWide;
exports.aDivingSetWarnsBeforeItGoesUnder = aDivingSetWarnsBeforeItGoesUnder;
exports.aSinkingSetIsStillFooting = aSinkingSetIsStillFooting;
exports.theWarningIsLongEnoughToHopOff = theWarningIsLongEnoughToHopOff;
exports.losingTheLastFrogShowsGameOver = losingTheLastFrogShowsGameOver;
exports.theGameOverPromptBlinks = theGameOverPromptBlinks;
const assert_1 = __importDefault(require("assert"));
const fixture_1 = require("./fixture");
const constants_1 = require("../game/constants");
/**
 * FAQ-7n: "You must hit exact center or your frog will die."
 */
async function ahomeIsEnteredAtItsExactCentreOnly() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const home = data.homes[2];
    data.frog.y = 0;
    data.frog.x = home.x + constants_1.HOME_CENTRE_OFFSET;
    game.checkHomeArrival();
    assert_1.default.ok(home.occupied, 'the centre of the home takes the frog');
    const missed = (0, fixture_1.startedLevel)(1);
    const other = missed.data.homes[2];
    missed.data.frog.y = 0;
    missed.data.frog.x = other.x + constants_1.HOME_CENTRE_OFFSET + 1;
    const lives = missed.data.lives;
    missed.game.checkHomeArrival();
    assert_1.default.ok(!other.occupied, 'one cell off is not the centre');
    assert_1.default.strictEqual(missed.data.lives, lives - 1, 'and it costs a frog');
}
/**
 * FAQ-7o: "keep in mind that crocodiles like to randomly appear in your
 * home. Make sure that your home is clear before trying to settle your frog
 * down into it."
 */
async function aCrocodileInAHomeKillsTheFrogThatEntersIt() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    const home = data.homes[1];
    home.hasAlligator = true;
    const lives = data.lives;
    data.frog.y = 0;
    data.frog.x = home.x + constants_1.HOME_CENTRE_OFFSET;
    game.checkHomeArrival();
    assert_1.default.strictEqual(data.lives, lives - 1, 'the crocodile takes the frog');
    assert_1.default.ok(!home.occupied, 'and the home is not credited');
}
/** FAQ-6.4i/6.4l: no crocodile visits a home on level 1. */
async function noCrocodileVisitsAHomeOnLevelOne() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    for (let i = 0; i < 400; i++)
        game.update();
    assert_1.default.ok(data.homes.every(h => !h.hasAlligator), 'the crocodile only starts appearing at level 2');
}
/** ...and one does from level 2. */
async function aCrocodileVisitsAHomeFromLevelTwo() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    let seen = false;
    for (let i = 0; i < 2000 && !seen; i++) {
        game.update();
        seen = data.homes.some(h => h.hasAlligator);
    }
    assert_1.default.ok(seen, 'a crocodile should turn up in a home from level 2');
}
/** FAQ-7m: "you can hold out until the fly appears in your home". */
async function aFlyAppearsInAHome() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    let seen = false;
    for (let i = 0; i < 2000 && !seen; i++) {
        game.update();
        seen = data.homes.some(h => h.hasFly);
    }
    assert_1.default.ok(seen, 'a fly should appear in a home to be waited for');
}
/**
 * FAQ-7f: "The snake is deadly to your frog and you cannot hop over it."
 */
async function theMedianSnakeKillsTheFrog() {
    const { game, data } = (0, fixture_1.startedLevel)(3);
    const median = data.lanes.find(l => l.type === 'safe' && l.y < 12);
    assert_1.default.ok(median, 'there should be a median');
    // The level's snake may have been dealt to a log instead of the median
    // (FAQ 6.4: "randomly in either the median, log, or both places"), so put
    // one on the median outright rather than depending on the deal.
    data.snakes = [{ id: 1, x: 10, y: median.y, direction: 1, speed: 1 }];
    const snake = data.snakes[0];
    data.frog.y = median.y;
    data.frog.x = snake.x;
    const lives = data.lives;
    game.checkCollisions();
    assert_1.default.strictEqual(data.lives, lives - 1, 'the median snake is deadly');
}
/** FAQ-7k: "Watch out for the snakes, they sometimes like to ride on the logs." */
async function aSnakeOnALogKillsTheFrogRidingIt() {
    const { game, data } = (0, fixture_1.startedLevel)(3);
    const lane = (0, fixture_1.laneOf)(data, 'water', 3);
    const log = lane.objects[0];
    log.snakeAt = 1;
    data.frog.y = lane.y;
    data.frog.x = log.x + 1;
    const lives = data.lives;
    game.checkCollisions();
    assert_1.default.strictEqual(data.lives, lives - 1, 'the snake on the log is deadly');
}
/**
 * FAQ-7h/7i: "You can jump on the backs of the crocodiles and otters. Just
 * don't get near their mouths or they are apt to turn your frog into a
 * meal."
 */
async function aCrocodilesBackCarriesYouAndItsMouthDoesNot() {
    const { game, data } = (0, fixture_1.startedLevel)(5);
    const lane = (0, fixture_1.laneOf)(data, 'water', 5);
    const croc = lane.objects[0];
    croc.x = 10;
    // The back: the trailing cells.
    data.frog.y = lane.y;
    data.frog.x = croc.x + croc.width - 1;
    let lives = data.lives;
    game.checkCollisions();
    assert_1.default.strictEqual(data.lives, lives, 'the back of a crocodile is footing');
    assert_1.default.ok(data.frog.onObject, 'and the frog rides it');
    // The mouth: the leading cell, which is the way it is travelling.
    const mouth = (0, fixture_1.startedLevel)(5);
    const mouthLane = (0, fixture_1.laneOf)(mouth.data, 'water', 5);
    const mouthCroc = mouthLane.objects[0];
    mouthCroc.x = 10;
    mouth.data.frog.y = mouthLane.y;
    mouth.data.frog.x = mouthCroc.x; // lane 5 runs right to left
    lives = mouth.data.lives;
    mouth.game.checkCollisions();
    assert_1.default.strictEqual(mouth.data.lives, lives - 1, 'the mouth eats the frog');
}
/** FAQ-6.4n: "The otter appears randomly on any of the water lanes." */
async function anOtterAppearsOnAWaterLane() {
    const { game, data } = (0, fixture_1.startedLevel)(4);
    let seen = false;
    for (let i = 0; i < 2000 && !seen; i++) {
        game.update();
        seen = data.lanes
            .filter(l => l.type === 'water')
            .some(l => l.objects.some(o => o.type === 'otter'));
    }
    assert_1.default.ok(seen, 'an otter should turn up on the water');
}
/**
 * FAQ-7j: "You may see a purple frog hopping around on the log in water
 * lane #2. Just cross over this frog to give it a piggyback ride to your
 * home and get an extra 200 points."
 */
async function crossingTheLadyFrogPicksHerUp() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const lane = (0, fixture_1.laneOf)(data, 'water', 2);
    const log = lane.objects[0];
    log.ladyFrogAt = 1;
    data.frog.y = lane.y;
    data.frog.x = log.x + 1;
    game.checkCollisions();
    assert_1.default.ok(data.carryingLadyFrog, 'she climbs on');
    assert_1.default.strictEqual(log.ladyFrogAt, null, 'and leaves the log');
}
/**
 * She has to actually turn up: FAQ 7, "You may see a purple frog hopping
 * around on the log in water lane #2."
 */
async function aLadyFrogAppearsOnALaneTwoLog() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    let seen = false;
    for (let i = 0; i < 2000 && !seen; i++) {
        game.update();
        seen = (0, fixture_1.laneOf)(data, 'water', 2).objects.some(o => o.ladyFrogAt !== null && o.ladyFrogAt !== undefined);
    }
    assert_1.default.ok(seen, 'a lady frog should appear on a lane 2 log to be picked up');
}
/** A lady frog only ever rides a lane 2 log (FAQ 7). */
async function theLadyFrogOnlyRidesLaneTwo() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    for (let i = 0; i < 1500; i++)
        game.update();
    for (const lane of data.lanes.filter(l => l.type === 'water' && l.lane !== 2)) {
        const riders = lane.objects.filter(o => o.ladyFrogAt !== null && o.ladyFrogAt !== undefined);
        assert_1.default.strictEqual(riders.length, 0, `lane ${lane.lane} should carry no lady frog`);
    }
}
/**
 * FAQ-7p: "if you waste too much time, the things on the river will move
 * quicker so you will have to adjust your strategy accordingly."
 */
async function theRiverSpeedsUpWhenYouDawdle() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const calm = game.riverSpeedScale();
    data.timeRemaining = constants_1.INITIAL_TIME - constants_1.RIVER_HURRY_AFTER_SECONDS - 1;
    const hurried = game.riverSpeedScale();
    assert_1.default.ok(hurried > calm, `the river should run quicker: ${calm} then ${hurried}`);
}
/**
 * FAQ-6.4d: "cars in Lane 4 will travel fast after a specific period of
 * time if they aren't traveling fast already".
 */
async function laneFourPicksUpSpeedAfterAWhile() {
    const { game, data } = (0, fixture_1.startedLevel)(3); // level 3's lane 4 is marked SLOW
    const atStart = game.lane4SpeedScale();
    data.frogStartTime = Date.now() - (constants_1.LANE4_SPEEDUP_AFTER_MS + 1000);
    const later = game.lane4SpeedScale();
    assert_1.default.ok(later > atStart, `lane 4 should pick up: ${atStart} then ${later}`);
}
/** A lane already marked fast does not speed up again. */
async function aLaneAlreadyFastDoesNotSpeedUpTwice() {
    const { game, data } = (0, fixture_1.startedLevel)(1); // level 1's lane 4 is marked FAST
    const atStart = game.lane4SpeedScale();
    data.frogStartTime = Date.now() - (constants_1.LANE4_SPEEDUP_AFTER_MS + 1000);
    assert_1.default.strictEqual(game.lane4SpeedScale(), atStart);
}
/** FAQ-7l: the frog cannot wrap around; riding off the edge kills it. */
async function ridingOffTheEdgeKillsTheFrog() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const raft = lane.objects[0];
    raft.x = -1;
    data.frog.y = lane.y;
    data.frog.x = -0.5;
    data.frog.onObject = raft;
    const lives = data.lives;
    game.update();
    assert_1.default.strictEqual(data.lives, lives - 1, 'off the edge is death, not a wrap');
}
/** A diving turtle drowns the frog standing on it (FAQ-7g). */
async function aDivingTurtleDrownsTheFrog() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const turtle = lane.objects.find(t => t.canDive);
    assert_1.default.ok(turtle, 'lane 1 should have a diving set');
    // diveStage is the state; isDiving is derived from it each tick, so
    // setting only the derived field is undone by the next update.
    turtle.diveStage = 'down';
    turtle.diveTimer = 0;
    turtle.isDiving = true;
    data.frog.y = lane.y;
    data.frog.x = turtle.x;
    data.frog.onObject = turtle;
    const lives = data.lives;
    game.update();
    assert_1.default.strictEqual(data.lives, lives - 1);
}
/** The turtle widths follow the FAQ's set-of-three diagram. */
async function aTurtleSetIsThreeCellsWide() {
    const { data } = (0, fixture_1.startedLevel)(1);
    const turtle = (0, fixture_1.laneOf)(data, 'water', 1).objects[0];
    assert_1.default.strictEqual(turtle.width, constants_1.OBJECT_WIDTHS.turtle);
}
/**
 * A diving turtle set warns before it goes under.
 *
 * Reported live 2026-08-31: "we need to animate the crocodiles before they
 * dive so i have a chanse to get off". A set used to snap from solid to gone
 * with no tell at all, so standing on one was a coin flip.
 */
async function aDivingSetWarnsBeforeItGoesUnder() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const turtle = lane.objects.find(t => t.canDive);
    turtle.diveStage = 'up';
    turtle.diveTimer = 0;
    const seen = [];
    for (let i = 0; i < 400; i++) {
        game.update();
        const stage = turtle.diveStage;
        if (seen[seen.length - 1] !== stage)
            seen.push(stage);
        if (seen.length >= 4)
            break;
    }
    assert_1.default.deepStrictEqual(seen.slice(0, 3), ['up', 'sinking', 'down'], `a set should sink before it dives, saw ${seen.join(' -> ')}`);
}
/** A set that is only sinking is still solid ground. */
async function aSinkingSetIsStillFooting() {
    const { game, data } = (0, fixture_1.startedLevel)(2);
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    const turtle = lane.objects.find(t => t.canDive);
    turtle.diveStage = 'sinking';
    turtle.diveTimer = 0;
    // A real tick, so the game works out for itself whether a sinking set is
    // deadly - asserting against a hand-set isDiving would prove nothing.
    data.frog.y = lane.y;
    data.frog.x = turtle.x;
    const lives = data.lives;
    game.update();
    assert_1.default.strictEqual(turtle.diveStage, 'sinking', 'still on its way down');
    assert_1.default.ok(!turtle.isDiving, 'and not yet counted as under');
    assert_1.default.strictEqual(data.lives, lives, 'a sinking set has not drowned anybody yet');
    assert_1.default.ok(data.frog.onObject, 'and it still carries the frog');
}
/** The warning lasts long enough to react to. */
async function theWarningIsLongEnoughToHopOff() {
    // A hop is one tick of input; the warning has to be worth several.
    assert_1.default.ok(constants_1.TURTLE_WARNING_MS >= 800, `${constants_1.TURTLE_WARNING_MS}ms is not enough time to notice and move`);
}
/**
 * Losing the last frog shows a GAME OVER screen.
 *
 * Reported live: "there is no game over screen in frogger?" - the state was
 * set and nothing ever drew it, so the board simply froze.
 */
async function losingTheLastFrogShowsGameOver() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    let frame = '';
    game.renderCallback =
        (c) => { frame = c; };
    data.lives = 1;
    data.score = 1234;
    data.frog.y = 10;
    data.frog.x = 20;
    // Walk into a car.
    const road = data.lanes.find(l => l.type === 'road' && l.y === 10);
    road.objects = [{
            id: 1, type: 'car', x: data.frog.x, y: road.y,
            lane: road.lane, width: 2, speed: road.speed,
        }];
    game.checkCollisions();
    // Run the death animation out.
    for (let i = 0; i < 40 && data.state !== 'gameover'; i++)
        game.update();
    assert_1.default.strictEqual(data.state, 'gameover', 'the game should be over');
    data.frameCount = 0;
    game.render();
    const text = frame.replace(/\{[^}]*\}/g, '');
    assert_1.default.ok(text.includes('GAME OVER'), 'it should say so');
    assert_1.default.ok(text.includes('SCORE 1234'), 'with the score');
    assert_1.default.ok(text.includes('PRESS ENTER'), 'and what to do next');
}
/** ...and the prompt blinks. */
async function theGameOverPromptBlinks() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    let frame = '';
    game.renderCallback =
        (c) => { frame = c; };
    data.state = 'gameover';
    data.frameCount = 0;
    game.render();
    const on = frame.includes('PRESS ENTER');
    data.frameCount = constants_1.GAME_OVER_BLINK_FRAMES;
    game.render();
    const off = frame.includes('PRESS ENTER');
    assert_1.default.ok(on, 'showing on one frame');
    assert_1.default.ok(!off, 'and gone a blink later');
}
//# sourceMappingURL=hazards.test.js.map