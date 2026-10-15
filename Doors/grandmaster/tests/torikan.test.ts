/**
 * Torikan (HeborisCE "footcut" qualifying time cutoff) regression tests.
 *
 * Before this change GRANDMASTER had no time-limit or DOOM difficulty
 * system at all - Master mode and 'death' (this door's DOOM/DEVIL mode)
 * let a player sit at any level indefinitely. HeborisCE gates progress past
 * level 500 (and, in DOOM, level 1000) behind a deadline: reach the
 * checkpoint too slowly and the run is forced to end there instead of
 * continuing. src/game/gamestart.c:10961 checkEnding(), gates at
 * gamestart.c:11176-11220, cutoff constants at
 * "Documentation/7-Reference Sources/HeborisCE-1.1.0/src/game/init.c:172-183".
 */

import assert from 'assert';
import {
  MASTER_TORIKAN_FRAMES,
  DOOM_TORIKAN_FRAMES,
  doomTorikanFramesForLevel1000,
  doomBandForRotationSystem,
  checkTorikan,
} from '../core/time-limit';
import { GameEngine } from '../core/game';
import type { PlayerSettings } from '../core/types';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };

function settings(rotationSystem: PlayerSettings['rotationSystem']): any {
  return {
    rotationSystem, das: 100, arr: 20, softDropSpeed: 20,
    ghostPiece: true, lockDelay: 500, previewCount: 4,
    musicVolume: 0, sfxVolume: 0, keyBindings: {},
  };
}

// --- Reference constants (init.c:172-183) -----------------------------

export async function masterCutoffIsSevenMinutesAtFrameRate(): Promise<void> {
  // init.c:174 - timelimit_master = 420*60
  assert.strictEqual(MASTER_TORIKAN_FRAMES, 420 * 60);
}

export async function doomCutoffsMatchTheThreeDifficultyBands(): Promise<void> {
  // init.c:178-180
  assert.strictEqual(DOOM_TORIKAN_FRAMES.easy, 240 * 60);
  assert.strictEqual(DOOM_TORIKAN_FRAMES.normal, 205 * 60);
  assert.strictEqual(DOOM_TORIKAN_FRAMES.hard, 183 * 60);
}

export async function level1000CutoffIsDoubleLevel500ForEveryBand(): Promise<void> {
  // gamestart.c:6254 - "1000の足切りは500の2倍"
  assert.strictEqual(doomTorikanFramesForLevel1000('easy'), DOOM_TORIKAN_FRAMES.easy * 2);
  assert.strictEqual(doomTorikanFramesForLevel1000('normal'), DOOM_TORIKAN_FRAMES.normal * 2);
  assert.strictEqual(doomTorikanFramesForLevel1000('hard'), DOOM_TORIKAN_FRAMES.hard * 2);
}

// --- Pure gate logic ----------------------------------------------------

export async function masterExpiresOnlyWhenTheCrossingLockIsLate(): Promise<void> {
  const late = checkTorikan({
    mode: 'master', levelBefore: 499, levelAfter: 500,
    gametimeFrames: MASTER_TORIKAN_FRAMES + 1, rotationSystem: 'SRS',
  });
  assert.strictEqual(late.expired, true);
  assert.strictEqual(late.checkpointLevel, 500);

  const onTime = checkTorikan({
    mode: 'master', levelBefore: 499, levelAfter: 500,
    gametimeFrames: MASTER_TORIKAN_FRAMES, rotationSystem: 'SRS',
  });
  assert.strictEqual(onTime.expired, false, 'exactly at the deadline still qualifies (> not >=)');
}

export async function masterDoesNotReExpireOnLaterLocks(): Promise<void> {
  // gamestart.c's (tcbuf < 500) guard: the gate only fires on the lock that
  // crosses the line, not on every subsequent lock spent above it.
  const result = checkTorikan({
    mode: 'master', levelBefore: 501, levelAfter: 503,
    gametimeFrames: MASTER_TORIKAN_FRAMES * 10, rotationSystem: 'SRS',
  });
  assert.strictEqual(result.expired, false);
}

export async function deathGatesLevel500ByRotationBand(): Promise<void> {
  const hardLate = checkTorikan({
    mode: 'death', levelBefore: 499, levelAfter: 500,
    gametimeFrames: DOOM_TORIKAN_FRAMES.hard + 1, rotationSystem: 'ARS',
  });
  assert.strictEqual(hardLate.expired, true);
  assert.strictEqual(hardLate.checkpointLevel, 500);

  // Same elapsed time qualifies under the more generous easy band (BARS).
  const easyOnTime = checkTorikan({
    mode: 'death', levelBefore: 499, levelAfter: 500,
    gametimeFrames: DOOM_TORIKAN_FRAMES.hard + 1, rotationSystem: 'BARS',
  });
  assert.strictEqual(easyOnTime.expired, false);
}

export async function deathGatesLevel1000AtDoubleTheBandCutoff(): Promise<void> {
  const band = doomBandForRotationSystem('SRS'); // 'normal'
  const justUnder = checkTorikan({
    mode: 'death', levelBefore: 999, levelAfter: 1000,
    gametimeFrames: doomTorikanFramesForLevel1000(band), rotationSystem: 'SRS',
  });
  assert.strictEqual(justUnder.expired, false);

  const justOver = checkTorikan({
    mode: 'death', levelBefore: 999, levelAfter: 1000,
    gametimeFrames: doomTorikanFramesForLevel1000(band) + 1, rotationSystem: 'SRS',
  });
  assert.strictEqual(justOver.expired, true);
  assert.strictEqual(justOver.checkpointLevel, 1000);
}

export async function otherModesHaveNoTorikanGate(): Promise<void> {
  for (const mode of ['marathon', 'sprint', 'ultra', 'classic'] as const) {
    const result = checkTorikan({
      mode, levelBefore: 499, levelAfter: 500,
      gametimeFrames: Number.MAX_SAFE_INTEGER, rotationSystem: 'SRS',
    });
    assert.strictEqual(result.expired, false, `${mode} must not gate on level 500`);
  }
}

// --- Wiring into the real game engine (core/game.ts lockPiece) ----------

export async function masterModeForcesCompleteAtLevel500WhenLate(): Promise<void> {
  const engine = new GameEngine('master', settings('SRS'), sounds, undefined, 499);
  engine.start();
  // Backdate the run's start so the elapsed-frames clock already reads past
  // the 7:00 Master cutoff by the time this lock happens.
  (engine as any).state.startTime = Date.now() - (MASTER_TORIKAN_FRAMES / 60) * 1000 - 1000;

  (engine as any).hardDrop();

  const st = engine.getState();
  assert.strictEqual(st.torikanExpired, true);
  assert.strictEqual(st.torikanCheckpointLevel, 500);
  assert.strictEqual(st.level, 500);
  assert.strictEqual(st.status, 'complete');
}

export async function masterModeContinuesPastLevel500WhenOnTime(): Promise<void> {
  const engine = new GameEngine('master', settings('SRS'), sounds, undefined, 499);
  engine.start();
  (engine as any).state.startTime = Date.now() - 60 * 1000; // 1 minute in, well under 7:00

  (engine as any).hardDrop();

  const st = engine.getState();
  assert.strictEqual(st.torikanExpired, false);
  assert.strictEqual(st.level, 500);
  assert.strictEqual(st.status, 'playing');
}

export async function deathModeForcesCompleteAtLevel500WhenLateForItsBand(): Promise<void> {
  // ARS bands 'hard' (doomBandForRotationSystem) -> 183*60 frames = 3:03.
  const engine = new GameEngine('death', settings('ARS'), sounds, undefined, 499);
  engine.start();
  (engine as any).state.startTime = Date.now() - (DOOM_TORIKAN_FRAMES.hard / 60) * 1000 - 1000;

  (engine as any).hardDrop();

  const st = engine.getState();
  assert.strictEqual(st.torikanExpired, true);
  assert.strictEqual(st.torikanCheckpointLevel, 500);
  assert.strictEqual(st.status, 'complete');
}
