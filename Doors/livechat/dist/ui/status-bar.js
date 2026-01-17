"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STATUS_HEIGHT = void 0;
exports.createStatusBar = createStatusBar;
exports.updateStatusBar = updateStatusBar;
/**
 * Status bar component - uses SDK StatusBar widget
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const types_1 = require("../types");
exports.STATUS_HEIGHT = 1;
function createStatusBar(screen) {
    const bar = new blessed_1.StatusBar({
        parent: screen,
        position: 'bottom',
        fg: 'white',
        bg: 'blue',
        separator: ' | ',
    });
    return bar;
}
function updateStatusBar(statusBar, state, presenceService, username, userId, nodeId, getChannelDisplayName, updateChatHeader) {
    const ch = getChannelDisplayName(state.currentChannel) || 'none';
    const status = state.prefs.muteAllEvents ? 'MUTED' : 'LIVE';
    const presence = presenceService.get(userId);
    const myStatus = presence?.status || 'online';
    // Use setFullContent for the custom LiveChat format
    statusBar.setFullContent(` @${username} | Node ${nodeId} | #${ch} | ${types_1.PRESENCE_INDICATORS[myStatus]} ${myStatus.toUpperCase()} | [${status}] | F1:Help F4:Emoji `);
    updateChatHeader();
}
