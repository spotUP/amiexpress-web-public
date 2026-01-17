"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoor = void 0;
const app_1 = require("./app");
const runDoor = async (doorSession) => {
    const { socket, bbsSession, user, params } = doorSession;
    // Modern functional door entry point
    await (0, app_1.execute)({
        socket,
        bbsSession,
        user,
        params,
        close: () => {
            socket.emit('door:close');
        }
    });
};
exports.runDoor = runDoor;
//# sourceMappingURL=index.js.map