/**
 * The solo modes and the result they report.
 *
 * Endless and Time Attack end for opposite reasons, and the difference matters
 * to the leaderboard: topping out in Endless is a loss, while running out of
 * clock in Time Attack is a COMPLETED game with a score that stands.
 */

import assert from 'assert';
import { Stack } from '../../core/panels/stack';
import { GeneratorSource } from '../../core/panels/generator-source';
import { getClassicEndless } from '../../core/panels/level-data';
import { TIME_ATTACK_FRAMES } from '../../core/panels/consts';
import { buildPanelsResult } from '../../core/panels/score-report';

/**
 * `stillStack` turns the automatic rise OFF.
 *
 * Not a convenience: left rising, an unattended board tops out in well under
 * two minutes, so a timed test would end by DEATH and never exercise the clock
 * at all. That is what the first version of these tests did, and it failed for
 * the right reason.
 */
function makeStack(timeLimit?: number, stillStack = false): Stack {
  const stack = new Stack({
    levelData: getClassicEndless('normal'),
    panelSource: new GeneratorSource(20260903, true),
    timeLimit,
    behaviours: stillStack ? { passiveRaise: false, allowManualRaise: false } : undefined,
  });
  stack.startingState();
  return stack;
}

export async function timeAttackIsTwoMinutesOfFrames(): Promise<void> {
  assert.strictEqual(TIME_ATTACK_FRAMES, 7200, '120 seconds at 60 frames a second');
}

export async function timeAttackEndsWhenTheClockRunsOut(): Promise<void> {
  const stack = makeStack(TIME_ATTACK_FRAMES, true);

  // Run past the limit; with the rise off, nothing else can end this game.
  for (let i = 0; i < TIME_ATTACK_FRAMES + 10 && !stack.gameEnded(); i++) stack.run();

  assert.ok(stack.gameEnded(), 'the game ended');
  assert.ok(stack.ranOutOfTime, 'and it ended on the clock');
  assert.strictEqual(stack.stopWatch, TIME_ATTACK_FRAMES, 'exactly at the limit');
}

export async function endlessRunsPastTwoMinutes(): Promise<void> {
  const stack = makeStack(undefined, true);
  assert.strictEqual(stack.timeLimit, null, 'no limit at all');

  for (let i = 0; i < TIME_ATTACK_FRAMES + 100 && !stack.gameEnded(); i++) stack.run();

  assert.ok(!stack.ranOutOfTime, 'endless never ends on the clock');
  assert.ok(!stack.gameEnded(), 'and with the rise off it simply keeps going');
}

/**
 * Running out of clock in Time Attack is a COMPLETED game. Topping out in
 * Endless is not, and the leaderboard shows the difference.
 */
export async function onlyTimeAttackReportsACompletedGame(): Promise<void> {
  const timed = makeStack(TIME_ATTACK_FRAMES, true);
  for (let i = 0; i < TIME_ATTACK_FRAMES + 10 && !timed.gameEnded(); i++) timed.run();
  assert.strictEqual(buildPanelsResult(timed, 'timeattack').completed, true);

  const endless = makeStack();
  assert.strictEqual(
    buildPanelsResult(endless, 'endless').completed, false,
    'endless is survived, never completed',
  );
}

/**
 * The Tetris-shaped fields have no panel equivalent and report zero rather than
 * a strained analogy: a leaderboard claiming a Panel de Pon game scored four
 * T-spins is worse than one that says none.
 */
export async function theResultReportsPanelNumbersNotTetrisOnes(): Promise<void> {
  const stack = makeStack();
  for (let i = 0; i < 600; i++) stack.run();

  const result = buildPanelsResult(stack, 'endless');

  assert.strictEqual(result.mode, 'tetris_attack');
  assert.strictEqual(result.score, stack.score);
  assert.strictEqual(result.level, stack.speed, 'level is the stack SPEED, 1 to 99');
  assert.strictEqual(result.lines, stack.panelsCleared, 'lines are panels cleared');
  assert.strictEqual(result.grade, '', 'Panel de Pon has no grading system');

  assert.strictEqual(result.tetrisCount, 0);
  assert.strictEqual(result.tSpinCount, 0);
  assert.strictEqual(result.perfectClears, 0);
}

export async function theReportedTimeIsMillisecondsOfPlay(): Promise<void> {
  const stack = makeStack();
  for (let i = 0; i < 600; i++) stack.run();

  const result = buildPanelsResult(stack, 'endless');
  assert.strictEqual(
    result.time, Math.round((stack.stopWatch / 60) * 1000),
    'frames at 60Hz, converted once',
  );
  assert.ok((result.time ?? 0) > 0);
}
