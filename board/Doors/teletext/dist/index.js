"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
/**
 * TELETEXT - browse the teletext service packs installed on this board.
 *
 * Ceefax, Oracle and 4-Tel pages survive because people recovered them off
 * home VHS tapes; a pack is one of those recoveries plus a manifest. The
 * door replays them the way they went out: page numbers, subpage carousels,
 * the four coloured fastext keys, and reveal for a concealed answer. The
 * interactive pages of the era - Bamboozle, the quizzes, the unearthed
 * pages of Worms for Teletext - were never programs, only page graphs, so
 * following the links IS playing them.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
exports.metadata = {
    name: 'Teletext',
    version: '1.0.0',
    description: 'Browse installed teletext service packs',
    author: 'AmiExpress Team',
    command: 'TELETEXT',
};
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
let app = null;
door.onStart(async (ctx) => {
    app = new app_1.TeletextApp({
        socket: ctx.socket,
        bbsSession: ctx.bbsSession,
        user: ctx.user,
        bbs: ctx.bbs,
        close: () => ctx.close(),
    });
    app.start();
});
door.onInput(async (_ctx, key) => {
    app?.handleInput(key.raw ?? key.key);
});
door.onClose(async () => {
    // The carousel is a timer. A door that leaves one running keeps painting
    // into a socket that has gone.
    app?.stop();
    app = null;
});
door.onError(async (ctx, error) => {
    console.error('[Teletext]', error);
    ctx.socket.emit('ansi-output', `\r\n\x1b[31mTeletext: ${error.message}\x1b[0m\r\n`);
    app?.stop();
    app = null;
    ctx.close();
});
exports.default = door;
//# sourceMappingURL=index.js.map