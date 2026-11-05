import type { AppState } from './state';
import { appendInput, backspaceInput, clearInput } from './state';

/** Key handler result */
export interface KeyResult {
  type: 'char' | 'backspace' | 'enter' | 'escape' | 'tab' | 'arrow' | 'ignore';
  char?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
}

/** Parse raw key input */
export function parseKey(data: string): KeyResult {
  // Arrow keys
  if (data === '\x1b[A') return { type: 'arrow', direction: 'up' };
  if (data === '\x1b[B') return { type: 'arrow', direction: 'down' };
  if (data === '\x1b[C') return { type: 'arrow', direction: 'right' };
  if (data === '\x1b[D') return { type: 'arrow', direction: 'left' };

  // Special keys
  if (data === '\x1b' || data === '\x03') return { type: 'escape' };
  if (data === '\t') return { type: 'tab' };
  if (data === '\r' || data === '\n') return { type: 'enter' };
  if (data === '\x7f' || data === '\b') return { type: 'backspace' };

  // Printable character
  if (data.length === 1 && data >= ' ' && data <= '~') {
    return { type: 'char', char: data };
  }

  return { type: 'ignore' };
}

/** Handle key input and update state */
export function handleKey(state: AppState, key: KeyResult): string | null {
  switch (key.type) {
    case 'char':
      appendInput(state, key.char!);
      return key.char!;
    case 'backspace':
      if (state.inputBuffer.length > 0) {
        backspaceInput(state);
        return 'BACKSPACE';
      }
      return null;
    case 'enter':
      const msg = state.inputBuffer.trim();
      clearInput(state);
      return msg ? 'SUBMIT:' + msg : null;
    case 'escape':
      return 'ESCAPE';
    case 'tab':
      return 'TAB';
    default:
      return null;
  }
}
