/**
 * Hello World TypeScript Door for AmiExpress-Web
 * Demonstrates TypeScript door capabilities
 */

import { Socket } from 'socket.io';

interface DoorSession {
  socket: Socket;
  user: any;
  bbsSession?: any;
}

export async function runDoor(session: DoorSession) {
  const { socket } = session;

  // Get user information
  const username = session.user?.username || 'Guest';
  const secLevel = session.user?.secLevel || 0;
  const nodeId = session.bbsSession?.nodeId || 1;

  // Clear screen and display header
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\x1b[0;36m╔══════════════════════════════════════════════════════════════════════════════╗\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;36m║                                                                              ║\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;36m║\x1b[0;33m                     TYPESCRIPT DOOR - HELLO WORLD                            \x1b[0;36m║\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;36m║                                                                              ║\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;36m╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');

  // Display greeting
  socket.emit('ansi-output', `\x1b[0;32m  * Hello, ${username}!\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[0;32m  * You are on node ${nodeId}\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[0;32m  * Your security level is ${secLevel}\x1b[0m\r\n`);
  socket.emit('ansi-output', `\x1b[0;32m  * Current time: ${new Date().toLocaleString()}\x1b[0m\r\n`);
  socket.emit('ansi-output', '\r\n');

  // Information about TypeScript doors
  socket.emit('ansi-output', '\x1b[0;33m  This door demonstrates TypeScript support in AmiExpress-Web.\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0;33m  TypeScript doors have access to:\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0m    - Full Socket.IO socket for real-time communication\r\n');
  socket.emit('ansi-output', '\x1b[0m    - Complete BBS session object\r\n');
  socket.emit('ansi-output', '\x1b[0m    - User information and security levels\r\n');
  socket.emit('ansi-output', '\x1b[0m    - Async/await for clean asynchronous code\r\n');
  socket.emit('ansi-output', '\r\n');

  // Interactive example
  socket.emit('ansi-output', '\x1b[0;36m  Enter your favorite JavaScript framework (or press Enter to skip): \x1b[0m');

  return new Promise<void>((resolve) => {
    const inputHandler = (input: string) => {
      // Clean up handler
      if (session.bbsSession) {
        delete session.bbsSession.doorInputHandler;
      }

      if (input && input.trim()) {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', `\x1b[0;32m  * Nice! ${input.trim()} is a solid choice!\x1b[0m\r\n`);
      } else {
        socket.emit('ansi-output', '\r\n');
        socket.emit('ansi-output', '\x1b[0;33m  * TypeScript is the real winner here!\x1b[0m\r\n');
      }

      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', '\x1b[0;36m  TypeScript door completed successfully.\x1b[0m\r\n');
      socket.emit('ansi-output', '\r\n');

      resolve();
    };

    // Register handler in session
    if (session.bbsSession) {
      session.bbsSession.doorInputHandler = inputHandler;
    }
  });
}

export default runDoor;
