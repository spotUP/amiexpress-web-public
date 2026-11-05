"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupPinListeners = setupPinListeners;
exports.pinMessage = pinMessage;
exports.unpinMessage = unpinMessage;
exports.getPinnedMessages = getPinnedMessages;
exports.cleanupPinListeners = cleanupPinListeners;
function setupPinListeners(socket, onPinUpdated, onPinList) {
    socket.on('chat:pin:updated', onPinUpdated);
    socket.on('chat:pin:list', onPinList);
}
function pinMessage(socket, roomId, messageId) {
    socket.emit('chat:pin:add', { roomId, messageId });
}
function unpinMessage(socket, roomId, messageId) {
    socket.emit('chat:pin:remove', { roomId, messageId });
}
function getPinnedMessages(socket, roomId) {
    socket.emit('chat:pin:list', { roomId });
}
function cleanupPinListeners(socket) {
    socket.off('chat:pin:updated');
    socket.off('chat:pin:list');
}
