import type { TypingUser } from '../types';
import { color } from '../utils/ansi';

/** Typing buffer for a user */
export interface TypingBuffer {
  username: string;
  buffer: string;
  lastUpdate: number;
  color: string;
}

/** Create typing preview component */
export function createTypingPreview(blessed: any, screen: any) {
  return blessed.box({
    parent: screen,
    bottom: 4,
    left: 16,
    width: '100%-16',
    height: 3,
    border: { type: 'line' },
    style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
    tags: true,
    content: ''
  });
}

/** Render typing preview content */
export function renderTypingPreview(buffers: Map<number, TypingBuffer>): string {
  const lines: string[] = [];
  const now = Date.now();

  for (const [userId, buf] of buffers) {
    if (now - buf.lastUpdate > 5000) continue;
    if (buf.buffer.length === 0) continue;
    lines.push(color(`${buf.username}:`, buf.color) + ` ${buf.buffer}|`);
  }

  return lines.slice(-3).join('\n') || color('(No one typing)', 'gray');
}

/** Process keystroke for typing buffer */
export function processKeystroke(
  buffers: Map<number, TypingBuffer>,
  userId: number,
  username: string,
  char: string,
  userColor: string
): void {
  let buf = buffers.get(userId);
  if (!buf) {
    buf = { username, buffer: '', lastUpdate: Date.now(), color: userColor };
    buffers.set(userId, buf);
  }

  if (char === 'BACKSPACE') {
    buf.buffer = buf.buffer.slice(0, -1);
  } else if (char === 'CLEAR' || char === 'SUBMIT') {
    buffers.delete(userId);
    return;
  } else {
    buf.buffer += char;
  }
  buf.lastUpdate = Date.now();
}
