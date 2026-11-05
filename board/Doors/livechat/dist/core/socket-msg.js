"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupMessageEvents = setupMessageEvents;
const state_1 = require("./state");
const formatter_1 = require("./formatter");
const renderer_1 = require("./renderer");
const mentions_1 = require("../utils/mentions");
/** Setup message socket events */
function setupMessageEvents(socket, state, ui, audio, currentUser) {
    // New message
    socket.on('chat:message', (msg) => {
        if (msg.channelId !== state.currentChannel)
            return;
        (0, state_1.addMessage)(state, msg);
        const isMention = (0, mentions_1.mentionsUser)(msg.content, currentUser);
        audio.onMessage(isMention);
        (0, renderer_1.appendToLog)(ui, (0, formatter_1.formatMessage)(msg, currentUser, state.prefs.compactMode));
        ui.screen.render();
    });
    // User joined
    socket.on('chat:user-joined', (data) => {
        if (data.channelId !== state.currentChannel)
            return;
        audio.onJoin();
        (0, renderer_1.appendToLog)(ui, (0, formatter_1.formatSystemMessage)(`${data.username} joined`));
        ui.screen.render();
    });
    // User left
    socket.on('chat:user-left', (data) => {
        if (data.channelId !== state.currentChannel)
            return;
        audio.onLeave();
        (0, renderer_1.appendToLog)(ui, (0, formatter_1.formatSystemMessage)(`${data.username} left`));
        ui.screen.render();
    });
}
