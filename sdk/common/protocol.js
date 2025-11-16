"use strict";
/**
 * WebSocket Protocol for Client Doors
 * Defines message format for browser-BBS communication
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtocolHelper = exports.MessageType = void 0;
/**
 * Message Types
 */
var MessageType;
(function (MessageType) {
    // Connection lifecycle
    MessageType["CONNECT"] = "connect";
    MessageType["DISCONNECT"] = "disconnect";
    MessageType["CONNECTED"] = "connected";
    // I/O
    MessageType["OUTPUT"] = "output";
    MessageType["INPUT"] = "input";
    // RPC (for hybrid doors)
    MessageType["RPC_REQUEST"] = "rpc-request";
    MessageType["RPC_RESPONSE"] = "rpc-response";
    MessageType["RPC_ERROR"] = "rpc-error";
    // State
    MessageType["STATE_UPDATE"] = "state-update";
    MessageType["PING"] = "ping";
    MessageType["PONG"] = "pong";
})(MessageType || (exports.MessageType = MessageType = {}));
/**
 * Helper to create messages
 */
class ProtocolHelper {
    static createOutputMessage(text, userId) {
        return {
            type: MessageType.OUTPUT,
            timestamp: Date.now(),
            data: { text, userId },
        };
    }
    static createInputMessage(key) {
        return {
            type: MessageType.INPUT,
            timestamp: Date.now(),
            data: key,
        };
    }
    static createRPCRequest(id, method, params) {
        return {
            type: MessageType.RPC_REQUEST,
            timestamp: Date.now(),
            id,
            method,
            params,
        };
    }
    static createRPCResponse(id, result) {
        return {
            type: MessageType.RPC_RESPONSE,
            timestamp: Date.now(),
            id,
            result,
        };
    }
    static createRPCError(id, code, message, data) {
        return {
            type: MessageType.RPC_ERROR,
            timestamp: Date.now(),
            id,
            error: { code, message, data },
        };
    }
}
exports.ProtocolHelper = ProtocolHelper;
