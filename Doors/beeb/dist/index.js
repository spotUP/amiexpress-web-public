"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
/**
 * BEEB - a BBC Micro on the board.
 *
 * The emulator is jsbeeb, vendored at vendor/jsbeeb and served by the board
 * at /beeb/ as its own program (it is GPL-3; see vendor/jsbeeb/NOTICE.md).
 * The board supplies it with the sysop's ROMs and the sysop's software -
 * there is no open-source BBC ROM, so nothing here ships one.
 *
 * This door is CLIENT_ONLY: a BBC Micro is a bitmap machine and a caller
 * without a browser cannot be shown one. The board turns those callers away
 * before the door runs.
 */
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
exports.metadata = {
    name: 'BBC Micro',
    version: '1.0.0',
    description: 'Run BBC Micro software from the board',
    author: 'AmiExpress Team',
    command: 'BEEB',
};
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
let app = null;
door.onStart(async (ctx) => {
    app = new app_1.BeebApp({
        socket: ctx.socket,
        bbsSession: ctx.bbsSession,
        user: ctx.user,
        close: () => ctx.close(),
    });
    app.start();
});
door.onInput(async (_ctx, key) => {
    app?.handleInput(key.raw ?? key.key);
});
door.onClose(async () => {
    app?.stop();
    app = null;
});
door.onError(async (ctx, error) => {
    console.error('[Beeb]', error);
    ctx.socket.emit('ansi-output', `\r\n\x1b[31mBBC Micro: ${error.message}\x1b[0m\r\n`);
    app?.stop();
    app = null;
    ctx.close();
});
exports.default = door;
//# sourceMappingURL=index.js.map