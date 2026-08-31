"use strict";
/**
 * What the sysop can set on LiveChat, and what the door does with it.
 *
 * The declaration is `door.settings.json` beside this file; the values are
 * `settings.json`, written by the admin. Both are read through the SDK, which
 * resolves the door's root - `__dirname` is this directory in development and
 * `dist/` in production, because the backend imports `index.ts` in one and
 * `dist/index.js` in the other.
 *
 * Read once per door launch (`loadSettings` in createApp), then handed out by
 * `settings()`. Reading per launch rather than per process is what makes a
 * change in the admin reach the next user without a backend restart; reading
 * once per launch rather than per event keeps it off the message path.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.applySettings = applySettings;
exports.loadSettings = loadSettings;
exports.settings = settings;
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
/**
 * What LiveChat ran with before it declared anything. A board that sets
 * nothing must behave exactly as it did.
 */
exports.DEFAULT_SETTINGS = {
    defaultChannel: 'general',
    soundEffects: true,
    sidebarWidth: 15,
    reconnectAttempts: 3,
};
function clampInt(value, fallback, min, max) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}
/**
 * The declared values, made safe to use.
 *
 * The SDK has already applied the manifest's types; this is the door's own
 * floor - a sidebar of 0 columns or 900 reconnect attempts is not a setting,
 * it is a broken screen, and a hand-edited settings.json can carry either.
 */
function applySettings(raw) {
    const channel = typeof raw.defaultChannel === 'string' ? raw.defaultChannel.trim() : '';
    return {
        defaultChannel: channel !== '' ? channel : exports.DEFAULT_SETTINGS.defaultChannel,
        soundEffects: raw.soundEffects === undefined ? exports.DEFAULT_SETTINGS.soundEffects : raw.soundEffects !== false,
        sidebarWidth: clampInt(raw.sidebarWidth, exports.DEFAULT_SETTINGS.sidebarWidth, 8, 40),
        reconnectAttempts: clampInt(raw.reconnectAttempts, exports.DEFAULT_SETTINGS.reconnectAttempts, 1, 10),
    };
}
let current = exports.DEFAULT_SETTINGS;
/** Read what the sysop set. Called once, when a user opens the door. */
function loadSettings() {
    try {
        current = applySettings((0, settings_1.readDoorSettings)(__dirname));
    }
    catch (error) {
        // A manifest someone broke by hand must not stop the door: it runs on
        // what it shipped with, and the admin reports the fault.
        console.error('[LiveChat] settings:', error.message);
        current = exports.DEFAULT_SETTINGS;
    }
    return current;
}
/** What the current launch is running with. */
function settings() {
    return current;
}
