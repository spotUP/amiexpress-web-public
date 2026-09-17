"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.applySettings = applySettings;
exports.loadSettings = loadSettings;
/**
 * What the sysop set, made safe to use.
 *
 * Follows the wrapper shape every other door uses (see
 * Doors/bbs-dashboard/settings.ts): the manifest declares, the admin edits,
 * this clamps, and a hand-broken settings.json costs the door nothing.
 */
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
exports.DEFAULT_SETTINGS = {
    defaultService: '',
    dwellSeconds: 8,
    mosaicStyle: 'ascii',
    allowReveal: true,
};
function clampInt(raw, def, min, max) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return def;
    return Math.min(max, Math.max(min, Math.round(n)));
}
function applySettings(raw) {
    const style = String(raw.mosaicStyle ?? exports.DEFAULT_SETTINGS.mosaicStyle);
    return {
        defaultService: String(raw.defaultService ?? '').trim(),
        dwellSeconds: clampInt(raw.dwellSeconds, exports.DEFAULT_SETTINGS.dwellSeconds, 2, 60),
        mosaicStyle: style === 'sextant' ? 'sextant' : 'ascii',
        allowReveal: raw.allowReveal === undefined ? exports.DEFAULT_SETTINGS.allowReveal : Boolean(raw.allowReveal),
    };
}
function loadSettings() {
    try {
        return applySettings((0, settings_1.readDoorSettings)(__dirname));
    }
    catch (error) {
        console.error('[Teletext] settings:', error.message);
        return exports.DEFAULT_SETTINGS;
    }
}
//# sourceMappingURL=settings.js.map