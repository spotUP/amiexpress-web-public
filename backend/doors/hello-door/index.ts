/**
 * Hello World Door
 * A simple example TypeScript door for AmiExpress-Web
 */

import { Socket } from 'socket.io';

interface DoorSession {
  socket: Socket;
  user: any;
}

export async function runDoor(session: DoorSession) {
  const { socket } = session;

  // Clear screen and display header
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\r\n\x1b[1;36m-= Hello World Door =-\x1b[0m\r\n\r\n');

  // Greet user
  const username = session.user?.username || 'User';
  socket.emit('ansi-output', `\x1b[33mHello, ${username}!\x1b[0m\r\n\r\n`);

  // Display some info
  socket.emit('ansi-output', '\x1b[37mThis is a TypeScript door example.\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[37mYou can create your own doors using TypeScript/JavaScript!\x1b[0m\r\n\r\n');

  // Display current date/time
  const now = new Date();
  socket.emit('ansi-output', `\x1b[36mCurrent time: ${now.toLocaleString()}\x1b[0m\r\n\r\n`);

  // Exit prompt
  socket.emit('ansi-output', '\x1b[90mPress any key to exit...\x1b[0m\r\n');

  return new Promise<void>((resolve) => {
    socket.once('terminal-input', () => {
      resolve();
    });
  });
}

export default runDoor;
