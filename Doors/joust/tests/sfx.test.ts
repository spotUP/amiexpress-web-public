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
import { JoustData, Enemy } from '../game/types';

/** A wave with the board cleared, so only what a test places is in play. */
function emptyWave(): { game: JoustGame; data: JoustData } {
  const data = createInitialGameData();
  const game = new JoustGame(
    data,
    () => { /* no display in tests */ },
    () => { /* game over is the door's screen */ },
    () => { /* wave complete likewise */ }
  );
  game.initWave();
  data.state = 'playing';
  data.enemies = [];
  data.eggs = [];
  data.pterodactyl.isActive = false;
  data.player.invincibleTimer = 0;
  game.cues.clear();
  return { game, data };
}

function enemyAt(x: number, y: number): Enemy {
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
  } as Enemy;
}

/** The flap is Joust's signature sound. */
export async function flappingSounds(): Promise<void> {
  const { game } = emptyWave();

  game.handleFlap();

  assert.deepStrictEqual(game.cues.drain(), ['jump']);
}

/** Winning a joust, losing one and bouncing are three different sounds. */
export async function theThreeOutcomesOfAJoustSoundDifferent(): Promise<void> {
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
export async function collectingAnEggSounds(): Promise<void> {
  const { game, data } = emptyWave();
  data.player.x = 10;
  data.player.y = 10;
  data.eggs = [{
    id: 1, x: 10, y: 10, vx: 0, vy: 0,
    state: 'landed', timer: 0, enemyType: 'bounder',
  } as any];

  game.checkCollisions();

  assert.deepStrictEqual(game.cues.drain(), ['coin']);
}

/** An egg that hatches puts an enemy back on the board. */
export async function anEggHatchingSounds(): Promise<void> {
  const { game, data } = emptyWave();
  data.eggs = [{
    id: 1, x: 10, y: 10, vx: 0, vy: 0,
    state: 'hatching', timer: 100_000, enemyType: 'bounder',
  } as any];
  // Keep the player away from it, or it is collected before it hatches.
  data.player.x = 40;
  data.player.y = 2;

  game.update();

  assert.ok(game.cues.pending.includes('blip'));
}

/** Losing the last life ends the game audibly. */
export async function losingTheLastLifeSoundsGameOver(): Promise<void> {
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
export async function deathSoundsOnce(): Promise<void> {
  const { game, data } = emptyWave();
  data.player.x = 10;
  data.player.y = 10;
  data.enemies = [enemyAt(10, 8), { ...enemyAt(10, 8), id: 2 }];

  game.checkCollisions();

  assert.strictEqual(game.cues.drain().filter(c => c === 'death').length, 1);
}

/** Clearing the wave. */
export async function clearingTheWaveSounds(): Promise<void> {
  const { game, data } = emptyWave();

  game.update();

  assert.strictEqual(data.state, 'waveComplete');
  assert.ok(game.cues.pending.includes('level-up'));
}

/** An undrained queue stays bounded. */
export async function anUndrainedQueueStaysBounded(): Promise<void> {
  const { game } = emptyWave();

  for (let i = 0; i < 200; i++) game.handleFlap();

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
    Number(decay![1]) <= 2.5,
    `a ${decay![1]}s tail was reported as way too long`
  );
  assert.ok(
    Number(feedback![1]) > 0 && Number(feedback![1]) <= 0.3,
    `echo feedback ${feedback![1]} should give a couple of repeats, not a cloud`
  );
}
