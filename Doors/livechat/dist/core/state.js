"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createInitialState = createInitialState;
exports.setChannel = setChannel;
exports.addMessage = addMessage;
exports.clearInput = clearInput;
exports.appendInput = appendInput;
exports.backspaceInput = backspaceInput;
/** Create initial state */
function createInitialState() {
    return {
        running: true,
        currentChannel: '', // Empty until user actually joins a room
        inputBuffer: '',
        focusedPane: 'input',
        channels: [],
        messages: [],
        members: [],
        typingBuffers: new Map(),
        typingUsers: new Set(),
        prefs: {
            showLogins: true,
            showFileActivity: true,
            showDoorActivity: true,
            showMessages: true,
            showSystemAnnouncements: true,
            muteAllEvents: false,
            compactMode: false,
            showTimestamps: true,
            notificationSound: true,
            mentionSound: true
        },
        lastMessageId: null
    };
}
/** State mutations */
function setChannel(state, channelId) {
    state.currentChannel = channelId;
    state.messages = [];
    state.typingBuffers.clear();
}
function addMessage(state, msg) {
    state.messages.push(msg);
    state.lastMessageId = msg.id;
    if (state.messages.length > 100) {
        state.messages.shift();
    }
}
function clearInput(state) {
    state.inputBuffer = '';
}
function appendInput(state, char) {
    state.inputBuffer += char;
}
function backspaceInput(state) {
    state.inputBuffer = state.inputBuffer.slice(0, -1);
}
