/**
 * Torikan (qualifying time cutoff) — HeborisCE's "footcut" system
 *
 * HeborisCE calls this 足切り ("footcut"); the TGM community calls the same
 * mechanic "torikan". It is NOT a countdown that kills the player mid-game —
 * it's a checkpoint deadline. The game watches for the piece lock that
 * carries the level across 500 (Master/20G/DOOM) or 1000 (DOOM only). If the
 * in-game clock is already past the mode's cutoff at that instant, the run
 * is forced to end right there (the "ending" sequence starts early) instead
 * of continuing. Reach the checkpoint before the cutoff and nothing happens.
 *
 * Source: src/game/gamestart.c:10961 checkEnding(player, tcbuf) — tcbuf is
 * the level *before* this lock's level-up, so the "crossed the line just
 * now" test is (tcbuf < threshold && tc[player] >= threshold). The actual
 * gates are gamestart.c:11176-11220; the cutoff constants are
 * src/game/init.c:172-183 (mirrored as defaults in gamestart.c:1367-1378).
 */

import type { GameMode, RotationSystem } from './types';

/**
 * DOOM's cutoff is banded by how forgiving the rotation rule is: HeborisCE
 * groups nine named rulesets into three difficulty bands and gives the
 * harder ones a shorter deadline. init.c:178-180:
 *   Easy   (ACE-SRS, ACE-ARS, DS-World)      240*60 frames = 4:00
 *   Normal (Heboris, Ti-World, ACE-ARS2)     205*60 frames = 3:25
 *   Hard   (Ti-ARS, SRS-X, D.R.S)            183*60 frames = 3:03
 */
export type DoomDifficultyBand = 'easy' | 'normal' | 'hard';

// init.c:174 — timelimit_master = 420*60. 7:00 to clear level 500 in Master.
// (init.c:176's timelimit_20G, 360*60/6:00, has no analog here: this door
// has no separate 20G mode, only 'master'.)
export const MASTER_TORIKAN_FRAMES = 420 * 60;

// init.c:178-180 — timelimit_doom_{E,N,H}, selected in gamestart.c:6242-6248
// by the rotation rule's rots[pl] band.
export const DOOM_TORIKAN_FRAMES: Record<DoomDifficultyBand, number> = {
  easy: 240 * 60,
  normal: 205 * 60,
  hard: 183 * 60,
};

/**
 * gamestart.c:6254 — "1000の足切りは500の2倍" ("the 1000 footcut is double
 * the 500 one"): timelimit2[pl] = timelimit[pl] * 2. Same band, second gate.
 */
export function doomTorikanFramesForLevel1000(band: DoomDifficultyBand): number {
  return DOOM_TORIKAN_FRAMES[band] * 2;
}

/**
 * Not reference-derived — a mapping decision, called out separately from
 * the numbers above.
 *
 * init.c:178-180 bands nine HeborisCE-native rotation *rules* (HEBORIS,
 * TI-ARS, TI-WORLD, ACE-SRS, ACE-ARS, ACE-ARS2, DS-World, SRS-X, D.R.S) by
 * difficulty. This door only implements four generic rotation *systems*
 * (SRS/ARS/NRS/BARS — core/types.ts:19) and none of them is one of those
 * nine rules, so there is no lookup table to port; picking a band per
 * system is a judgment call:
 *   - SRS is this door's default (app.ts) the way HEBORIS is the engine's
 *     own native default and sits in the Normal band -> normal.
 *   - ARS is the strict TGM-style system (tight kick allowance) and NRS has
 *     no kicks at all — both closer in spirit to the Hard band's
 *     TI-ARS/SRS-X/D.R.S (advanced-player rules) than to Easy -> hard.
 *   - BARS is the softer hybrid rule (core/pieces.ts) -> easy, the one
 *     band otherwise unused.
 */
export function doomBandForRotationSystem(system: RotationSystem): DoomDifficultyBand {
  switch (system) {
    case 'BARS':
      return 'easy';
    case 'SRS':
      return 'normal';
    case 'ARS':
    case 'NRS':
      return 'hard';
  }
}

export interface TorikanCheckInput {
  mode: GameMode;
  /** Level before this piece's lock resolved (gamestart.c's tcbuf). */
  levelBefore: number;
  /** Level after this piece's lock resolved (gamestart.c's tc[player]). */
  levelAfter: number;
  /** Frames elapsed since the run started (gamestart.c's gametime[player]). */
  gametimeFrames: number;
  rotationSystem: RotationSystem;
}

export interface TorikanResult {
  /** True if this lock just missed a qualifying cutoff. */
  expired: boolean;
  /** The checkpoint level (500 or 1000) the run was capped to, if expired. */
  checkpointLevel: 500 | 1000 | null;
}

const PASSED: TorikanResult = { expired: false, checkpointLevel: null };

/**
 * True the instant a lock carries the level from below `threshold` to at or
 * past it — gamestart.c's `(tc[player] >= threshold) && (tcbuf < threshold)`.
 * Guards against re-firing on every later lock once the level has moved on.
 */
function justCrossed(levelBefore: number, levelAfter: number, threshold: number): boolean {
  return levelAfter >= threshold && levelBefore < threshold;
}

/**
 * Evaluate the torikan gate for the lock that just happened.
 *
 * Master: single gate at level 500 against MASTER_TORIKAN_FRAMES
 * (gamestart.c:11176-11178, "500で足きり", gameMode 1/2).
 *
 * Death (this door's DOOM/DEVIL mode — core/game.ts's Shirase garbage rise
 * at level >= 500 matches gamestart.c's DEVIL gating): two gates, level 500
 * against the rotation-banded DOOM_TORIKAN_FRAMES (gamestart.c:11187-11197,
 * "devilは二つ足切り") and level 1000 against double that
 * (gamestart.c:11202-11210, "LV1000で足切り"). DEVIL-MINUS's separate
 * timelimitm_devil/timelimitmw_devil constants (init.c:182-183) have no
 * analog here — this door has no devil-minus variant, only 'death'.
 */
export function checkTorikan(input: TorikanCheckInput): TorikanResult {
  const { mode, levelBefore, levelAfter, gametimeFrames, rotationSystem } = input;

  if (mode === 'master') {
    if (justCrossed(levelBefore, levelAfter, 500) && gametimeFrames > MASTER_TORIKAN_FRAMES) {
      return { expired: true, checkpointLevel: 500 };
    }
    return PASSED;
  }

  if (mode === 'death') {
    const band = doomBandForRotationSystem(rotationSystem);

    if (justCrossed(levelBefore, levelAfter, 500) && gametimeFrames > DOOM_TORIKAN_FRAMES[band]) {
      return { expired: true, checkpointLevel: 500 };
    }
    if (justCrossed(levelBefore, levelAfter, 1000) && gametimeFrames > doomTorikanFramesForLevel1000(band)) {
      return { expired: true, checkpointLevel: 1000 };
    }
    return PASSED;
  }

  // No other mode in this door has a HeborisCE footcut analog.
  return PASSED;
}
