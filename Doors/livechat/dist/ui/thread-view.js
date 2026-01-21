"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createThreadView = createThreadView;
/**
 * Thread view UI component
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function createThreadView(screen, threadData) {
    const overlay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '80%',
        height: '80%',
        border: {
            type: 'line',
            labelStyle: { fg: 'white', bg: 'blue' } // Blue background for label
        },
        style: { border: { fg: 'cyan' } },
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
    let content = `{bold}{cyan-fg}Original Message:{/cyan-fg}{/bold}\n`;
    content += `{yellow-fg}${threadData.parent.sender_username}{/yellow-fg}: ${threadData.parent.message}\n`;
    content += `{gray-fg}${new Date(threadData.parent.created_at * 1000).toLocaleString()}{/gray-fg}\n\n`;
    // Replies
    if (threadData.replies && threadData.replies.length > 0) {
        content += `{bold}{green-fg}Replies (${threadData.replies.length}):{/green-fg}{/bold}\n\n`;
        threadData.replies.forEach((reply, idx) => {
            content += `{cyan-fg}${idx + 1}.{/cyan-fg} {yellow-fg}${reply.sender_username}{/yellow-fg}: ${reply.message}\n`;
            content += `   {gray-fg}${new Date(reply.created_at * 1000).toLocaleString()}{/gray-fg}\n\n`;
        });
    }
    else {
        content += `{gray-fg}No replies yet. Be the first to reply!{/gray-fg}\n`;
    }
    content += `\n{cyan-fg}Press ESC to close{/cyan-fg}`;
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
