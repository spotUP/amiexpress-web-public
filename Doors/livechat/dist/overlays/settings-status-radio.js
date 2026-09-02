"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusRadio = createStatusRadio;
/**
 * Settings status radio buttons
 */
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const door_theme_1 = require("../door-theme");
function createStatusRadio(p, l, top, h, presenceService, socketEmitter, userId, updateStatusBar) {
    const radio = blessed_1.default.radioset({
        parent: p,
        top,
        left: l,
        width: '100%-6',
        height: h,
        mouse: true,
        items: [
            { text: 'Online', value: 'online' },
            { text: 'Away', value: 'away' },
            { text: 'Busy', value: 'busy' },
            { text: 'Do Not Disturb', value: 'dnd' },
        ],
        selected: 0,
        vertical: true,
        spacing: 1,
        style: { fg: door_theme_1.T.ink },
    });
    radio.on('change', (v) => {
        presenceService.setStatus(userId, v);
        socketEmitter.presenceUpdate(v);
        updateStatusBar();
    });
    return radio;
}
