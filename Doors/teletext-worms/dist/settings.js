"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SETTINGS = void 0;
exports.applySettings = applySettings;
exports.loadSettings = loadSettings;
/**
 * What the sysop set, made safe to use. Same wrapper shape as every other
 * door (see Doors/bbs-dashboard/settings.ts).
 */
const settings_1 = require("@amiexpress/bbs-door-sdk/settings");
exports.DEFAULT_SETTINGS = {
    wormsPerTeam: 2,
    startingHealth: 100,
    allowNetwork: true,
};
function clampInt(raw, def, min, max) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return def;
    return Math.min(max, Math.max(min, Math.round(n)));
}
function applySettings(raw) {
    return {
        wormsPerTeam: clampInt(raw.wormsPerTeam, exports.DEFAULT_SETTINGS.wormsPerTeam, 1, 4),
        startingHealth: clampInt(raw.startingHealth, exports.DEFAULT_SETTINGS.startingHealth, 25, 200),
        allowNetwork: raw.allowNetwork === undefined ? exports.DEFAULT_SETTINGS.allowNetwork : Boolean(raw.allowNetwork),
    };
}
function loadSettings() {
    try {
        return applySettings((0, settings_1.readDoorSettings)(__dirname));
    }
    catch (error) {
        console.error('[TeletextWorms] settings:', error.message);
        return exports.DEFAULT_SETTINGS;
    }
}
//# sourceMappingURL=settings.js.map