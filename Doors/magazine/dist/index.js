"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * MAG - the reader for THE UNKNOWN FREQUENCY.
 *
 * Reads the stories the board's magazine service publishes
 * (Magazine/index.json, Magazine/stories/<id>.json, Magazine/frontpage.json)
 * and sets them in newspaper columns: one column at 40, two at 80, three on
 * a wide terminal. Only the front page the editor approved is shown as the
 * front page; with nothing approved the reader says AWAITING EDITOR.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'The Unknown Frequency',
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
    console.error('Magazine reader error:', error);
});
exports.default = door;
//# sourceMappingURL=index.js.map