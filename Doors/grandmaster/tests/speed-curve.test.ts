/**
 * Master mode timing curve vs HeborisCE speed.c.
 *
 * MASTER_SPEED_CURVE's header claimed "Based on TGM3 timing data from
 * HeborisCE speed.c" but the are/arelinelock/das/lockDelay columns were
 * taken from the wrong end of the table: the curve opened at level 0 with
 * the values speed.c holds from level 500 (are:25/arelinelock:29/das:10),
 * instead of the true opening values (speed.c:86-89), and then tightened
 * to are:14/arelinelock:6 at level 500 - a pair Heboris doesn't reach
 * until level 800 (speed.c:101,106, column index 6 of the 500+ tables).
 *
 * Reference: Documentation/7-Reference Sources/HeborisCE-1.1.0/src/game/speed.c
 */

import assert from 'assert';
import { MASTER_SPEED_CURVE, getSpeedParams } from '../core/gravity';

export async function theCurveStartsWhereHeborisStartsIt(): Promise<void> {
  // speed.c:86-89 - Master mode initial values, held until level 500.
  const params = getSpeedParams(0, 'master');
  assert.strictEqual(params.are, 26, `level 0 are should be 26 (speed.c:86 wait1_master_half), got ${params.are}`);
  assert.strictEqual(params.arelinelock, 40, `level 0 arelinelock should be 40 (speed.c:87 wait2_master_half), got ${params.arelinelock}`);
  assert.strictEqual(params.lockDelay, 28, `level 0 lockDelay should be 28 (speed.c:88 wait3_master_half), got ${params.lockDelay}`);
  assert.strictEqual(params.das, 15, `level 0 das should be 15 (speed.c:89 waitt_master_half), got ${params.das}`);
}

export async function theInitialValuesHoldUntilLevel500(): Promise<void> {
  // speed.c:86-89 apply unchanged for every level below 500 - confirmed by
  // sampling a level just under the breakpoint, not just level 0.
  const params = getSpeedParams(499, 'master');
  assert.strictEqual(params.are, 26);
  assert.strictEqual(params.arelinelock, 40);
  assert.strictEqual(params.lockDelay, 28);
  assert.strictEqual(params.das, 15);
}

export async function level500MatchesTheFirstTableColumn(): Promise<void> {
  // speed.c:100-116, column "500" (index 0 of the *_master_tbl arrays).
  const params = getSpeedParams(500, 'master');
  assert.strictEqual(params.are, 25, `level 500 are should be 25 (speed.c:101 wait1_master_tbl[0]), got ${params.are}`);
  assert.strictEqual(params.arelinelock, 29, `level 500 arelinelock should be 29 (speed.c:106 wait2_master_tbl[0]), got ${params.arelinelock}`);
  assert.strictEqual(params.lockDelay, 28, `level 500 lockDelay should be 28 (speed.c:111 wait3_master_tbl[0]), got ${params.lockDelay}`);
  assert.strictEqual(params.das, 10, `level 500 das should be 10 (speed.c:116 waitt_master_tbl[0]), got ${params.das}`);
}

export async function are14ArrivesAt800NotAt500(): Promise<void> {
  // The regression this test exists to catch: the old curve opened with
  // are:14/arelinelock:6 at level 500. speed.c:101/106 column index 6
  // (level 800) is where those values actually first appear.
  const at500 = getSpeedParams(500, 'master');
  assert.notStrictEqual(at500.are, 14, 'level 500 must not already carry the level-800 are value');
  assert.notStrictEqual(at500.arelinelock, 6, 'level 500 must not already carry the level-800 arelinelock value');

  const at799 = getSpeedParams(799, 'master');
  assert.strictEqual(at799.are, 19, `level 799 are should still be 19 (speed.c:101, column "700"), got ${at799.are}`);

  const at800 = getSpeedParams(800, 'master');
  assert.strictEqual(at800.are, 14, `level 800 are should be 14 (speed.c:101 wait1_master_tbl[6], column "800"), got ${at800.are}`);
  assert.strictEqual(at800.arelinelock, 6, `level 800 arelinelock should be 6 (speed.c:106 wait2_master_tbl[6]), got ${at800.arelinelock}`);
}

export async function theCurveReachesTheFinalTableColumn(): Promise<void> {
  // speed.c:101,106,111,116 - last column, index 27, level "1850".
  const params = getSpeedParams(1850, 'master');
  assert.strictEqual(params.are, 2, `level 1850 are should be 2 (speed.c:101 wait1_master_tbl[27]), got ${params.are}`);
  assert.strictEqual(params.arelinelock, 1, `level 1850 arelinelock should be 1 (speed.c:106 wait2_master_tbl[27]), got ${params.arelinelock}`);
  assert.strictEqual(params.lockDelay, 9, `level 1850 lockDelay should be 9 (speed.c:111 wait3_master_tbl[27]), got ${params.lockDelay}`);
  assert.strictEqual(params.das, 6, `level 1850 das should be 6 (speed.c:116 waitt_master_tbl[27]), got ${params.das}`);
}

export async function everyBreakpointCitesAKnownTableValue(): Promise<void> {
  // Every are/arelinelock/das/lockDelay breakpoint at or above level 500
  // must equal one of the values that actually appears in speed.c's
  // wait1/2/3/t_master_tbl arrays (speed.c:99-117) - guards against a
  // future edit reintroducing an interpolated or invented number.
  const wait1 = new Set([25, 19, 14, 8, 7, 6, 5, 4, 3, 2]);
  const wait2 = new Set([29, 19, 9, 6, 4, 3, 1]);
  const wait3 = new Set([28, 18, 16, 15, 14, 12, 11, 10, 9]);
  const waitt = new Set([10, 9, 8, 7, 6]);

  for (const entry of MASTER_SPEED_CURVE) {
    if (entry.level < 500) continue;
    assert.ok(wait1.has(entry.are), `level ${entry.level} are=${entry.are} is not a value from wait1_master_tbl`);
    assert.ok(wait2.has(entry.arelinelock), `level ${entry.level} arelinelock=${entry.arelinelock} is not a value from wait2_master_tbl`);
    assert.ok(wait3.has(entry.lockDelay), `level ${entry.level} lockDelay=${entry.lockDelay} is not a value from wait3_master_tbl`);
    assert.ok(waitt.has(entry.das), `level ${entry.level} das=${entry.das} is not a value from waitt_master_tbl`);
  }
}
