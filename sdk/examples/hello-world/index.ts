/**
 * Hello World - Simple Door Example with Mock Data
 *
 * Demonstrates:
 * - Basic door setup
 * - Mock data provider for testing
 * - User input handling
 * - ANSI output
 */

import { Door, AnsiColor, GraphicsEngine, setupMockDevelopment } from '@amiexpress/bbs-door-sdk';

// Create door
const door = new Door({
  name: 'Hello World',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Simple hello world example'
});

// Graphics engine for ANSI rendering
const gfx = new GraphicsEngine({ width: 80, height: 24 });

// Set up mock development mode (auto-connects test user)
if (process.env.NODE_ENV !== 'production') {
  setupMockDevelopment(door, {
    name: 'TestUser',
    securityLevel: 100,
    timeLeft: 60
  });
}

// Handle user connection
door.onConnect((user) => {
  console.log(`User ${user.name} connected!`);

  gfx.clear(AnsiColor.Black);
  gfx.drawText(25, 8, '╔════════════════════════════╗', AnsiColor.Cyan);
  gfx.drawText(25, 9, '║     HELLO WORLD DOOR!     ║', AnsiColor.BrightCyan);
  gfx.drawText(25, 10, '╚════════════════════════════╝', AnsiColor.Cyan);
  gfx.drawText(20, 12, `Welcome, ${user.name}!`, AnsiColor.BrightYellow);
  gfx.drawText(20, 14, `Security Level: ${user.securityLevel}`, AnsiColor.White);
  gfx.drawText(20, 15, `Time Remaining: ${user.timeLeft} minutes`, AnsiColor.White);
  gfx.drawText(20, 18, 'Press any key to exit...', AnsiColor.Green);

  door.sendAnsi(gfx.render(), user.id);
});

// Handle user input
door.onInput((user, key) => {
  console.log(`User ${user.name} pressed: ${key.key}`);

  gfx.clear(AnsiColor.Black);
  gfx.drawText(30, 10, 'Goodbye!', AnsiColor.BrightYellow);
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
