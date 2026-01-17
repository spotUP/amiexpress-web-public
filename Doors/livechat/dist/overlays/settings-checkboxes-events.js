"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEventCheckboxes = createEventCheckboxes;
/**
 * Settings event checkboxes
 */
const blessed_1 = __importDefault(require("@amiexpress/bbs-door-sdk/engines/ui/blessed"));
function createEventCheckboxes(p, state, l, r) {
    blessed_1.default.box({
        parent: p,
        top: r++,
        left: l,
        width: 20,
        height: 1,
        content: '{cyan-fg}BBS Events:{/cyan-fg}',
        tags: true,
        style: { fg: 'white' },
    });
    const showLogins = blessed_1.default.checkbox({
        parent: p,
        top: r++,
        left: l + 2,
        text: 'Show User Logins/Logouts',
        checked: state.prefs.showLogins,
        mouse: true,
        style: { fg: 'white' },
    });
    const showFileActivity = blessed_1.default.checkbox({
        parent: p,
        top: r++,
        left: l + 2,
        text: 'Show File Uploads/Downloads',
        checked: state.prefs.showFileActivity,
        mouse: true,
        style: { fg: 'white' },
    });
    const showDoorActivity = blessed_1.default.checkbox({
        parent: p,
        top: r++,
        left: l + 2,
        text: 'Show Door Activity',
        checked: state.prefs.showDoorActivity,
        mouse: true,
        style: { fg: 'white' },
    });
    const showMessages = blessed_1.default.checkbox({
        parent: p,
        top: r++,
        left: l + 2,
        text: 'Show New Messages',
        checked: state.prefs.showMessages,
        mouse: true,
        style: { fg: 'white' },
    });
    const showAnnouncements = blessed_1.default.checkbox({
        parent: p,
        top: r++,
        left: l + 2,
        text: 'Show System Announcements',
        checked: state.prefs.showSystemAnnouncements,
        mouse: true,
        style: { fg: 'white' },
    });
    return { showLogins, showFileActivity, showDoorActivity, showMessages, showAnnouncements, nextRow: r };
}
