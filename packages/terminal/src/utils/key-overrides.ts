/**
 * Keys the terminal has to translate itself, before xterm sees them.
 *
 * xterm decides what bytes a keystroke becomes, and its answer is not
 * always the one a door needs:
 *
 *   Alt+Enter is the 80x25 / responsive toggle in every door that has a
 *   size to change (the ANSI editor, the sprite studio, LiveChat,
 *   GRANDMASTER - see sdk/utils/terminal-mode.ts). On macOS xterm does NOT
 *   ESC-prefix an Option combination unless macOptionIsMeta is set, which
 *   it is not, so the door received a bare Enter: a chat message sent, a
 *   newline typed, and a toggle that looked dead. Reported 2026-09-01 as
 *   "it did not snap back to 80x25 when i toggled it off".
 *
 * Kept pure and separate because the component that owns the keyboard
 * cannot be mounted in a test - it needs a canvas, a socket and a real
 * xterm - while the decision is a lookup.
 */

export interface KeyLike {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  type?: string;
}

/** What the terminal knows about itself when a key arrives. */
export interface TerminalKeyState {
  /** Raw key-down/key-up events go to the door; xterm sees nothing. */
  gameMode: boolean;
  /** No socket, no emit - the key is dropped rather than half-sent. */
  connected: boolean;
  /** Ctrl+Shift+M turned mouse reporting off, so copy/select-all are ours. */
  mouseTrackingDisabled: boolean;
}

/**
 * What to do with one keystroke.
 *
 * `fullscreen` rides along instead of being its own action because Alt+Enter
 * does two things at once: the door changes its columns and the browser
 * changes its window.
 */
export type TerminalKeyAction =
  | { kind: 'pass' }
  | { kind: 'block'; fullscreen?: boolean }
  | { kind: 'send'; bytes: string; fullscreen?: boolean }
  | { kind: 'select-all' }
  | { kind: 'copy' };

/** xterm sends no modifier for these; a door that reads selections needs them. */
const SHIFT_ARROWS: Record<string, string> = {
  ArrowUp: '\x1B[1;2A',
  ArrowDown: '\x1B[1;2B',
  ArrowRight: '\x1B[1;2C',
  ArrowLeft: '\x1B[1;2D',
};

/** ESC, then the key - how a terminal spells "Alt" to a door. */
const META_PREFIX = '\x1b';

/**
 * The bytes this keystroke should send, or null to let xterm decide.
 *
 * Only keydown produces bytes: a keyup that also emitted would send every
 * override twice.
 */
export function keyOverride(ev: KeyLike): string | null {
  if (ev.type && ev.type !== 'keydown') return null;

  // Alt+Enter, and only Alt: Ctrl+Alt+Enter and Cmd+Alt+Enter belong to
  // whatever else the caller has bound them to.
  if (ev.altKey && !ev.ctrlKey && !ev.metaKey && (ev.key === 'Enter' || ev.key === 'Return')) {
    return `${META_PREFIX}\r`;
  }

  return null;
}

/**
 * The single decision every keystroke passes through before xterm sees it.
 *
 * xterm keeps ONE custom key handler - a second `attachCustomKeyEventHandler`
 * silently replaces the first - and BBSTerminal registered two, so the older
 * one (Shift+Arrow, copy/select-all, the Ctrl+Shift+M block) had never run.
 * Every rule lives here now, in the order it has to be asked, and the
 * component only executes the answer.
 */
export function classifyKey(ev: KeyLike, state: TerminalKeyState): TerminalKeyAction {
  const modKey = Boolean(ev.ctrlKey || ev.metaKey);

  // The mouse toggle is owned by a window listener (xterm does not reliably
  // deliver the combination here); xterm must not also type an M.
  if (modKey && ev.shiftKey && (ev.key === 'M' || ev.key === 'm')) {
    return { kind: 'block' };
  }

  // Alt+Enter: the door's size toggle AND the browser's window toggle. In
  // game mode the window keydown listener already emits the key with its
  // modifiers, so sending the bytes as well would toggle the door twice -
  // straight back to the size it started at.
  const override = keyOverride(ev);
  if (override !== null) {
    if (state.gameMode && state.connected) return { kind: 'block', fullscreen: true };
    return { kind: 'send', bytes: override, fullscreen: true };
  }

  if (state.gameMode && state.connected) {
    return { kind: 'block' };
  }

  // Browser-native selection does not work over xterm's canvas, so with mouse
  // reporting off these two are ours to serve.
  if (state.mouseTrackingDisabled && modKey && ev.type === 'keydown') {
    if (ev.key === 'a' || ev.key === 'A') return { kind: 'select-all' };
    if (ev.key === 'c' || ev.key === 'C') return { kind: 'copy' };
  }

  if (ev.shiftKey) {
    const sequence = SHIFT_ARROWS[ev.key];
    if (sequence) return { kind: 'send', bytes: sequence };
  }

  return { kind: 'pass' };
}
