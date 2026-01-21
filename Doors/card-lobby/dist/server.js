"use strict";
/**
 * Card Lobby - Hybrid Door Server Component
 *
 * Wraps the main card lobby implementation and adds RPC handlers
 * for the hybrid client (audio support).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.rpcHandlers = exports.metadata = void 0;
exports.emitSound = emitSound;
const index_1 = __importStar(require("./index"));
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
/**
 * RPC handler for polling UNO table events
 * Returns events that occurred after the provided lastEventId
 */
function pollTableEvents(params, session) {
    // Note: This is a simplified implementation
    // In a real multi-node setup, this would query the Storage API
    // For now, events are propagated via socket.io 'unoEvent' emissions
    return { ok: true, events: [] };
}
/**
 * RPC handler for broadcasting UNO events to all table players
 * This is called when a UNO action occurs that needs to be broadcast
 */
function broadcastUnoEvent(params, session) {
    const { tableId, type, data } = params;
    if (!tableId || !type) {
        return { ok: false };
    }
    // Emit event via socket to all connected clients
    // The door instance will handle adding it to the event queue
    if (session?.socket?.emit) {
        session.socket.emit('unoEventBroadcast', { tableId, type, data });
    }
    return { ok: true };
}
exports.rpcHandlers = {
    input: forwardInput,
    pollTableEvents,
    broadcastUnoEvent,
};
exports.default = index_1.default;
