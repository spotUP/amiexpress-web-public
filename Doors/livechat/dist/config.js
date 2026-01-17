"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timing = exports.layout = exports.defaultChannels = exports.metadata = void 0;
/** Door metadata */
exports.metadata = {
    name: 'LiveChat',
    version: '2.0.0',
    author: 'AmiExpress Team',
    description: 'Advanced multi-user chat with real-time typing',
    minSecurityLevel: 10,
    command: 'LIVECHAT',
    category: 'Communication'
};
/** Default channel IDs */
exports.defaultChannels = {
    general: 'general',
    random: 'random',
    help: 'help',
    system: 'system'
};
/** UI dimensions */
exports.layout = {
    sidebarWidth: 16,
    headerHeight: 1,
    inputHeight: 3,
    typingHeight: 3
};
/** Timing config */
exports.timing = {
    typingTimeout: 5000,
    typingCleanup: 1000,
    reconnectDelay: 3000
};
