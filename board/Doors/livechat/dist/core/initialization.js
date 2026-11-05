"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeLiveChat = initializeLiveChat;
const state_1 = require("./state");
const commands_1 = require("../commands");
const command_exec_1 = require("./command-exec");
const services_1 = require("../services");
const audio_1 = require("../utils/audio");
const message_1 = require("../handlers/message");
const command_1 = require("../handlers/command");
function initializeLiveChat(session, screen) {
    const { user, socket } = session;
    const username = user?.username || 'Guest';
    const userId = parseInt(user?.id, 10) || 0;
    const nodeId = session.bbsSession?.nodeId || 1;
    const secLevel = user?.secLevel || 10;
    const state = (0, state_1.createInitialState)();
    const registry = (0, commands_1.createCommandRegistry)();
    const initialRoomId = session.bbsSession?.currentRoomId;
    const initialRoomName = session.bbsSession?.currentRoomName;
    let currentRoomLabel = initialRoomName || '';
    if (initialRoomId)
        state.currentChannel = initialRoomId;
    const socketEmitter = new services_1.SocketEmitter(socket);
    const presenceService = new services_1.PresenceService();
    const eventBus = new services_1.ExtendedEventBus(socket);
    // Hybrid door: audio is played client-side, server just emits events via socket
    const audio = new audio_1.AudioService(socket);
    const messageHandler = new message_1.MessageHandler();
    const commandHandler = new command_1.CommandHandler();
    presenceService.setStatus(userId, 'online');
    const onlineUsers = new Map();
    onlineUsers.set(String(userId), { username, status: 'online', nodeId, joinedAt: new Date() });
    const cmdCtx = (0, command_exec_1.createCommandContext)(state, { id: userId, username, securityLevel: secLevel });
    return { username, userId, nodeId, secLevel, state, registry, currentRoomLabel,
        socketEmitter, presenceService, eventBus, audio, messageHandler,
        commandHandler, onlineUsers, cmdCtx };
}
