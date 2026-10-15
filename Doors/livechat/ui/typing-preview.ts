import type { TypingUser } from '../types';
import { PANEL_BORDER } from './theme';
import type { Screen, Box } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { createBox } from '@amiexpress/bbs-door-sdk/utils/blessed-helpers';
import { color } from '../utils/ansi';
import { STATUS_HEIGHT } from './status-bar';
import { INPUT_HEIGHT } from './input-box';
import { T } from '../door-theme';

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
    style: { fg: T.dim, border: { fg: PANEL_BORDER } },
    tags: true,
    content: '',
    focusable: false,
    mouse: false,
    clickable: false
  });
}

/**
 * How long a typing buffer stands after its owner's last keystroke.
 *
 * A buffer is only removed when its owner sends the line or clears it, so
 * somebody who types two characters and walks away would otherwise count as
 * typing for the rest of the session.
 */
export const TYPING_STALE_MS = 5000;

/**
 * True while anyone - the caller or another node - is mid-keystroke.
 *
 * The preview reads this per buffer to decide what to draw; the theme
 * chrome reads it for the whole room, because a glitch is a lie written
 * over the chat log and every keystroke rebuilds that log's content. Both
 * answer the question from the same buffers and the same staleness.
 */
export function isAnyoneTyping(
  buffers: Map<number, TypingBuffer>,
  now: number = Date.now()
): boolean {
  for (const buf of buffers.values()) {
    if (now - buf.lastUpdate <= TYPING_STALE_MS) return true;
  }
  return false;
}

/** Render typing preview content - shows other users typing in real-time */
export function renderTypingPreview(buffers: Map<number, TypingBuffer>): string {
  const parts: string[] = [];
  const now = Date.now();

  for (const [userId, buf] of buffers) {
    // Skip stale buffers (no keystroke since TYPING_STALE_MS ago)
    if (now - buf.lastUpdate > TYPING_STALE_MS) continue;
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
