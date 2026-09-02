/**
 * The Devil/DOOM grade ladder.
 *
 * HeborisCE's Devil family (gameMode 3 - this door's 'death') does NOT use
 * the TGM3 Master ladder. It has its own name table, dgname
 * (gamestart.c:609):
 *
 *   {"1","S1","S2","S3","S4","S5","S6","S7","S8","S9","S10","S11","S12",
 *    "S13","M","GM","GOD"}
 *
 * and its own progression rules:
 *
 *  - In run: `grade[player] = tr[player] / 10` every ten levels, guarded by
 *    `if(grade[player] < 13)` (gamestart.c:9348-9349, 9372-9373, 9398-9399).
 *    tr is level/10, so the grade index is level/100 and it stops at S13.
 *  - At level 1300 (gamestart.c:11108-11122, "DEVILなら1300で終了させる"):
 *    the run ends. GOD (index 16) flashes if gametime is within 19200 frames
 *    (5:20) for a CLASSIC-family rotation, or 21000 (5:50) for a WORLD-family
 *    one; otherwise S13.
 *  - After the staff roll (gamestart.c:4544-4552) the window is tighter -
 *    18000 frames (5:00) classic, 19200 (5:20) world. This door has no Devil
 *    staff roll (its credit roll is Master's M-grade challenge,
 *    core/credit-roll.ts), so the level-1300 window is the one that decides,
 *    and the post-roll pair is recorded here rather than guessed at.
 *
 * isWRule (gamestart.c:4856-4858) is `rots == 2 || 3 || 6 || 7`:
 * TI-WORLD, ACE-SRS, DS-WORLD and SRS-X.
 */
import type { TGMGrade, RotationSystem } from './types';
/** dgname indices 0-13; the ladder a Devil run can climb while playing. */
export declare const DEVIL_GRADE_LADDER: readonly TGMGrade[];
/** The level a Devil run ends at (gamestart.c:11108). */
export declare const DEVIL_END_LEVEL = 1300;
/**
 * GOD windows in frames at 60 fps, keyed by rotation family.
 * Level 1300 (gamestart.c:11109); the post-roll pair (4545) is unreachable
 * in this door and kept for the day a Devil roll exists.
 */
export declare const GOD_WINDOW_AT_1300: {
    readonly classic: 19200;
    readonly world: 21000;
};
export declare const GOD_WINDOW_AFTER_ROLL: {
    readonly classic: 18000;
    readonly world: 19200;
};
/** isWRule(): the WORLD-family rotation systems get the longer window. */
export declare function isWorldRule(rotationSystem: RotationSystem): boolean;
/**
 * In-run grade: level/100, capped at S13 (gamestart.c:9348-9349's
 * `if(grade[player] < 13) grade[player] = tr[player] / 10`).
 */
export declare function devilGradeForLevel(level: number): TGMGrade;
/**
 * The grade a finished Devil run keeps: GOD inside the window, S13 outside
 * it (gamestart.c:11109-11122).
 */
export declare function devilFinalGrade(gametimeFrames: number, rotationSystem: RotationSystem): TGMGrade;
//# sourceMappingURL=devil-grade.d.ts.map