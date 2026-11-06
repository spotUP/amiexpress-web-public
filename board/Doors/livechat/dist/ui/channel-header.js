"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChannelHeader = createChannelHeader;
exports.chatPanelTitle = chatPanelTitle;
exports.formatChannelHeader = formatChannelHeader;
exports.updateChannelHeader = updateChannelHeader;
exports.formatPinnedCount = formatPinnedCount;
const door_theme_1 = require("../door-theme");
/** Create channel header component */
function createChannelHeader(blessed, screen) {
    return blessed.box({
        // A bar, not a frame: Panel borders when the caller names none, and a
        // one-row box with a frame has no interior - its content never renders.
        border: undefined,
        parent: screen,
        top: 1,
        left: 16,
        width: '100%-16',
        height: 1,
        style: { fg: door_theme_1.T.accent, bold: true },
        tags: true,
        content: ''
    });
}
/**
 * The chat panel's title: the channel name and its topic. This title is what
 * the user reads as the channel header, and it showed only "#general" after
 * /topic was set - the topic lived in state but no title ever included it.
 */
function chatPanelTitle(channelName, topic, suffix = '') {
    return topic ? `${channelName} - ${topic}${suffix}` : `${channelName}${suffix}`;
}
/** Format channel header content */
function formatChannelHeader(channel, userCount) {
    if (!channel)
        return ' No channel selected';
    const prefix = channel.type === 'dm' ? '@' : '#';
    return ` ${chatPanelTitle(prefix + channel.name, channel.topic)} [${userCount} users]`;
}
/** Update channel header */
function updateChannelHeader(header, channel, userCount) {
    header.setContent(formatChannelHeader(channel, userCount));
}
/** Format pinned indicator */
function formatPinnedCount(count) {
    return count > 0 ? ` [${count} pinned]` : '';
}
