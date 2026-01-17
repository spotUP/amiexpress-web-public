/**
 * TGM3 Gravity System
 *
 * Authentic speed curves for Master and Death modes
 * Based on TGM3 timing data from HeborisCE speed.c
 */
import type { GameMode, SpeedLevel } from './types';
/**
 * Master mode speed curve (Classic TGM3)
 * Levels correspond to breakpoints where timing values change
 */
export declare const MASTER_SPEED_CURVE: SpeedLevel[];
/**
 * Death mode (Shirase) speed curve
 * Fast gravity and aggressive delays
 */
export declare const DEATH_SPEED_CURVE: SpeedLevel[];
/**
 * Sprint mode - constant moderate speed
 */
export declare const SPRINT_SPEED: SpeedLevel;
/**
 * Marathon mode - gradual difficulty increase
 */
export declare const MARATHON_SPEED_CURVE: SpeedLevel[];
/**
 * Get speed parameters for current level and mode
 */
export declare function getSpeedParams(level: number, mode: GameMode): SpeedLevel;
/**
 * Check if current level is 20G
 */
export declare function is20G(level: number, mode: GameMode): boolean;
/**
 * Get frames to lock (60fps)
 */
export declare function getLockDelayFrames(level: number, mode: GameMode): number;
/**
 * Get ARE (Appearance Delay) frames
 */
export declare function getAREFrames(level: number, mode: GameMode): number;
/**
 * Get line clear delay frames
 */
export declare function getLineClearFrames(level: number, mode: GameMode): number;
/**
 * Convert frames to milliseconds (60fps)
 */
export declare function framesToMs(frames: number): number;
/**
 * Convert gravity (cells per frame) to drop rate
 */
export declare function gravityToDropRate(gravity: number): number;
//# sourceMappingURL=gravity.d.ts.map