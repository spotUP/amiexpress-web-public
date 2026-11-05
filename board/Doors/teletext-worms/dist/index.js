"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
/**
 * TTWORMS - Worms, in teletext, on a board that can actually compute.
 *
 * Team17 built Worms for teletext in 1996 and it was broadcast for six
 * weeks. It worked by precomputing every screen the game could ever reach
 * and transmitting them as hidden pages, because a television had no
 * processor and no way to send anything back. It was shelved because a
 * day's broadcast could not hold enough pages.
 *
 * Neither limit applies here. The board works out the shot and composes
 * the page for it, and the caller's keys arrive over a socket. The result
 * is still an ordinary teletext page - 40 columns, block graphics at 2x3
 * pixels a cell, an 80 by 60 battlefield - just one that could not have
 * been sent down a vertical blanking interval.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
exports.metadata = {
    name: 'Teletext Worms',
    version: '1.0.0',
    description: 'Turn-based artillery on generated teletext pages',
    author: 'AmiExpress Team',
    command: 'TTWORMS',
};
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
let app = null;
door.onStart(async (ctx) => {
    app = new app_1.WormsApp({
        socket: ctx.socket,
        bbsSession: ctx.bbsSession,
        user: ctx.user,
        close: () => ctx.close(),
        achievement: (type, opts) => ctx.achievement?.(type, opts) ?? false,
    });
    app.start();
});
door.onInput(async (_ctx, key) => {
    app?.handleInput(key.raw ?? key.key);
});
door.onClose(async () => {
    // A match left in a lobby holds a seat nobody can take.
    app?.stop();
    app = null;
});
door.onError(async (ctx, error) => {
    console.error('[TeletextWorms]', error);
    ctx.socket.emit('ansi-output', `\r\n\x1b[31mWorms: ${error.message}\x1b[0m\r\n`);
    app?.stop();
    app = null;
    ctx.close();
});
exports.default = door;
//# sourceMappingURL=index.js.map