"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.metadata = void 0;
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const app_1 = require("./app");
exports.metadata = {
    name: 'RIP Browser',
    version: '1.0.0',
    description: 'Browse and view RIP graphics files',
    author: 'AmiExpress Team',
    command: 'RIPBROWSER',
};
const door = new bbs_door_sdk_1.ServerDoor(exports.metadata);
door.onStart(async (ctx) => {
    const { socket, bbsSession, user } = ctx;
    // Delegate to execute function in app.ts
    await (0, app_1.execute)({
        socket,
        bbsSession,
        user,
        params: ctx.params || [],
        close: () => {
            socket.emit('door:close');
        }
    });
});
exports.default = door;
//# sourceMappingURL=index.js.map