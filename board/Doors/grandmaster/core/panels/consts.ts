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
export const DEFAULT_INPUT_REPEAT_DELAY = 20;

/** Frames between automatic speed increases, for TIME_INTERVAL levels. 15 seconds. */
export const DT_SPEED_INCREASE = 15 * 60;

/** Time Attack's limit: 120 seconds. */
export const TIME_ATTACK_TIME = 120;
export const TIME_ATTACK_FRAMES = TIME_ATTACK_TIME * 60;

export const COUNTDOWN_START = 8;
export const COUNTDOWN_LENGTH = 180;
export const COUNTDOWN_CURSOR_SPEED = 4;

/**
 * Raw frames-per-row by speed, before the /16 that turns them into frames per
 * displacement unit. Speed is 1-99; the plateau from 50 up is deliberate.
 */
const SPEED_TO_RISE_TIME_RAW: readonly number[] = [
  942, 983, 838, 790, 755, 695, 649, 604, 570, 515,
  474, 444, 394, 370, 347, 325, 306, 289, 271, 256,
  240, 227, 213, 201, 189, 178, 169, 158, 148, 138,
  129, 120, 112, 105,  99,  92,  86,  82,  77,  73,
   69,  66,  62,  59,  56,  54,  52,  50,  48,  47,
   47,  47,  47,  47,  47,  47,  47,  47,  47,  47,
   47,  47,  47,  47,  47,  47,  47,  47,  47,  47,
   47,  47,  47,  47,  47,  47,  47,  47,  47,  47,
   47,  47,  47,  47,  47,  47,  47,  47,  47,  47,
   47,  47,  47,  47,  47,  47,  47,  47,  47,
];

/**
 * Frames per displacement unit, indexed by speed (1-99).
 *
 * A row is 16 displacement units, so the raw value IS frames per row. These
 * stay fractional - the rise timer accumulates them, and rounding here would
 * drift the stack out of step within a single game.
 */
export const SPEED_TO_RISE_TIME: readonly number[] = [
  0, ...SPEED_TO_RISE_TIME_RAW.map((x) => x / 16),
];

/** Displacement units in one row. */
export const DISPLACEMENT_PER_ROW = 16;

/**
 * Panels that must be cleared to reach the next speed, for CLEARED_PANEL_COUNT
 * levels (classic endless and 1P time attack). Indexed by current speed.
 * The last entry is infinite: speed 99 is the end of the ladder.
 */
export const PANELS_TO_NEXT_SPEED: readonly number[] = [
  0,
   9, 12, 12, 12, 12, 12, 15, 15, 18, 18,
  24, 24, 24, 24, 24, 24, 21, 18, 18, 18,
  36, 36, 36, 36, 36, 36, 36, 36, 36, 36,
  39, 39, 39, 39, 39, 39, 39, 39, 39, 39,
  45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
  45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
  45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
  45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
  45, 45, 45, 45, 45, 45, 45, 45, 45, 45,
  45, 45, 45, 45, 45, 45, 45, 45, Infinity,
];

/** Shake frames by panel count (width * height), 1-24. Beyond 24 it clamps. */
const GARBAGE_SIZE_TO_SHAKE_FRAMES: readonly number[] = [
  18, 18, 18, 18, 24, 42,
  42, 42, 42, 42, 42, 66,
  66, 66, 66, 66, 66, 66,
  66, 66, 66, 66, 66, 76,
];

/** How long the stack shakes when a garbage block of this size lands. */
export function shakeFramesForGarbageSize(width: number, height: number): number {
  const panelCount = width * height;
  if (panelCount > GARBAGE_SIZE_TO_SHAKE_FRAMES.length) {
    return GARBAGE_SIZE_TO_SHAKE_FRAMES[GARBAGE_SIZE_TO_SHAKE_FRAMES.length - 1];
  }
  if (panelCount > 0) {
    return GARBAGE_SIZE_TO_SHAKE_FRAMES[panelCount - 1];
  }
  throw new Error(
    `Trying to determine shake time of a garbage block with width ${width} and height ${height}`,
  );
}

/**
 * Combo size to the garbage it sends: a list of WIDTHS, each one row tall.
 *
 * Upstream declares entries at 4-14, 20 and 27 and then fills every gap up to
 * 72 by carrying the previous entry forward, so 15-19 all send four 6-wides,
 * 21-26 send six, and 28+ send eight. A plain three-panel match sends nothing.
 */
function buildComboGarbage(): readonly (readonly number[])[] {
  const table: number[][] = [];
  const set = (i: number, widths: number[]) => { table[i] = widths; };

  set(1, []); set(2, []); set(3, []);
  set(4, [3]);       set(5, [4]);        set(6, [5]);
  set(7, [6]);       set(8, [3, 4]);     set(9, [4, 4]);
  set(10, [5, 5]);   set(11, [5, 6]);    set(12, [6, 6]);
  set(13, [6, 6, 6]);
  set(14, [6, 6, 6, 6]);
  set(20, [6, 6, 6, 6, 6, 6]);
  set(27, [6, 6, 6, 6, 6, 6, 6, 6]);

  for (let i = 1; i <= 72; i++) {
    if (!table[i]) table[i] = table[i - 1];
  }
  return table;
}

const COMBO_GARBAGE = buildComboGarbage();

/** The garbage widths a combo of `comboSize` panels sends. Empty for 3 or fewer. */
export function comboGarbageFor(comboSize: number): readonly number[] {
  if (comboSize < 1) return [];
  const capped = Math.min(comboSize, 72);
  return COMBO_GARBAGE[capped] ?? [];
}

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
export const MAX_CHAIN_GARBAGE_HEIGHT = 12;

/** The highest chain the score table rewards; above this a chain scores nothing. */
export const MAX_SCORING_CHAIN = 13;

/** Score for a combo of N panels (index 0 unused, 1-30). Only 4+ scores. */
export const SCORE_COMBO_TA: readonly number[] = [
  0,
     0,    0,    0,   20,   30,
    50,   60,   70,   80,  100,
   140,  170,  210,  250,  290,
   340,  390,  440,  490,  550,
   610,  680,  750,  820,  900,
   980, 1060, 1150, 1240, 1330,
];

/** Score for a chain of N (index 0 unused, 1-13). Chains above 13 score 0. */
export const SCORE_CHAIN_TA: readonly number[] = [
  0,
     0,   50,   80,  150,  300,
   400,  500,  700,  900, 1100,
  1300, 1500, 1800,
];

/** Points for one popped panel. */
export const SCORE_PER_PANEL = 10;

/** Points for one completed manual raise. */
export const SCORE_PER_MANUAL_RAISE = 1;

/** Upstream's cap, and its comment on it: "lol owned". */
export const MAX_SCORE = 99999;

// --- Garbage flight timings (client/src/globals.lua) ---

/** Frames the attack animation plays before reaching the telegraph. */
export const GARBAGE_TRANSIT_TIME = 45;
/** Frames the garbage sits in the telegraph once it arrives. */
export const GARBAGE_TELEGRAPH_TIME = 45;
/** Frames after leaving the telegraph before the garbage may land. */
export const GARBAGE_DELAY_LAND_TIME = 60;
/** How far behind a stack may fall before the match is unrecoverable. */
export const MAX_LAG = 155 + GARBAGE_TELEGRAPH_TIME + GARBAGE_TRANSIT_TIME;

/**
 * Frames garbage stays staged before it is put in transit.
 *
 * The +1 is upstream's, with the comment that it compensates for a historical
 * off-by-one in when the attack animation started. Total time from earning a
 * piece to it being able to land is this plus GARBAGE_DELAY_LAND_TIME: 151.
 */
export const STAGING_DURATION = GARBAGE_TRANSIT_TIME + GARBAGE_TELEGRAPH_TIME + 1;

export enum AttackType {
  COMBO = 0,
  CHAIN = 1,
  SHOCK = 2,
}

/**
 * Engine versions. Physics differ between them, and the committed replay
 * fixtures span several - a replay loaded under the wrong one diverges.
 */
export const ENGINE_VERSIONS = {
  PRE_TELEGRAPH: '045',
  TELEGRAPH_COMPATIBLE: '046',
  TOUCH_COMPATIBLE: '047',
  LEVELDATA: '048',
  WIGGLE_PUNISH: '049',
} as const;

export const ENGINE_VERSION = ENGINE_VERSIONS.WIGGLE_PUNISH;
