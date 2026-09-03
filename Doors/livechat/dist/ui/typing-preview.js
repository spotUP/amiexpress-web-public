"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TYPING_STALE_MS = exports.TYPING_HEIGHT = void 0;
exports.createTypingPreview = createTypingPreview;
exports.isAnyoneTyping = isAnyoneTyping;
exports.renderTypingPreview = renderTypingPreview;
exports.processKeystroke = processKeystroke;
const theme_1 = require("./theme");
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const status_bar_1 = require("./status-bar");
const input_box_1 = require("./input-box");
const door_theme_1 = require("../door-theme");
// Height of the typing indicator bar (shows who is typing in real-time)
exports.TYPING_HEIGHT = 3;
/** Create typing preview component */
function createTypingPreview(screen) {
    return (0, blessed_helpers_1.createBox)({
        parent: screen,
        bottom: status_bar_1.STATUS_HEIGHT + input_box_1.INPUT_HEIGHT,
        left: 16,
        width: '100%-16',
        height: exports.TYPING_HEIGHT,
        border: { type: 'line' },
        style: { fg: door_theme_1.T.dim, border: { fg: theme_1.PANEL_BORDER } },
        tags: true,
        content: '',
        focusable: false,
        mouse: false,
        clickable: false
    });
}
/**
 * How long a typing buffer stands after its owner's last keystroke.
 *
 * A buffer is only removed when its owner sends the line or clears it, so
 * somebody who types two characters and walks away would otherwise count as
 * typing for the rest of the session.
 */
exports.TYPING_STALE_MS = 5000;
/**
 * True while anyone - the caller or another node - is mid-keystroke.
 *
 * The preview reads this per buffer to decide what to draw; the theme
 * chrome reads it for the whole room, because a glitch is a lie written
 * over the chat log and every keystroke rebuilds that log's content. Both
 * answer the question from the same buffers and the same staleness.
 */
function isAnyoneTyping(buffers, now = Date.now()) {
    for (const buf of buffers.values()) {
        if (now - buf.lastUpdate <= exports.TYPING_STALE_MS)
            return true;
    }
    return false;
}
/** Render typing preview content - shows other users typing in real-time */
function renderTypingPreview(buffers) {
    const parts = [];
    const now = Date.now();
    for (const [userId, buf] of buffers) {
        // Skip stale buffers (no keystroke since TYPING_STALE_MS ago)
        if (now - buf.lastUpdate > exports.TYPING_STALE_MS)
            continue;
        // Show user's buffer with cursor indicator
        if (buf.buffer.length > 0) {
            parts.push(`{${buf.color}-fg}${buf.username}:{/${buf.color}-fg} ${buf.buffer}{inverse} {/inverse}`);
        }
    }
    // Return all typing users on one line, separated by spaces
    return parts.length > 0 ? parts.slice(0, 3).join('  ') : '';
}
/** Process keystroke for typing buffer */
function processKeystroke(buffers, userId, username, char, userColor) {
    let buf = buffers.get(userId);
    if (!buf) {
        buf = { username, buffer: '', lastUpdate: Date.now(), color: userColor };
        buffers.set(userId, buf);
    }
    if (char === 'BACKSPACE') {
        buf.buffer = buf.buffer.slice(0, -1);
    }
    else if (char === 'CLEAR' || char === 'SUBMIT') {
        buffers.delete(userId);
        return;
    }
    else {
        buf.buffer += char;
    }
    buf.lastUpdate = Date.now();
}
