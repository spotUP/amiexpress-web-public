"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendRoomLine = sendRoomLine;
const format_1 = require("../utils/format");
const markdown_1 = require("../utils/markdown");
const formatter_1 = require("../core/formatter");
const reply_quote_1 = require("../core/reply-quote");
const door_theme_1 = require("../door-theme");
function sendRoomLine(deps, msg, replyTo) {
    const { socket, userId, username } = deps;
    const messageId = `${userId}-${Date.now()}`;
    socket.emit('room:message', { message: msg, messageId, clientId: messageId, ...(replyTo ? { replyTo } : {}) });
    // Local echo (the server skips echoing own messages back). The content is
    // parsed as it is for anyone else's line; the tags around it are ours.
    const parent = replyTo ? deps.lookupMessage(replyTo) : undefined;
    if (parent)
        deps.addChatMessage((0, reply_quote_1.formatReplyQuote)(parent), false, messageId);
    const time = (0, format_1.formatTime)(new Date());
    const color = (0, formatter_1.getUserColor)(username);
    deps.addChatMessage(`{${door_theme_1.T.dim}-fg}[${time}]{/${door_theme_1.T.dim}-fg} <{${color}-fg}${username}{/${color}-fg}> ${(0, markdown_1.parseContent)(msg)}`, false, messageId);
    deps.rememberMessage(messageId, username, msg);
    deps.updateTypingPreview();
    deps.inputHistory.add(messageId, msg);
}
