"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * NOTIFY - choose how the board reaches you (email, push, a notice on the board).
 *
 * A CoreDoor whose onStart hands the context straight to createApp. See app.ts.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Notifications',
    version: '1.0.0',
    author: 'AmiExpress',
});
door.onStart(async (ctx) => {
    await (0, app_1.createApp)(ctx);
});
door.onClose(async () => {
    // createApp tears down its own screen and input manager.
});
door.onError(async (_ctx, error) => {
    console.error('NOTIFY error:', error);
});
exports.default = door;
//# sourceMappingURL=index.js.map