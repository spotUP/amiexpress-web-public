/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Every shot ends one of two ways - it sticks, or it pops - and the player
 * aims the next one differently depending on which. That pair is the one
 * worth protecting.
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createInitialGameData } from '../game/initial-data';
import { PuzzleBobbleGame } from '../game/puzzle-bobble-game';
import { GRID_WIDTH, GRID_HEIGHT } from '../game/constants';
/** A board with the grid cleared, so only what a test places is in play. */
function emptyBoard() {
    const data = createInitialGameData();
    const game = new PuzzleBobbleGame(data, () => { }, () => { }, () => { });
    game.initLevel();
    data.state = 'playing';
    for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
            data.grid[row][col] = null;
        }
    }
    game.cues.clear();
    return { game, data };
}
function bubbleAt(row, col, color) {
    return {
        x: col, y: row, color,
        isPopping: false, popFrame: 0, isFalling: false, fallVy: 0,
    };
}
/** Firing. */
export async function shootingSounds() {
    const { game, data } = emptyBoard();
    game.handleShoot();
    assert.ok(data.shootingBubble?.isActive, 'a bubble is in the air');
    assert.deepStrictEqual(game.cues.drain(), ['laser']);
}
/** A second shot while one is still flying makes no sound. */
export async function shootingWhileABubbleIsInFlightIsSilent() {
    const { game } = emptyBoard();
    game.handleShoot();
    game.cues.clear();
    game.handleShoot();
    assert.deepStrictEqual(game.cues.drain(), []);
}
/** A shot that sticks and one that pops sound different. */
export async function stickingAndPoppingSoundDifferent() {
    const stuck = emptyBoard();
    stuck.data.grid[0][1] = bubbleAt(0, 1, 'blue');
    stuck.game.handleShoot();
    stuck.data.shootingBubble.color = 'red';
    // Land it beside a bubble of another colour: nothing matches.
    for (let i = 0; i < 200 && stuck.data.shootingBubble; i++)
        stuck.game.update();
    // The shooter fires straight up from the middle column, so the reds go
    // where the bubble will actually arrive.
    const popped = emptyBoard();
    popped.data.grid[0][3] = bubbleAt(0, 3, 'red');
    popped.data.grid[0][4] = bubbleAt(0, 4, 'red');
    popped.data.grid[0][5] = bubbleAt(0, 5, 'red');
    popped.game.handleShoot();
    popped.data.shootingBubble.color = 'red';
    for (let i = 0; i < 200 && popped.data.shootingBubble; i++)
        popped.game.update();
    assert.ok(stuck.game.cues.pending.includes('land'), 'a lone bubble sticks');
    assert.ok(!stuck.game.cues.pending.includes('pickup'), 'and does not pop');
    assert.ok(popped.game.cues.pending.includes('pickup'), 'three of a colour pop');
}
/** The ceiling coming down is the pressure the whole game applies. */
export async function theCeilingDroppingSounds() {
    const { game, data } = emptyBoard();
    data.grid[0][0] = bubbleAt(0, 0, 'red');
    data.ceilingInterval = 1;
    data.shootingBubble = null;
    game.update();
    assert.ok(game.cues.pending.includes('alarm'));
}
/** Clearing the grid finishes the level. */
export async function clearingTheGridSoundsTheLevel() {
    const { game, data } = emptyBoard();
    game.update();
    assert.strictEqual(data.state, 'levelComplete');
    assert.ok(game.cues.pending.includes('level-up'));
}
/** Bubbles reaching the shooter ends it. */
export async function reachingTheShooterSoundsGameOver() {
    const { game, data } = emptyBoard();
    data.grid[0][0] = bubbleAt(0, 0, 'red');
    // Push the grid down past the danger line without a ceiling drop.
    data.gridOffset = GRID_HEIGHT + 5;
    data.ceilingInterval = 100000;
    game.update();
    assert.strictEqual(data.state, 'gameover');
    assert.ok(game.cues.pending.includes('gameover'));
}
/** An undrained queue stays bounded. */
export async function anUndrainedQueueStaysBounded() {
    const { game, data } = emptyBoard();
    for (let i = 0; i < 200; i++) {
        data.shootingBubble = null;
        game.handleShoot();
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
 * Second pass was reported as "way too long tails". That is a DIFFERENT
 * knob - decay and feedback, not wet - so the ceiling here is on those, and
 * the wetness floor stays where it is. Anyone tuning this again should move
 * decay and feedback, and leave wet alone.
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
    assert.ok(Number(decay[1]) <= 2.5, `a ${decay[1]}s tail was reported as way too long`);
    assert.ok(Number(feedback[1]) > 0 && Number(feedback[1]) <= 0.3, `echo feedback ${feedback[1]} should give a couple of repeats, not a cloud`);
}
