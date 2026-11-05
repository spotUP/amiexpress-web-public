/**
 * The lookup tables, transcribed from panel-attack/panel-game @ c80668e.
 *
 * Sources, table by table:
 *   SPEED_TO_RISE_TIME, COUNTDOWN_*, ATTACK_TYPE, ENGINE_VERSIONS
 *                                        common/engine/consts.lua
 *   PANELS_TO_NEXT_SPEED, GARBAGE_SIZE_TO_SHAKE_FRAMES, DT_SPEED_INCREASE,
 *   DEFAULT_INPUT_REPEAT_DELAY           common/engine/Stack.lua
 *   COMBO_GARBAGE, SCORE_COMBO_TA, SCORE_CHAIN_TA
 *                                        common/engine/checkMatches.lua
 *   GARBAGE_* timings, MAX_LAG           client/src/globals.lua
 *
 * Every value here was read out of the source, not remembered. Where a table
 * looks wrong it is quoted as wrong on purpose - upstream's own comment on the
 * rise table is "Yes, 2 is slower than 1 and 50..99 are the same."
 */
/** Frames a cursor direction is held before it starts repeating once per frame. */
export declare const DEFAULT_INPUT_REPEAT_DELAY = 20;
/** Frames between automatic speed increases, for TIME_INTERVAL levels. 15 seconds. */
export declare const DT_SPEED_INCREASE: number;
/** Time Attack's limit: 120 seconds. */
export declare const TIME_ATTACK_TIME = 120;
export declare const TIME_ATTACK_FRAMES: number;
export declare const COUNTDOWN_START = 8;
export declare const COUNTDOWN_LENGTH = 180;
export declare const COUNTDOWN_CURSOR_SPEED = 4;
/**
 * Frames per displacement unit, indexed by speed (1-99).
 *
 * A row is 16 displacement units, so the raw value IS frames per row. These
 * stay fractional - the rise timer accumulates them, and rounding here would
 * drift the stack out of step within a single game.
 */
export declare const SPEED_TO_RISE_TIME: readonly number[];
/** Displacement units in one row. */
export declare const DISPLACEMENT_PER_ROW = 16;
/**
 * Panels that must be cleared to reach the next speed, for CLEARED_PANEL_COUNT
 * levels (classic endless and 1P time attack). Indexed by current speed.
 * The last entry is infinite: speed 99 is the end of the ladder.
 */
export declare const PANELS_TO_NEXT_SPEED: readonly number[];
/** How long the stack shakes when a garbage block of this size lands. */
export declare function shakeFramesForGarbageSize(width: number, height: number): number;
/** The garbage widths a combo of `comboSize` panels sends. Empty for 3 or fewer. */
export declare function comboGarbageFor(comboSize: number): readonly number[];
/**
 * The tallest chain garbage that can be sent.
 *
 * DELIBERATE DIVERGENCE FROM panel-attack, which grows chain garbage without
 * limit as height = chainCounter - 1. Two independent sources say the original
 * stops: the SNES manual FAQ ("They will always be a x12 garbage block, from
 * x13 on") and panel-pop, which writes `if (chain > 12) chain = 12`. Since this
 * mode is TETRIS ATTACK, the original wins where the two disagree.
 *
 * Chain 13 therefore sends a 6-wide of height 12, and so does every chain above
 * it - which is also why the chain card reads "x?" rather than a number there.
 */
export declare const MAX_CHAIN_GARBAGE_HEIGHT = 12;
/** The highest chain the score table rewards; above this a chain scores nothing. */
export declare const MAX_SCORING_CHAIN = 13;
/** Score for a combo of N panels (index 0 unused, 1-30). Only 4+ scores. */
export declare const SCORE_COMBO_TA: readonly number[];
/** Score for a chain of N (index 0 unused, 1-13). Chains above 13 score 0. */
export declare const SCORE_CHAIN_TA: readonly number[];
/** Points for one popped panel. */
export declare const SCORE_PER_PANEL = 10;
/** Points for one completed manual raise. */
export declare const SCORE_PER_MANUAL_RAISE = 1;
/** Upstream's cap, and its comment on it: "lol owned". */
export declare const MAX_SCORE = 99999;
/** Frames the attack animation plays before reaching the telegraph. */
export declare const GARBAGE_TRANSIT_TIME = 45;
/** Frames the garbage sits in the telegraph once it arrives. */
export declare const GARBAGE_TELEGRAPH_TIME = 45;
/** Frames after leaving the telegraph before the garbage may land. */
export declare const GARBAGE_DELAY_LAND_TIME = 60;
/** How far behind a stack may fall before the match is unrecoverable. */
export declare const MAX_LAG: number;
/**
 * Frames garbage stays staged before it is put in transit.
 *
 * The +1 is upstream's, with the comment that it compensates for a historical
 * off-by-one in when the attack animation started. Total time from earning a
 * piece to it being able to land is this plus GARBAGE_DELAY_LAND_TIME: 151.
 */
export declare const STAGING_DURATION: number;
export declare enum AttackType {
    COMBO = 0,
    CHAIN = 1,
    SHOCK = 2
}
/**
 * Engine versions. Physics differ between them, and the committed replay
 * fixtures span several - a replay loaded under the wrong one diverges.
 */
export declare const ENGINE_VERSIONS: {
    readonly PRE_TELEGRAPH: "045";
    readonly TELEGRAPH_COMPATIBLE: "046";
    readonly TOUCH_COMPATIBLE: "047";
    readonly LEVELDATA: "048";
    readonly WIGGLE_PUNISH: "049";
};
export declare const ENGINE_VERSION: "049";
//# sourceMappingURL=consts.d.ts.map