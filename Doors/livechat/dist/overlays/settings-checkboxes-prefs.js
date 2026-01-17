"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPrefCheckboxes = createPrefCheckboxes;
/**
 * Settings preference checkboxes
 */
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
function createPrefCheckboxes(p, l, r, g) {
    const muteSounds = blessed_1.default.checkbox({
        parent: p,
        top: r,
        left: l,
        text: 'Mute Sounds',
        checked: false,
        mouse: true,
        style: { fg: 'white' },
    });
    r += g;
    const showTyping = blessed_1.default.checkbox({
        parent: p,
        top: r,
        left: l,
        text: 'Show Typing Indicators',
        checked: true,
        mouse: true,
        style: { fg: 'white' },
    });
    r += g;
    const timestamps = blessed_1.default.checkbox({
        parent: p,
        top: r,
        left: l,
        text: 'Show Timestamps',
        checked: true,
        mouse: true,
        style: { fg: 'white' },
    });
    r += 2;
    return { muteSounds, showTyping, timestamps, nextRow: r };
}
