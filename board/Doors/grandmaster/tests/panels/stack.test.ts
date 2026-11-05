/**
 * The Stack, driven a frame at a time.
 *
 * These are the first tests that run the real loop rather than poking a board,
 * so they pin the orderings inside a frame - which is where a port of this kind
 * goes wrong invisibly.
 */

import assert from 'assert';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getModern, LevelData } from '../../core/panels/level-data';
import { SPEED_TO_RISE_TIME, DT_SPEED_INCREASE } from '../../core/panels/consts';

function makeStack(levelData: LevelData = getModern(1), seed = 1): Stack {
  const stack = new Stack({ levelData, panelSource: new GeneratorSource(seed, true) });
  stack.startingState();
  return stack;
}

/** Advance n frames with no input. */
function runFrames(stack: Stack, n: number): void {
  for (let i = 0; i < n; i++) stack.run();
}

export async function startingStateFillsTheBottomAndLeavesTheTopClear(): Promise<void> {
  const stack = makeStack();

  let filled = 0;
  for (let row = 1; row <= stack.height; row++) {
    for (let col = 1; col <= stack.width; col++) {
      if (stack.panels[row][col].color !== 0) filled += 1;
    }
  }

  assert.ok(filled > 0, 'the board is not empty');
  for (let col = 1; col <= stack.width; col++) {
    assert.strictEqual(
      stack.panels[stack.height][col].color, 0,
      'the top row starts clear, or the game would begin topped out',
    );
  }
  assert.strictEqual(stack.isToppedOut(), false);
}

/**
 * The stack rises in SIXTEENTHS of a row. A row is only committed when
 * displacement reaches 0, and the timer that drives it accumulates a fractional
 * number of frames per sixteenth - which is why the speed table is not rounded.
 */
export async function theStackRisesInSixteenthsAndCommitsARow(): Promise<void> {
  const stack = makeStack();
  stack.speed = 99; // 47/16 frames per sixteenth: the fastest the table goes
  stack.riseTimer = SPEED_TO_RISE_TIME[99];

  let rows = 0;
  let displacementAtCommit = -1;
  stack.onNewRow = () => {
    rows += 1;
    if (rows === 1) displacementAtCommit = stack.displacement;
  };

  const startDisplacement = stack.displacement;
  runFrames(stack, 10);
  assert.ok(stack.displacement < startDisplacement, 'the stack has begun to rise');

  runFrames(stack, 60);
  assert.strictEqual(rows, 1, 'a full row committed after about 47 frames');
  assert.strictEqual(displacementAtCommit, 16, 'displacement reset to a full row on commit');
  assert.ok(stack.displacement < 16, 'and immediately began rising towards the next');
}

/** Nothing rises while panels are still resolving. */
export async function riseIsLockedWhilePanelsAreActive(): Promise<void> {
  const stack = makeStack();
  stack.speed = 99;

  // Something that stays active for the whole window. A swap would not do:
  // it finishes in four frames and the lock would correctly release.
  stack.panels[2][2].color = 1;
  stack.panels[2][2].state = 'matched';
  stack.panels[2][2].timer = 500;
  stack.nActivePanels = 1;

  const before = stack.displacement;
  runFrames(stack, 30);
  assert.strictEqual(stack.displacement, before, 'the stack held still');
  assert.strictEqual(stack.riseLock, true);
}

/**
 * Stop time is the reward for a match, and it does not begin until PRE-stop
 * time - the clear animation - has finished. Neither ticks the other down.
 */
export async function preStopRunsOutBeforeStopTimeBegins(): Promise<void> {
  const stack = makeStack();
  stack.preStopTime = 5;
  stack.stopTime = 10;

  runFrames(stack, 5);
  assert.strictEqual(stack.preStopTime, 0);
  assert.strictEqual(stack.stopTime, 10, 'stop time is untouched while pre-stop remains');

  runFrames(stack, 4);
  assert.strictEqual(stack.stopTime, 6, 'and only then starts counting down');
}

export async function stopTimeHoldsTheStackStill(): Promise<void> {
  const stack = makeStack();
  stack.speed = 99;
  stack.stopTime = 100;

  const before = stack.displacement;
  runFrames(stack, 40);
  assert.strictEqual(stack.displacement, before, 'no rise while stop time remains');
}

/**
 * Pushing the stack up throws away every frame of stop time you were owed.
 * This is the trade the game asks for: rush now, lose the reward.
 */
export async function manualRaiseDumpsAllStopTime(): Promise<void> {
  const stack = makeStack();
  stack.stopTime = 200;
  stack.manualRaise = true;

  stack.run();

  assert.strictEqual(stack.stopTime, 0, 'a manual raise dumps the reward');
  assert.ok(stack.displacement < 16, 'and the stack moved');
}

/**
 * A swap is queued on the frame it is asked for and executes at the start of
 * the NEXT frame, before matching. Nothing on the board may change on the input
 * frame itself.
 */
export async function aSwapExecutesOnTheFollowingFrame(): Promise<void> {
  const stack = makeStack();
  runFrames(stack, 2); // swapping is refused while clock <= 1

  stack.curRow = 1;
  stack.curCol = 1;
  const leftColorBefore = stack.panels[1][1].color;
  const rightColorBefore = stack.panels[1][2].color;

  stack.swapThisFrame = true;
  stack.run();

  assert.strictEqual(stack.panels[1][1].color, leftColorBefore, 'nothing moved on the input frame');
  assert.ok(stack.swapQueued(), 'but the swap is queued');

  stack.run();
  assert.strictEqual(stack.panels[1][1].color, rightColorBefore, 'and executes on the next frame');
  assert.strictEqual(stack.panels[1][1].state, 'swapping');
}

export async function aQueuedSwapLocksTheRise(): Promise<void> {
  const stack = makeStack();
  runFrames(stack, 2);
  stack.curRow = 1;
  stack.curCol = 1;
  stack.swapThisFrame = true;
  stack.run();

  assert.ok(stack.swapQueued());
  stack.run();
  assert.strictEqual(stack.riseLock, true, 'a queued swap is one guaranteed frame of no rise');
}

export async function twoEmptyCellsCannotBeSwapped(): Promise<void> {
  const stack = makeStack();
  runFrames(stack, 2);

  const a = stack.panels[stack.height][1];
  const b = stack.panels[stack.height][2];
  a.color = 0;
  b.color = 0;
  assert.strictEqual(stack.canSwap(a, b), false);

  b.color = 1;
  assert.strictEqual(stack.canSwap(a, b), true, 'one empty side is fine');
}

export async function aHoveringPanelAboveBlocksTheSwap(): Promise<void> {
  const stack = makeStack();
  runFrames(stack, 2);

  const a = stack.panels[2][1];
  const b = stack.panels[2][2];
  a.color = 1;
  b.color = 2;
  a.state = 'normal';
  b.state = 'normal';
  assert.strictEqual(stack.canSwap(a, b), true);

  stack.panels[3][1].state = 'hovering';
  assert.strictEqual(stack.canSwap(a, b), false, 'nothing above the cursor may be hovering');
}

/**
 * Swapping a panel over a gap commits the board to it falling, so the swap
 * cannot be taken back on the next frame.
 */
export async function aSwapOverAGapCannotBeTakenBack(): Promise<void> {
  const stack = makeStack();
  runFrames(stack, 2);

  // Clear a hole under column 2 at row 3, and put a panel at [3][1].
  stack.panels[2][2].color = 0;
  stack.panels[3][1].color = 1;
  stack.panels[3][1].state = 'normal';
  stack.panels[3][2].color = 0;
  stack.panels[3][2].state = 'normal';

  stack.swap(3, 1);

  const movedRight = stack.panels[3][2];
  assert.strictEqual(movedRight.color, 1, 'the panel is now over the hole');
  assert.strictEqual(movedRight.dontSwap, true, 'and is flagged as uncancellable');
}

export async function speedIncreasesOnTheFifteenSecondInterval(): Promise<void> {
  const stack = makeStack(getModern(1)); // TIME_INTERVAL mode, starts at speed 1
  assert.strictEqual(stack.speed, 1);
  assert.strictEqual(stack.nextSpeedIncreaseClock, DT_SPEED_INCREASE);

  runFrames(stack, DT_SPEED_INCREASE + 1);
  assert.strictEqual(stack.speed, 2, 'one step up after fifteen seconds');
  assert.strictEqual(stack.nextSpeedIncreaseClock, DT_SPEED_INCREASE * 2);
}

/**
 * Being topped out drains health once per frame, and only the automatic rise
 * does it. At modern level 10 health is 1, so death is immediate.
 */
export async function beingToppedOutDrainsHealthAndEndsTheGame(): Promise<void> {
  const stack = makeStack(getModern(10));
  assert.strictEqual(stack.health, 1, 'modern 10 has one point of health');

  for (let col = 1; col <= stack.width; col++) {
    stack.panels[stack.height][col].color = 1;
    stack.panels[stack.height][col].state = 'normal';
  }
  assert.strictEqual(stack.isToppedOut(), true);

  runFrames(stack, 3);
  assert.ok(stack.gameEnded(), 'the game is over');
  assert.ok(stack.gameOverClock >= 0);
}

export async function healthRefillsWhenTheStackIsNoLongerToppedOut(): Promise<void> {
  const stack = makeStack(getModern(1)); // 121 health
  for (let col = 1; col <= stack.width; col++) {
    stack.panels[stack.height][col].color = 1;
    stack.panels[stack.height][col].state = 'normal';
  }

  runFrames(stack, 5);
  assert.ok(stack.health < 121, 'health drained while topped out');

  for (let col = 1; col <= stack.width; col++) stack.panels[stack.height][col].color = 0;
  runFrames(stack, 2);
  assert.strictEqual(stack.health, 121, 'and refills once the top row is clear again');
}

export async function poppingPanelsScoresTenEach(): Promise<void> {
  const stack = makeStack();
  const before = stack.score;
  // Drive a panel through its pop directly; the stack's callback does the score.
  const panel = stack.panels[1][1];
  panel.color = 1;
  panel.match(false, 1, 1);
  for (let i = 0; i < 200 && stack.score === before; i++) panel.update(stack.panels);
  assert.strictEqual(stack.score, before + 10, 'ten points for one popped panel');
}

export async function theCursorStaysOnTheBoard(): Promise<void> {
  const stack = makeStack();
  stack.curCol = 1;
  stack.applyCursorDirection('left');
  assert.strictEqual(stack.curCol, 1, 'cannot leave the left edge');

  stack.curCol = stack.width - 1;
  stack.applyCursorDirection('right');
  assert.strictEqual(
    stack.curCol, stack.width - 1,
    'the cursor spans two cells, so it stops one short of the right edge',
  );

  stack.curRow = 1;
  stack.applyCursorDirection('down');
  assert.strictEqual(stack.curRow, 1, 'cannot leave the bottom');
}
