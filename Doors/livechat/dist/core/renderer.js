"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.render = render;
exports.renderTopBar = renderTopBar;
exports.renderChannelHeader = renderChannelHeader;
exports.renderTypingArea = renderTypingArea;
exports.renderInputBox = renderInputBox;
exports.appendToLog = appendToLog;
exports.clearLog = clearLog;
const typing_preview_1 = require("../ui/typing-preview");
const channel_header_1 = require("../ui/channel-header");
/** Render all UI components */
function render(ui, state, user) {
    renderTopBar(ui, state, user);
    renderChannelHeader(ui, state);
    renderTypingArea(ui, state);
    renderInputBox(ui, state);
    ui.screen.render();
}
/** Render top bar */
function renderTopBar(ui, state, user) {
    const status = state.prefs.muteAllEvents ? '[MUTED]' : '[*]';
    // TODO: Implement after screen module modularization
    // ui.topBar.setContent(formatTopBar(user.username, user.nodeId || 1, state.currentChannel, status));
}
/** Render channel header */
function renderChannelHeader(ui, state) {
    const channel = state.channels.find(c => c.id === state.currentChannel) || null;
    const count = state.members.length;
    ui.channelHeader.setContent((0, channel_header_1.formatChannelHeader)(channel, count));
}
/** Render typing preview */
function renderTypingArea(ui, state) {
    ui.typingPreview.setContent((0, typing_preview_1.renderTypingPreview)(state.typingBuffers));
}
/** Render input box */
function renderInputBox(ui, state) {
    ui.inputBox.setContent(`> ${state.inputBuffer}_`);
}
/** Append message to chat log */
function appendToLog(ui, line) {
    ui.chatLog.log(line);
}
/** Clear chat log */
function clearLog(ui) {
    ui.chatLog.setContent('');
}
