/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * The three outcomes of a joust are the point: winning, losing and bouncing
 * off level must sound different, because from the saddle they look almost
 * the same and the player learns the lance height by ear.
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createInitialGameData } from '../game/initial-data';
import { JoustGame } from '../game/joust-game';
/** A wave with the board cleared, so only what a test places is in play. */
function emptyWave() {
    const data = createInitialGameData();
    const game = new JoustGame(data, () => { }, () => { }, () => { });
    game.initWave();
    data.state = 'playing';
    data.enemies = [];
    data.eggs = [];
    data.pterodactyl.isActive = false;
    data.player.invincibleTimer = 0;
    game.cues.clear();
    return { game, data };
}
function enemyAt(x, y) {
    return {
        id: 1,
        type: 'bounder',
        x, y,
        vx: 0,
        vy: 0,
        direction: 'left',
        isFlapping: false,
        flapFrame: 0,
        state: 'flying',
        aiTimer: 0,
    };
}
/** The flap is Joust's signature sound. */
export async function flappingSounds() {
    const { game } = emptyWave();
    game.handleFlap();
    assert.deepStrictEqual(game.cues.drain(), ['jump']);
}
/** Winning a joust, losing one and bouncing are three different sounds. */
export async function theThreeOutcomesOfAJoustSoundDifferent() {
    const won = emptyWave();
    won.data.player.x = 10;
    won.data.player.y = 8;
    won.data.enemies = [enemyAt(10, 10)];
    won.game.checkCollisions();
    const lost = emptyWave();
    lost.data.player.x = 10;
    lost.data.player.y = 10;
    lost.data.enemies = [enemyAt(10, 8)];
    lost.game.checkCollisions();
    const level = emptyWave();
    level.data.player.x = 10;
    level.data.player.y = 10;
    level.data.enemies = [enemyAt(10, 10)];
    level.game.checkCollisions();
    assert.deepStrictEqual(won.game.cues.drain(), ['hit'], 'the higher lance wins');
    assert.deepStrictEqual(lost.game.cues.drain(), ['death'], 'the lower one dies');
    assert.deepStrictEqual(level.game.cues.drain(), ['boop'], 'level lances bounce');
}
/** An egg left behind is worth collecting, and says so. */
export async function collectingAnEggSounds() {
    const { game, data } = emptyWave();
    data.player.x = 10;
    data.player.y = 10;
    data.eggs = [{
            id: 1, x: 10, y: 10, vx: 0, vy: 0,
            state: 'landed', timer: 0, enemyType: 'bounder',
        }];
    game.checkCollisions();
    assert.deepStrictEqual(game.cues.drain(), ['coin']);
}
/** An egg that hatches puts an enemy back on the board. */
export async function anEggHatchingSounds() {
    const { game, data } = emptyWave();
    data.eggs = [{
            id: 1, x: 10, y: 10, vx: 0, vy: 0,
            state: 'hatching', timer: 100000, enemyType: 'bounder',
        }];
    // Keep the player away from it, or it is collected before it hatches.
    data.player.x = 40;
    data.player.y = 2;
    game.update();
    assert.ok(game.cues.pending.includes('blip'));
}
/** Losing the last life ends the game audibly. */
export async function losingTheLastLifeSoundsGameOver() {
    const { game, data } = emptyWave();
    data.lives = 1;
    data.player.x = 10;
    data.player.y = 10;
    data.enemies = [enemyAt(10, 8)];
    game.checkCollisions();
    assert.strictEqual(data.state, 'gameover');
    assert.deepStrictEqual(game.cues.drain(), ['death', 'gameover']);
}
/** The death cue fires once, however many enemies are on top of the player. */
export async function deathSoundsOnce() {
    const { game, data } = emptyWave();
    data.player.x = 10;
    data.player.y = 10;
    data.enemies = [enemyAt(10, 8), { ...enemyAt(10, 8), id: 2 }];
    game.checkCollisions();
    assert.strictEqual(game.cues.drain().filter(c => c === 'death').length, 1);
}
/** Clearing the wave. */
export async function clearingTheWaveSounds() {
    const { game, data } = emptyWave();
    game.update();
    assert.strictEqual(data.state, 'waveComplete');
    assert.ok(game.cues.pending.includes('level-up'));
}
/** An undrained queue stays bounded. */
export async function anUndrainedQueueStaysBounded() {
    const { game } = emptyWave();
    for (let i = 0; i < 200; i++)
        game.handleFlap();
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
