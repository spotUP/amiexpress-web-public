"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.timing = exports.layout = exports.metadata = void 0;
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
