/**
 * Hello World - Simple Door Example with Mock Data
 *
 * Demonstrates:
 * - Basic door setup
 * - Mock data provider for testing
 * - User input handling
 * - ANSI output
 */

import { Door, AnsiColor, GraphicsEngine } from '@amiexpress/bbs-door-sdk';
import { runDoorWithSession } from '../../tools/runDoorSession';

// Create door
const door = new Door({
  name: 'Hello World',
  version: '1.0.0',
  author: 'AmiExpress SDK',
  description: 'Simple hello world example'
});

// Graphics engine for ANSI rendering
const gfx = new GraphicsEngine({ width: 80, height: 24 });

// Handle user connection
door.onConnect((user: any) => {
  console.log(`User ${user.name} connected!`);

  gfx.clear(AnsiColor.Black);

  // Draw a box using the drawBox method (handles positioning correctly)
  gfx.drawBox({ x: 25, y: 8, width: 30, height: 3 }, 'double', AnsiColor.Cyan);
  gfx.drawText(27, 9, 'HELLO WORLD DOOR!', AnsiColor.BrightCyan);

  gfx.drawText(20, 12, `Welcome, ${user.name}!`, AnsiColor.BrightYellow);
  gfx.drawText(20, 14, `Security Level: ${user.securityLevel}`, AnsiColor.White);
  gfx.drawText(20, 15, `Time Remaining: ${user.timeLeft} minutes`, AnsiColor.White);
  gfx.drawText(20, 18, 'Press any key to exit...', AnsiColor.Green);

  door.sendAnsi(gfx.render(), user.id);
});

// Handle user input
door.onInput((user: any, key: any) => {
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
door.onDisconnect((user: any) => {
  console.log(`User ${user.name} disconnected`);
});

export async function runDoor(doorSession: any): Promise<void> {
  await runDoorWithSession(door, doorSession);
}
