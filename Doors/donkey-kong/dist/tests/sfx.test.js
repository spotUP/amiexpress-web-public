/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Hitting a barrel with the hammer and being hit by one are the same
 * collision in the code and opposite events to the player, so they are the
 * pair worth protecting.
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createInitialGameData } from '../game/initial-data';
import { DonkeyKongGame } from '../game/donkey-kong-game';
/** A stage with the hazards cleared, so only what a test places is in play. */
function emptyStage() {
    const data = createInitialGameData();
    const game = new DonkeyKongGame(data, () => { }, () => { }, () => { });
    game.initStage();
    data.state = 'playing';
    data.barrels = [];
    data.fireBalls = [];
    // initStage grants respawn invincibility, which suppresses every
    // collision - including the ones these tests are about.
    data.player.invincibleTimer = 0;
    game.cues.clear();
    return { game, data };
}
function barrelAt(x, y) {
    return {
        id: 1, type: 'normal', x, y, vx: 0, vy: 0,
        isRolling: true, onLadder: false, direction: 'right', frame: 0,
    };
}
/** The jump. */
export async function jumpingSounds() {
    const { game, data } = emptyStage();
    data.player.isOnGround = true;
    data.player.isJumping = false;
    data.player.isClimbing = false;
    game.handleJump();
    assert.deepStrictEqual(game.cues.drain(), ['jump']);
}
/** A jump that cannot happen makes no sound. */
export async function aJumpInMidAirIsSilent() {
    const { game, data } = emptyStage();
    data.player.isOnGround = false;
    game.handleJump();
    assert.deepStrictEqual(game.cues.drain(), []);
}
/** With the hammer a barrel is smashed; without it, it is fatal. */
export async function theHammerTurnsADeathIntoASmash() {
    const armed = emptyStage();
    armed.data.player.hasHammer = true;
    armed.data.barrels = [barrelAt(armed.data.player.x, armed.data.player.y)];
    armed.game.checkCollisions();
    const bare = emptyStage();
    bare.data.player.hasHammer = false;
    bare.data.barrels = [barrelAt(bare.data.player.x, bare.data.player.y)];
    bare.game.checkCollisions();
    assert.deepStrictEqual(armed.game.cues.drain(), ['explosion'], 'the hammer smashes');
    assert.deepStrictEqual(bare.game.cues.drain(), ['death'], 'without it, it kills');
}
/** Picking the hammer up. */
export async function takingTheHammerSounds() {
    const { game, data } = emptyStage();
    data.hammers = [{ x: data.player.x, y: data.player.y, isCollected: false }];
    game.update();
    assert.ok(game.cues.pending.includes('powerup'));
    assert.ok(data.player.hasHammer, 'and the hammer is in hand');
}
/** Pulling a rivet is the rivet stage's only move. */
export async function pullingARivetSounds() {
    const { game, data } = emptyStage();
    data.rivets = [{ x: data.player.x, y: data.player.y, isRemoved: false }];
    data.hammers = [];
    game.update();
    assert.ok(game.cues.pending.includes('switch'));
    assert.ok(data.rivets[0].isRemoved);
}
/** Losing the last life ends the game audibly. */
export async function losingTheLastLifeSoundsGameOver() {
    const { game, data } = emptyStage();
    data.lives = 1;
    data.barrels = [barrelAt(data.player.x, data.player.y)];
    game.checkCollisions();
    assert.strictEqual(data.state, 'gameover');
    assert.deepStrictEqual(game.cues.drain(), ['death', 'gameover']);
}
/** The death cue fires once, however many barrels are on top of Mario. */
export async function deathSoundsOnce() {
    const { game, data } = emptyStage();
    data.barrels = [
        barrelAt(data.player.x, data.player.y),
        { ...barrelAt(data.player.x, data.player.y), id: 2 },
    ];
    game.checkCollisions();
    assert.strictEqual(game.cues.drain().filter(c => c === 'death').length, 1);
}
/** An undrained queue stays bounded. */
export async function anUndrainedQueueStaysBounded() {
    const { game, data } = emptyStage();
    for (let i = 0; i < 200; i++) {
        data.player.isOnGround = true;
        data.player.isJumping = false;
        game.handleJump();
    }
    assert.ok(game.cues.pending.length <= 32, 'the cue queue is capped');
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
export async function theEffectsAreSentWetToBothReverbAndEcho() {
    const client = readFileSync(join(__dirname, '..', 'client.ts'), 'utf8');
    const reverbWet = /sfxReverb:\s*\{[^}]*wet:\s*([\d.]+)/.exec(client);
    const echoWet = /sfxEcho:\s*\{[^}]*wet:\s*([\d.]+)/.exec(client);
    const decay = /sfxReverb:\s*\{[^}]*decay:\s*([\d.]+)/.exec(client);
    const feedback = /sfxEcho:\s*\{[^}]*feedback:\s*([\d.]+)/.exec(client);
    assert.ok(reverbWet, 'the client should ask for a reverb send');
    assert.ok(echoWet, 'and an echo send - the send level is the max of the two');
    assert.ok(decay, 'the reverb needs a tail length');
    assert.ok(feedback, 'and the echo needs repeats');
    // Wet enough to hear.
    assert.ok(Number(reverbWet[1]) >= 0.7, `reverb send is ${reverbWet[1]}; below 0.7 it was reported as too dry`);
    assert.ok(Number(echoWet[1]) >= 0.7, `echo send is ${echoWet[1]}; below 0.7 it was reported as too dry`);
    // Short enough not to ring into the next event.
    assert.ok(Number(decay[1]) <= 1.0, `a ${decay[1]}s tail is too long - 2.4s was still reported as too long`);
    assert.ok(Number(feedback[1]) > 0 && Number(feedback[1]) <= 0.15, `echo feedback ${feedback[1]} should give ONE faint repeat, not a cloud`);
}
