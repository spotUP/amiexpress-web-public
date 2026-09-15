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
  const base: LockEvent = {
    lineCount: 0, tSpin: false, tSpinFull: false,
    allClear: false, combo: 0, comboIgnoringSingles: 0, piecesPlaced: 1, level: 0,
    pieceType: 'I', cameFromHold: false, clearedRows: [],
  };
  const event = { ...base, ...over };
  // A 3-corner T-Spin is a T-Spin: a test that sets one without the other is
  // describing a lock the engine cannot produce.
  if (event.tSpinFull) event.tSpin = true;
  return event;
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
  // mission_info_en[5]: "Do cycle! (all kinds of line erase)". The norm is
  // spelled out here because the judge READS it now - the four is the
  // mission's ask, not a constant in the engine.
  const run = new MissionRun(mission('cycle', { norm: 4 }));
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
  tspin.onLock(lock({ lineCount: 1, tSpinFull: true }));
  tspin.onLock(lock({ lineCount: 2, tSpinFull: true }));
  assert.strictEqual(tspin.getProgress().outcome, 'cleared');

  const tsd = new MissionRun(mission('tspinDouble', { norm: 1 }));
  tsd.onLock(lock({ lineCount: 1, tSpinFull: true }));
  assert.strictEqual(tsd.getProgress().current, 0, 'a T-spin single is not a T-spin double');
  tsd.onLock(lock({ lineCount: 2, tSpinFull: true }));
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
  // Every modifier the loader knows, defaulted off. A new one that forgets
  // its default here is a rule a pack can ask for and the engine will not read.
  assert.deepStrictEqual(m.modifiers, {
    big: false, hidden: undefined, hideNext: false, rollRoll: false,
    rotateLock: false, blind: false, reverse: false, xray: false, mirror: false,
  });
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

/**
 * A MINI is not a T-Spin for a mission.
 *
 * The reference forces `tspin_flag` through the 3-corner check in MISSION
 * mode, so it is 2 or 0 there (`ars.c:545-552`, the `gameMode == 8` clause).
 * The door's LockEvent flattened 'full' and 'mini' into one boolean, so a
 * mini cleared a T-SPIN mission - an objective the arcade would not have
 * given you.
 */
export async function aTSpinMiniDoesNotCountForAMission(): Promise<void> {
  const run = new MissionRun(mission('tspin', { norm: 1 }));
  run.onLock(lock({ lineCount: 1, tSpin: true, tSpinFull: false }));
  assert.strictEqual(run.getProgress().current, 0,
    'a mini is a T-Spin for scoring and NOT for a mission');
  assert.strictEqual(run.getProgress().outcome, 'playing');

  run.onLock(lock({ lineCount: 1, tSpinFull: true }));
  assert.strictEqual(run.getProgress().outcome, 'cleared', 'the 3-corner one counts');
}

/**
 * A T-Spin TRIPLE clears a T-SPIN DOUBLE mission.
 *
 * `mission.c:1101-1103` is `tspin_flag[0] == 2 && lines >= 2`. The door
 * demanded exactly two, which made the harder spin count for nothing.
 */
export async function aTSpinTripleCountsForTheDoubleObjective(): Promise<void> {
  const run = new MissionRun(mission('tspinDouble', { norm: 1 }));
  run.onLock(lock({ lineCount: 3, tSpinFull: true }));
  assert.strictEqual(run.getProgress().outcome, 'cleared',
    'two lines OR MORE - the reference does not punish the bigger spin');
}

/**
 * CYCLE is judged against its own norm.
 *
 * `mission.c:874-879` latches each clear size once and compares the count
 * against `mission_norm`, exactly like every other type. The door hardcoded
 * four, so a pack asking for two sizes was judged as asking for all four -
 * a mission that reads as one thing on the select screen and another in
 * play.
 */
export async function cycleIsJudgedAgainstItsNormNotAlwaysFour(): Promise<void> {
  const run = new MissionRun(mission('cycle', { norm: 2 }));
  assert.strictEqual(run.getProgress().target, 2, 'the target is the norm');
  run.onLock(lock({ lineCount: 1 }));
  run.onLock(lock({ lineCount: 1 }));
  assert.strictEqual(run.getProgress().outcome, 'playing', 'a repeat is not a new size');
  run.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(run.getProgress().outcome, 'cleared', 'two DIFFERENT sizes was the ask');
}

/**
 * And a pack cannot ask for a fifth clear size.
 *
 * There are four. The judge would never reach five, so the mission is
 * unplayable, and an unplayable mission is refused at LOAD - which is the
 * loader's whole job in this door.
 */
export async function aCycleNormAboveFourIsRefused(): Promise<void> {
  const pack = {
    name: 'bad', missions: [{
      id: '01', name: 'FIVE SIZES', objective: 'cycle', norm: 5,
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    }],
  };
  assert.throws(() => parseMissionPack(pack, 'test'), MissionPackError,
    'five clear sizes do not exist');

  // And the form every existing pack is written in still loads: cycle with
  // no norm at all meant "all four" when the judge hardcoded it.
  const old = {
    name: 'ok', missions: [{
      id: '01', name: 'CYCLE', objective: 'cycle',
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    }],
  };
  assert.strictEqual(parseMissionPack(old, 'test').missions[0].norm, 4,
    'an absent cycle norm still means the four sizes');
}

/**
 * The GRADE option: the same judge, counted three ways.
 *
 * `mission_opt_1` on DOUBLE and TRIPLE (`mission.c:841-866`): 0 is exactly N,
 * 1 is N or more, 2 is exactly N with any other clear throwing the count
 * away. The door only ever had the first.
 */
export async function anExactObjectiveCanBeAskedForThreeWays(): Promise<void> {
  const exact = new MissionRun(mission('double', { norm: 2 }));
  exact.onLock(lock({ lineCount: 3 }));
  assert.strictEqual(exact.getProgress().current, 0, 'a triple is not a double');

  const atLeast = new MissionRun(mission('double', { norm: 2, strictness: 'atLeast' }));
  atLeast.onLock(lock({ lineCount: 3 }));
  atLeast.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(atLeast.getProgress().outcome, 'cleared', 'two lines OR MORE');

  const orReset = new MissionRun(mission('triple', { norm: 2, strictness: 'exactOrReset' }));
  orReset.onLock(lock({ lineCount: 3 }));
  assert.strictEqual(orReset.getProgress().current, 1);
  orReset.onLock(lock({ lineCount: 1 }));
  assert.strictEqual(orReset.getProgress().current, 0, 'any other clear throws it away');
  assert.strictEqual(orReset.getProgress().outcome, 'playing');
}

/**
 * BTOB 4L is that third form, and it still behaves exactly as it did.
 *
 * It used to be a branch of its own; it is now "four lines, exactOrReset",
 * which is the same rule expressed once. The pin is that the BEHAVIOUR did
 * not move - a mission written before this refactor plays the same.
 */
export async function b2bTetrisIsTheExactOrResetFormAndCannotBeSoftened(): Promise<void> {
  const run = new MissionRun(mission('b2bTetris', { norm: 2 }));
  run.onLock(lock({ lineCount: 4 }));
  run.onLock(lock({ lineCount: 2 }));
  assert.strictEqual(run.getProgress().current, 0, 'a double still resets it');
  run.onLock(lock({ lineCount: 4 }));
  run.onLock(lock({ lineCount: 0 }));
  run.onLock(lock({ lineCount: 4 }));
  assert.strictEqual(run.getProgress().outcome, 'cleared',
    'a lock that clears NOTHING does not break the chain');

  // And a pack cannot ask for a soft one: that is a tetris mission.
  const soft = {
    name: 'soft', missions: [{
      id: '01', name: 'SOFT', objective: 'b2bTetris', norm: 2, strictness: 'atLeast',
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    }],
  };
  assert.throws(() => parseMissionPack(soft, 'test'), MissionPackError);
}

/**
 * COMBO's NOT1LINE reads the counter singles do not advance.
 *
 * `combo2` (`gamestart.c:10256`): a clear of two or more advances it, a
 * single leaves it alone, and a lock that clears nothing breaks it like the
 * normal combo. The engine keeps it; the mission chooses which counter it
 * is judged on.
 */
export async function comboCanBeAskedToIgnoreSingles(): Promise<void> {
  const plain = new MissionRun(mission('combo', { norm: 3 }));
  plain.onLock(lock({ lineCount: 1, combo: 3, comboIgnoringSingles: 1 }));
  assert.strictEqual(plain.getProgress().outcome, 'cleared', 'singles count by default');

  const notOne = new MissionRun(mission('combo', { norm: 3, ignoreSingles: true }));
  notOne.onLock(lock({ lineCount: 1, combo: 3, comboIgnoringSingles: 1 }));
  assert.strictEqual(notOne.getProgress().current, 1, 'a single-driven combo does not');
  notOne.onLock(lock({ lineCount: 2, combo: 4, comboIgnoringSingles: 3 }));
  assert.strictEqual(notOne.getProgress().outcome, 'cleared');
}

/** An option on an objective that does not take it is a pack bug, not a no-op. */
export async function anOptionOnTheWrongObjectiveIsRefused(): Promise<void> {
  const packWith = (extra: Record<string, unknown>) => ({
    name: 'x', missions: [{
      id: '01', name: 'X', objective: 'lines', norm: 3,
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {}, ...extra,
    }],
  });
  assert.throws(() => parseMissionPack(packWith({ strictness: 'atLeast' }), 'test'),
    MissionPackError, 'lines counts every line; a grade means nothing to it');
  assert.throws(() => parseMissionPack(packWith({ ignoreSingles: true }), 'test'),
    MissionPackError, 'only COMBO has two counters to choose between');
  assert.throws(() => parseMissionPack(
    { name: 'x', missions: [{ id: '01', name: 'X', objective: 'double', norm: 2,
      strictness: 'sometimes', timeLimitSeconds: 0, startLevel: 0, garbageRows: 0,
      modifiers: {} }] }, 'test'), MissionPackError, 'and the value is checked');
}

/**
 * The ORDER family: the clear has to be made BY the named piece.
 *
 * `mission.c:989-1116`. Five objectives, one question - which piece locked -
 * which the engine knew and the lock event did not carry.
 */
export async function anOrderMissionCountsOnlyTheNamedPiece(): Promise<void> {
  const single = new MissionRun(mission('singleOrder', { norm: 2, requiredPiece: 'T' }));
  single.onLock(lock({ lineCount: 1, pieceType: 'I' }));
  assert.strictEqual(single.getProgress().current, 0, 'the I did not answer the ask');
  single.onLock(lock({ lineCount: 2, pieceType: 'T' }));
  assert.strictEqual(single.getProgress().current, 0, 'and a double is not a single');
  single.onLock(lock({ lineCount: 1, pieceType: 'T' }));
  single.onLock(lock({ lineCount: 1, pieceType: 'T' }));
  assert.strictEqual(single.getProgress().outcome, 'cleared');

  // BLOCKORDER counts LINES, not clears (mission.c:989-1000).
  const block = new MissionRun(mission('blockOrder', { norm: 4, requiredPiece: 'I' }));
  block.onLock(lock({ lineCount: 4, pieceType: 'I' }));
  assert.strictEqual(block.getProgress().outcome, 'cleared', 'four lines in one go');

  // A PAIR: 7 is "L or J", 8 is "S or Z" (mission.c:354-362).
  const pair = new MissionRun(mission('tripleOrder', { norm: 2, requiredPiece: 'LJ' }));
  pair.onLock(lock({ lineCount: 3, pieceType: 'L' }));
  pair.onLock(lock({ lineCount: 3, pieceType: 'J' }));
  assert.strictEqual(pair.getProgress().outcome, 'cleared', 'either of the pair');
}

/**
 * RE TRIPLE ORDER is the one that counts everything EXCEPT the named piece -
 * and with a pair named, the reference counts every triple instead
 * (mission.c:1044-1048).
 */
export async function reTripleOrderCountsEverythingButThePiece(): Promise<void> {
  const not = new MissionRun(mission('reTripleOrder', { norm: 1, requiredPiece: 'I' }));
  not.onLock(lock({ lineCount: 3, pieceType: 'I' }));
  assert.strictEqual(not.getProgress().current, 0, 'the named piece is the one that does NOT count');
  not.onLock(lock({ lineCount: 3, pieceType: 'L' }));
  assert.strictEqual(not.getProgress().outcome, 'cleared');

  const pair = new MissionRun(mission('reTripleOrder', { norm: 1, requiredPiece: 'SZ' }));
  pair.onLock(lock({ lineCount: 3, pieceType: 'S' }));
  assert.strictEqual(pair.getProgress().outcome, 'cleared',
    'with a pair named the reference counts every triple, S and Z included');
}

/** HOLD USE (mission_opt_2): the piece has to have been held first. */
export async function anOrderMissionCanInsistThePieceWasHeld(): Promise<void> {
  const run = new MissionRun(mission('doubleOrder', {
    norm: 1, requiredPiece: 'O', requireHold: true,
  }));
  run.onLock(lock({ lineCount: 2, pieceType: 'O', cameFromHold: false }));
  assert.strictEqual(run.getProgress().current, 0, 'the right piece, straight from the queue');
  run.onLock(lock({ lineCount: 2, pieceType: 'O', cameFromHold: true }));
  assert.strictEqual(run.getProgress().outcome, 'cleared');
}

/**
 * The SPLIT family is about the GAP, which a line COUNT cannot answer.
 *
 * `mission.c:1053-1098` walks the field and counts the uncleared rows lying
 * between the cleared ones: SPLIT DOUBLE and SPLIT TRIPLE want any gap at
 * all, SPLIT DOUBLE2 wants exactly two rows.
 */
export async function theSplitFamilyReadsTheRowsNotTheCount(): Promise<void> {
  const sd = new MissionRun(mission('splitDouble', { norm: 1 }));
  sd.onLock(lock({ lineCount: 2, clearedRows: [18, 19] }));
  assert.strictEqual(sd.getProgress().current, 0, 'two touching rows are an ordinary double');
  sd.onLock(lock({ lineCount: 2, clearedRows: [17, 19] }));
  assert.strictEqual(sd.getProgress().outcome, 'cleared', 'one row left between them');

  const st = new MissionRun(mission('splitTriple', { norm: 1 }));
  st.onLock(lock({ lineCount: 3, clearedRows: [17, 18, 19] }));
  assert.strictEqual(st.getProgress().current, 0);
  st.onLock(lock({ lineCount: 3, clearedRows: [15, 17, 19] }));
  assert.strictEqual(st.getProgress().outcome, 'cleared');

  const two = new MissionRun(mission('splitDouble2', { norm: 1 }));
  two.onLock(lock({ lineCount: 2, clearedRows: [17, 19] }));
  assert.strictEqual(two.getProgress().current, 0, 'one row between is not two');
  two.onLock(lock({ lineCount: 2, clearedRows: [16, 19] }));
  assert.strictEqual(two.getProgress().outcome, 'cleared', 'exactly two rows between');
}

/** An ORDER mission with no piece named is not a mission this engine judges. */
export async function anOrderMissionWithoutAPieceIsRefused(): Promise<void> {
  const missing = {
    name: 'x', missions: [{
      id: '01', name: 'ORDER', objective: 'tripleOrder', norm: 2,
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    }],
  };
  assert.throws(() => parseMissionPack(missing, 'test'), MissionPackError,
    'the objective is ABOUT a piece; without one it cannot be judged');

  const wrongPiece = {
    name: 'x', missions: [{
      id: '01', name: 'ORDER', objective: 'tripleOrder', norm: 2, requiredPiece: 'Q',
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    }],
  };
  assert.throws(() => parseMissionPack(wrongPiece, 'test'), MissionPackError);

  const notAnOrder = {
    name: 'x', missions: [{
      id: '01', name: 'LINES', objective: 'lines', norm: 2, requiredPiece: 'T',
      timeLimitSeconds: 0, startLevel: 0, garbageRows: 0, modifiers: {},
    }],
  };
  assert.throws(() => parseMissionPack(notAnOrder, 'test'), MissionPackError,
    'and an objective that cannot read it says so');
}
