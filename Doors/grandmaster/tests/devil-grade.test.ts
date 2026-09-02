/**
 * The Devil/DOOM grade ladder in 'death' mode.
 *
 * 'death' is HeborisCE's gameMode 3. It was scored on the TGM3 Master
 * ladder (9 -> ... -> GM), which that mode never uses: the reference gives
 * the Devil family its own name table, dgname (gamestart.c:609), climbed by
 * level and topped by GOD - a rank this door could not award at all, because
 * 'death' also had no ending. It ran past 1300 for ever.
 *
 * Reference: Documentation/7-Reference Sources/HeborisCE-1.1.0/src/game/gamestart.c
 */

import assert from 'assert';
import { GameEngine } from '../core/game';
import {
  devilGradeForLevel, devilFinalGrade, isWorldRule,
  DEVIL_END_LEVEL, GOD_WINDOW_AT_1300,
} from '../core/devil-grade';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const baseSettings: any = {
  rotationSystem: 'SRS', das: 100, arr: 20, softDropSpeed: 20,
  ghostPiece: true, lockDelay: 500, previewCount: 4,
  musicVolume: 0, sfxVolume: 0, keyBindings: {},
};

/** A death run parked at `level`, `seconds` into the game, ready to lock. */
function deathRunAt(level: number, seconds: number, rotationSystem = 'SRS'): any {
  const engine: any = new GameEngine('death', { ...baseSettings, rotationSystem }, sounds);
  engine.start();
  const state = engine.getState();
  state.level = level;
  state.startTime = Date.now() - seconds * 1000;
  return engine;
}

export async function theLadderIsLevelOverAHundredAndStopsAtS13(): Promise<void> {
  // gamestart.c:9348-9349 `if(grade < 13) grade = tr / 10`, tr = level/10.
  assert.strictEqual(devilGradeForLevel(0), '1');
  assert.strictEqual(devilGradeForLevel(99), '1');
  assert.strictEqual(devilGradeForLevel(100), 'S1');
  assert.strictEqual(devilGradeForLevel(500), 'S5');
  assert.strictEqual(devilGradeForLevel(1299), 'S12');
  assert.strictEqual(devilGradeForLevel(1300), 'S13');
  assert.strictEqual(devilGradeForLevel(9999), 'S13', 'the in-run ladder never passes S13');
}

export async function aDeathRunShowsTheDevilLadderNotTheMasterOne(): Promise<void> {
  const engine = deathRunAt(700, 60);
  engine.update(50);   // one frame is enough - the grade is published per update

  assert.strictEqual(engine.getState().grade, 'S7', 'death climbs dgname by level');

  const master: any = new GameEngine('master', baseSettings, sounds);
  master.start();
  master.getState().level = 700;
  master.update(50);
  assert.notStrictEqual(master.getState().grade, 'S7', 'master keeps its own ladder');
}

export async function reaching1300InTimeIsGod(): Promise<void> {
  // 19200 frames = 5:20 at 60 fps, the CLASSIC-family window at level 1300.
  const engine = deathRunAt(DEVIL_END_LEVEL - 1, 200);   // 200s = 12,000 frames
  engine.hardDrop();

  const state = engine.getState();
  assert.strictEqual(state.status, 'complete', 'the run ends at 1300 now');
  assert.strictEqual(state.level, DEVIL_END_LEVEL, 'and stops there');
  assert.strictEqual(state.grade, 'GOD', 'inside the window, GOD');
}

export async function reaching1300TooSlowlyIsS13(): Promise<void> {
  const engine = deathRunAt(DEVIL_END_LEVEL - 1, 400);   // 400s = 24,000 frames
  engine.hardDrop();

  const state = engine.getState();
  assert.strictEqual(state.status, 'complete');
  assert.strictEqual(state.level, DEVIL_END_LEVEL);
  assert.strictEqual(state.grade, 'S13', 'outside the window, S13');
}

export async function theWorldFamilyGetsTheLongerWindow(): Promise<void> {
  // gamestart.c:11109 - isWRule() (rots 2,3,6,7) allows 21000 frames (5:50)
  // where the classic families get 19200 (5:20). 20,000 frames sits between
  // the two, so the same run is GOD under one family and S13 under the other.
  const between = 20000 / 60;

  for (const system of ['TI-WORLD', 'ACE-SRS', 'DS-WORLD', 'SRS-X'] as const) {
    assert.strictEqual(isWorldRule(system), true, `${system} is a WORLD rule`);
    const engine = deathRunAt(DEVIL_END_LEVEL - 1, between, system);
    engine.hardDrop();
    assert.strictEqual(engine.getState().grade, 'GOD', `${system} still has time`);
  }

  for (const system of ['SRS', 'ARS', 'TI-ARS', 'ACE-ARS'] as const) {
    assert.strictEqual(isWorldRule(system), false, `${system} is not a WORLD rule`);
    const engine = deathRunAt(DEVIL_END_LEVEL - 1, between, system);
    engine.hardDrop();
    assert.strictEqual(engine.getState().grade, 'S13', `${system} ran out at 5:20`);
  }
}

export async function theWindowsAreTheReferencesOwnNumbers(): Promise<void> {
  assert.strictEqual(GOD_WINDOW_AT_1300.classic, 19200, '5:20 at 60fps');
  assert.strictEqual(GOD_WINDOW_AT_1300.world, 21000, '5:50 at 60fps');
  assert.strictEqual(devilFinalGrade(19200, 'SRS'), 'GOD', 'the boundary is inclusive (<=)');
  assert.strictEqual(devilFinalGrade(19201, 'SRS'), 'S13');
}
