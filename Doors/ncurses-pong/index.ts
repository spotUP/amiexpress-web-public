/**
 * ncurses-pong - Port of vicentebolea/Pong-curses
 *
 * Original: https://github.com/vicentebolea/Pong-curses
 * Author: Vicente Adolfo Bolea Sanchez <vicente.bolea@gmail.com>
 *
 * This is a direct port to validate the ncurses compatibility layer.
 */

import { PongDoor } from './app.js';

/** Door metadata */
export const metadata = {
  name: 'ncurses-pong',
  version: '1.0.0',
  description: 'Classic Pong game (ncurses port)',
  author: 'Vicente Bolea (original), AmiExpress (port)',
  command: 'PONG',
};

/** Door session from BBS handler */
interface DoorSession {
  socket: any;
  user: any;
  bbsSession: any;
  bbs: any;
  params: string[];
  doorInputHandler?: (data: string) => void;
}

/** Main door entry point - required by BBS */
export async function runDoor(session: DoorSession): Promise<void> {
  const door = new PongDoor();
  let inputHandlerInstalled = false;

  // CRITICAL: Set inDoorManager flag so backend routes input to doorInputHandler
  // Without this, socket-handlers.ts won't call the doorInputHandler!
  session.bbsSession.inDoorManager = true;

  // Enable game mode for real-time input (required for ncurses games)
  // This makes the frontend send immediate key-down events instead of waiting for Enter
  try {
    if (session.bbs?.enableGameMode) {
      session.bbs.enableGameMode();
    }
  } catch (error) {
    // Continue anyway - game might still work without game mode
  }

  // Parse escape sequences into key names
  function parseKeyData(data: string): { ch: string | undefined; key: { name?: string; sequence: string } } {
    const sequence = data;

    // Arrow keys and special keys via escape sequences
    if (sequence.startsWith('\x1b[') || sequence.startsWith('\x1bO')) {
      // CSI sequences (ESC [ ...)
      if (sequence === '\x1b[A' || sequence === '\x1bOA') return { ch: undefined, key: { name: 'up', sequence } };
      if (sequence === '\x1b[B' || sequence === '\x1bOB') return { ch: undefined, key: { name: 'down', sequence } };
      if (sequence === '\x1b[C' || sequence === '\x1bOC') return { ch: undefined, key: { name: 'right', sequence } };
      if (sequence === '\x1b[D' || sequence === '\x1bOD') return { ch: undefined, key: { name: 'left', sequence } };
      if (sequence === '\x1b[H' || sequence === '\x1bOH') return { ch: undefined, key: { name: 'home', sequence } };
      if (sequence === '\x1b[F' || sequence === '\x1bOF') return { ch: undefined, key: { name: 'end', sequence } };
      if (sequence === '\x1b[5~') return { ch: undefined, key: { name: 'pageup', sequence } };
      if (sequence === '\x1b[6~') return { ch: undefined, key: { name: 'pagedown', sequence } };
      if (sequence === '\x1b[2~') return { ch: undefined, key: { name: 'insert', sequence } };
      if (sequence === '\x1b[3~') return { ch: undefined, key: { name: 'delete', sequence } };
      // F1-F4 (SS3)
      if (sequence === '\x1bOP') return { ch: undefined, key: { name: 'f1', sequence } };
      if (sequence === '\x1bOQ') return { ch: undefined, key: { name: 'f2', sequence } };
      if (sequence === '\x1bOR') return { ch: undefined, key: { name: 'f3', sequence } };
      if (sequence === '\x1bOS') return { ch: undefined, key: { name: 'f4', sequence } };
    }

    // ESC alone
    if (sequence === '\x1b') return { ch: undefined, key: { name: 'escape', sequence } };

    // Backspace
    if (sequence === '\x7f' || sequence === '\x08') return { ch: undefined, key: { name: 'backspace', sequence } };

    // Enter
    if (sequence === '\r' || sequence === '\n') return { ch: undefined, key: { name: 'enter', sequence } };

    // Tab
    if (sequence === '\t') return { ch: undefined, key: { name: 'tab', sequence } };

    // Regular character
    return { ch: data, key: { name: data, sequence } };
  }

  // Create a context compatible with ncurses initscr()
  const context = {
    emit: (event: string, data: string) => {
      if (event === 'ansi-output') {
        session.socket.emit('ansi-output', data);
      }
    },
    write: (data: string) => session.socket.emit('ansi-output', data),
    screen: {
      on: (event: string, handler: (ch: any, key: any) => void) => {
        if (event === 'keypress') {
          if (session.bbsSession) {
            // CRITICAL: Set handler on bbsSession, not on the wrapper session
            session.bbsSession.doorInputHandler = (data: string) => {
              const { ch, key } = parseKeyData(data);
              handler(ch, key);
            };
            inputHandlerInstalled = true;
          } else {
            // Store fallback listener for cleanup
            const socketListener = (data: string) => {
              const { ch, key } = parseKeyData(data);
              handler(ch, key);
            };
            session.socket.on('data', socketListener);
            // Save reference for cleanup
            (session as any)._ncursesPongSocketListener = socketListener;
          }
        }
      }
    }
  };

  try {
    await door.onStart(context as any);
  } finally {
    // Clean up door manager flags
    session.bbsSession.inDoorManager = false;

    // Remove socket listeners to prevent memory leaks
    if (session.socket) {
      // Remove specific listener if it exists
      const socketListener = (session as any)._ncursesPongSocketListener;
      if (socketListener) {
        session.socket.removeListener('data', socketListener);
        delete (session as any)._ncursesPongSocketListener;
      } else {
        // Fallback to removing all data listeners
        session.socket.removeAllListeners('data');
      }
    }
    if (inputHandlerInstalled && session.bbsSession.doorInputHandler) {
      delete session.bbsSession.doorInputHandler;
    }

    // Disable game mode
    try {
      if (session.bbs?.disableGameMode) {
        session.bbs.disableGameMode();
      }
    } catch (error) {
      // Silently handle cleanup errors
    }
  }
}

export default { runDoor, metadata };
