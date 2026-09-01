"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * THEME - pick how the doors look.
 *
 * Same shape as DOORS: a CoreDoor whose onStart hands the context straight
 * to createApp. See app.ts for what it draws and why.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Theme',
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
    console.error('Theme picker error:', error);
});
exports.default = door;
//# sourceMappingURL=index.js.map