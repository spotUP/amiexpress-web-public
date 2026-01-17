"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupThreadListeners = setupThreadListeners;
exports.createThread = createThread;
exports.replyToThread = replyToThread;
exports.getThreadMessages = getThreadMessages;
exports.cleanupThreadListeners = cleanupThreadListeners;
function setupThreadListeners(socket, onThreadCreated, onThreadReply, onThreadMessages) {
    socket.on('chat:thread:created', onThreadCreated);
    socket.on('chat:thread:reply', onThreadReply);
    socket.on('chat:thread:messages', onThreadMessages);
}
function createThread(socket, messageId, title) {
    socket.emit('chat:thread:create', { messageId, title });
}
function replyToThread(socket, threadId, message) {
    socket.emit('chat:thread:reply', { threadId, message });
}
function getThreadMessages(socket, threadId) {
    socket.emit('chat:thread:messages', { threadId });
}
function cleanupThreadListeners(socket) {
    socket.off('chat:thread:created');
    socket.off('chat:thread:reply');
    socket.off('chat:thread:messages');
}
