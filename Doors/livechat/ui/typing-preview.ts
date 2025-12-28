import type { TypingUser } from '../types';
import type { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { color } from '../utils/ansi';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';

// Height of the typing indicator bar (shows who is typing in real-time)
export const TYPING_HEIGHT = 3;

/** Typing buffer for a user */
export interface TypingBuffer {
  username: string;
  buffer: string;
  lastUpdate: number;
  color: string;
}

/** Create typing preview component */
export function createTypingPreview(screen: Screen): Box {
  return createBox({
    parent: screen,
    bottom: STATUS_HEIGHT + INPUT_HEIGHT,
    left: 16,
    width: '100%-16',
    height: TYPING_HEIGHT,
    border: { type: 'line' },
    style: { fg: 'gray', bg: 'black', border: { fg: 'gray' } },
    tags: true,
    content: ''
  });
}

/** Render typing preview content - shows other users typing in real-time */
export function renderTypingPreview(buffers: Map<number, TypingBuffer>): string {
  const parts: string[] = [];
  const now = Date.now();

  for (const [userId, buf] of buffers) {
    // Skip stale buffers (no keystroke in 5 seconds)
    if (now - buf.lastUpdate > 5000) continue;
    // Show user's buffer with cursor indicator
    if (buf.buffer.length > 0) {
      parts.push(`{${buf.color}-fg}${buf.username}:{/${buf.color}-fg} ${buf.buffer}{inverse} {/inverse}`);
    }
  }

  // Return all typing users on one line, separated by spaces
  return parts.length > 0 ? parts.slice(0, 3).join('  ') : '';
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
