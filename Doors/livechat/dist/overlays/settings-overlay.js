"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSettingsOverlay = createSettingsOverlay;
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
const settings_checkboxes_events_1 = require("./settings-checkboxes-events");
const settings_checkboxes_prefs_1 = require("./settings-checkboxes-prefs");
const settings_status_radio_1 = require("./settings-status-radio");
const settings_save_1 = require("./settings-save");
function createSettingsOverlay(s, st, ps, se, uid, usb, hm) {
    const w = Math.min(72, Math.max(46, s.width - 6));
    const h = Math.min(22, Math.max(18, s.height - 4));
    const l = 2;
    const o = blessed_1.default.box({
        parent: s,
        top: 'center',
        left: 'center',
        width: w,
        height: h,
        label: ' Settings ',
        border: { type: 'line' },
        shadow: true,
        hidden: true,
        mouse: true,
        keys: true,
        closable: true,
        draggable: true,
        trapFocus: true,
        ch: ' ',
        style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } },
    });
    o.enableResize();
    const eCb = (0, settings_checkboxes_events_1.createEventCheckboxes)(o, st, l, 2);
    const pCb = (0, settings_checkboxes_prefs_1.createPrefCheckboxes)(o, l, eCb.nextRow + 2, 2);
    blessed_1.default.line({
        parent: o,
        top: pCb.nextRow,
        left: l,
        width: '100%-6',
        orientation: 'horizontal',
        type: 'line',
        style: { fg: 'gray' },
    });
    blessed_1.default.box({
        parent: o,
        top: pCb.nextRow + 1,
        left: l,
        width: 20,
        height: 1,
        content: 'Status:',
        style: { fg: 'cyan' },
    });
    (0, settings_status_radio_1.createStatusRadio)(o, l, pCb.nextRow + 3, Math.min(6, Math.max(4, h - pCb.nextRow - 7)), ps, se, uid, usb);
    const btn = blessed_1.default.button({
        parent: o,
        bottom: 1,
        left: 'center',
        width: 12,
        height: 1,
        content: 'Close',
        mouse: true,
        style: { fg: 'white', bg: 'blue', focus: { bg: 'cyan' } },
    });
    btn.on('press', () => {
        (0, settings_save_1.saveSettings)(st, { ...eCb, ...pCb }, usb);
        hm(o);
    });
    // Handle close from X button or ESC key
    o.on('close', () => {
        (0, settings_save_1.saveSettings)(st, { ...eCb, ...pCb }, usb);
        hm(o);
    });
    // Add explicit escape key handler to ensure it works even when child elements are focused
    o.key(['escape'], () => {
        (0, settings_save_1.saveSettings)(st, { ...eCb, ...pCb }, usb);
        hm(o);
    });
    return o;
}
