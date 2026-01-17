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
 */
exports.MASTER_SPEED_CURVE = [
    // level, gravity, are, arelinelock (Line clear), das, lockDelay
    { level: 0, gravity: 4 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 30, gravity: 6 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 35, gravity: 8 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 40, gravity: 10 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 50, gravity: 12 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 60, gravity: 15 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 70, gravity: 30 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 80, gravity: 45 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 90, gravity: 60 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 100, gravity: 90 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 120, gravity: 120 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 140, gravity: 150 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 160, gravity: 180 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 170, gravity: 210 / 60, are: 25, arelinelock: 29, das: 10, lockDelay: 28 },
    { level: 200, gravity: 1.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 220, gravity: 2.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 230, gravity: 3.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 233, gravity: 4.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 236, gravity: 5.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 239, gravity: 6.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 243, gravity: 8.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 247, gravity: 10.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 251, gravity: 15.0, are: 25, arelinelock: 19, das: 10, lockDelay: 28 },
    { level: 300, gravity: 1.0, are: 19, arelinelock: 9, das: 10, lockDelay: 28 },
    { level: 330, gravity: 2.0, are: 19, arelinelock: 9, das: 10, lockDelay: 28 },
    { level: 360, gravity: 3.0, are: 19, arelinelock: 9, das: 10, lockDelay: 28 },
    { level: 400, gravity: 4.0, are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
    { level: 420, gravity: 5.0, are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
    { level: 450, gravity: 5.0, are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
    { level: 500, gravity: 20.0, are: 14, arelinelock: 6, das: 10, lockDelay: 28 },
    { level: 600, gravity: 20.0, are: 8, arelinelock: 6, das: 9, lockDelay: 18 },
    { level: 700, gravity: 20.0, are: 7, arelinelock: 6, das: 9, lockDelay: 16 },
    { level: 800, gravity: 20.0, are: 7, arelinelock: 6, das: 8, lockDelay: 15 },
    { level: 1100, gravity: 20.0, are: 6, arelinelock: 6, das: 8, lockDelay: 14 },
    { level: 1200, gravity: 20.0, are: 5, arelinelock: 4, das: 7, lockDelay: 12 },
    { level: 1300, gravity: 20.0, are: 4, arelinelock: 4, das: 6, lockDelay: 11 },
    { level: 1400, gravity: 20.0, are: 3, arelinelock: 3, das: 6, lockDelay: 10 },
    { level: 1500, gravity: 20.0, are: 2, arelinelock: 1, das: 6, lockDelay: 9 },
];
/**
 * Death mode (Shirase) speed curve
 * Fast gravity and aggressive delays
 */
exports.DEATH_SPEED_CURVE = [
    { level: 0, gravity: 1.0, are: 11, arelinelock: 8, das: 9, lockDelay: 20 },
    { level: 100, gravity: 1.0, are: 10, arelinelock: 5, das: 8, lockDelay: 18 },
    { level: 200, gravity: 1.0, are: 9, arelinelock: 5, das: 7, lockDelay: 16 },
    { level: 300, gravity: 1.0, are: 6, arelinelock: 4, das: 7, lockDelay: 13 },
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