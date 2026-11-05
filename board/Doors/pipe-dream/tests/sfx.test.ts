/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Laying a pipe and throwing one away are one keypress apart, and a
 * mis-hit discard costs the level. They must not sound alike.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createInitialGameData } from '../game/initial-data';
import { PipeDreamGame } from '../game/pipe-dream-game';
import { PipeDreamData } from '../game/types';
import { getLevelConfig } from '../game/constants';

/** A level with the board cleared, so only what a test places is in play. */
function emptyBoard(): { game: PipeDreamGame; data: PipeDreamData } {
  const data = createInitialGameData();
  const game = new PipeDreamGame(
    data,
    () => { /* no display in tests */ },
    () => { /* game over is the door's screen */ },
    () => { /* level complete likewise */ }
  );
  game.initLevel();
  data.state = 'playing';

  // initLevel scatters obstacles and reservoirs at random. Clear everything
  // but the start, so a test places what it means to test.
  const config = getLevelConfig(data.level);
  for (let y = 0; y < config.gridHeight; y++) {
    for (let x = 0; x < config.gridWidth; x++) {
      if (x === data.startX && y === data.startY) continue;
      data.grid[y][x] = {
        pipe: null, fillLevel: 0, isObstacle: false,
        isStart: false, startDirection: null,
      };
    }
  }

  game.cues.clear();
  return { game, data };
}

/** Laying a pipe and discarding one sound different. */
export async function layingAndDiscardingSoundDifferent(): Promise<void> {
  const laid = emptyBoard();
  laid.data.cursor = { x: 3, y: 3 };
  laid.game.handlePlace();

  const binned = emptyBoard();
  binned.game.handleDiscard();

  assert.deepStrictEqual(laid.game.cues.drain(), ['switch'], 'a pipe goes down');
  assert.deepStrictEqual(binned.game.cues.drain(), ['boop'], 'a pipe goes away');
}

/** A place that cannot happen makes no sound. */
export async function placingOnAnObstacleIsSilent(): Promise<void> {
  const { game, data } = emptyBoard();
  data.cursor = { x: 3, y: 3 };
  data.grid[3][3].isObstacle = true;

  game.handlePlace();

  assert.deepStrictEqual(game.cues.drain(), []);
}

/** Moving the cursor is silent - it happens constantly and means nothing. */
export async function movingTheCursorIsSilent(): Promise<void> {
  const { game } = emptyBoard();

  game.handleMove('right');
  game.handleMove('down');

  assert.deepStrictEqual(game.cues.drain(), []);
}

/** The water arriving is the clock the whole level runs on. */
export async function theWaterStartingSounds(): Promise<void> {
  const { game, data } = emptyBoard();
  data.flowDelay = 1;

  game.update();

  assert.ok(data.flowStarted, 'the flow began');
  assert.deepStrictEqual(game.cues.drain(), ['alarm']);
}

/** Each pipe the water fills is the tick the player is racing. */
export async function eachFilledPipeSounds(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[data.startY][data.startX + 1].pipe = 'horizontal';
  data.flowDelay = 0;
  game.update();       // starts the flow
  game.cues.clear();

  // Enough ticks for the start cell to fill and the flow to step on.
  for (let i = 0; i < 200 && !game.cues.pending.includes('blip'); i++) {
    game.update();
  }

  assert.ok(game.cues.pending.includes('blip'), 'a filled pipe is heard');
}

/** Running out of pipe ends the game; Pipe Dream has no lives to lose. */
export async function theLeakSoundsGameOverAndNotADeath(): Promise<void> {
  const { game, data } = emptyBoard();
  data.flowDelay = 0;
  game.update();
  game.cues.clear();

  // Nothing is connected to the start, so the water has nowhere to go.
  for (let i = 0; i < 500 && data.state !== 'gameover'; i++) game.update();

  assert.strictEqual(data.state, 'gameover');
  const cues = game.cues.drain();
  assert.ok(cues.includes('gameover'), 'the leak ends it');
  assert.ok(!cues.includes('death'), 'and there is no life to lose');
}

/** An undrained queue stays bounded. */
export async function anUndrainedQueueStaysBounded(): Promise<void> {
  const { game } = emptyBoard();

  for (let i = 0; i < 200; i++) game.handleDiscard();

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
export async function theEffectsAreSentWetToBothReverbAndEcho(): Promise<void> {
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
  assert.ok(
    Number(reverbWet![1]) >= 0.7,
    `reverb send is ${reverbWet![1]}; below 0.7 it was reported as too dry`
  );
  assert.ok(
    Number(echoWet![1]) >= 0.7,
    `echo send is ${echoWet![1]}; below 0.7 it was reported as too dry`
  );

  // Short enough not to ring into the next event.
  assert.ok(
    Number(decay![1]) <= 1.0,
    `a ${decay![1]}s tail is too long - 2.4s was still reported as too long`
  );
  assert.ok(
    Number(feedback![1]) > 0 && Number(feedback![1]) <= 0.15,
    `echo feedback ${feedback![1]} should give ONE faint repeat, not a cloud`
  );
}
