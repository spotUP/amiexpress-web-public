/**
 * Input Helpers
 * Common utilities for buffered input handling
 */

import { BBSSession } from '../../index';

/**
 * Handle buffered line input (express.e:2304-2342)
 * Returns true if Enter was pressed (line complete)
 */
export function handleBufferedInput(
  socket: any,
  session: BBSSession,
  data: string,
  callback: (input: string) => void | Promise<void>
): boolean {
  // Initialize inputBuffer if needed
  if (!session.inputBuffer) {
    session.inputBuffer = '';
  }

  // Enter pressed - process the buffered input
  if (data === '\r' || data === '\n') {
    const input = session.inputBuffer;
    session.inputBuffer = '';

    // Call the callback (may be async)
    const result = callback(input);
    if (result instanceof Promise) {
      result.catch(error => {
console.error('Error in buffered input callback:', error);
      });
    }
    return true;
  }

  // Backspace (express.e:2304-2320)
  else if (data === '\x7f' || data === '\b') {
    // express.e:2306 - IF curpos>0 THEN (only backspace if buffer has content)
    if (session.inputBuffer.length > 0) {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
      // express.e:2307-2319 - Send backspace sequence: BS + space + BS
      // This moves cursor back, overwrites char with space, moves cursor back again
      socket.emit('ansi-output', '\b \b');
    }
    // If buffer is empty, ignore backspace (prevents erasing prompt)
    return false;
  }

  // Printable character - add to buffer
  else if (data.length === 1 && data >= ' ' && data <= '~') {
    session.inputBuffer += data;
    // Echo character back to terminal (express.e:2342) - backend handles ALL echo
    socket.emit('ansi-output', data);
    return false;
  }

  // Ignore other control characters
  return false;
}

/**
 * Handle single-keypress input (no buffering, no echo)
 * Used for menu navigation, confirmations, etc.
 */
export function handleSingleKeyInput(
  socket: any,
  session: BBSSession,
  data: string,
  callback: (key: string) => void | Promise<void>
): void {
  // Only process printable characters and common control keys
  if (data.length > 0) {
    const result = callback(data);
    if (result instanceof Promise) {
      result.catch(error => {
console.error('Error in single key input callback:', error);
      });
    }
  }
}
