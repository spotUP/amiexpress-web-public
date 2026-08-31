"use strict";
/**
 * Sprite Studio - browse and preview every door's sprite sheets.
 *
 * Fork lineage: the ANSI editor door's wrapper (Doors/ansi-editor) is the
 * pattern for hosting a full-screen blessed app in a door; the black-screen
 * fix (34056d29f) landed there first so this fork starts clean. Editing
 * modes are plan 2b; this door ships browsing and live playback.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
const door = new bbs_door_sdk_1.CoreDoor({
    name: 'Sprite Studio',
    version: '0.1.0',
    description: 'Browse and preview door sprite sheets',
    author: 'AmiExpress BBS',
});
let app = null;
door.onStart(async (ctx) => {
    app = new app_1.StudioApp(ctx);
    await app.start();
});
door.onClose(async () => {
    app?.destroy();
    app = null;
});
exports.default = door;
