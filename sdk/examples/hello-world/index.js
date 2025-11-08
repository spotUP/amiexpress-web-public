"use strict";
/**
 * Hello World - Simple BBS Door Example
 */
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("../../core");
const door = new core_1.Door({
    name: 'Hello World',
    version: '1.0.0',
    author: 'AmiExpress Team'
});
const gfx = new core_1.GraphicsEngine({ width: 80, height: 24 });
door.onConnect((user) => {
    // Clear screen
    gfx.clear(core_1.AnsiColor.Black);
    // Draw welcome message
    gfx.drawText(30, 10, 'Hello, BBS World!', core_1.AnsiColor.Cyan);
    gfx.drawText(25, 12, `Welcome, ${user.name}!`, core_1.AnsiColor.Yellow);
    gfx.drawText(20, 14, 'Press any key to continue...', core_1.AnsiColor.White);
    // Send output to user
    door.sendAnsi(gfx.render(), user.id);
});
door.onInput((user, key) => {
    // Clear and goodbye
    gfx.clear(core_1.AnsiColor.Black);
    gfx.drawText(30, 10, 'Goodbye!', core_1.AnsiColor.Green);
    door.sendAnsi(gfx.render(), user.id);
    // Disconnect after a moment
    setTimeout(() => {
        door.disconnect(user.id);
    }, 1000);
});
door.start();
