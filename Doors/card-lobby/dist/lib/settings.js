"use strict";
/**
 * What the sysop can set on the Card Lobby, and what the door does with it.
 *
 * The declaration is `door.settings.json` at the door root; the values are
 * `settings.json` beside it, written by the admin. Both are read through the
 * SDK, which resolves the door root by walking up from here - `lib/` in
 * development, `dist/lib/` in production, and neither carries a manifest or a
 * package.json of its own, so the walk lands on the door either way.
 *
 * Read once per door launch (`loadSettings` in the door's onStart), then
 * handed out by `settings()`. Reading per launch rather than per process is
 * what makes a change in the admin reach the next player without a backend
 * restart; the shipped values in `constants.ts` stay the defaults, so a board
 * that sets nothing plays exactly the lobby it played yesterday.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.applySettings = applySettings;
exports.loadSettings = loadSettings;
exports.settings = settings;
exports.dailyBonusCooldownMs = dailyBonusCooldownMs;
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
const constants_1 = require("./constants");
const HOUR_MS = 60 * 60 * 1000;
exports.DEFAULT_SETTINGS = {
    startingChips: constants_1.STARTING_CHIPS,
    dailyBonusChips: constants_1.DAILY_BONUS,
    dailyBonusCooldownHours: constants_1.DAILY_COOLDOWN_MS / HOUR_MS,
    entryFeeRate: constants_1.ENTRY_FEE_RATE,
    activityReward: constants_1.ACTIVITY_REWARD,
    winReward: constants_1.WIN_REWARD,
};
function clampInt(value, fallback, min, max) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}
function clampRate(value, fallback, min, max) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, n));
}
/**
 * The declared values, made safe to use.
 *
 * The SDK has already applied the manifest's types; this is the door's own
 * floor - an entry fee of 400% is not a setting, it is a table nobody can sit
 * at, and a hand-edited settings.json can carry one.
 */
function applySettings(raw) {
    return {
        startingChips: clampInt(raw.startingChips, exports.DEFAULT_SETTINGS.startingChips, 0, 1000000),
        dailyBonusChips: clampInt(raw.dailyBonusChips, exports.DEFAULT_SETTINGS.dailyBonusChips, 0, 100000),
        dailyBonusCooldownHours: clampInt(raw.dailyBonusCooldownHours, exports.DEFAULT_SETTINGS.dailyBonusCooldownHours, 1, 168),
        entryFeeRate: clampRate(raw.entryFeeRate, exports.DEFAULT_SETTINGS.entryFeeRate, 0, 1),
        activityReward: clampInt(raw.activityReward, exports.DEFAULT_SETTINGS.activityReward, 0, 10000),
        winReward: clampInt(raw.winReward, exports.DEFAULT_SETTINGS.winReward, 0, 10000),
    };
}
let current = exports.DEFAULT_SETTINGS;
/**
 * Read what the sysop set. Called once, when a player opens the door.
 *
 * `from` is the directory the SDK resolves the door root out of, and is only
 * ever passed by a test standing up a board of its own.
 */
function loadSettings(from = __dirname) {
    try {
        current = applySettings((0, settings_1.readDoorSettings)(from));
    }
    catch (error) {
        // A manifest someone broke by hand must not stop the door: it runs on what
        // it shipped with, and the admin reports the fault.
        console.error('[CardLobby] settings:', error.message);
        current = exports.DEFAULT_SETTINGS;
    }
    return current;
}
/** What the door is running with right now. */
function settings() {
    return current;
}
/**
 * The bonus cooldown as the wallet code measures it. The manifest declares
 * hours because that is what a sysop types; every comparison here is against
 * Date.now().
 */
function dailyBonusCooldownMs() {
    return current.dailyBonusCooldownHours * HOUR_MS;
}
