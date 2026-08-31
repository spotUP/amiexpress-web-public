/**
 * Scoring (FAQ 6.3) and the lives the cabinet was set to give.
 *
 * Covers FAQ-6.3a, FAQ-6.3b, FAQ-6.3c, FAQ-6.3d, FAQ-6.3e, FAQ-6.3f,
 * FAQ-6.3g, FAQ-6.3h and FAQ-6.3i.
 */

import assert from 'assert';
import { startedLevel } from './fixture';
import {
  SCORES, EXTRA_LIFE_SCORE, LIVES_OPTIONS, GRID_HEIGHT,
  HOME_POSITIONS, HOME_CENTRE_OFFSET, INITIAL_TIME,
} from '../game/constants';

/** FAQ-6.3a: "10 points for each forward hop." */
export async function aForwardHopPaysTen(): Promise<void> {
  const { game, data } = startedLevel(1);
  const before = data.score;

  game.handleDirection('up');

  assert.strictEqual(data.score - before, SCORES.hop);
}

/** Hopping backwards pays nothing. */
export async function hoppingBackwardsPaysNothing(): Promise<void> {
  const { game, data } = startedLevel(1);

  game.handleDirection('up');
  const afterUp = data.score;
  game.handleDirection('down');

  assert.strictEqual(data.score, afterUp);
}

/**
 * FAQ-6.3b: "Forward Hop: 10 points (max points per home is 100)". A row
 * pays once, so bouncing up and down the same row cannot farm points - it
 * used to pay 10 every time the frog moved up.
 */
export async function aRowPaysOnlyOnce(): Promise<void> {
  const { game, data } = startedLevel(1);

  game.handleDirection('up');
  const afterFirst = data.score;

  game.handleDirection('down');
  game.handleDirection('up');

  assert.strictEqual(data.score, afterFirst, 'the same row should not pay twice');
}

/** ...and one trip cannot earn more than 100 from hopping. */
export async function hopPointsAreCappedPerHome(): Promise<void> {
  const { game, data } = startedLevel(1);

  for (let i = 0; i < GRID_HEIGHT + 4; i++) game.handleDirection('up');

  assert.ok(
    data.hopPointsThisHome <= SCORES.maxHopPerHome,
    `hop points for one home should cap at ${SCORES.maxHopPerHome}, got ${data.hopPointsThisHome}`
  );
}

/** FAQ-6.3c and 6.3g: a home pays 50, plus 10 per second left. */
export async function reachingHomePaysFiftyPlusTheTimeBonus(): Promise<void> {
  const { game, data } = startedLevel(1);

  data.timeRemaining = 30;
  const before = data.score;
  game.settleFrogInHome(0);

  assert.strictEqual(
    data.score - before,
    SCORES.home + 30 * SCORES.timeBonus
  );
}

/** FAQ-6.3d: filling all five homes pays 1,000. */
export async function fillingEveryHomePaysAThousand(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.timeRemaining = 0;

  let total = 0;
  for (let i = 0; i < 5; i++) {
    // Each trip starts the clock again, so zero it every time to leave the
    // time bonus out of the comparison.
    data.timeRemaining = 0;
    const before = data.score;
    game.settleFrogInHome(i);
    total += data.score - before;
  }

  assert.strictEqual(total, 5 * SCORES.home + SCORES.levelComplete);
}

/** FAQ-6.3f: "Eating a Fly: 200 points". */
export async function takingTheFlyPaysTwoHundred(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.timeRemaining = 0;
  data.homes[2].hasFly = true;

  const before = data.score;
  game.settleFrogInHome(2);

  assert.strictEqual(data.score - before, SCORES.home + SCORES.fly);
}

/** FAQ-6.3e: "Bringing a Frog to Your Home: 200 points". */
export async function carryingTheLadyFrogHomePaysTwoHundred(): Promise<void> {
  const { game, data } = startedLevel(1);
  data.timeRemaining = 0;
  data.carryingLadyFrog = true;

  const before = data.score;
  game.settleFrogInHome(1);

  assert.strictEqual(data.score - before, SCORES.home + SCORES.ladyFrog);
  assert.ok(!data.carryingLadyFrog, 'she gets off at the home');
}

/** FAQ-6.3i: "you get one free frog at 20,000 points". */
export async function aFreeFrogArrivesAtTwentyThousand(): Promise<void> {
  const { game, data } = startedLevel(1);
  const lives = data.lives;

  data.score = EXTRA_LIFE_SCORE - 1;
  game.update();
  assert.strictEqual(data.lives, lives, 'nothing below the threshold');

  data.score = EXTRA_LIFE_SCORE;
  game.update();
  assert.strictEqual(data.lives, lives + 1, 'the free frog at 20,000');

  data.score = EXTRA_LIFE_SCORE * 3;
  game.update();
  assert.strictEqual(data.lives, lives + 1, 'and only the one');
}

/** FAQ-6.3h: "You start the game with 3, 5, 7, or 256 lives". */
export async function theCabinetOffersTheFourLifeSettings(): Promise<void> {
  assert.deepStrictEqual(LIVES_OPTIONS, [3, 5, 7, 256]);
}

/** FAQ-7a: sixty seconds on the clock, whatever the level. */
export async function everyLevelGivesSixtySeconds(): Promise<void> {
  for (const level of [1, 5, 9, 14]) {
    const { data } = startedLevel(level);
    assert.strictEqual(data.timeRemaining, INITIAL_TIME, `level ${level}`);
  }
}

/** A home is entered at its exact centre (FAQ-7n), which fixes the offset. */
export async function theHomeCentreIsWhereTheFrogHasToLand(): Promise<void> {
  const { data } = startedLevel(1);

  assert.strictEqual(data.homes.length, HOME_POSITIONS.length);
  assert.strictEqual(data.homes[0].x, HOME_POSITIONS[0]);
  assert.ok(HOME_CENTRE_OFFSET >= 0);
}
