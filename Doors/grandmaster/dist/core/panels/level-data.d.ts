/**
 * Level data: the tables that ARE the game.
 *
 * Transcribed from common/data/LevelData.lua and common/data/LevelPresets.lua
 * (panel-attack/panel-game @ c80668e), value for value. Two parallel systems,
 * both shipped by the original:
 *
 *   MODERN   levels 1-11, per-level frame constants, stop time by formula,
 *            speed rises on a 15-second timer, health from 121 down to 1.
 *   CLASSIC  easy/normal/hard/ex, flat stop constants, speed rises by panels
 *            cleared, one health, shock disabled - and NO garbageHover, which
 *            is why classic cannot be used for any mode with garbage.
 *
 * Semantics of the frame constants, from LevelData.lua's own doc block:
 *   HOVER          how long a panel hangs above an empty space before falling
 *   GARBAGE_HOVER  how long garbage panels hover after popping
 *   FLASH          how long panels flash after being matched
 *   FACE           how long they show the matched face after the flash, before
 *                  the pop timers start
 *   POP            how long one panel of a match takes to pop
 *
 * `adjacentDenialFrequency` is deliberately a TRUNCATED rational, not n/7.
 * Upstream runs it through JsonSafePrecision so the value survives a JSON
 * round trip unchanged; it is compared against a running frequency inside the
 * generator's rejection loop, so using the full-precision fraction would
 * eventually accept a panel the original denies and desync the board.
 */
/** How the stack's speed increases over time. */
export declare enum SpeedIncreaseMode {
    TIME_INTERVAL = 1,
    CLEARED_PANEL_COUNT = 2
}
/** Which stop-time formula applies. The two are genuinely different shapes. */
export declare enum StopFormula {
    MODERN = 1,
    CLASSIC = 2
}
export interface FrameConstants {
    HOVER: number;
    /** Absent on classic presets: classic cannot handle garbage at all. */
    GARBAGE_HOVER?: number;
    FLASH: number;
    FACE: number;
    POP: number;
}
export interface StopConstants {
    formula: StopFormula;
    comboConstant: number;
    chainConstant: number;
    dangerConstant: number;
    coefficient: number;
    dangerCoefficient: number;
}
export interface LevelData {
    startingSpeed: number;
    speedIncreaseMode: SpeedIncreaseMode;
    shockFrequency: number;
    shockCap: number;
    colors: number;
    adjacentDenialFrequency: number;
    maxHealth: number;
    stop: StopConstants;
    frameConstants: FrameConstants;
}
/**
 * JsonSafePrecision.toSafePrecision: `%.14g`, then parsed back.
 *
 * `toPrecision(14)` is the same 14-significant-digit truncation, and Number()
 * undoes the string form. Integers are returned untouched, as upstream does.
 */
export declare function toSafePrecision(value: number): number;
/** JsonSafePrecision.fractionToSafePrecision. */
export declare function fractionToSafePrecision(numerator: number, denominator: number): number;
export type ClassicDifficulty = 1 | 2 | 3 | 4 | 'easy' | 'normal' | 'hard' | 'ex';
/** A copy of the modern preset for `level` (1-11). Upstream deep-copies too. */
export declare function getModern(level: number): LevelData;
/** A copy of the classic preset for `difficulty` (1-4 or easy/normal/hard/ex). */
export declare function getClassic(difficulty: ClassicDifficulty): LevelData;
/**
 * Classic presets as Endless uses them.
 *
 * Identical to classic except difficulty 1, which gets 5 colours instead of 6
 * and allows horizontally adjacent same-colour panels. Upstream notes that
 * game-prep and replay-loading code has to check the game mode and apply this
 * override - here it is simply its own accessor.
 */
export declare function getClassicEndless(difficulty: ClassicDifficulty): LevelData;
export declare const MODERN_PRESET_COUNT: number;
export declare const CLASSIC_PRESET_COUNT: number;
/**
 * The level any mode with GARBAGE in it must be played at.
 *
 * Not a taste decision. A classic preset has no GARBAGE_HOVER - it has no
 * frame count for garbage turning into panels - so the first time a player
 * CLEARS garbage on a classic board the engine throws. That is unreachable in
 * Endless, where no garbage ever arrives, and certain in any versus mode.
 */
export declare const GARBAGE_MODE_LEVEL = 10;
/** Garbage needs a GARBAGE_HOVER; classic presets do not have one. */
export declare function isGarbageCompatible(data: LevelData): boolean;
//# sourceMappingURL=level-data.d.ts.map