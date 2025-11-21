"use strict";
/**
 * Hello World - Simple Door Example with Mock Data
 *
 * Demonstrates:
 * - Basic door setup
 * - Mock data provider for testing
 * - User input handling
 * - ANSI output
 */
Object.defineProperty(exports, "__esModule", { value: true });
const bbs_door_sdk_1 = require("@amiexpress/bbs-door-sdk");
const mock_1 = require("../../tools/mock");
// Create door
const door = new bbs_door_sdk_1.Door({
    name: 'Hello World',
    version: '1.0.0',
    author: 'AmiExpress SDK',
    description: 'Simple hello world example'
});
// Graphics engine for ANSI rendering
const gfx = new bbs_door_sdk_1.GraphicsEngine({ width: 80, height: 24 });
// Set up mock development mode (auto-connects test user)
if (process.env.NODE_ENV !== 'production') {
    (0, mock_1.setupMockDevelopment)(door, {
        name: 'TestUser',
        securityLevel: 100,
        timeLeft: 60
    });
}
// Handle user connection
door.onConnect((user) => {
    console.log(`User ${user.name} connected!`);
    gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
    gfx.drawText(25, 8, '╔════════════════════════════╗', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(25, 9, '║     HELLO WORLD DOOR!     ║', bbs_door_sdk_1.AnsiColor.BrightCyan);
    gfx.drawText(25, 10, '╚════════════════════════════╝', bbs_door_sdk_1.AnsiColor.Cyan);
    gfx.drawText(20, 12, `Welcome, ${user.name}!`, bbs_door_sdk_1.AnsiColor.BrightYellow);
    gfx.drawText(20, 14, `Security Level: ${user.securityLevel}`, bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(20, 15, `Time Remaining: ${user.timeLeft} minutes`, bbs_door_sdk_1.AnsiColor.White);
    gfx.drawText(20, 18, 'Press any key to exit...', bbs_door_sdk_1.AnsiColor.Green);
    door.sendAnsi(gfx.render(), user.id);
});
// Handle user input
door.onInput((user, key) => {
    console.log(`User ${user.name} pressed: ${key.key}`);
    gfx.clear(bbs_door_sdk_1.AnsiColor.Black);
    gfx.drawText(30, 10, 'Goodbye!', bbs_door_sdk_1.AnsiColor.BrightYellow);
    door.sendAnsi(gfx.render(), user.id);
    // Disconnect after showing goodbye message
    setTimeout(() => {
        door.disconnect(user.id);
    }, 1000);
});
// Handle disconnection
door.onDisconnect((user) => {
    console.log(`User ${user.name} disconnected`);
});
// Start the door
door.start();
console.log('Hello World door started!');
