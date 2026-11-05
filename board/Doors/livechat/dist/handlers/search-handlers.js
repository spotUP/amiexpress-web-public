"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSearchListeners = setupSearchListeners;
exports.searchMessages = searchMessages;
exports.cleanupSearchListeners = cleanupSearchListeners;
function setupSearchListeners(socket, onResults) {
    socket.on('chat:search:results', onResults);
}
function searchMessages(socket, query, filters) {
    socket.emit('chat:search', { query, ...filters });
}
function cleanupSearchListeners(socket) {
    socket.off('chat:search:results');
}
