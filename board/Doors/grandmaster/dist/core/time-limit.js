"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DOOM_TORIKAN_FRAMES = exports.MASTER_TORIKAN_FRAMES = void 0;
exports.doomTorikanFramesForLevel1000 = doomTorikanFramesForLevel1000;
exports.doomBandForRotationSystem = doomBandForRotationSystem;
exports.checkTorikan = checkTorikan;
// init.c:174 — timelimit_master = 420*60. 7:00 to clear level 500 in Master.
// (init.c:176's timelimit_20G, 360*60/6:00, has no analog here: this door
// has no separate 20G mode, only 'master'.)
exports.MASTER_TORIKAN_FRAMES = 420 * 60;
// init.c:178-180 — timelimit_doom_{E,N,H}, selected in gamestart.c:6242-6248
// by the rotation rule's rots[pl] band.
exports.DOOM_TORIKAN_FRAMES = {
    easy: 240 * 60,
    normal: 205 * 60,
    hard: 183 * 60,
};
/**
 * gamestart.c:6254 — "1000の足切りは500の2倍" ("the 1000 footcut is double
 * the 500 one"): timelimit2[pl] = timelimit[pl] * 2. Same band, second gate.
 */
function doomTorikanFramesForLevel1000(band) {
    return exports.DOOM_TORIKAN_FRAMES[band] * 2;
}
/**
 * Which DOOM deadline a rotation system plays under.
 *
 * For the six HeborisCE-native systems this is NOT a judgment call - the
 * reference bands them by name at init.c:178-180:
 *   Easy   (240*60) - ACE-SRS, ACE-ARS, DS-World
 *   Normal (205*60) - Heboris, Ti-World, ACE-ARS2
 *   Hard   (183*60) - Ti-ARS, SRS-X, D.R.S
 *
 * The door's own four generic systems are not in that list and never will
 * be, so they still take a mapping DECISION, called out as such:
 *   - SRS is this door's default the way HEBORIS is the engine's own, and
 *     HEBORIS sits in Normal -> normal.
 *   - ARS is the strict TGM-style system and NRS has no kicks at all, both
 *     closer in spirit to Hard's advanced rules -> hard.
 *   - BARS is the softer hybrid -> easy.
 */
function doomBandForRotationSystem(system) {
    switch (system) {
        // Named by the reference, init.c:178-180.
        case 'ACE-SRS':
        case 'ACE-ARS':
        case 'DS-WORLD':
            return 'easy';
        case 'TI-WORLD':
            return 'normal';
        case 'TI-ARS':
        case 'SRS-X':
            return 'hard';
        // The door's own systems, a documented decision rather than a citation.
        case 'BARS':
            return 'easy';
        case 'SRS':
            return 'normal';
        case 'ARS':
        case 'NRS':
            return 'hard';
    }
}
const PASSED = { expired: false, checkpointLevel: null };
/**
 * True the instant a lock carries the level from below `threshold` to at or
 * past it — gamestart.c's `(tc[player] >= threshold) && (tcbuf < threshold)`.
 * Guards against re-firing on every later lock once the level has moved on.
 */
function justCrossed(levelBefore, levelAfter, threshold) {
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
function checkTorikan(input) {
    const { mode, levelBefore, levelAfter, gametimeFrames, rotationSystem } = input;
    if (mode === 'master') {
        if (justCrossed(levelBefore, levelAfter, 500) && gametimeFrames > exports.MASTER_TORIKAN_FRAMES) {
            return { expired: true, checkpointLevel: 500 };
        }
        return PASSED;
    }
    if (mode === 'death') {
        const band = doomBandForRotationSystem(rotationSystem);
        if (justCrossed(levelBefore, levelAfter, 500) && gametimeFrames > exports.DOOM_TORIKAN_FRAMES[band]) {
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
//# sourceMappingURL=time-limit.js.map