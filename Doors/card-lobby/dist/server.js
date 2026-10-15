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
const index_1 = __importStar(require("./index"));
exports.metadata = {
    ...index_1.metadata,
};
// emitSound lived here and nothing ever called it: the client half listened
// for its 'door-message' through an onMessage the SDK does not have, and the
// door's real sounds go out as the OSC sfx sequence instead. Both halves are
// gone rather than left as a channel that looks wired.
/*
 * THERE IS NO `input` RPC, AND THERE MUST NOT BE ONE.
 *
 * A key pressed in the browser reaches this door's server half ONCE already:
 * `key-down` -> socket-handlers -> `session.doorInputHandler`, which the
 * blessed door installed over the client-door no-op when it enabled its
 * DoorInputManager. The client half used to forward every key it was shown
 * back here as `rpc('input', { raw })`, and a `forwardInput` handler fed it to
 * that same doorInputHandler - so every keystroke arrived TWICE, the second a
 * network round trip behind the first.
 *
 * It was invisible for a year because the client bundle threw on load and
 * never forwarded anything (fixed 2026-09-14, dfb730eaa); from that day V -
 * which turns a panel over - turned it over twice and landed where it
 * started, "flickers broken cards and flips back", then "just switches view
 * for a frame and then back", then "does nothing" once the redraw got fast
 * enough for both flips to land in one frame (sysop, 2026-09-15). A number
 * key that picks on one press and plays on the next would pick AND play.
 *
 * Leaving the method unregistered is deliberate rather than tidy: the bridge
 * answers an unknown method with an RPC error and NO side effect, so a stale
 * client bundle that still sends the echo cannot deliver a key twice, whether
 * or not the caller has reloaded. tests/a-key-reaches-the-door-once pins it.
 */
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
    pollTableEvents,
    broadcastUnoEvent,
};
exports.default = index_1.default;
