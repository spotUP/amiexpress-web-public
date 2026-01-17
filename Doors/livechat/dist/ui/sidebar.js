"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sidebarConfig = sidebarConfig;
exports.formatUser = formatUser;
exports.renderUsers = renderUsers;
exports.formatChannel = formatChannel;
exports.renderChannels = renderChannels;
const ansi_1 = require("../utils/ansi");
/** Create sidebar box config */
function sidebarConfig() {
    return {
        label: ' Users ',
        border: { type: 'line' },
        tags: true,
        scrollable: true,
        style: {
            fg: 'white',
            border: { fg: 'magenta' }
        }
    };
}
/** Format user for sidebar */
function formatUser(member) {
    const prefix = member.isTyping ? '*' : ' ';
    const name = member.isOperator ? (0, ansi_1.bold)(member.username) : member.username;
    return `${prefix}${name}`;
}
/** Render user list */
function renderUsers(box, members) {
    const lines = members.map(formatUser);
    box.setContent(lines.join('\n'));
}
/** Format channel for list */
function formatChannel(ch, isCurrent) {
    const prefix = isCurrent ? '>' : ' ';
    const name = isCurrent ? (0, ansi_1.bold)(ch.name) : ch.name;
    return `${prefix}#${name} (${ch.memberCount})`;
}
/** Render channel list */
function renderChannels(box, channels, currentId) {
    const lines = channels.map(ch => formatChannel(ch, ch.id === currentId));
    box.setContent(lines.join('\n'));
}
