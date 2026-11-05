"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatMessagesFrom = chatMessagesFrom;
function chatMessagesFrom(messages, username) {
    const u = (username || '').toLowerCase();
    return messages.filter(m => m.type === 'message' && (m.username || '').toLowerCase() === u);
}
