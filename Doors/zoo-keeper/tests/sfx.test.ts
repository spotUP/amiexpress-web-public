/**
 * The sounds the game asks for.
 *
 * A sound effect cannot report that it never played, so every cue is
 * asserted here rather than left to be noticed by ear. The game pushes
 * names into `game.cues` and never touches a socket, which is what makes
 * this testable at all.
 *
 * Zeke walks the perimeter constantly, so the interesting assertions are
 * the SILENCES: repairing wall that is not damaged says nothing, or the
 * whole lap would be one continuous noise.
 */

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createInitialGameData } from '../game/initial-data';
import { ZooKeeperGame } from '../game/zoo-stage';
import { ZooKeeperData, Animal } from '../game/types';
import {
  ZOO_PERIMETER, EXTRA_LIFE_SCORE, NET_DURATION_TICKS, GAME_AREA,
} from '../game/constants';

/** A zoo with no animals loose, so only what a test places is in play. */
function quietZoo(): { game: ZooKeeperGame; data: ZooKeeperData } {
  const data = createInitialGameData();
  const game = new ZooKeeperGame(data, () => { /* no display in tests */ });
  game.initZooStage();
  data.state = 'playing';
  data.zooStage.animals = [];
  data.zooStage.bonusItems = [];
  game.cues.clear();
  return { game, data };
}

function escapedAnimalAt(x: number, y: number): Animal {
  return {
    id: 1, type: 'lion', x, y, dx: 0, dy: 0,
    escaped: true, targetWallX: 0, targetWallY: 0, attackTimer: 0,
  } as Animal;
}

/** The jump. */
export async function jumpingSounds(): Promise<void> {
  const { game } = quietZoo();

  game.handleJump();

  assert.deepStrictEqual(game.cues.drain(), ['jump']);
}

/**
 * Repairing damaged wall sounds; walking over intact wall does not.
 *
 * Zeke patrols the perimeter the whole level. If every step made a repair
 * noise the sound would carry no information at all.
 */
export async function onlyDamagedWallSoundsWhenRepaired(): Promise<void> {
  const { game, data } = quietZoo();
  // Zeke builds where he ARRIVES, so damage the cell he is about to
  // step onto rather than the one he is standing on.
  const wall = data.zooStage.wall;
  wall[0][3].thickness = 1;

  data.zeke.x = ZOO_PERIMETER.outerLeft + 2;
  data.zeke.y = ZOO_PERIMETER.outerTop;
  game.handleDirection('right');
  const repaired = game.cues.drain();

  game.handleDirection('right');
  const alreadyFull = game.cues.drain();

  assert.ok(repaired.includes('switch'), 'a damaged segment is built back up');
  assert.ok(!alreadyFull.includes('switch'), 'intact wall is not rebuilt twice');
}

/** Netting an escaped animal, and jumping one, are different rewards. */
export async function nettingAndJumpingSoundDifferent(): Promise<void> {
  const netted = quietZoo();
  netted.data.zeke.hasNet = true;
  netted.data.zeke.isJumping = false;
  netted.data.zooStage.animals = [escapedAnimalAt(netted.data.zeke.x, netted.data.zeke.y)];
  netted.game.checkCollisions();

  const jumped = quietZoo();
  jumped.data.zeke.isJumping = true;
  jumped.data.zooStage.animals = [escapedAnimalAt(jumped.data.zeke.x + 1, jumped.data.zeke.y)];
  jumped.game.checkCollisions();

  assert.deepStrictEqual(netted.game.cues.drain(), ['pickup'], 'the net catches');
  assert.deepStrictEqual(jumped.game.cues.drain(), ['coin'], 'the jump scores');
}

/** Caught without the net. */
export async function beingCaughtSounds(): Promise<void> {
  const { game, data } = quietZoo();
  data.zeke.hasNet = false;
  data.zeke.isJumping = false;
  data.zooStage.animals = [escapedAnimalAt(data.zeke.x, data.zeke.y)];

  game.checkCollisions();

  assert.ok(game.cues.pending.includes('death'));
}

/** Losing the last life ends the game audibly. */
export async function losingTheLastLifeSoundsGameOver(): Promise<void> {
  const { game, data } = quietZoo();
  data.lives = 1;
  data.zeke.hasNet = false;
  data.zeke.isJumping = false;
  data.zooStage.animals = [escapedAnimalAt(data.zeke.x, data.zeke.y)];

  game.checkCollisions();

  assert.strictEqual(data.state, 'gameover');
  assert.deepStrictEqual(game.cues.drain(), ['death', 'gameover']);
}

/** The net changes what Zeke can do; the fruit only pays. */
export async function theNetSoundsBiggerThanTheFruit(): Promise<void> {
  const net = quietZoo();
  net.data.zooStage.fusePosition = 0.5;
  net.data.zooStage.bonusItems = [{
    type: 'net', x: 0, y: 0, collected: false, fusePosition: 0,
  }];
  // checkBonusItems recomputes the item's position from its place on the
  // fuse, so Zeke has to be where the fuse puts it.
  net.data.zeke.x = 20;
  net.data.zeke.y = GAME_AREA.bottom - 1;
  net.game.checkBonusItems();

  const fruit = quietZoo();
  fruit.data.zooStage.fusePosition = 0.5;
  fruit.data.zooStage.bonusItems = [{
    type: 'watermelon', x: 0, y: 0, collected: false, fusePosition: 0,
  }];
  fruit.data.zeke.x = 20;
  fruit.data.zeke.y = GAME_AREA.bottom - 1;
  fruit.game.checkBonusItems();

  assert.ok(net.game.cues.pending.includes('powerup'), 'the net is a power-up');
  assert.ok(fruit.game.cues.pending.includes('coin'), 'the fruit is points');
  assert.ok(net.data.zeke.netTimer === NET_DURATION_TICKS, 'and the net actually ran');
}

/** The free keeper at 50,000. */
export async function theFreeKeeperSounds(): Promise<void> {
  const { game, data } = quietZoo();
  data.score = EXTRA_LIFE_SCORE;

  game.checkExtraLife();

  assert.ok(game.cues.pending.includes('1up'));
}

/** An undrained queue stays bounded. */
export async function anUndrainedQueueStaysBounded(): Promise<void> {
  const { game, data } = quietZoo();

  for (let i = 0; i < 200; i++) {
    data.zeke.isJumping = false;
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
