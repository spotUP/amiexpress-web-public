"use strict";
/**
 * Neo-Blessed Showcase v2.0 - Entry Point
 *
 * Comprehensive demonstration of all neo-blessed and blessed-contrib widgets
 *
 * This is the complete 2000+ line showcase with 10 interactive pages showing
 * all 49 widgets, live animations, charts, gauges, and best practices.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Neo-Blessed Showcase',
    version: '2.0.0',
    author: 'AmiExpress SDK v2.0',
});
door.onStart(async (ctx) => {
    // Create session object that app expects
    const session = {
        socket: ctx.socket,
        user: ctx.user,
        bbsSession: ctx.bbsSession,
        bbs: ctx.bbs,
        video: ctx.video,
        audio: ctx.audio,
        params: [],
    };
    const app = await (0, app_1.createApp)(session);
    await app.run();
});
door.onClose(async (ctx) => {
    ctx.output.writeLine('\r\n\x1b[36mShowcase closed.\x1b[0m\r\n');
});
door.onError(async (ctx, error) => {
    ctx.output.writeLine(`\r\n\x1b[31mError: ${error.message}\x1b[0m\r\n`);
});
exports.default = door;
//# sourceMappingURL=index.js.map