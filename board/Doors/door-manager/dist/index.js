"use strict";
/**
 * Door Manager - SysOp Door Management Tool
 * SDK v2.0 Entry Point
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
// Create Door instance
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Door Manager',
    version: '2.0.0',
    author: 'AmiExpress Team',
});
// Handle door start
door.onStart(async (ctx) => {
    // The backend passes: { socket, bbsSession, user, bbs, params }
    // which is exactly what createApp expects
    await (0, app_1.createApp)(ctx);
});
// Handle door close
door.onClose(async (ctx) => {
    // Cleanup handled by createApp
});
// Handle errors
door.onError(async (ctx, error) => {
    console.error('Door Manager error:', error);
});
exports.default = door;
//# sourceMappingURL=index.js.map