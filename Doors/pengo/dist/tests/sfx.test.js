"use strict";
/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The distinctions matter as much as the presence: a wall shake that stuns
 * a Sno-Bee and one that catches nobody must not sound the same, because
 * the difference is the whole timing of the move.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pushingABlockSounds = pushingABlockSounds;
exports.crushingASnoBeeSounds = crushingASnoBeeSounds;
exports.aWallShakeSaysWhetherItCaughtAnything = aWallShakeSaysWhetherItCaughtAnything;
exports.liningUpTheDiamondsSounds = liningUpTheDiamondsSounds;
exports.theDiamondFanfareDoesNotRepeat = theDiamondFanfareDoesNotRepeat;
exports.beingCaughtSounds = beingCaughtSounds;
exports.deathSoundsOnce = deathSoundsOnce;
exports.losingTheLastLifeSoundsGameOver = losingTheLastLifeSoundsGameOver;
exports.clearingTheBoardSoundsTheLevel = clearingTheBoardSoundsTheLevel;
exports.anUndrainedQueueStaysBounded = anUndrainedQueueStaysBounded;
exports.theEffectsAreSentWetToBothReverbAndEcho = theEffectsAreSentWetToBothReverbAndEcho;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const initial_data_1 = require("../game/initial-data");
const pengo_game_1 = require("../game/pengo-game");
const constants_1 = require("../game/constants");
/**
 * A board the test controls completely.
 *
 * initLevel scatters ice, diamonds, Pengo and the Sno-Bees at random, which
 * is right for play and useless for a test. This keeps the walls and clears
 * everything inside them.
 */
function emptyBoard() {
    const data = (0, initial_data_1.createInitialGameData)();
    const game = new pengo_game_1.PengoGame(data, () => { });
    game.initLevel();
    for (let y = 0; y < constants_1.GRID_HEIGHT; y++) {
        for (let x = 0; x < constants_1.GRID_WIDTH; x++) {
            const edge = x === 0 || x === constants_1.GRID_WIDTH - 1 || y === 0 || y === constants_1.GRID_HEIGHT - 1;
            data.grid[y][x] = edge ? 'wall' : 'empty';
        }
    }
    data.enemies = [];
    data.eggs = [];
    data.state = 'playing';
    data.pengo = {
        x: 4, y: 4, direction: 'right',
        isPushing: false, pushFrame: 0, isDead: false, deathFrame: 0,
    };
    game.cues.clear();
    return { game, data };
}
function enemyAt(x, y) {
    return {
        id: 1, x, y, direction: 'left', state: 'walking',
        stunTimer: 0, hatchTimer: 0, moveTimer: 0,
    };
}
/** Pushing a block is what Pengo does; it should be what Pengo sounds like. */
async function pushingABlockSounds() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice';
    game.handlePush();
    assert_1.default.deepStrictEqual(game.cues.drain(), ['dash']);
}
/** A block that catches a Sno-Bee crushes it, audibly. */
async function crushingASnoBeeSounds() {
    const { game, data } = emptyBoard();
    data.grid[4][5] = 'ice';
    data.enemies = [enemyAt(6, 4)];
    game.handlePush();
    assert_1.default.deepStrictEqual(game.cues.drain(), ['dash', 'explosion']);
}
/** A wall shake that stuns and one that catches nobody are different sounds. */
async function aWallShakeSaysWhetherItCaughtAnything() {
    const caught = emptyBoard();
    caught.data.pengo.direction = 'up';
    caught.data.pengo.y = 2;
    caught.data.pengo.x = 4;
    caught.data.grid[1][4] = 'wall';
    caught.data.enemies = [enemyAt(4, 1)];
    caught.game.handlePush();
    const missed = emptyBoard();
    missed.data.pengo.direction = 'up';
    missed.data.pengo.y = 2;
    missed.data.pengo.x = 4;
    missed.data.grid[1][4] = 'wall';
    missed.game.handlePush();
    assert_1.default.deepStrictEqual(caught.game.cues.drain(), ['hit'], 'a stun is a hit');
    assert_1.default.deepStrictEqual(missed.game.cues.drain(), ['boop'], 'a miss is not');
}
/** Lining the diamonds up is the biggest score in the game. */
async function liningUpTheDiamondsSounds() {
    const { game, data } = emptyBoard();
    data.grid[3][4] = 'diamond';
    data.grid[3][6] = 'diamond';
    data.grid[4][5] = 'ice';
    game.handlePush();
    assert_1.default.ok(game.cues.pending.includes('powerup'), 'the alignment announces itself');
}
/** ...and it announces itself once, not on every push thereafter. */
async function theDiamondFanfareDoesNotRepeat() {
    const { game, data } = emptyBoard();
    data.grid[3][4] = 'diamond';
    data.grid[3][6] = 'diamond';
    data.grid[4][5] = 'ice';
    game.handlePush();
    game.cues.clear();
    data.grid[4][5] = 'ice';
    game.handlePush();
    assert_1.default.ok(!game.cues.pending.includes('powerup'), 'the diamonds are still aligned; that is not news twice');
}
/** Being caught by a Sno-Bee. */
async function beingCaughtSounds() {
    const { game, data } = emptyBoard();
    data.enemies = [enemyAt(4, 4)];
    game.update();
    assert_1.default.ok(game.cues.pending.includes('death'));
}
/** The death cue fires once, not on every frame of the death animation. */
async function deathSoundsOnce() {
    const { game, data } = emptyBoard();
    data.enemies = [enemyAt(4, 4)];
    game.update();
    const first = game.cues.drain().filter(c => c === 'death').length;
    for (let i = 0; i < 5; i++)
        game.update();
    assert_1.default.strictEqual(first, 1);
    assert_1.default.deepStrictEqual(game.cues.drain(), [], 'the animation is silent');
}
/** Losing the last life ends the game audibly. */
async function losingTheLastLifeSoundsGameOver() {
    const { game, data } = emptyBoard();
    data.lives = 1;
    data.enemies = [enemyAt(4, 4)];
    game.update();
    // The death animation runs for twenty frames before the respawn finds
    // there is nothing left to respawn.
    for (let i = 0; i < 25 && data.state !== 'gameover'; i++)
        game.update();
    assert_1.default.strictEqual(data.state, 'gameover');
    assert_1.default.ok(game.cues.pending.includes('gameover'));
}
/** Clearing the board finishes the level. */
async function clearingTheBoardSoundsTheLevel() {
    const { game, data } = emptyBoard();
    game.update();
    assert_1.default.strictEqual(data.state, 'levelComplete');
    assert_1.default.ok(game.cues.pending.includes('level-up'));
}
/** An undrained queue stays bounded, so attract mode neither sounds nor leaks. */
async function anUndrainedQueueStaysBounded() {
    const { game, data } = emptyBoard();
    for (let i = 0; i < 200; i++) {
        data.grid[4][5] = 'ice';
        game.handlePush();
        data.pengo.isPushing = false;
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
 * Then "too long tails" was reported TWICE - at 5-7s, and again at
 * 1.8-2.4s. That is a DIFFERENT knob from wet: decay and feedback. So the
 * ceiling here is on those two and the wetness floor stays where it is.
 * Anyone tuning this again should move decay and feedback and leave wet
 * alone; a send is parallel, so lowering wet costs audibility without
 * shortening anything.
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
    assert_1.default.ok(Number(decay[1]) <= 1.0, `a ${decay[1]}s tail is too long - 2.4s was still reported as too long`);
    assert_1.default.ok(Number(feedback[1]) > 0 && Number(feedback[1]) <= 0.15, `echo feedback ${feedback[1]} should give ONE faint repeat, not a cloud`);
}
//# sourceMappingURL=sfx.test.js.map