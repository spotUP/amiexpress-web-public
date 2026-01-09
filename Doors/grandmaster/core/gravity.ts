/**
 * TGM3 Gravity System
 *
 * Authentic speed curves for Master and Death modes
 * Based on TGM3 timing data
 */

import type { GameMode, SpeedLevel } from './types';

/**
 * Master mode speed curve (Classic TGM3)
 * Based on HeborisCE speed.c wait1/wait2/wait3/waitt tables
 *
 * Level breakpoints from HeborisCE (every 50 levels from 500-1850):
 * wait1 = ARE (appearance delay after lock)
 * wait2 = Line clear delay
 * wait3 = Lock delay
 * waitt = DAS (horizontal auto-repeat)
 *
 * HeborisCE wait1_master_tbl (ARE):
 * 25,25,25,25,19,19,14,14,14,14,8,8,7,7,7,7,7,7,7,7,7,7,6,6,5,4,3,2
 *
 * HeborisCE wait2_master_tbl (Line clear):
 * 29,29,19,19,9,9,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,4,4,3,1
 *
 * HeborisCE wait3_master_tbl (Lock delay):
 * 28,28,28,28,28,28,28,28,18,18,16,16,15,15,15,15,15,15,15,15,15,15,14,14,12,11,10,9
 *
 * HeborisCE waitt_master_tbl (DAS):
 * 10,10,10,10,10,10,10,10,9,9,9,9,8,8,8,8,8,8,8,8,8,8,8,8,7,6,6,6
 */
export const MASTER_SPEED_CURVE: SpeedLevel[] = [
  // Level 0-499: Learning phase with classic TGM gravity ramp
  { level: 0,   gravity: 0.016,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 30,  gravity: 0.025,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 35,  gravity: 0.031,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 40,  gravity: 0.050,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 50,  gravity: 0.062,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 60,  gravity: 0.078,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 70,  gravity: 0.098,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 80,  gravity: 0.125,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 90,  gravity: 0.156,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 100, gravity: 0.195,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 120, gravity: 0.234,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 140, gravity: 0.273,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 160, gravity: 0.312,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 170, gravity: 0.391,  are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
  { level: 200, gravity: 0.500,  are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
  { level: 220, gravity: 0.625,  are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
  { level: 230, gravity: 0.781,  are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
  { level: 233, gravity: 0.938,  are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
  { level: 236, gravity: 1.000,  are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
  { level: 251, gravity: 1.250,  are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
  { level: 300, gravity: 1.562,  are: 19, arelinelock: 9,  das: 10, lockDelay: 28 },
  { level: 330, gravity: 1.953,  are: 19, arelinelock: 9,  das: 10, lockDelay: 28 },
  { level: 360, gravity: 2.441,  are: 19, arelinelock: 9,  das: 10, lockDelay: 28 },
  { level: 400, gravity: 3.125,  are: 14, arelinelock: 6,  das: 10, lockDelay: 28 },
  { level: 420, gravity: 3.906,  are: 14, arelinelock: 6,  das: 10, lockDelay: 28 },
  { level: 450, gravity: 4.883,  are: 14, arelinelock: 6,  das: 10, lockDelay: 28 },

  // Level 500+: High speed with HeborisCE timing tables
  // Breakpoints every 50 levels from HeborisCE
  { level: 500, gravity: 5.000,   are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
  { level: 550, gravity: 5.000,   are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
  { level: 600, gravity: 5.000,   are: 8,  arelinelock: 6, das: 9,  lockDelay: 18 },
  { level: 650, gravity: 5.000,   are: 8,  arelinelock: 6, das: 9,  lockDelay: 18 },
  { level: 700, gravity: 5.000,   are: 7,  arelinelock: 6, das: 9,  lockDelay: 16 },
  { level: 750, gravity: 5.000,   are: 7,  arelinelock: 6, das: 9,  lockDelay: 16 },
  { level: 800, gravity: 5.000,   are: 7,  arelinelock: 6, das: 8,  lockDelay: 15 },
  { level: 850, gravity: 5.000,   are: 7,  arelinelock: 6, das: 8,  lockDelay: 15 },

  // Level 900+: 20G with extreme timing
  { level: 900,  gravity: 20.000, are: 7,  arelinelock: 6, das: 8, lockDelay: 15 },
  { level: 950,  gravity: 20.000, are: 7,  arelinelock: 6, das: 8, lockDelay: 15 },
  { level: 1000, gravity: 20.000, are: 7,  arelinelock: 6, das: 8, lockDelay: 15 },
  { level: 1050, gravity: 20.000, are: 7,  arelinelock: 6, das: 8, lockDelay: 15 },
  { level: 1100, gravity: 20.000, are: 6,  arelinelock: 6, das: 8, lockDelay: 14 },
  { level: 1150, gravity: 20.000, are: 6,  arelinelock: 6, das: 8, lockDelay: 14 },
  { level: 1200, gravity: 20.000, are: 5,  arelinelock: 4, das: 7, lockDelay: 12 },
  { level: 1250, gravity: 20.000, are: 4,  arelinelock: 4, das: 6, lockDelay: 11 },
  { level: 1300, gravity: 20.000, are: 3,  arelinelock: 3, das: 6, lockDelay: 10 },
  { level: 1350, gravity: 20.000, are: 2,  arelinelock: 1, das: 6, lockDelay: 9 },
];

/**
 * Death mode (Shirase) speed curve
 * 20G from level 500, extreme difficulty
 */
export const DEATH_SPEED_CURVE: SpeedLevel[] = [
  // Fast start
  { level: 0,   gravity: 0.5,    are: 25, arelinelock: 40, das: 14, lockDelay: 30 },
  { level: 100, gravity: 1.0,    are: 25, arelinelock: 30, das: 12, lockDelay: 30 },
  { level: 200, gravity: 2.0,    are: 16, arelinelock: 25, das: 10, lockDelay: 30 },
  { level: 300, gravity: 3.0,    are: 16, arelinelock: 25, das: 10, lockDelay: 30 },
  { level: 400, gravity: 4.0,    are: 16, arelinelock: 25, das: 8,  lockDelay: 30 },

  // 20G from 500
  { level: 500, gravity: 20.0,   are: 12, arelinelock: 16, das: 8,  lockDelay: 17 },
  { level: 600, gravity: 20.0,   are: 12, arelinelock: 12, das: 8,  lockDelay: 15 },
  { level: 700, gravity: 20.0,   are: 10, arelinelock: 12, das: 8,  lockDelay: 15 },
  { level: 800, gravity: 20.0,   are: 10, arelinelock: 12, das: 6,  lockDelay: 15 },
  { level: 900, gravity: 20.0,   are: 10, arelinelock: 6,  das: 6,  lockDelay: 8 },
  { level: 1000, gravity: 20.0,  are: 8,  arelinelock: 6,  das: 6,  lockDelay: 8 },
  { level: 1100, gravity: 20.0,  are: 8,  arelinelock: 6,  das: 6,  lockDelay: 8 },
  { level: 1200, gravity: 20.0,  are: 8,  arelinelock: 6,  das: 6,  lockDelay: 8 },
];

/**
 * Sprint mode - constant moderate speed
 */
export const SPRINT_SPEED: SpeedLevel = {
  level: 0,
  gravity: 1.0,
  are: 20,
  arelinelock: 30,
  das: 10,
  lockDelay: 30,
};

/**
 * Marathon mode - gradual difficulty increase
 */
export const MARATHON_SPEED_CURVE: SpeedLevel[] = [
  { level: 0,   gravity: 0.02,  are: 25, arelinelock: 40, das: 14, lockDelay: 30 },
  { level: 100, gravity: 0.1,   are: 25, arelinelock: 40, das: 14, lockDelay: 30 },
  { level: 200, gravity: 0.3,   are: 25, arelinelock: 30, das: 12, lockDelay: 30 },
  { level: 300, gravity: 0.5,   are: 20, arelinelock: 30, das: 12, lockDelay: 30 },
  { level: 400, gravity: 1.0,   are: 20, arelinelock: 25, das: 10, lockDelay: 30 },
  { level: 500, gravity: 2.0,   are: 16, arelinelock: 25, das: 10, lockDelay: 30 },
];

/**
 * Get speed parameters for current level and mode
 */
export function getSpeedParams(level: number, mode: GameMode): SpeedLevel {
  let curve: SpeedLevel[] | SpeedLevel;

  switch (mode) {
    case 'master':
      curve = MASTER_SPEED_CURVE;
      break;
    case 'death':
      curve = DEATH_SPEED_CURVE;
      break;
    case 'sprint':
      return SPRINT_SPEED;
    case 'marathon':
      curve = MARATHON_SPEED_CURVE;
      break;
    default:
      curve = MASTER_SPEED_CURVE;
  }

  // Find the appropriate speed entry
  if (Array.isArray(curve)) {
    for (let i = curve.length - 1; i >= 0; i--) {
      if (level >= curve[i].level) {
        return curve[i];
      }
    }
    return curve[0];
  }

  return curve;
}

/**
 * Check if current level is 20G
 */
export function is20G(level: number, mode: GameMode): boolean {
  const params = getSpeedParams(level, mode);
  return params.gravity >= 20.0;
}

/**
 * Get frames to lock (60fps)
 */
export function getLockDelayFrames(level: number, mode: GameMode): number {
  const params = getSpeedParams(level, mode);
  return params.lockDelay;
}

/**
 * Get ARE (Appearance Delay) frames
 */
export function getAREFrames(level: number, mode: GameMode): number {
  const params = getSpeedParams(level, mode);
  return params.are;
}

/**
 * Get line clear delay frames
 */
export function getLineClearFrames(level: number, mode: GameMode): number {
  const params = getSpeedParams(level, mode);
  return params.arelinelock;
}

/**
 * Convert frames to milliseconds (60fps)
 */
export function framesToMs(frames: number): number {
  return (frames / 60) * 1000;
}

/**
 * Convert gravity (cells per frame) to drop rate
 */
export function gravityToDropRate(gravity: number): number {
  if (gravity >= 20.0) {
    return 0;  // Instant drop (20G)
  }
  return 1 / gravity;  // Frames per cell
}
