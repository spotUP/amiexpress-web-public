/**
 * What kills the frog, what it can ride, and what turns up in a home.
 *
 * Covers FAQ-6.4d, FAQ-6.4i, FAQ-6.4l, FAQ-6.4m, FAQ-6.4n, FAQ-7f, FAQ-7h,
 * FAQ-7i, FAQ-7j, FAQ-7k, FAQ-7m, FAQ-7n, FAQ-7o and FAQ-7p.
 */

import assert from 'assert';
import { startedLevel, laneOf } from './fixture';
import { RiverObject } from '../game/types';
import {
  OBJECT_WIDTHS, HOME_CENTRE_OFFSET, INITIAL_TIME,
  RIVER_HURRY_AFTER_SECONDS, LANE4_SPEEDUP_AFTER_MS,
} from '../game/constants';

/**
 * FAQ-7n: "You must hit exact center or your frog will die."
 */
export async function ahomeIsEnteredAtItsExactCentreOnly(): Promise<void> {
  const { game, data } = startedLevel(1);
  const home = data.homes[2];

  data.frog.y = 0;
  data.frog.x = home.x + HOME_CENTRE_OFFSET;
  game.checkHomeArrival();
  assert.ok(home.occupied, 'the centre of the home takes the frog');

  const missed = startedLevel(1);
  const other = missed.data.homes[2];
  missed.data.frog.y = 0;
  missed.data.frog.x = other.x + HOME_CENTRE_OFFSET + 1;
  const lives = missed.data.lives;
  missed.game.checkHomeArrival();

  assert.ok(!other.occupied, 'one cell off is not the centre');
  assert.strictEqual(missed.data.lives, lives - 1, 'and it costs a frog');
}

/**
 * FAQ-7o: "keep in mind that crocodiles like to randomly appear in your
 * home. Make sure that your home is clear before trying to settle your frog
 * down into it."
 */
export async function aCrocodileInAHomeKillsTheFrogThatEntersIt(): Promise<void> {
  const { game, data } = startedLevel(2);
  const home = data.homes[1];
  home.hasAlligator = true;

  const lives = data.lives;
  data.frog.y = 0;
  data.frog.x = home.x + HOME_CENTRE_OFFSET;
  game.checkHomeArrival();

  assert.strictEqual(data.lives, lives - 1, 'the crocodile takes the frog');
  assert.ok(!home.occupied, 'and the home is not credited');
}

/** FAQ-6.4i/6.4l: no crocodile visits a home on level 1. */
export async function noCrocodileVisitsAHomeOnLevelOne(): Promise<void> {
  const { game, data } = startedLevel(1);

  for (let i = 0; i < 400; i++) game.update();

  assert.ok(
    data.homes.every(h => !h.hasAlligator),
    'the crocodile only starts appearing at level 2'
  );
}

/** ...and one does from level 2. */
export async function aCrocodileVisitsAHomeFromLevelTwo(): Promise<void> {
  const { game, data } = startedLevel(2);

  let seen = false;
  for (let i = 0; i < 2000 && !seen; i++) {
    game.update();
    seen = data.homes.some(h => h.hasAlligator);
  }

  assert.ok(seen, 'a crocodile should turn up in a home from level 2');
}

/** FAQ-7m: "you can hold out until the fly appears in your home". */
export async function aFlyAppearsInAHome(): Promise<void> {
  const { game, data } = startedLevel(1);

  let seen = false;
  for (let i = 0; i < 2000 && !seen; i++) {
    game.update();
    seen = data.homes.some(h => h.hasFly);
  }

  assert.ok(seen, 'a fly should appear in a home to be waited for');
}

/**
 * FAQ-7f: "The snake is deadly to your frog and you cannot hop over it."
 */
export async function theMedianSnakeKillsTheFrog(): Promise<void> {
  const { game, data } = startedLevel(3);

  const median = data.lanes.find(l => l.type === 'safe' && l.y < 12);
  assert.ok(median, 'there should be a median');

  // The level's snake may have been dealt to a log instead of the median
  // (FAQ 6.4: "randomly in either the median, log, or both places"), so put
  // one on the median outright rather than depending on the deal.
  data.snakes = [{ id: 1, x: 10, y: median!.y, direction: 1, speed: 1 }];

  const snake = data.snakes[0];
  data.frog.y = median!.y;
  data.frog.x = snake.x;

  const lives = data.lives;
  game.checkCollisions();

  assert.strictEqual(data.lives, lives - 1, 'the median snake is deadly');
}

/** FAQ-7k: "Watch out for the snakes, they sometimes like to ride on the logs." */
export async function aSnakeOnALogKillsTheFrogRidingIt(): Promise<void> {
  const { game, data } = startedLevel(3);

  const lane = laneOf(data, 'water', 3);
  const log = lane.objects[0] as RiverObject;
  log.snakeAt = 1;

  data.frog.y = lane.y;
  data.frog.x = log.x + 1;

  const lives = data.lives;
  game.checkCollisions();

  assert.strictEqual(data.lives, lives - 1, 'the snake on the log is deadly');
}

/**
 * FAQ-7h/7i: "You can jump on the backs of the crocodiles and otters. Just
 * don't get near their mouths or they are apt to turn your frog into a
 * meal."
 */
export async function aCrocodilesBackCarriesYouAndItsMouthDoesNot(): Promise<void> {
  const { game, data } = startedLevel(5);

  const lane = laneOf(data, 'water', 5);
  const croc = lane.objects[0] as RiverObject;
  croc.x = 10;

  // The back: the trailing cells.
  data.frog.y = lane.y;
  data.frog.x = croc.x + croc.width - 1;
  let lives = data.lives;
  game.checkCollisions();
  assert.strictEqual(data.lives, lives, 'the back of a crocodile is footing');
  assert.ok(data.frog.onObject, 'and the frog rides it');

  // The mouth: the leading cell, which is the way it is travelling.
  const mouth = startedLevel(5);
  const mouthLane = laneOf(mouth.data, 'water', 5);
  const mouthCroc = mouthLane.objects[0] as RiverObject;
  mouthCroc.x = 10;
  mouth.data.frog.y = mouthLane.y;
  mouth.data.frog.x = mouthCroc.x;      // lane 5 runs right to left
  lives = mouth.data.lives;
  mouth.game.checkCollisions();

  assert.strictEqual(mouth.data.lives, lives - 1, 'the mouth eats the frog');
}

/** FAQ-6.4n: "The otter appears randomly on any of the water lanes." */
export async function anOtterAppearsOnAWaterLane(): Promise<void> {
  const { game, data } = startedLevel(4);

  let seen = false;
  for (let i = 0; i < 2000 && !seen; i++) {
    game.update();
    seen = data.lanes
      .filter(l => l.type === 'water')
      .some(l => (l.objects as RiverObject[]).some(o => o.type === 'otter'));
  }

  assert.ok(seen, 'an otter should turn up on the water');
}

/**
 * FAQ-7j: "You may see a purple frog hopping around on the log in water
 * lane #2. Just cross over this frog to give it a piggyback ride to your
 * home and get an extra 200 points."
 */
export async function crossingTheLadyFrogPicksHerUp(): Promise<void> {
  const { game, data } = startedLevel(1);

  const lane = laneOf(data, 'water', 2);
  const log = lane.objects[0] as RiverObject;
  log.ladyFrogAt = 1;

  data.frog.y = lane.y;
  data.frog.x = log.x + 1;
  game.checkCollisions();

  assert.ok(data.carryingLadyFrog, 'she climbs on');
  assert.strictEqual(log.ladyFrogAt, null, 'and leaves the log');
}

/**
 * She has to actually turn up: FAQ 7, "You may see a purple frog hopping
 * around on the log in water lane #2."
 */
export async function aLadyFrogAppearsOnALaneTwoLog(): Promise<void> {
  const { game, data } = startedLevel(1);

  let seen = false;
  for (let i = 0; i < 2000 && !seen; i++) {
    game.update();
    seen = (laneOf(data, 'water', 2).objects as RiverObject[]).some(
      o => o.ladyFrogAt !== null && o.ladyFrogAt !== undefined
    );
  }

  assert.ok(seen, 'a lady frog should appear on a lane 2 log to be picked up');
}

/** A lady frog only ever rides a lane 2 log (FAQ 7). */
export async function theLadyFrogOnlyRidesLaneTwo(): Promise<void> {
  const { game, data } = startedLevel(1);

  for (let i = 0; i < 1500; i++) game.update();

  for (const lane of data.lanes.filter(l => l.type === 'water' && l.lane !== 2)) {
    const riders = (lane.objects as RiverObject[]).filter(
      o => o.ladyFrogAt !== null && o.ladyFrogAt !== undefined
    );
    assert.strictEqual(riders.length, 0, `lane ${lane.lane} should carry no lady frog`);
  }
}

/**
 * FAQ-7p: "if you waste too much time, the things on the river will move
 * quicker so you will have to adjust your strategy accordingly."
 */
export async function theRiverSpeedsUpWhenYouDawdle(): Promise<void> {
  const { game, data } = startedLevel(1);

  const calm = game.riverSpeedScale();

  data.timeRemaining = INITIAL_TIME - RIVER_HURRY_AFTER_SECONDS - 1;
  const hurried = game.riverSpeedScale();

  assert.ok(hurried > calm, `the river should run quicker: ${calm} then ${hurried}`);
}

/**
 * FAQ-6.4d: "cars in Lane 4 will travel fast after a specific period of
 * time if they aren't traveling fast already".
 */
export async function laneFourPicksUpSpeedAfterAWhile(): Promise<void> {
  const { game, data } = startedLevel(3);   // level 3's lane 4 is marked SLOW

  const atStart = game.lane4SpeedScale();

  data.frogStartTime = Date.now() - (LANE4_SPEEDUP_AFTER_MS + 1000);
  const later = game.lane4SpeedScale();

  assert.ok(later > atStart, `lane 4 should pick up: ${atStart} then ${later}`);
}

/** A lane already marked fast does not speed up again. */
export async function aLaneAlreadyFastDoesNotSpeedUpTwice(): Promise<void> {
  const { game, data } = startedLevel(1);   // level 1's lane 4 is marked FAST

  const atStart = game.lane4SpeedScale();
  data.frogStartTime = Date.now() - (LANE4_SPEEDUP_AFTER_MS + 1000);

  assert.strictEqual(game.lane4SpeedScale(), atStart);
}

/** FAQ-7l: the frog cannot wrap around; riding off the edge kills it. */
export async function ridingOffTheEdgeKillsTheFrog(): Promise<void> {
  const { game, data } = startedLevel(1);

  const lane = laneOf(data, 'water', 1);
  const raft = lane.objects[0] as RiverObject;
  raft.x = -1;

  data.frog.y = lane.y;
  data.frog.x = -0.5;
  data.frog.onObject = raft;

  const lives = data.lives;
  game.update();

  assert.strictEqual(data.lives, lives - 1, 'off the edge is death, not a wrap');
}

/** A diving turtle drowns the frog standing on it (FAQ-7g). */
export async function aDivingTurtleDrownsTheFrog(): Promise<void> {
  const { game, data } = startedLevel(2);

  const lane = laneOf(data, 'water', 1);
  const turtle = (lane.objects as RiverObject[]).find(t => t.canDive);
  assert.ok(turtle, 'lane 1 should have a diving set');

  turtle!.isDiving = true;
  data.frog.y = lane.y;
  data.frog.x = turtle!.x;
  data.frog.onObject = turtle!;

  const lives = data.lives;
  game.update();

  assert.strictEqual(data.lives, lives - 1);
}

/** The turtle widths follow the FAQ's set-of-three diagram. */
export async function aTurtleSetIsThreeCellsWide(): Promise<void> {
  const { data } = startedLevel(1);
  const turtle = laneOf(data, 'water', 1).objects[0] as RiverObject;

  assert.strictEqual(turtle.width, OBJECT_WIDTHS.turtle);
}
