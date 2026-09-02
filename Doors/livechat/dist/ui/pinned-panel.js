"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPinnedPanel = createPinnedPanel;
/**
 * Pinned messages panel UI component
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("./theme");
const door_theme_1 = require("../door-theme");
function createPinnedPanel(screen, pinnedMessages) {
    const overlay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '80%',
        height: '70%',
        border: {
            type: 'line',
            labelStyle: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar } // Blue background for label
        },
        style: { border: { fg: theme_1.PANEL_BORDER }, ...theme_1.PANEL_FOCUS_STYLE },
        label: ' Pinned Messages ',
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        scrollbar: { ch: '█' },
        focusable: true,
        hidden: true,
        trapFocus: true,
    });
    if (pinnedMessages.length === 0) {
        overlay.setContent(`{${door_theme_1.T.dim}-fg}No pinned messages in this room.{/${door_theme_1.T.dim}-fg}\n\n{${door_theme_1.T.accent}-fg}Press ESC to close{/${door_theme_1.T.accent}-fg}`);
    }
    else {
        let content = `{bold}{${door_theme_1.T.accentAlt}-fg}Pinned Messages (${pinnedMessages.length}):{/${door_theme_1.T.accentAlt}-fg}{/bold}\n\n`;
        pinnedMessages.forEach((pin, idx) => {
            const pinnedDate = new Date(pin.pinned_at * 1000).toLocaleString();
            const messageDate = new Date(pin.message_created_at * 1000).toLocaleString();
            content += `{${door_theme_1.T.accent}-fg}${idx + 1}.{/${door_theme_1.T.accent}-fg} {${door_theme_1.T.accentAlt}-fg}${pin.sender_username}{/${door_theme_1.T.accentAlt}-fg}: ${pin.message}\n`;
            content += `   {${door_theme_1.T.dim}-fg}Sent: ${messageDate}{/${door_theme_1.T.dim}-fg}\n`;
            content += `   {${door_theme_1.T.dim}-fg}Pinned by ${pin.pinned_by} on ${pinnedDate}{/${door_theme_1.T.dim}-fg}\n\n`;
        });
        content += `\n{${door_theme_1.T.accent}-fg}Press ESC to close{/${door_theme_1.T.accent}-fg}`;
        overlay.setContent(content);
    }
    overlay.key(['escape', 'q'], () => {
        overlay.hide();
        overlay.destroy();
        screen.render();
    });
    overlay.show();
    overlay.focus();
    screen.render();
    return overlay;
}
