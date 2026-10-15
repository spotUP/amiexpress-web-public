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
 *
 * are/arelinelock/das/lockDelay sourced from HeborisCE speed.c:
 * - Levels 0-499 hold the Master mode INITIAL values (speed.c:86-89):
 *     wait1_master_half=26 (are), wait2_master_half=40 (arelinelock),
 *     wait3_master_half=28 (lockDelay), waitt_master_half=15 (das).
 *   The curve used to open with the level-500 breakpoint's values
 *   (25/29/10/28) instead - the wrong end of the table.
 * - From level 500, wait1_master_tbl/wait2_master_tbl/wait3_master_tbl/
 *   waitt_master_tbl (speed.c:98-117) are indexed every 50 levels starting
 *   at 500 (column headers at speed.c:100,105,110,115). Breakpoints below
 *   list only the indices where a column actually changes value; the door
 *   previously reached are:14/arelinelock:6 at level 500 - Heboris does not
 *   reach those values until level 800 (index 6 of the *_tbl arrays).
 */
export declare const MASTER_SPEED_CURVE: SpeedLevel[];
/**
 * Death mode (Shirase) speed curve
 * 20G from the first piece, with aggressive delays.
 *
 * The gravity column used to ramp 1.0 -> 20.0 at level 500 and contradicted
 * the door's own manual ("20G from the START"). HeborisCE settles it:
 * gamestart.c:6097 sets `sp[pl] = 1200` - the file's own comment for 1200 is
 * "20G" - BEFORE the per-mode jump at 6112, and the Devil/DOOM arm (case 3 ->
 * `ldvl:`, 6197-6250) sets only wait1/wait2/wait3/waitt from the doom tables
 * and never touches sp again. Beginner and Master DO overwrite it
 * (lvTableBeg/lvTableTgm, 6130-6142); the mode these delay columns come from
 * does not. Reported live by the sysop, 2026-09-02.
 *
 * Death Mode's are/arelinelock/das/lockDelay columns are an
 * exact match, level for level, for wait1_doom_tbl/wait2_doom_tbl/
 * wait3_doom_tbl/waitt_doom_tbl (the current Devil-DOOM table,
 * speed.c:174-193, indexed every 100 levels from 0), including the
 * breakpoints this curve omits because the table doesn't change value
 * there (levels 400, 700, 800, 900, 1300 repeat their predecessor).
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