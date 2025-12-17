import type { TypingUser } from '../types';
import { color } from '../utils/ansi';

/** Create input box config */
export function inputBoxConfig() {
  return {
    label: ' Message ',
    border: { type: 'line' as const },
    inputOnFocus: true,
    tags: true,
    style: {
      border: { fg: 'green' },
      focus: { border: { fg: 'yellow' } }
    }
  };
}

/** Format typing indicator */
export function formatTyping(users: TypingUser[]): string {
  if (users.length === 0) return '';
  if (users.length === 1) {
    return color(`${users[0].username} is typing...`, 'gray');
  }
  if (users.length === 2) {
    return color(`${users[0].username} and ${users[1].username} are typing...`, 'gray');
  }
  return color(`${users.length} people are typing...`, 'gray');
}

/** Create status line config */
export function statusLineConfig() {
  return {
    height: 1,
    tags: true,
    style: { fg: 'gray' }
  };
}
