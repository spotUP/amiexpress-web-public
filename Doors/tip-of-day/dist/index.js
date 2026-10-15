"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * TIP - one tip per login.
 *
 * A display-only door: pick a tip, show it, any key (or 30 seconds for
 * unattended logins) returns to the board. Nothing is written except the
 * rotation state (seen tip ids, per caller) in door storage, so logins
 * cycle instead of repeating.
 *
 * Phase 1: fixed 80-column render, run by hand via TIP. Responsive,
 * 40-column and login-hook phases follow per the plan.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Tip of the day',
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
    console.error('Tip-of-the-day error:', error);
});
exports.default = door;
//# sourceMappingURL=index.js.map