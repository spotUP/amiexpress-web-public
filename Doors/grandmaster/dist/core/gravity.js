"use strict";
/**
 * TGM3 Gravity System
 *
 * Authentic speed curves for Master and Death modes
 * Based on TGM3 timing data from HeborisCE speed.c
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MARATHON_SPEED_CURVE = exports.SPRINT_SPEED = exports.DEATH_SPEED_CURVE = exports.MASTER_SPEED_CURVE = void 0;
exports.getSpeedParams = getSpeedParams;
exports.is20G = is20G;
exports.getLockDelayFrames = getLockDelayFrames;
exports.getAREFrames = getAREFrames;
exports.getLineClearFrames = getLineClearFrames;
exports.framesToMs = framesToMs;
exports.gravityToDropRate = gravityToDropRate;
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
exports.MASTER_SPEED_CURVE = [
    // level, gravity, are, arelinelock (Line clear), das, lockDelay
    { level: 0, gravity: 4 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 30, gravity: 6 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 35, gravity: 8 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 40, gravity: 10 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 50, gravity: 12 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 60, gravity: 15 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 70, gravity: 30 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 80, gravity: 45 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 90, gravity: 60 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 100, gravity: 90 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 120, gravity: 120 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 140, gravity: 150 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 160, gravity: 180 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 170, gravity: 210 / 60, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 200, gravity: 1.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 220, gravity: 2.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 230, gravity: 3.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 233, gravity: 4.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 236, gravity: 5.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 239, gravity: 6.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 243, gravity: 8.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 247, gravity: 10.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 251, gravity: 15.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 300, gravity: 1.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 330, gravity: 2.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 360, gravity: 3.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 400, gravity: 4.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 420, gravity: 5.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    { level: 450, gravity: 5.0, are: 26, arelinelock: 40, das: 15, lockDelay: 28 },
    // speed.c:98-117, *_tbl index 0 (column header "500")
    { level: 500, gravity: 20.0, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    // index 2 ("600"): wait2 29->19
    { level: 600, gravity: 20.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    // index 4 ("700"): wait1 25->19, wait2 19->9
    { level: 700, gravity: 20.0, are: 19, arelinelock: 9, das: 10, lockDelay: 28 },
    // index 6 ("800"): wait1 19->14, wait2 9->6
    { level: 800, gravity: 20.0, are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
    // index 8 ("900"): wait3 28->18, waitt 10->9
    { level: 900, gravity: 20.0, are: 14, arelinelock: 6, das: 9, lockDelay: 18 },
    // index 10 ("1000"): wait1 14->8, wait3 18->16
    { level: 1000, gravity: 20.0, are: 8, arelinelock: 6, das: 9, lockDelay: 16 },
    // index 12 ("1100"): wait1 8->7, wait3 16->15, waitt 9->8
    { level: 1100, gravity: 20.0, are: 7, arelinelock: 6, das: 8, lockDelay: 15 },
    // index 22 ("1600"): wait1 7->6, wait3 15->14
    { level: 1600, gravity: 20.0, are: 6, arelinelock: 6, das: 8, lockDelay: 14 },
    // index 24 ("1700"): wait1 6->5, wait2 6->4, wait3 14->12, waitt 8->7
    { level: 1700, gravity: 20.0, are: 5, arelinelock: 4, das: 7, lockDelay: 12 },
    // index 25 ("1750"): wait1 5->4, wait3 12->11, waitt 7->6
    { level: 1750, gravity: 20.0, are: 4, arelinelock: 4, das: 6, lockDelay: 11 },
    // index 26 ("1800"): wait1 4->3, wait2 4->3, wait3 11->10
    { level: 1800, gravity: 20.0, are: 3, arelinelock: 3, das: 6, lockDelay: 10 },
    // index 27 ("1850", last column): wait1 3->2, wait2 3->1, wait3 10->9
    { level: 1850, gravity: 20.0, are: 2, arelinelock: 1, das: 6, lockDelay: 9 },
];
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
exports.DEATH_SPEED_CURVE = [
    { level: 0, gravity: 20.0, are: 11, arelinelock: 8, das: 9, lockDelay: 20 },
    { level: 100, gravity: 20.0, are: 10, arelinelock: 5, das: 8, lockDelay: 18 },
    { level: 200, gravity: 20.0, are: 9, arelinelock: 5, das: 7, lockDelay: 16 },
    { level: 300, gravity: 20.0, are: 6, arelinelock: 4, das: 7, lockDelay: 13 },
    { level: 500, gravity: 20.0, are: 5, arelinelock: 3, das: 6, lockDelay: 12 },
    { level: 600, gravity: 20.0, are: 4, arelinelock: 3, das: 5, lockDelay: 11 },
    { level: 1000, gravity: 20.0, are: 6, arelinelock: 2, das: 5, lockDelay: 11 },
    { level: 1100, gravity: 20.0, are: 4, arelinelock: 2, das: 5, lockDelay: 10 },
    { level: 1200, gravity: 20.0, are: 3, arelinelock: 2, das: 5, lockDelay: 9 },
];
/**
 * Sprint mode - constant moderate speed
 */
exports.SPRINT_SPEED = {
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
exports.MARATHON_SPEED_CURVE = [
    { level: 0, gravity: 0.02, are: 25, arelinelock: 40, das: 14, lockDelay: 30 },
    { level: 100, gravity: 0.1, are: 25, arelinelock: 40, das: 14, lockDelay: 30 },
    { level: 200, gravity: 0.3, are: 25, arelinelock: 30, das: 12, lockDelay: 30 },
    { level: 300, gravity: 0.5, are: 20, arelinelock: 30, das: 12, lockDelay: 30 },
    { level: 400, gravity: 1.0, are: 20, arelinelock: 25, das: 10, lockDelay: 30 },
    { level: 500, gravity: 2.0, are: 16, arelinelock: 25, das: 10, lockDelay: 30 },
];
/**
 * Get speed parameters for current level and mode
 */
function getSpeedParams(level, mode) {
    let curve;
    switch (mode) {
        case 'master':
            curve = exports.MASTER_SPEED_CURVE;
            break;
        case 'death':
            curve = exports.DEATH_SPEED_CURVE;
            break;
        case 'sprint':
            return exports.SPRINT_SPEED;
        case 'marathon':
            curve = exports.MARATHON_SPEED_CURVE;
            break;
        default:
            curve = exports.MASTER_SPEED_CURVE;
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
function is20G(level, mode) {
    const params = getSpeedParams(level, mode);
    return params.gravity >= 20.0;
}
/**
 * Get frames to lock (60fps)
 */
function getLockDelayFrames(level, mode) {
    const params = getSpeedParams(level, mode);
    return params.lockDelay;
}
/**
 * Get ARE (Appearance Delay) frames
 */
function getAREFrames(level, mode) {
    const params = getSpeedParams(level, mode);
    return params.are;
}
/**
 * Get line clear delay frames
 */
function getLineClearFrames(level, mode) {
    const params = getSpeedParams(level, mode);
    return params.arelinelock;
}
/**
 * Convert frames to milliseconds (60fps)
 */
function framesToMs(frames) {
    return (frames / 60) * 1000;
}
/**
 * Convert gravity (cells per frame) to drop rate
 */
function gravityToDropRate(gravity) {
    if (gravity >= 20.0) {
        return 0; // Instant drop (20G)
    }
    return 1 / gravity; // Frames per cell
}
//# sourceMappingURL=gravity.js.map