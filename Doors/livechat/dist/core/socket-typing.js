"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupTypingEvents = setupTypingEvents;
exports.shouldShowEvent = shouldShowEvent;
exports.setupBBSEvents = setupBBSEvents;
const typing_preview_1 = require("../ui/typing-preview");
const formatter_1 = require("./formatter");
const services_1 = require("../services");
const renderer_1 = require("./renderer");
/** Setup typing socket events */
function setupTypingEvents(socket, state, ui) {
    socket.on('chat:keystroke', (data) => {
        if (data.channelId !== state.currentChannel)
            return;
        (0, typing_preview_1.processKeystroke)(state.typingBuffers, data.userId, data.username, data.char, (0, formatter_1.getUserColor)(data.username));
        (0, renderer_1.renderTypingArea)(ui, state);
        ui.screen.render();
    });
}
/** Check if event should be shown based on user preferences */
function shouldShowEvent(event, prefs) {
    if (prefs.muteAllEvents)
        return false;
    switch (event.type) {
        case 'user_login':
        case 'user_logout':
            return prefs.showLogins;
        case 'upload_start':
        case 'upload_complete':
        case 'download_start':
        case 'download_complete':
            return prefs.showFileActivity;
        case 'door_enter':
        case 'door_exit':
            return prefs.showDoorActivity;
        case 'new_message':
        case 'page_sysop':
        case 'conference_join':
        case 'node_activity':
            return prefs.showMessages;
        case 'system_announcement':
            return prefs.showSystemAnnouncements;
        default:
            return true; // Show unknown events by default
    }
}
/** Setup BBS event socket events */
function setupBBSEvents(socket, state, ui, audio) {
    socket.on('bbs:event', (event) => {
        if (!shouldShowEvent(event, state.prefs))
            return;
        audio.onNotification();
        (0, renderer_1.appendToLog)(ui, (0, services_1.formatBBSEvent)(event));
        ui.screen.render();
    });
}
