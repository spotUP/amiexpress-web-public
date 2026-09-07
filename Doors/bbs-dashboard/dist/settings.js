"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.applySettings = applySettings;
exports.loadSettings = loadSettings;
/**
 * The dashboard's one sysop-settable knob: how often it refreshes.
 *
 * The auto-refresh interval was hardcoded at 3 seconds (`startAutoRefresh`),
 * and the uptime counter advanced by a matching hardcoded 3. A busy board
 * wants it slower; a wall display wants it snappier. Declared in
 * `door.settings.json`, edited in the admin, read here through the same SDK
 * helper every other door uses. Mirrors `Doors/livechat/settings.ts`.
 */
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
exports.DEFAULT_SETTINGS = { refreshSeconds: 3 };
function clampInt(raw, def, min, max) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return def;
    return Math.min(max, Math.max(min, Math.round(n)));
}
/**
 * The declared value, made safe to use. A 0-second refresh is a busy-loop and
 * a 3600-second one is not a live dashboard; a hand-edited settings.json can
 * carry either, so the door has its own floor and ceiling.
 */
function applySettings(raw) {
    return { refreshSeconds: clampInt(raw.refreshSeconds, exports.DEFAULT_SETTINGS.refreshSeconds, 1, 60) };
}
/** Read what the sysop set. Called once, when a user opens the door. */
function loadSettings() {
    try {
        return applySettings((0, settings_1.readDoorSettings)(__dirname));
    }
    catch (error) {
        // A manifest broken by hand must not stop the door: it runs on the
        // default, and the admin reports the fault.
        console.error('[BBSDashboard] settings:', error.message);
        return exports.DEFAULT_SETTINGS;
    }
}
