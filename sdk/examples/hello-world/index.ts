/**
 * Hello World - Simple BBS Door Example
 */

import { Door, GraphicsEngine, AnsiColor } from '../../core';

const door = new Door({
  name: 'Hello World',
  version: '1.0.0',
  author: 'AmiExpress Team'
});

const gfx = new GraphicsEngine({ width: 80, height: 24 });

door.onConnect((user) => {
  // Clear screen
  gfx.clear(AnsiColor.Black);

  // Draw welcome message
  gfx.drawText(30, 10, 'Hello, BBS World!', AnsiColor.Cyan);
  gfx.drawText(25, 12, `Welcome, ${user.name}!`, AnsiColor.Yellow);
  gfx.drawText(20, 14, 'Press any key to continue...', AnsiColor.White);

  // Send output to user
  door.sendAnsi(gfx.render(), user.id);
});

door.onInput((user, key) => {
  // Clear and goodbye
  gfx.clear(AnsiColor.Black);
  gfx.drawText(30, 10, 'Goodbye!', AnsiColor.Green);
  door.sendAnsi(gfx.render(), user.id);

  // Disconnect after a moment
  setTimeout(() => {
    door.disconnect(user.id);
  }, 1000);
});

door.start();
