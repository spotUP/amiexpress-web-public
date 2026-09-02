"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createThreadView = createThreadView;
/**
 * Thread view UI component
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
const theme_1 = require("./theme");
const door_theme_1 = require("../door-theme");
function createThreadView(screen, threadData) {
    const overlay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '80%',
        height: '80%',
        border: {
            type: 'line',
            labelStyle: { fg: door_theme_1.T.ink, bg: door_theme_1.T.bar } // Blue background for label
        },
        style: { border: { fg: theme_1.PANEL_BORDER }, ...theme_1.PANEL_FOCUS_STYLE },
        label: ` Thread: ${threadData.parent.message.substring(0, 40)}... `,
        tags: true,
        keys: true,
        vi: true,
        mouse: true,
        scrollable: true,
        scrollbar: { ch: '█' },
        focusable: true,
        hidden: true,
        trapFocus: true,
        zIndex: 9990,
    });
    // Parent message
    let content = `{bold}{${door_theme_1.T.accent}-fg}Original Message:{/${door_theme_1.T.accent}-fg}{/bold}\n`;
    content += `{${door_theme_1.T.accentAlt}-fg}${threadData.parent.sender_username}{/${door_theme_1.T.accentAlt}-fg}: ${threadData.parent.message}\n`;
    content += `{${door_theme_1.T.dim}-fg}${new Date(threadData.parent.created_at * 1000).toLocaleString()}{/${door_theme_1.T.dim}-fg}\n\n`;
    // Replies
    if (threadData.replies && threadData.replies.length > 0) {
        content += `{bold}{${door_theme_1.T.ok}-fg}Replies (${threadData.replies.length}):{/${door_theme_1.T.ok}-fg}{/bold}\n\n`;
        threadData.replies.forEach((reply, idx) => {
            content += `{${door_theme_1.T.accent}-fg}${idx + 1}.{/${door_theme_1.T.accent}-fg} {${door_theme_1.T.accentAlt}-fg}${reply.sender_username}{/${door_theme_1.T.accentAlt}-fg}: ${reply.message}\n`;
            content += `   {${door_theme_1.T.dim}-fg}${new Date(reply.created_at * 1000).toLocaleString()}{/${door_theme_1.T.dim}-fg}\n\n`;
        });
    }
    else {
        content += `{${door_theme_1.T.dim}-fg}No replies yet. Be the first to reply!{/${door_theme_1.T.dim}-fg}\n`;
    }
    content += `\n{${door_theme_1.T.accent}-fg}Press ESC to close{/${door_theme_1.T.accent}-fg}`;
    overlay.setContent(content);
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
