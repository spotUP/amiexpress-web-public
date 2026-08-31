"use strict";
/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The distinctions matter as much as the presence: drowning and being run
 * over must not sound the same, or the sound is decoration rather than
 * feedback.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.aHopMakesASound = aHopMakesASound;
exports.aHopIntoTheWallIsSilent = aHopIntoTheWallIsSilent;
exports.drowningSoundsDifferentFromBeingRunOver = drowningSoundsDifferentFromBeingRunOver;
exports.theClockRunningOutSoundsLikeAClock = theClockRunningOutSoundsLikeAClock;
exports.reachingAHomeSounds = reachingAHomeSounds;
exports.eatingTheFlyAddsItsOwnSound = eatingTheFlyAddsItsOwnSound;
exports.deliveringTheLadyFrogSounds = deliveringTheLadyFrogSounds;
exports.fillingTheLastHomeSoundsTheLevel = fillingTheLastHomeSoundsTheLevel;
exports.theFreeFrogSounds = theFreeFrogSounds;
exports.losingTheLastFrogSoundsGameOver = losingTheLastFrogSoundsGameOver;
exports.anUndrainedDemoStaysBounded = anUndrainedDemoStaysBounded;
exports.theEffectsAreSentWetToBothReverbAndEcho = theEffectsAreSentWetToBothReverbAndEcho;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const fixture_1 = require("./fixture");
const constants_1 = require("../game/constants");
/** A hop the player made is a hop the player hears. */
async function aHopMakesASound() {
    const { game } = (0, fixture_1.startedLevel)(1);
    game.handleDirection('up');
    assert_1.default.deepStrictEqual(game.cues.drain(), ['jump']);
}
/** A hop into the wall goes nowhere, so it says nothing. */
async function aHopIntoTheWallIsSilent() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.frog.x = 0;
    game.cues.clear();
    game.handleDirection('left');
    assert_1.default.deepStrictEqual(game.cues.drain(), []);
}
/** Drowning and being run over are different sounds. */
async function drowningSoundsDifferentFromBeingRunOver() {
    const water = (0, fixture_1.startedLevel)(1);
    const lane = (0, fixture_1.laneOf)(water.data, 'water', 1);
    // Open water: nothing to land on, so the frog goes in.
    lane.objects.length = 0;
    water.data.frog.y = lane.y;
    water.data.frog.x = 5;
    water.game.cues.clear();
    water.game.checkCollisions();
    const road = (0, fixture_1.startedLevel)(1);
    const roadLane = (0, fixture_1.laneOf)(road.data, 'road', 1);
    road.data.frog.y = roadLane.y;
    // Inside the vehicle, not rounded to its cell: vehicles start on a
    // fractional x, and rounding can land just BEHIND the bumper.
    road.data.frog.x = roadLane.objects[0].x + 0.5;
    road.game.cues.clear();
    road.game.checkCollisions();
    assert_1.default.deepStrictEqual(water.game.cues.drain(), ['drop'], 'the river plunks');
    assert_1.default.deepStrictEqual(road.game.cues.drain(), ['death'], 'the road does not');
}
/** Running out of time is its own warning, not a generic death. */
async function theClockRunningOutSoundsLikeAClock() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.timeRemaining = 1;
    game.cues.clear();
    // One second of play is twenty ticks.
    for (let i = 0; i < 20; i++)
        game.update();
    assert_1.default.ok(game.cues.pending.includes('alarm'), 'the clock should sound the alarm');
    assert_1.default.ok(!game.cues.pending.includes('death'), 'and not the death cue as well');
}
/** Getting a frog home is the reward the game is built around. */
async function reachingAHomeSounds() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const home = data.homes[2];
    data.frog.y = 0;
    data.frog.x = home.x + constants_1.HOME_CENTRE_OFFSET;
    game.cues.clear();
    game.checkHomeArrival();
    assert_1.default.deepStrictEqual(game.cues.drain(), ['success']);
}
/** The fly in the home is a bonus, and it is heard as one. */
async function eatingTheFlyAddsItsOwnSound() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const home = data.homes[2];
    home.hasFly = true;
    data.frog.y = 0;
    data.frog.x = home.x + constants_1.HOME_CENTRE_OFFSET;
    game.cues.clear();
    game.checkHomeArrival();
    assert_1.default.deepStrictEqual(game.cues.drain(), ['success', 'coin']);
}
/** Carrying the lady frog home pays 200, and says so. */
async function deliveringTheLadyFrogSounds() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    const home = data.homes[2];
    data.carryingLadyFrog = true;
    data.frog.y = 0;
    data.frog.x = home.x + constants_1.HOME_CENTRE_OFFSET;
    game.cues.clear();
    game.checkHomeArrival();
    assert_1.default.deepStrictEqual(game.cues.drain(), ['success', 'powerup']);
}
/** Filling all five homes finishes the level. */
async function fillingTheLastHomeSoundsTheLevel() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    for (let i = 0; i < 4; i++)
        game.settleFrogInHome(i);
    game.cues.clear();
    game.settleFrogInHome(4);
    assert_1.default.deepStrictEqual(game.cues.drain(), ['success', 'level-up']);
}
/** FAQ 6.3: "you get one free frog at 20,000 points" - and you hear it. */
async function theFreeFrogSounds() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.score = constants_1.EXTRA_LIFE_SCORE;
    game.cues.clear();
    game.update();
    assert_1.default.ok(game.cues.pending.includes('1up'), 'the free frog announces itself');
}
/** Losing the last frog ends the game audibly. */
async function losingTheLastFrogSoundsGameOver() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    data.lives = 1;
    const lane = (0, fixture_1.laneOf)(data, 'water', 1);
    lane.objects.length = 0;
    data.frog.y = lane.y;
    data.frog.x = 5;
    game.checkCollisions();
    game.cues.clear();
    // The death animation runs for twenty frames before the respawn decides
    // there is nothing left to respawn.
    for (let i = 0; i < 25 && data.state !== 'gameover'; i++)
        game.update();
    assert_1.default.strictEqual(data.state, 'gameover');
    assert_1.default.ok(game.cues.pending.includes('gameover'));
}
/**
 * Attract mode stays silent.
 *
 * Not by suppressing anything: the demo game's cues are simply never
 * drained, and the queue is bounded, so a menu left up all night neither
 * makes a noise nor grows.
 */
async function anUndrainedDemoStaysBounded() {
    const { game, data } = (0, fixture_1.startedLevel)(1);
    for (let i = 0; i < 500; i++) {
        game.handleDirection(i % 2 === 0 ? 'up' : 'down');
        if (data.frog.isDead)
            break;
    }
    assert_1.default.ok(game.cues.pending.length <= 32, 'the cue queue is capped');
}
/**
 * The effects are sent to a reverb AND an echo: wet, but short.
 *
 * Two corrections, in opposite directions, and this holds the band between
 * them.
 *
 * First pass was reported as needing "much more echo/reverb/wetness". Part
 * of why it was so dry is structural: the SDK builds ONE parallel send at
 * max(reverb.wet, echo.wet), and no echo was declared at all, so the send
 * carried nothing but the reverb wash. Hence the floor on both wets.
 *
 * Second pass was reported as "way too long tails". That is a DIFFERENT
 * knob - decay and feedback, not wet - so the ceiling here is on those, and
 * the wetness floor stays where it is. Anyone tuning this again should move
 * decay and feedback, and leave wet alone.
 */
async function theEffectsAreSentWetToBothReverbAndEcho() {
    const client = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, '..', 'client.ts'), 'utf8');
    const reverbWet = /sfxReverb:\s*\{[^}]*wet:\s*([\d.]+)/.exec(client);
    const echoWet = /sfxEcho:\s*\{[^}]*wet:\s*([\d.]+)/.exec(client);
    const decay = /sfxReverb:\s*\{[^}]*decay:\s*([\d.]+)/.exec(client);
    const feedback = /sfxEcho:\s*\{[^}]*feedback:\s*([\d.]+)/.exec(client);
    assert_1.default.ok(reverbWet, 'the client should ask for a reverb send');
    assert_1.default.ok(echoWet, 'and an echo send - the send level is the max of the two');
    assert_1.default.ok(decay, 'the reverb needs a tail length');
    assert_1.default.ok(feedback, 'and the echo needs repeats');
    // Wet enough to hear.
    assert_1.default.ok(Number(reverbWet[1]) >= 0.7, `reverb send is ${reverbWet[1]}; below 0.7 it was reported as too dry`);
    assert_1.default.ok(Number(echoWet[1]) >= 0.7, `echo send is ${echoWet[1]}; below 0.7 it was reported as too dry`);
    // Short enough not to ring into the next event.
    assert_1.default.ok(Number(decay[1]) <= 2.5, `a ${decay[1]}s tail was reported as way too long`);
    assert_1.default.ok(Number(feedback[1]) > 0 && Number(feedback[1]) <= 0.3, `echo feedback ${feedback[1]} should give a couple of repeats, not a cloud`);
}
//# sourceMappingURL=sfx.test.js.map