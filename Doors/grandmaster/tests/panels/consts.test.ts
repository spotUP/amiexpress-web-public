/**
 * The lookup tables, checked against their sources.
 *
 * These are pure-function oracles: no RNG, no engine, no timing. If one of
 * these fails, a constant was mistyped, and a mistyped constant is the kind of
 * defect that produces a game which plays almost right and is wrong forever.
 *
 * Three of the tables here have INDEPENDENT corroboration, which is worth
 * recording because it is rare:
 *
 *  - shakeFramesForGarbageSize mirrors upstream's own testShakeFrames.
 *  - SCORE_COMBO_TA and SCORE_CHAIN_TA are identical, value for value, to the
 *    tables in tzwaan/tetris-attack-js (objects.js:680-738) - a JavaScript
 *    reimplementation written in 2017 with no knowledge of panel-attack's
 *    source. Two independent transcriptions agreeing is as close to the SNES
 *    tables as we can get without a disassembly.
 *  - The combo-to-garbage table for sizes 4-11 is corroborated by panel-pop
 *    (VsGame.cpp handleGarbageSpawning), which agrees exactly.
 */

import assert from 'assert';
import {
  shakeFramesForGarbageSize,
  comboGarbageFor,
  SCORE_COMBO_TA,
  SCORE_CHAIN_TA,
  SPEED_TO_RISE_TIME,
  PANELS_TO_NEXT_SPEED,
  DISPLACEMENT_PER_ROW,
  STAGING_DURATION,
  GARBAGE_DELAY_LAND_TIME,
  MAX_LAG,
  MAX_CHAIN_GARBAGE_HEIGHT,
  TIME_ATTACK_FRAMES,
  DT_SPEED_INCREASE,
} from '../../core/panels/consts';

export async function shakeFramesMatchTheGarbageSizeTable(): Promise<void> {
  // The four bands of the table, at the garbage sizes the game actually sends.
  assert.strictEqual(shakeFramesForGarbageSize(3, 1), 18, '3-wide combo garbage');
  assert.strictEqual(shakeFramesForGarbageSize(4, 1), 18, '4-wide');
  assert.strictEqual(shakeFramesForGarbageSize(5, 1), 24, '5-wide crosses into 24');
  assert.strictEqual(shakeFramesForGarbageSize(6, 1), 42, '6-wide crosses into 42');
  assert.strictEqual(shakeFramesForGarbageSize(6, 2), 66, '12 panels crosses into 66');
  assert.strictEqual(shakeFramesForGarbageSize(6, 4), 76, '24 panels is the last entry');
  // Anything larger clamps to the final entry rather than running off the table.
  assert.strictEqual(shakeFramesForGarbageSize(6, 12), 76, 'a full-height chain block clamps');
}

export async function shakeFramesRejectsEmptyGarbage(): Promise<void> {
  assert.throws(() => shakeFramesForGarbageSize(6, 0), /shake time/);
  assert.throws(() => shakeFramesForGarbageSize(6, -1), /shake time/);
}

export async function comboGarbageMatchesTheTable(): Promise<void> {
  assert.deepStrictEqual(comboGarbageFor(3), [], 'a plain match sends nothing');
  assert.deepStrictEqual(comboGarbageFor(4), [3]);
  assert.deepStrictEqual(comboGarbageFor(5), [4]);
  assert.deepStrictEqual(comboGarbageFor(6), [5]);
  assert.deepStrictEqual(comboGarbageFor(7), [6]);
  assert.deepStrictEqual(comboGarbageFor(8), [3, 4]);
  assert.deepStrictEqual(comboGarbageFor(9), [4, 4]);
  assert.deepStrictEqual(comboGarbageFor(10), [5, 5]);
  assert.deepStrictEqual(comboGarbageFor(11), [5, 6]);
  assert.deepStrictEqual(comboGarbageFor(12), [6, 6]);
  assert.deepStrictEqual(comboGarbageFor(13), [6, 6, 6]);
}

/**
 * Upstream declares entries only at 4-14, 20 and 27, then carries each forward
 * to fill the gaps. The carry is easy to omit and would silently under-send.
 */
export async function comboGarbageCarriesForwardIntoTheGaps(): Promise<void> {
  assert.deepStrictEqual(comboGarbageFor(14), [6, 6, 6, 6]);
  assert.deepStrictEqual(comboGarbageFor(15), [6, 6, 6, 6], '15-19 carry 14 forward');
  assert.deepStrictEqual(comboGarbageFor(19), [6, 6, 6, 6]);
  assert.deepStrictEqual(comboGarbageFor(20), [6, 6, 6, 6, 6, 6]);
  assert.deepStrictEqual(comboGarbageFor(26), [6, 6, 6, 6, 6, 6], '21-26 carry 20 forward');
  assert.deepStrictEqual(comboGarbageFor(27), [6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepStrictEqual(comboGarbageFor(72), [6, 6, 6, 6, 6, 6, 6, 6], 'the table ends at 72');
}

export async function scoreTablesMatchBothIndependentSources(): Promise<void> {
  // Combo scores. Nothing below 4.
  assert.strictEqual(SCORE_COMBO_TA[3], 0);
  assert.strictEqual(SCORE_COMBO_TA[4], 20);
  assert.strictEqual(SCORE_COMBO_TA[5], 30);
  assert.strictEqual(SCORE_COMBO_TA[6], 50);
  assert.strictEqual(SCORE_COMBO_TA[7], 60);
  assert.strictEqual(SCORE_COMBO_TA[8], 70);
  assert.strictEqual(SCORE_COMBO_TA[9], 80);
  assert.strictEqual(SCORE_COMBO_TA[10], 100);
  assert.strictEqual(SCORE_COMBO_TA[11], 140);
  assert.strictEqual(SCORE_COMBO_TA[12], 170);
  assert.strictEqual(SCORE_COMBO_TA[30], 1330, 'the table runs to 30');

  // Chain scores. There is no chain 1; the counter starts at 2.
  assert.strictEqual(SCORE_CHAIN_TA[2], 50);
  assert.strictEqual(SCORE_CHAIN_TA[3], 80);
  assert.strictEqual(SCORE_CHAIN_TA[4], 150);
  assert.strictEqual(SCORE_CHAIN_TA[5], 300);
  assert.strictEqual(SCORE_CHAIN_TA[13], 1800, 'the highest scoring chain');
  assert.strictEqual(SCORE_CHAIN_TA.length, 14, 'nothing above 13 is in the table');
}

/**
 * The rise table's oddities are load-bearing, and every one of them looks like
 * a typo: speed 2 is SLOWER than speed 1, and 50 through 99 are all identical.
 * Upstream's own comment is "Yes, 2 is slower than 1 and 50..99 are the same."
 */
export async function riseTableKeepsItsDocumentedOddities(): Promise<void> {
  assert.strictEqual(SPEED_TO_RISE_TIME.length, 100, 'index 0 unused, speeds 1-99');
  assert.strictEqual(SPEED_TO_RISE_TIME[1], 942 / DISPLACEMENT_PER_ROW);
  assert.ok(SPEED_TO_RISE_TIME[2] > SPEED_TO_RISE_TIME[1], 'speed 2 really is slower than 1');
  assert.strictEqual(SPEED_TO_RISE_TIME[3], 838 / DISPLACEMENT_PER_ROW);
  assert.strictEqual(SPEED_TO_RISE_TIME[50], 47 / DISPLACEMENT_PER_ROW);
  assert.strictEqual(SPEED_TO_RISE_TIME[99], 47 / DISPLACEMENT_PER_ROW, 'the plateau');

  // Fractional, deliberately: the rise timer accumulates these.
  assert.notStrictEqual(
    SPEED_TO_RISE_TIME[1], Math.floor(SPEED_TO_RISE_TIME[1]),
    'rounding here would drift the stack within one game',
  );
}

export async function panelsToNextSpeedMatchesTheTable(): Promise<void> {
  assert.strictEqual(PANELS_TO_NEXT_SPEED[1], 9, 'speed 1 to 2 costs 9 panels');
  assert.strictEqual(PANELS_TO_NEXT_SPEED[2], 12);
  assert.strictEqual(PANELS_TO_NEXT_SPEED[7], 15);
  assert.strictEqual(PANELS_TO_NEXT_SPEED[17], 21, 'the table dips here, and that is correct');
  assert.strictEqual(PANELS_TO_NEXT_SPEED[18], 18);
  assert.strictEqual(PANELS_TO_NEXT_SPEED[41], 45);
  assert.strictEqual(PANELS_TO_NEXT_SPEED[99], Infinity, 'speed 99 is the end of the ladder');
}

export async function garbageFlightTimingsAddUp(): Promise<void> {
  assert.strictEqual(STAGING_DURATION, 91, '45 transit + 45 telegraph + upstream\'s +1');
  assert.strictEqual(GARBAGE_DELAY_LAND_TIME, 60);
  assert.strictEqual(
    STAGING_DURATION + GARBAGE_DELAY_LAND_TIME, 151,
    'total frames from earning a piece to it being able to land',
  );
  assert.strictEqual(MAX_LAG, 245);
}

export async function timingConstantsMatchTheirDocumentedValues(): Promise<void> {
  assert.strictEqual(TIME_ATTACK_FRAMES, 7200, 'two minutes at 60fps');
  assert.strictEqual(DT_SPEED_INCREASE, 900, 'fifteen seconds');
  assert.strictEqual(DISPLACEMENT_PER_ROW, 16);
}

/**
 * Our one deliberate divergence from panel-attack, and the reason for it.
 *
 * panel-attack grows chain garbage without limit (height = chain - 1). The SNES
 * original stops at a 12-tall block, per the manual FAQ ("They will always be a
 * x12 garbage block, from x13 on") and per panel-pop, which caps identically.
 * Two sources against one, and this mode is TETRIS ATTACK.
 */
export async function chainGarbageIsCappedLikeTheOriginal(): Promise<void> {
  assert.strictEqual(MAX_CHAIN_GARBAGE_HEIGHT, 12);
  const heightFor = (chain: number) => Math.min(chain - 1, MAX_CHAIN_GARBAGE_HEIGHT);
  assert.strictEqual(heightFor(2), 1, 'the first chain link sends one row');
  assert.strictEqual(heightFor(5), 4);
  assert.strictEqual(heightFor(13), 12, 'chain 13 reaches the cap');
  assert.strictEqual(heightFor(20), 12, 'and nothing above it sends more');
}
