"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GARBAGE_MODE_LEVEL = exports.CLASSIC_PRESET_COUNT = exports.MODERN_PRESET_COUNT = exports.StopFormula = exports.SpeedIncreaseMode = void 0;
exports.toSafePrecision = toSafePrecision;
exports.fractionToSafePrecision = fractionToSafePrecision;
exports.getModern = getModern;
exports.getClassic = getClassic;
exports.getClassicEndless = getClassicEndless;
exports.isGarbageCompatible = isGarbageCompatible;
/** How the stack's speed increases over time. */
var SpeedIncreaseMode;
(function (SpeedIncreaseMode) {
    SpeedIncreaseMode[SpeedIncreaseMode["TIME_INTERVAL"] = 1] = "TIME_INTERVAL";
    SpeedIncreaseMode[SpeedIncreaseMode["CLEARED_PANEL_COUNT"] = 2] = "CLEARED_PANEL_COUNT";
})(SpeedIncreaseMode || (exports.SpeedIncreaseMode = SpeedIncreaseMode = {}));
/** Which stop-time formula applies. The two are genuinely different shapes. */
var StopFormula;
(function (StopFormula) {
    StopFormula[StopFormula["MODERN"] = 1] = "MODERN";
    StopFormula[StopFormula["CLASSIC"] = 2] = "CLASSIC";
})(StopFormula || (exports.StopFormula = StopFormula = {}));
/** LevelData.lua's default when a preset does not call setShockFrequency. */
const DEFAULT_SHOCK_FREQUENCY = 12;
/**
 * JsonSafePrecision.toSafePrecision: `%.14g`, then parsed back.
 *
 * `toPrecision(14)` is the same 14-significant-digit truncation, and Number()
 * undoes the string form. Integers are returned untouched, as upstream does.
 */
function toSafePrecision(value) {
    if (Math.floor(value) === value)
        return value;
    return Number(value.toPrecision(14));
}
/** JsonSafePrecision.fractionToSafePrecision. */
function fractionToSafePrecision(numerator, denominator) {
    return toSafePrecision(numerator / denominator);
}
function modernLevel(startingSpeed, shockFrequency, shockCap, colors, adjacentDenialFrequency, maxHealth, comboConstant, chainConstant, dangerConstant, coefficient, dangerCoefficient, HOVER, GARBAGE_HOVER, FLASH, FACE, POP) {
    return {
        startingSpeed,
        speedIncreaseMode: SpeedIncreaseMode.TIME_INTERVAL,
        shockFrequency,
        shockCap,
        colors,
        adjacentDenialFrequency,
        maxHealth,
        stop: {
            formula: StopFormula.MODERN,
            comboConstant, chainConstant, dangerConstant, coefficient, dangerCoefficient,
        },
        frameConstants: { HOVER, GARBAGE_HOVER, FLASH, FACE, POP },
    };
}
function classicDifficulty(colors, adjacentDenialFrequency, comboConstant, chainConstant, dangerConstant, HOVER, FLASH, FACE, POP) {
    return {
        startingSpeed: 1,
        speedIncreaseMode: SpeedIncreaseMode.CLEARED_PANEL_COUNT,
        shockFrequency: DEFAULT_SHOCK_FREQUENCY,
        shockCap: 0,
        colors,
        adjacentDenialFrequency,
        maxHealth: 1,
        stop: {
            formula: StopFormula.CLASSIC,
            comboConstant, chainConstant, dangerConstant,
            coefficient: 0, dangerCoefficient: 0,
        },
        // No GARBAGE_HOVER: LevelData:isGarbageCompatible() is false for classic.
        frameConstants: { HOVER, FLASH, FACE, POP },
    };
}
/**
 * MODERN, levels 1-11.
 *
 * Two entries look like typos and are not - they are what the source says:
 * level 9 STARTS SLOWER than level 8 (27 against 29), and level 11 has a
 * dangerCoefficient of 0 while every other level's matches its coefficient.
 */
const MODERN = [
    //           spd shockF cap col adjacentDenial                      hp  combo chain danger coef dCoef  HOV GHOV FLA FAC POP
    modernLevel(1, 12, 21, 5, 0, 121, -20, 80, 160, 20, 20, 12, 41, 44, 20, 9),
    modernLevel(5, 14, 18, 5, fractionToSafePrecision(1, 7), 101, -16, 77, 152, 18, 18, 12, 36, 44, 18, 9),
    modernLevel(9, 16, 18, 5, fractionToSafePrecision(2, 7), 81, -12, 74, 144, 16, 16, 11, 31, 42, 17, 8),
    modernLevel(13, 19, 15, 5, fractionToSafePrecision(3, 7), 66, -8, 71, 136, 14, 14, 10, 26, 42, 16, 8),
    modernLevel(17, 23, 15, 5, fractionToSafePrecision(4, 7), 51, -3, 68, 128, 12, 12, 9, 21, 38, 15, 8),
    modernLevel(21, 26, 12, 5, fractionToSafePrecision(5, 7), 41, 2, 65, 120, 10, 10, 6, 16, 36, 14, 8),
    modernLevel(25, 29, 9, 5, fractionToSafePrecision(6, 7), 31, 7, 62, 112, 8, 8, 5, 13, 34, 13, 8),
    modernLevel(29, 33, 6, 5, 1, 21, 12, 60, 104, 6, 6, 4, 10, 32, 12, 7),
    modernLevel(27, 37, 6, 6, 1, 11, 17, 58, 96, 4, 4, 6, 7, 30, 11, 7),
    modernLevel(32, 41, 3, 6, 1, 1, 22, 56, 88, 2, 2, 6, 4, 28, 10, 7),
    modernLevel(45, 18, 3, 6, 1, 1, 27, 53, 80, 1, 0, 3, 3, 22, 8, 6),
];
/**
 * CLASSIC, difficulties 1-4 (easy, normal, hard, ex).
 *
 * Note hard's FACE of 15 is LONGER than normal's 13, against the trend of
 * every other constant. That is what the source says.
 */
const CLASSIC = [
    //                col adjDenial combo chain danger  HOV FLA FAC POP
    classicDifficulty(6, 1, 120, 300, 600, 12, 44, 17, 9),
    classicDifficulty(6, 1, 120, 180, 420, 9, 36, 13, 8),
    classicDifficulty(6, 1, 120, 120, 240, 6, 22, 15, 7),
    classicDifficulty(6, 1, 90, 90, 180, 3, 16, 10, 6),
];
const DIFFICULTY_INDEX = {
    easy: 1, normal: 2, hard: 3, ex: 4,
};
function difficultyIndex(difficulty) {
    return typeof difficulty === 'number' ? difficulty : DIFFICULTY_INDEX[difficulty];
}
function clone(data) {
    return {
        ...data,
        stop: { ...data.stop },
        frameConstants: { ...data.frameConstants },
    };
}
/** A copy of the modern preset for `level` (1-11). Upstream deep-copies too. */
function getModern(level) {
    const preset = MODERN[level - 1];
    if (!preset)
        throw new Error(`trying to load inexistent level preset ${level}`);
    return clone(preset);
}
/** A copy of the classic preset for `difficulty` (1-4 or easy/normal/hard/ex). */
function getClassic(difficulty) {
    const preset = CLASSIC[difficultyIndex(difficulty) - 1];
    if (!preset)
        throw new Error(`trying to load inexistent difficulty preset ${difficulty}`);
    return clone(preset);
}
/**
 * Classic presets as Endless uses them.
 *
 * Identical to classic except difficulty 1, which gets 5 colours instead of 6
 * and allows horizontally adjacent same-colour panels. Upstream notes that
 * game-prep and replay-loading code has to check the game mode and apply this
 * override - here it is simply its own accessor.
 */
function getClassicEndless(difficulty) {
    const data = getClassic(difficulty);
    if (difficultyIndex(difficulty) === 1) {
        data.colors = 5;
        data.adjacentDenialFrequency = 0;
    }
    return data;
}
exports.MODERN_PRESET_COUNT = MODERN.length;
exports.CLASSIC_PRESET_COUNT = CLASSIC.length;
/**
 * The level any mode with GARBAGE in it must be played at.
 *
 * Not a taste decision. A classic preset has no GARBAGE_HOVER - it has no
 * frame count for garbage turning into panels - so the first time a player
 * CLEARS garbage on a classic board the engine throws. That is unreachable in
 * Endless, where no garbage ever arrives, and certain in any versus mode.
 */
exports.GARBAGE_MODE_LEVEL = 10;
/** Garbage needs a GARBAGE_HOVER; classic presets do not have one. */
function isGarbageCompatible(data) {
    return data.frameConstants.GARBAGE_HOVER !== undefined;
}
//# sourceMappingURL=level-data.js.map