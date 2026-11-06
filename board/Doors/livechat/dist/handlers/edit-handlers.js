"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editMessage = editMessage;
exports.deleteMessage = deleteMessage;
function editMessage(socket, roomId, messageId, content) {
    socket.emit('chat:edit', { roomId, messageId, content });
}
function deleteMessage(socket, roomId, messageId) {
    socket.emit('chat:delete', { roomId, messageId });
}
