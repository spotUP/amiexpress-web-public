"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPinnedPanel = createPinnedPanel;
/**
 * Pinned messages panel UI component
 */
const blessed_helpers_1 = require("@amiexpress/bbs-door-sdk/utils/blessed-helpers");
function createPinnedPanel(screen, pinnedMessages) {
    const overlay = (0, blessed_helpers_1.createBox)({
        parent: screen,
        top: 'center',
        left: 'center',
        width: '80%',
        height: '70%',
        border: { type: 'line' },
        style: { border: { fg: 'yellow' } },
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
        overlay.setContent('{gray-fg}No pinned messages in this room.{/gray-fg}\n\n{cyan-fg}Press ESC to close{/cyan-fg}');
    }
    else {
        let content = `{bold}{yellow-fg}Pinned Messages (${pinnedMessages.length}):{/yellow-fg}{/bold}\n\n`;
        pinnedMessages.forEach((pin, idx) => {
            const pinnedDate = new Date(pin.pinned_at * 1000).toLocaleString();
            const messageDate = new Date(pin.message_created_at * 1000).toLocaleString();
            content += `{cyan-fg}${idx + 1}.{/cyan-fg} {yellow-fg}${pin.sender_username}{/yellow-fg}: ${pin.message}\n`;
            content += `   {gray-fg}Sent: ${messageDate}{/gray-fg}\n`;
            content += `   {gray-fg}Pinned by ${pin.pinned_by} on ${pinnedDate}{/gray-fg}\n\n`;
        });
        content += `\n{cyan-fg}Press ESC to close{/cyan-fg}`;
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
