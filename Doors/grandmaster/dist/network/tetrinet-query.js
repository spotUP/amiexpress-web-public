"use strict";
/**
 * TetriNET Query Protocol Client
 *
 * Supports playerquery, listchan, listuser, and version commands.
 * Commands are sent over TCP with 0xFF terminator; responses end with LF.
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
exports.queryTetriNetServer = queryTetriNetServer;
const net = __importStar(require("net"));
async function queryTetriNetServer(host, command, port = 31457, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let buffer = '';
        const lines = [];
        const expectsOk = command === 'listchan' || command === 'listuser' || command === 'version';
        const cleanup = () => {
            socket.removeAllListeners();
            socket.destroy();
        };
        const finish = () => {
            cleanup();
            resolve({ command, lines });
        };
        const timer = setTimeout(() => {
            cleanup();
            reject(new Error('Query timeout'));
        }, timeoutMs);
        socket.on('data', (data) => {
            buffer += data.toString('latin1');
            let idx = buffer.indexOf('\n');
            while (idx !== -1) {
                const line = buffer.slice(0, idx).replace(/\r$/, '');
                buffer = buffer.slice(idx + 1);
                if (line.length > 0) {
                    if (line === '+OK') {
                        clearTimeout(timer);
                        finish();
                        return;
                    }
                    lines.push(line);
                    if (!expectsOk) {
                        clearTimeout(timer);
                        finish();
                        return;
                    }
                }
                idx = buffer.indexOf('\n');
            }
        });
        socket.on('error', (error) => {
            clearTimeout(timer);
            cleanup();
            reject(error);
        });
        socket.on('connect', () => {
            const payload = Buffer.from(command, 'latin1');
            const terminator = Buffer.from([0xFF]);
            socket.write(Buffer.concat([payload, terminator]));
        });
        socket.connect(port, host);
    });
}
//# sourceMappingURL=tetrinet-query.js.map