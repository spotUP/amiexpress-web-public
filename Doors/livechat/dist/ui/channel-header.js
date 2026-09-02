"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createChannelHeader = createChannelHeader;
exports.formatChannelHeader = formatChannelHeader;
exports.updateChannelHeader = updateChannelHeader;
exports.formatPinnedCount = formatPinnedCount;
const door_theme_1 = require("../door-theme");
/** Create channel header component */
function createChannelHeader(blessed, screen) {
    return blessed.box({
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
/** Format channel header content */
function formatChannelHeader(channel, userCount) {
    if (!channel)
        return ' No channel selected';
    const topic = channel.topic ? ` - ${channel.topic}` : '';
    const prefix = channel.type === 'dm' ? '@' : '#';
    return ` ${prefix}${channel.name}${topic} [${userCount} users]`;
}
/** Update channel header */
function updateChannelHeader(header, channel, userCount) {
    header.setContent(formatChannelHeader(channel, userCount));
}
/** Format pinned indicator */
function formatPinnedCount(count) {
    return count > 0 ? ` [${count} pinned]` : '';
}
