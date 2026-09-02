/**
 * MISSION mode - the judge, and the pack loader.
 *
 * HeborisCE's missions are DATA (mission.c:47-171 loads packs of thirty), so
 * the two things worth pinning hardest are: every objective counts the thing
 * it says it counts, and a pack that would produce an unplayable mission is
 * refused at load rather than at play.
 */

import assert from 'assert';
import { MissionRun, type LockEvent } from '../core/mission-run';
import { parseMissionPack, MissionPackError } from '../core/mission-pack';
import type { Mission, MissionObjective } from '../core/mission-types';

function mission(objective: MissionObjective, over: Partial<Mission> = {}): Mission {
  return {
    id: 't1', name: 'TEST', objective, norm: 3,
    timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    ...over,
  };
}

function lock(over: Partial<LockEvent> = {}): LockEvent {
  return { lineCount: 0, tSpin: false, allClear: false, combo: 0, piecesPlaced: 1, level: 0, ...over };
}

export async function linesCountEveryLineAndTheOthersCountEvents(): Promise<void> {
  const lines = new MissionRun(mission('lines', { norm: 5 }));
  lines.onLock(lock({ lineCount: 2 }));
  assert.strictEqual(lines.getProgress().current, 2, 'lines counts LINES');
  lines.onLock(lock({ lineCount: 3 }));
  assert.strictEqual(lines.getProgress().outcome, 'cleared');

  const doubles = new MissionRun(mission('double', { norm: 2 }));
  doubles.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(doubles.getProgress().current, 0, 'a tetris is not a double');
  doubles.onLock(lock({ lineCount: 2 }));
  doubles.onLock(lock({ lineCount: 2 }));
  assert.strictEqual(doubles.getProgress().outcome, 'cleared', 'two doubles clear it');
}

export async function cycleWantsOneOfEachClearSize(): Promise<void> {
  // mission_info_en[5]: "Do cycle! (all kinds of line erase)".
  const run = new MissionRun(mission('cycle'));
  for (const lineCount of [1, 1, 2, 3]) run.onLock(lock({ lineCount }));
  assert.strictEqual(run.getProgress().current, 3, 'repeats do not count twice');
  assert.strictEqual(run.getProgress().outcome, 'playing');

  run.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(run.getProgress().outcome, 'cleared', 'all four sizes seen');
}

export async function tSpinObjectivesWantARealTSpin(): Promise<void> {
  const tspin = new MissionRun(mission('tspin', { norm: 2 }));
  tspin.onLock(lock({ lineCount: 2, tSpin: false }));
  assert.strictEqual(tspin.getProgress().current, 0, 'a plain double is not a T-spin');
  tspin.onLock(lock({ lineCount: 1, tSpin: true }));
  tspin.onLock(lock({ lineCount: 2, tSpin: true }));
  assert.strictEqual(tspin.getProgress().outcome, 'cleared');

  const tsd = new MissionRun(mission('tspinDouble', { norm: 1 }));
  tsd.onLock(lock({ lineCount: 1, tSpin: true }));
  assert.strictEqual(tsd.getProgress().current, 0, 'a T-spin single is not a T-spin double');
  tsd.onLock(lock({ lineCount: 2, tSpin: true }));
  assert.strictEqual(tsd.getProgress().outcome, 'cleared');
}

export async function b2bTetrisIsResetByASmallerClear(): Promise<void> {
  // mission_info_en[28]: "Erase 4 lines at once %d times! Do not erase 3 or
  // less lines!" - the smaller clear resets the count, it does not merely
  // fail to add to it.
  const run = new MissionRun(mission('b2bTetris', { norm: 3 }));
  run.onLock(lock({ lineCount: 4 }));
  run.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(run.getProgress().current, 2);

  run.onLock(lock({ lineCount: 1 }));
  assert.strictEqual(run.getProgress().current, 0, 'a single wipes the chain');

  run.onLock(lock({ lineCount: 0 }));
  assert.strictEqual(run.getProgress().current, 0, 'a lock with no clear is harmless');

  for (let i = 0; i < 3; i++) run.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(run.getProgress().outcome, 'cleared');
}

export async function comboTakesTheBestAndPiecesAndLevelTakeTheLatest(): Promise<void> {
  const combo = new MissionRun(mission('combo', { norm: 4 }));
  combo.onLock(lock({ combo: 4 }));
  combo.onLock(lock({ combo: 0 }));
  assert.strictEqual(combo.getProgress().current, 4, 'the best combo stands');
  assert.strictEqual(combo.getProgress().outcome, 'cleared');

  const pieces = new MissionRun(mission('pieces', { norm: 10 }));
  pieces.onLock(lock({ piecesPlaced: 9 }));
  assert.strictEqual(pieces.getProgress().outcome, 'playing');
  pieces.onLock(lock({ piecesPlaced: 10 }));
  assert.strictEqual(pieces.getProgress().outcome, 'cleared');

  const level = new MissionRun(mission('level', { norm: 100 }));
  level.onLock(lock({ level: 99 }));
  assert.strictEqual(level.getProgress().outcome, 'playing');
  level.onLock(lock({ level: 100 }));
  assert.strictEqual(level.getProgress().outcome, 'cleared');
}

export async function allClearCountsAnEmptiedBoard(): Promise<void> {
  const run = new MissionRun(mission('allClear', { norm: 1 }));
  run.onLock(lock({ lineCount: 4, allClear: false }));
  assert.strictEqual(run.getProgress().outcome, 'playing');
  run.onLock(lock({ lineCount: 2, allClear: true }));
  assert.strictEqual(run.getProgress().outcome, 'cleared');
}

export async function theClockClearsSurviveAndFailsEverythingElse(): Promise<void> {
  const survive = new MissionRun(mission('survive', { norm: 0, timeLimitSeconds: 60 }));
  survive.onTime(59);
  assert.strictEqual(survive.getProgress().outcome, 'playing');
  survive.onTime(60);
  assert.strictEqual(survive.getProgress().outcome, 'cleared', 'outlasting the clock IS the mission');

  const timed = new MissionRun(mission('lines', { norm: 20, timeLimitSeconds: 60 }));
  timed.onTime(60);
  const progress = timed.getProgress();
  assert.strictEqual(progress.outcome, 'failed');
  assert.strictEqual(progress.failure, 'out of time');

  const untimed = new MissionRun(mission('lines', { norm: 20, timeLimitSeconds: 0 }));
  untimed.onTime(9999);
  assert.strictEqual(untimed.getProgress().outcome, 'playing', 'no clock, no deadline');
}

export async function toppingOutFailsEvenASurviveMission(): Promise<void> {
  const run = new MissionRun(mission('survive', { norm: 0, timeLimitSeconds: 60 }));
  run.onTopOut();
  assert.strictEqual(run.getProgress().outcome, 'failed');
  assert.strictEqual(run.getProgress().failure, 'topped out');

  // And a decided mission does not change its mind.
  const cleared = new MissionRun(mission('lines', { norm: 1 }));
  cleared.onLock(lock({ lineCount: 1 }));
  cleared.onTopOut();
  assert.strictEqual(cleared.getProgress().outcome, 'cleared', 'a cleared mission stays cleared');
}

// ---------------------------------------------------------------------------
// The pack loader
// ---------------------------------------------------------------------------

export async function aPackIsReadWithItsDefaults(): Promise<void> {
  const pack = parseMissionPack({
    name: 'STARTER',
    missions: [{ objective: 'lines', norm: 5, name: 'FIRST BLOOD' }],
  });

  assert.strictEqual(pack.name, 'STARTER');
  assert.strictEqual(pack.missions.length, 1);
  const [m] = pack.missions;
  assert.strictEqual(m.id, '01', 'an id is derived from the position');
  assert.strictEqual(m.name, 'FIRST BLOOD');
  assert.strictEqual(m.timeLimitSeconds, 0, 'no clock unless the pack asks for one');
  assert.strictEqual(m.startLevel, 0);
  assert.strictEqual(m.garbageRows, 0);
  assert.deepStrictEqual(m.modifiers, { big: false, hidden: undefined, hideNext: false, rollRoll: false });
}

export async function aPackWithAnUnjudgeableObjectiveIsRefused(): Promise<void> {
  // The reference has 42 objective types; this engine can judge fourteen of
  // them. A pack asking for one of the others is not a mission that plays
  // oddly - it is one that can never be completed.
  assert.throws(
    () => parseMissionPack({ missions: [{ objective: 'goldSquare', norm: 1 }] }, 'pack.json'),
    (error: Error) => error instanceof MissionPackError && /goldSquare/.test(error.message)
      && /pack.json #1/.test(error.message)
  );
}

export async function aPackThatCannotBePlayedIsRefusedAtLoad(): Promise<void> {
  const bad: [string, unknown][] = [
    ['not an object', 42],
    ['no missions', { name: 'x' }],
    ['empty missions', { missions: [] }],
    ['survive with no clock', { missions: [{ objective: 'survive' }] }],
    ['norm of zero', { missions: [{ objective: 'lines', norm: 0 }] }],
    ['negative garbage', { missions: [{ objective: 'lines', norm: 1, garbageRows: -3 }] }],
    ['fractional level', { missions: [{ objective: 'lines', norm: 1, startLevel: 1.5 }] }],
    ['bad hidden mode', { missions: [{ objective: 'lines', norm: 1, modifiers: { hidden: 'SOMETIMES' } }] }],
    ['duplicate ids', { missions: [
      { id: 'a', objective: 'lines', norm: 1 },
      { id: 'a', objective: 'lines', norm: 1 },
    ] }],
  ];

  for (const [what, raw] of bad) {
    assert.throws(() => parseMissionPack(raw), MissionPackError, `${what} must be refused`);
  }
}

export async function theHudLineSaysWhatToDoAndHowFarAlong(): Promise<void> {
  const run = new MissionRun(mission('tetris', { norm: 3 }));
  run.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(run.describe(), 'TETRIS 3  1/3');

  const survive = new MissionRun(mission('survive', { norm: 0, timeLimitSeconds: 90 }));
  survive.onTime(30);
  assert.strictEqual(survive.describe(), 'SURVIVE 90s  30/90');
}
