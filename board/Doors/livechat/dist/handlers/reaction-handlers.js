"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reactToMessage = reactToMessage;
exports.unreactToMessage = unreactToMessage;
exports.listMessageReactions = listMessageReactions;
function reactToMessage(socket, roomId, messageId, emoji) {
    socket.emit('chat:react', { roomId, messageId, emoji });
}
function unreactToMessage(socket, roomId, messageId, emoji) {
    socket.emit('chat:unreact', { roomId, messageId, emoji });
}
function listMessageReactions(socket, roomId, messageId) {
    socket.emit('chat:reactions:list', { roomId, messageId });
}
