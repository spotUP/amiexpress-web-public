"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupSocketEvents = setupSocketEvents;
const socket_msg_1 = require("./socket-msg");
const socket_typing_1 = require("./socket-typing");
/** Setup all socket event handlers */
function setupSocketEvents(socket, state, ui, audio, currentUser) {
    (0, socket_msg_1.setupMessageEvents)(socket, state, ui, audio, currentUser);
    (0, socket_typing_1.setupTypingEvents)(socket, state, ui);
    (0, socket_typing_1.setupBBSEvents)(socket, state, ui, audio);
}
