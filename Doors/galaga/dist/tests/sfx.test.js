"use strict";
/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The boss takes two shots, so the first one must SOUND different from the
 * second: a hit that does not kill is the only way the player learns the
 * boss is not a bee.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.firingSounds = firingSounds;
exports.aBossTakingAHitSoundsDifferentFromDying = aBossTakingAHitSoundsDifferentFromDying;
exports.rescuingTheCapturedFighterSounds = rescuingTheCapturedFighterSounds;
exports.beingShotDownSounds = beingShotDownSounds;
exports.losingTheLastLifeSoundsGameOver = losingTheLastLifeSoundsGameOver;
exports.clearingTheStageSounds = clearingTheStageSounds;
exports.anUndrainedQueueStaysBounded = anUndrainedQueueStaysBounded;
exports.theEffectsAreSentWetToBothReverbAndEcho = theEffectsAreSentWetToBothReverbAndEcho;
const assert_1 = __importDefault(require("assert"));
const fs_1 = require("fs");
const path_1 = require("path");
const initial_data_1 = require("../game/initial-data");
const galaga_game_1 = require("../game/galaga-game");
const constants_1 = require("../game/constants");
/** A stage with the sky cleared, so only what a test places is in play. */
function emptySky() {
    const data = (0, initial_data_1.createInitialGameData)();
    const game = new galaga_game_1.GalagaGame(data, () => { });
    game.initStage();
    data.state = 'playing';
    data.aliens = [];
    data.bullets = [];
    data.explosions = [];
    game.cues.clear();
    return { game, data };
}
function alienAt(x, y, over = {}) {
    return {
        id: 1,
        type: 'bee',
        state: 'formation',
        x, y,
        formationX: 0,
        formationY: 0,
        health: 1,
        diveProgress: 0,
        divePath: [],
        divePathIndex: 0,
        capturedFighter: false,
        tractorBeamActive: false,
        ...over,
    };
}
/** Firing. */
async function firingSounds() {
    const { game, data } = emptySky();
    game.handleKeyDown('fire');
    assert_1.default.ok(game.cues.pending.includes('laser'), 'the shot is heard');
    assert_1.default.ok(data.bullets.length > 0, 'and a bullet exists to have made it');
}
/** A hit that kills and one that does not are different sounds. */
async function aBossTakingAHitSoundsDifferentFromDying() {
    const wounded = emptySky();
    wounded.data.aliens = [alienAt(10, 5, { type: 'boss', health: 2 })];
    wounded.data.bullets = [{ id: 1, x: 10, y: 5, dy: -1, isEnemy: false }];
    wounded.game.checkCollisions();
    const killed = emptySky();
    killed.data.aliens = [alienAt(10, 5, { type: 'boss', health: 1 })];
    killed.data.bullets = [{ id: 1, x: 10, y: 5, dy: -1, isEnemy: false }];
    killed.game.checkCollisions();
    assert_1.default.deepStrictEqual(wounded.game.cues.drain(), ['hit'], 'the first shot lands');
    assert_1.default.deepStrictEqual(killed.game.cues.drain(), ['explosion'], 'the second kills');
}
/** Rescuing the captured fighter is Galaga's whole risk-and-reward. */
async function rescuingTheCapturedFighterSounds() {
    const { game, data } = emptySky();
    data.aliens = [alienAt(10, 5, { type: 'boss', health: 1, capturedFighter: true })];
    data.bullets = [{ id: 1, x: 10, y: 5, dy: -1, isEnemy: false }];
    game.checkCollisions();
    assert_1.default.ok(data.player.hasDualFighter, 'the fighter comes back');
    assert_1.default.ok(game.cues.pending.includes('powerup'), 'and it is heard');
}
/** Being shot down. */
async function beingShotDownSounds() {
    const { game, data } = emptySky();
    data.bullets = [{ id: 1, x: data.player.x, y: data.player.y, dy: 1, isEnemy: true }];
    game.checkCollisions();
    assert_1.default.ok(game.cues.pending.includes('death'));
}
/** Losing the last life ends the game audibly. */
async function losingTheLastLifeSoundsGameOver() {
    const { game, data } = emptySky();
    data.lives = 1;
    data.bullets = [{ id: 1, x: data.player.x, y: data.player.y, dy: 1, isEnemy: true }];
    game.checkCollisions();
    // The death animation runs before the respawn finds nothing to respawn.
    for (let i = 0; i < 80 && data.state !== 'gameover'; i++)
        game.update();
    assert_1.default.strictEqual(data.state, 'gameover');
    assert_1.default.ok(game.cues.pending.includes('gameover'));
}
/** Clearing the sky finishes the stage. */
async function clearingTheStageSounds() {
    const { game, data } = emptySky();
    game.update();
    assert_1.default.strictEqual(data.state, 'stageComplete');
    assert_1.default.ok(game.cues.pending.includes('level-up'));
}
/** An undrained queue stays bounded. */
async function anUndrainedQueueStaysBounded() {
    const { game, data } = emptySky();
    for (let i = 0; i < 200; i++) {
        data.bullets = [];
        game.handleKeyDown('fire');
        game.handleKeyUp('fire');
    }
    assert_1.default.ok(game.cues.pending.length <= 32, 'the cue queue is capped');
    assert_1.default.ok(constants_1.SCORES.bee > 0, 'the scoring table is still in play');
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