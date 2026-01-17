"use strict";
/**
 * Card Lobby - Hybrid Door Server Component
 *
 * Wraps the main card lobby implementation and adds RPC handlers
 * for the hybrid client (audio support).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcHandlers = exports.metadata = void 0;
exports.emitSound = emitSound;
exports.runDoor = runDoor;
const index_1 = require("./index");
exports.metadata = {
    ...index_1.metadata,
};
/**
 * Emit a sound event to the client
 */
function emitSound(session, soundType) {
    if (session?.socket?.emit) {
        session.socket.emit('door-message', { type: 'sound', data: { type: soundType } });
    }
}
/**
 * Main door entry point
 */
async function runDoor(session) {
    // Run the card lobby
    await (0, index_1.runDoor)(session);
}
/**
 * RPC handler for forwarding client input to the door
 */
function forwardInput(params, session) {
    const raw = typeof params?.raw === 'string' ? params.raw : '';
    const handler = session?.bbsSession?.doorInputHandler;
    if (!raw || typeof handler !== 'function') {
        return { ok: false };
    }
    handler(raw);
    return { ok: true };
}
exports.rpcHandlers = {
    input: forwardInput,
};
exports.default = { runDoor, metadata: exports.metadata, rpcHandlers: exports.rpcHandlers };
