"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * COSYSOP - choose which co-sysop answers when you page.
 *
 * Same shape as SCREENTHEME: a CoreDoor whose onStart hands the context
 * straight to createApp. See app.ts for what it draws, and why it cannot show
 * you the result inside the door.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Co-Sysop',
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
    console.error('Co-sysop persona picker error:', error);
});
exports.default = door;
//# sourceMappingURL=index.js.map