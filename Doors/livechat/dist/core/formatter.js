"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMessage = formatMessage;
exports.formatReactions = formatReactions;
exports.formatSystemMessage = formatSystemMessage;
exports.getUserColor = getUserColor;
exports.formatThread = formatThread;
exports.formatPinned = formatPinned;
const types_1 = require("../types");
const format_1 = require("../utils/format");
const markdown_1 = require("../utils/markdown");
const mentions_1 = require("../utils/mentions");
const ansi_1 = require("../utils/ansi");
/** Format a message for display */
function formatMessage(msg, currentUser, compact) {
    const time = compact ? '' : `{gray-fg}[${(0, format_1.formatTime)(msg.createdAt)}]{/gray-fg} `;
    const name = (0, ansi_1.userName)(msg.username, getUserColor(msg.username));
    let content = (0, markdown_1.parseContent)(msg.content);
    content = (0, mentions_1.highlightMentions)(content, currentUser);
    if (msg.type === 'action') {
        return `${time}{magenta-fg}* ${msg.username} ${content}{/magenta-fg}`;
    }
    return `${time}${name}: ${content}`;
}
/** Format reactions */
function formatReactions(reactions) {
    if (!reactions.length)
        return '';
    return ' ' + reactions.map(r => {
        const emoji = types_1.EMOJI_DISPLAY[r.emoji] || r.emoji;
        return `{cyan-fg}[${emoji}${r.count > 1 ? r.count : ''}]{/cyan-fg}`;
    }).join(' ');
}
/** Format system message */
function formatSystemMessage(text) {
    return (0, ansi_1.color)(`*** ${text}`, 'gray');
}
/** Get consistent color for username */
function getUserColor(username) {
    const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
    const hash = username.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
}
/** Format thread indicator */
function formatThread(replyCount) {
    if (replyCount <= 0)
        return '';
    return ` {gray-fg}[${replyCount} replies]{/gray-fg}`;
}
/** Format pinned indicator */
function formatPinned(isPinned) {
    return isPinned ? ' {cyan-fg}[PIN]{/cyan-fg}' : '';
}
