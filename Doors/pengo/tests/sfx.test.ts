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

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createInitialGameData } from '../game/initial-data';
import { PengoGame } from '../game/pengo-game';
import { PengoData } from '../game/types';
import { GRID_WIDTH, GRID_HEIGHT } from '../game/constants';

/**
 * A board the test controls completely.
 *
 * initLevel scatters ice, diamonds, Pengo and the Sno-Bees at random, which
 * is right for play and useless for a test. This keeps the walls and clears
 * everything inside them.
 */
function emptyBoard(): { game: PengoGame; data: PengoData } {
  const data = createInitialGameData();
  const game = new PengoGame(data, () => { /* no display in tests */ });
  game.initLevel();

  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const edge = x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1;
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

function enemyAt(x: number, y: number) {
  return {
    id: 1, x, y, direction: 'left' as const, state: 'walking' as const,
    stunTimer: 0, hatchTimer: 0, moveTimer: 0,
  };
}

/** Pushing a block is what Pengo does; it should be what Pengo sounds like. */
export async function pushingABlockSounds(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';

  game.handlePush();

  assert.deepStrictEqual(game.cues.drain(), ['dash']);
}

/** A block that catches a Sno-Bee crushes it, audibly. */
export async function crushingASnoBeeSounds(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[4][5] = 'ice';
  data.enemies = [enemyAt(6, 4)];

  game.handlePush();

  assert.deepStrictEqual(game.cues.drain(), ['dash', 'explosion']);
}

/** A wall shake that stuns and one that catches nobody are different sounds. */
export async function aWallShakeSaysWhetherItCaughtAnything(): Promise<void> {
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

  assert.deepStrictEqual(caught.game.cues.drain(), ['hit'], 'a stun is a hit');
  assert.deepStrictEqual(missed.game.cues.drain(), ['boop'], 'a miss is not');
}

/** Lining the diamonds up is the biggest score in the game. */
export async function liningUpTheDiamondsSounds(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[3][4] = 'diamond';
  data.grid[3][6] = 'diamond';
  data.grid[4][5] = 'ice';

  game.handlePush();

  assert.ok(game.cues.pending.includes('powerup'), 'the alignment announces itself');
}

/** ...and it announces itself once, not on every push thereafter. */
export async function theDiamondFanfareDoesNotRepeat(): Promise<void> {
  const { game, data } = emptyBoard();
  data.grid[3][4] = 'diamond';
  data.grid[3][6] = 'diamond';
  data.grid[4][5] = 'ice';
  game.handlePush();
  game.cues.clear();

  data.grid[4][5] = 'ice';
  game.handlePush();

  assert.ok(
    !game.cues.pending.includes('powerup'),
    'the diamonds are still aligned; that is not news twice'
  );
}

/** Being caught by a Sno-Bee. */
export async function beingCaughtSounds(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies = [enemyAt(4, 4)];

  game.update();

  assert.ok(game.cues.pending.includes('death'));
}

/** The death cue fires once, not on every frame of the death animation. */
export async function deathSoundsOnce(): Promise<void> {
  const { game, data } = emptyBoard();
  data.enemies = [enemyAt(4, 4)];

  game.update();
  const first = game.cues.drain().filter(c => c === 'death').length;
  for (let i = 0; i < 5; i++) game.update();

  assert.strictEqual(first, 1);
  assert.deepStrictEqual(game.cues.drain(), [], 'the animation is silent');
}

/** Losing the last life ends the game audibly. */
export async function losingTheLastLifeSoundsGameOver(): Promise<void> {
  const { game, data } = emptyBoard();
  data.lives = 1;
  data.enemies = [enemyAt(4, 4)];

  game.update();
  // The death animation runs for twenty frames before the respawn finds
  // there is nothing left to respawn.
  for (let i = 0; i < 25 && data.state !== 'gameover'; i++) game.update();

  assert.strictEqual(data.state, 'gameover');
  assert.ok(game.cues.pending.includes('gameover'));
}

/** Clearing the board finishes the level. */
export async function clearingTheBoardSoundsTheLevel(): Promise<void> {
  const { game, data } = emptyBoard();

  game.update();

  assert.strictEqual(data.state, 'levelComplete');
  assert.ok(game.cues.pending.includes('level-up'));
}

/** An undrained queue stays bounded, so attract mode neither sounds nor leaks. */
export async function anUndrainedQueueStaysBounded(): Promise<void> {
  const { game, data } = emptyBoard();

  for (let i = 0; i < 200; i++) {
    data.grid[4][5] = 'ice';
    game.handlePush();
    data.pengo.isPushing = false;
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
