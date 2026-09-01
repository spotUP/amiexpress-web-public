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

import assert from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { startedLevel, laneOf } from './fixture';
import {
  GRID_HEIGHT, HOME_CENTRE_OFFSET, EXTRA_LIFE_SCORE, INITIAL_TIME,
} from '../game/constants';

/** A hop the player made is a hop the player hears. */
export async function aHopMakesASound(): Promise<void> {
  const { game } = startedLevel(1);

  game.handleDirection('up');

  assert.deepStrictEqual(game.cues.drain(), ['jump']);
}

/** A hop into the wall goes nowhere, so it says nothing. */
export async function aHopIntoTheWallIsSilent(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.frog.x = 0;
  game.cues.clear();

  game.handleDirection('left');

  assert.deepStrictEqual(game.cues.drain(), []);
}

/** Drowning and being run over are different sounds. */
export async function drowningSoundsDifferentFromBeingRunOver(): Promise<void> {
  const water = startedLevel(1);
  const lane = laneOf(water.data, 'water', 1);
  // Open water: nothing to land on, so the frog goes in.
  lane.objects.length = 0;
  water.data.frog.y = lane.y;
  water.data.frog.x = 5;
  water.game.cues.clear();
  water.game.checkCollisions();

  const road = startedLevel(1);
  const roadLane = laneOf(road.data, 'road', 1);
  road.data.frog.y = roadLane.y;
  // Squarely inside the vehicle. Footing and collision are decided by the
  // frog's CENTRE - half of it has to be over the thing - so the frog goes
  // at the vehicle's own x, which puts its centre half a cell in. It used
  // to sit at x + 0.5, which under the centre rule is exactly the far edge
  // and therefore a miss.
  road.data.frog.x = roadLane.objects[0].x;
  road.game.cues.clear();
  road.game.checkCollisions();

  assert.deepStrictEqual(water.game.cues.drain(), ['drop'], 'the river plunks');
  assert.deepStrictEqual(road.game.cues.drain(), ['death'], 'the road does not');
}

/** Running out of time is its own warning, not a generic death. */
export async function theClockRunningOutSoundsLikeAClock(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.timeRemaining = 1;
  game.cues.clear();

  // One second of play is twenty ticks.
  for (let i = 0; i < 20; i++) game.update();

  assert.ok(game.cues.pending.includes('alarm'), 'the clock should sound the alarm');
  assert.ok(!game.cues.pending.includes('death'), 'and not the death cue as well');
}

/** Getting a frog home is the reward the game is built around. */
export async function reachingAHomeSounds(): Promise<void> {
  const { game, data } = startedLevel(1);
  const home = data.homes[2];
  data.frog.y = 0;
  data.frog.x = home.x + HOME_CENTRE_OFFSET;
  game.cues.clear();

  game.checkHomeArrival();

  assert.deepStrictEqual(game.cues.drain(), ['success']);
}

/** The fly in the home is a bonus, and it is heard as one. */
export async function eatingTheFlyAddsItsOwnSound(): Promise<void> {
  const { game, data } = startedLevel(1);
  const home = data.homes[2];
  home.hasFly = true;
  data.frog.y = 0;
  data.frog.x = home.x + HOME_CENTRE_OFFSET;
  game.cues.clear();

  game.checkHomeArrival();

  assert.deepStrictEqual(game.cues.drain(), ['success', 'coin']);
}

/** Carrying the lady frog home pays 200, and says so. */
export async function deliveringTheLadyFrogSounds(): Promise<void> {
  const { game, data } = startedLevel(1);
  const home = data.homes[2];
  data.carryingLadyFrog = true;
  data.frog.y = 0;
  data.frog.x = home.x + HOME_CENTRE_OFFSET;
  game.cues.clear();

  game.checkHomeArrival();

  assert.deepStrictEqual(game.cues.drain(), ['success', 'powerup']);
}

/** Filling all five homes finishes the level. */
export async function fillingTheLastHomeSoundsTheLevel(): Promise<void> {
  const { game, data } = startedLevel(1);
  for (let i = 0; i < 4; i++) game.settleFrogInHome(i);
  game.cues.clear();

  game.settleFrogInHome(4);

  assert.deepStrictEqual(game.cues.drain(), ['success', 'level-up']);
}

/** FAQ 6.3: "you get one free frog at 20,000 points" - and you hear it. */
export async function theFreeFrogSounds(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.score = EXTRA_LIFE_SCORE;
  game.cues.clear();

  game.update();

  assert.ok(game.cues.pending.includes('1up'), 'the free frog announces itself');
}

/** Losing the last frog ends the game audibly. */
export async function losingTheLastFrogSoundsGameOver(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.lives = 1;
  const lane = laneOf(data, 'water', 1);
  lane.objects.length = 0;
  data.frog.y = lane.y;
  data.frog.x = 5;
  game.checkCollisions();
  game.cues.clear();

  // The death animation runs for twenty frames before the respawn decides
  // there is nothing left to respawn.
  for (let i = 0; i < 25 && data.state !== 'gameover'; i++) game.update();

  assert.strictEqual(data.state, 'gameover');
  assert.ok(game.cues.pending.includes('gameover'));
}

/**
 * Attract mode stays silent.
 *
 * Not by suppressing anything: the demo game's cues are simply never
 * drained, and the queue is bounded, so a menu left up all night neither
 * makes a noise nor grows.
 */
export async function anUndrainedDemoStaysBounded(): Promise<void> {
  const { game, data } = startedLevel(1);

  for (let i = 0; i < 500; i++) {
    game.handleDirection(i % 2 === 0 ? 'up' : 'down');
    if (data.frog.isDead) break;
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
