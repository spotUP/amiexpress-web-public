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
exports.DEFAULT_SETTINGS = { questions: 10, pack: '', allowReveal: true };
function clampInt(raw, def, min, max) {
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(n))
        return def;
    return Math.min(max, Math.max(min, Math.round(n)));
}
function applySettings(raw) {
    return {
        questions: clampInt(raw.questions, exports.DEFAULT_SETTINGS.questions, 3, 30),
        pack: String(raw.pack ?? '').trim(),
        allowReveal: raw.allowReveal === undefined ? exports.DEFAULT_SETTINGS.allowReveal : Boolean(raw.allowReveal),
    };
}
function loadSettings() {
    try {
        return applySettings((0, settings_1.readDoorSettings)(__dirname));
    }
    catch (error) {
        console.error('[TeletextQuiz] settings:', error.message);
        return exports.DEFAULT_SETTINGS;
    }
}
//# sourceMappingURL=settings.js.map