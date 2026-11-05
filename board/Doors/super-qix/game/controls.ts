/**
 * The door's keyboard layer: what a raw key means, which direction it moves,
 * and what the help screen says about it.
 *
 * This lives beside the game rather than in index.ts so it can be tested
 * without standing up blessed and a door context. index.ts imports it and
 * keeps no key names of its own - which is the point of Q-5a: the help
 * screen is GENERATED from the same map the game dispatches on, so it cannot
 * drift out of date. It had: the help still advertised "Z - Slow Draw (2x
 * points)" and "X - Fast Draw" long after FAQ 2.5.3 was honoured and Super
 * Qix was given the single draw button it actually has.
 */

import { InputKey, Direction, KeyMap } from './types';

/**
 * Ctrl-D, as the terminal sends it.
 *
 * QUIX has a redraw for the same reason a BBS door needs one: a line that
 * drops a few bytes leaves the board looking wrong, and the player has no
 * other way to ask for it again (quix.c:308-335).
 */
export const REDRAW_KEY = '\x04';

/**
 * Keys the player may not bind a direction to, because the game already
 * needs them and a player who bound "up" to Q could not leave the door.
 */
export const RESERVED_KEYS: InputKey[] = [
  'q', 'escape', 'p', 'enter', 'space', 'backspace', 'tab', '?', 'ctrl-d', 'z', 'x',
];

/** The four movement tokens the game dispatches on. */
const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];

function isDirectionToken(key: string): key is Direction {
  return (DIRECTIONS as string[]).includes(key);
}

/**
 * Turn a raw key from the terminal into the token the game handles.
 *
 * The arrow escape sequences and WASD both arrive as direction tokens, so
 * the default bindings need no entry in the key map at all.
 */
export function normalizeKey(key: string): InputKey {
  if (key === '\x1b[A' || key === 'w' || key === 'W') return 'up';
  if (key === '\x1b[B' || key === 's' || key === 'S') return 'down';
  if (key === '\x1b[C' || key === 'd' || key === 'D') return 'right';
  if (key === '\x1b[D' || key === 'a' || key === 'A') return 'left';
  if (key === ' ') return 'space';
  if (key === '\r' || key === '\n') return 'enter';
  if (key === '\x1b' || key === '\x1b\x1b') return 'escape';
  if (key === '\x7f' || key === '\b') return 'backspace';
  if (key === '\t') return 'tab';
  if (key === REDRAW_KEY) return 'ctrl-d';
  return key.toLowerCase();
}

/**
 * Which direction a key moves the marker, or null if it moves it nowhere.
 *
 * The four direction TOKENS always answer for themselves, whatever the map
 * says, so the arrow keys and WASD keep working after any remap (Q-5d). A
 * remapped key is consulted on top of them, never instead of them.
 */
export function directionForKey(key: InputKey, keyMap?: KeyMap): Direction | null {
  if (isDirectionToken(key)) return key;
  if (!keyMap) return null;

  for (const direction of DIRECTIONS) {
    if (keyMap[direction] === key) return direction;
  }
  return null;
}

/**
 * Whether a key may be bound to a direction, and why not if it may not.
 *
 * Binding "up" to A would silently move the marker LEFT, because A is
 * already a direction token - so a key that already means a DIFFERENT
 * direction is refused rather than quietly shadowed.
 */
export function canBindKey(
  key: InputKey,
  direction: Direction
): { ok: boolean; reason?: string } {
  if (RESERVED_KEYS.includes(key)) {
    return { ok: false, reason: `${keyLabel(key)} is needed by the game` };
  }
  if (isDirectionToken(key) && key !== direction) {
    return { ok: false, reason: `${keyLabel(key)} already moves ${key}` };
  }
  return { ok: true };
}

/** How a key is written on the help screen. */
export function keyLabel(key: string): string {
  switch (key) {
    case 'up': return 'Arrow Up';
    case 'down': return 'Arrow Down';
    case 'left': return 'Arrow Left';
    case 'right': return 'Arrow Right';
    case 'space': return 'Space';
    case 'enter': return 'Enter';
    case 'escape': return 'Esc';
    case 'backspace': return 'Backspace';
    case 'tab': return 'Tab';
    case 'ctrl-d': return 'Ctrl-D';
    default: return key.toUpperCase();
  }
}

/**
 * Every binding the game answers to, in the order QUIX lists them.
 *
 * The four movement rows come from the LIVE map, so a remap shows up on the
 * help screen without anyone remembering to edit it.
 */
export function controlBindings(keyMap?: KeyMap): Array<{ keys: string; action: string }> {
  const map = keyMap ?? DEFAULT_KEY_MAP;
  return [
    { keys: keyLabel(map.up), action: 'Move up' },
    { keys: keyLabel(map.down), action: 'Move down' },
    { keys: keyLabel(map.left), action: 'Move left' },
    { keys: keyLabel(map.right), action: 'Move right' },
    { keys: 'Space / Z / X', action: 'Draw' },
    { keys: 'P', action: 'Pause' },
    { keys: 'Ctrl-D', action: 'Redraw the screen' },
    { keys: 'Q', action: 'Quit to the menu' },
  ];
}

/** The CONTROLS block of the help screen, one line per binding. */
export function helpControlLines(keyMap?: KeyMap): string[] {
  const bindings = controlBindings(keyMap);
  const width = Math.max(...bindings.map(b => b.keys.length));
  return bindings.map(b => `${b.keys.padEnd(width)} - ${b.action}`);
}

/**
 * The default bindings: the arrow keys, as direction tokens.
 *
 * Declared here rather than in constants.ts because it is the key layer's
 * own default and nothing else needs it - constants.ts re-exports it for the
 * door, which imports its constants from one place.
 */
export const DEFAULT_KEY_MAP: KeyMap = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
};
