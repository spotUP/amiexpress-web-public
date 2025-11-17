"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Test V-AWAIT door directly
const AmigaDoorSession_1 = require("../web/backend/src/amiga-emulation/AmigaDoorSession");
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
console.log('=== V-AWAIT Door Test ===\n');
const doorPath = path_1.default.join(process.cwd(), 'Doors/V-TOOLS/V-AWAIT/V-AWAITold');
console.log('Door path:', doorPath);
// Create mock socket (mimics socket.io Socket)
class MockSocket extends events_1.EventEmitter {
    emit(event, data) {
        if (data !== undefined) {
            const preview = typeof data === 'string' ? data.substring(0, 100) : JSON.stringify(data).substring(0, 100);
            console.log(`[SOCKET] emit('${event}'):`, preview);
        }
        return super.emit(event, data);
    }
    on(event, listener) {
        console.log(`[SOCKET] on('${event}')`);
        return super.on(event, listener);
    }
}
const mockSocket = new MockSocket();
const session = new AmigaDoorSession_1.AmigaDoorSession(mockSocket, {
    executablePath: doorPath,
    timeout: 10
});
console.log('\n=== Starting door execution ===\n');
session.start().then(() => {
    console.log('\n=== Door execution completed successfully ===');
    process.exit(0);
}).catch((err) => {
    console.error('\n=== Door execution failed ===');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    process.exit(1);
});
// Timeout
setTimeout(() => {
    console.log('\n=== Timeout after 10 seconds ===');
    process.exit(1);
}, 10000);
