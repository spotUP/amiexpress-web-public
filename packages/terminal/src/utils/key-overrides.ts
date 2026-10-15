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
import { controlColourToPetscii, commodoreColourToPetscii } from '../petscii/keymap';
import { petsciiInputToAscii } from '@amiexpress/bbs-door-sdk/petscii';

export interface KeyLike {
  key: string;
  code?: string;
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
 * Game-mode key identity: the PHYSICAL key, not the character.
 *
 * `ev.key` follows the Shift state: pressing L gives keydown 'L' and, if
 * Shift is released first (fast typing), keyup 'l'. Tracking press and
 * release by `ev.key` strands the timer and the held set on 'L', and the
 * client repeats it for ever - the WHIP title that filled with L after
 * "Li" (sysop, 2026-09-10). `ev.code` ('KeyL') is shift-invariant, so
 * down and up always meet. Emitted bytes still carry `ev.key` - doors
 * read characters, and that path is untouched.
 */
export function trackKeyId(ev: KeyLike): string {
  return ev.code || ev.key;
}

/** The modifiers held with a game-mode key. */
export interface GameKeyModifiers { alt?: boolean; ctrl?: boolean; shift?: boolean }

/**
 * What a game-mode key press sends as `key-down`.
 *
 * The MODIFIERS travel with the key. Without them a door in game mode
 * received Alt+Enter as a bare Enter - which in GRANDMASTER's menu is
 * "select" - so the size toggle could not work there however well the door
 * was wired (2026-09-02). `src` names who pressed it (window listener,
 * canvas, on-screen keyboard, game pad) for the board's `[DOOR-INPUT]` trace.
 */
export function gameKeyDownPayload(
  key: string,
  code: string,
  mods: GameKeyModifiers | undefined,
  src: string,
): { key: string; code: string; src: string } & GameKeyModifiers {
  return { key, code, ...mods, src };
}

/**
 * Repeat heartbeat: a held key keeps producing keydown auto-repeats, so a
 * repeat timer with no fresh edge for this long is orphaned (missed keyup,
 * blur race, mode toggle) and must stop instead of typing for ever.
 */
export const GAME_KEY_SILENCE_MS = 2000;

export function repeatAlive(lastSeenAt: number, now: number): boolean {
  return now - lastSeenAt <= GAME_KEY_SILENCE_MS;
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
  | { kind: 'copy' }
  /**
   * TEXT THE CALLER TYPED, which happens to have come from a chord rather
   * than from a character key. It goes down the ordinary input path, not
   * out as raw bytes on `command`, because that is where a typed character
   * goes and the board must not be able to tell the two apart.
   */
  | { kind: 'input'; text: string };

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
 * THE COLOUR CHORD, AT EIGHTY COLUMNS.
 *
 * "let ansi users type colors the same way and it gets translated to the
 * petscii users" (the sysop, 2026-09-22). A PETSCII session learned both
 * chords - CTRL and a digit for the first eight colours, the Commodore key
 * and a digit for the other eight - because its keys go through the canvas
 * keymap. An eighty-column session's keys go through xterm and this file,
 * which had never been told.
 *
 * The same two tables answer for both, so a chord typed on either terminal
 * becomes the same PETSCII colour byte and is decoded in one place. What
 * travels is the board's own colour MARKER, not an ESC sequence: a chat
 * line and a message both carry it, and a message has every ESC stripped
 * out of it before it is stored.
 *
 * The Commodore key is ALT here, exactly as it is on the canvas. META is
 * deliberately not a chord: Cmd+1 is the browser's own tab switch, and
 * taking it would cost the caller their tabs.
 */
export function colourChordText(ev: KeyLike): string | null {
  if (ev.type && ev.type !== 'keydown') return null;
  if (!ev.code || ev.metaKey) return null;
  /*
   * A CHARACTER THE KEYBOARD MADE IS TYPED, NOT A CHORD.
   *
   * On a Mac, Option is how a layout reaches its third level: on a Swedish
   * keyboard Option+2 is `@`, Option+7 `|`, Option+8 and 9 `[` and `]`. The
   * browser reports those as the character itself in `key`; a chord with
   * nothing to type reports the digit. Taking Option+2 as the Commodore key
   * cost the sysop the `@` of an email address at new-user signup
   * (2026-09-30). So Alt is a chord only when the key is still its digit.
   */
  if (ev.altKey && !ev.ctrlKey && !/^[0-9]$/.test(ev.key)) return null;
  const byte = ev.ctrlKey && !ev.altKey
    ? controlColourToPetscii(ev.code)
    : ev.altKey && !ev.ctrlKey
      ? commodoreColourToPetscii(ev.code)
      : null;
  if (byte === null) return null;
  const text = petsciiInputToAscii([byte]);
  return text === '' ? null : text;
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

  // The colour chords. Below the game-mode block on purpose: a door running
  // in game mode reads the raw key edges and must not also be typed at.
  const colour = colourChordText(ev);
  if (colour !== null) return { kind: 'input', text: colour };

  if (ev.shiftKey) {
    const sequence = SHIFT_ARROWS[ev.key];
    if (sequence) return { kind: 'send', bytes: sequence };
  }

  return { kind: 'pass' };
}


/** Which auto-repeat the running door asked for. */
export type KeyRepeatMode = 'game' | 'application';

/**
 * Keys that never auto-repeat, whatever the door.
 *
 * Movement and action keys in an arcade door: the door polls the held-key
 * state instead, so a synthetic repeat would double every press.
 */
const NEVER_REPEAT = new Set([
  'w', 'W', 'a', 'A', 's', 'S', 'd', 'D',
  ' ', 'Control', 'Shift', 'Alt', 'Meta',
  'Escape', 'Enter', 'Tab',
]);

/**
 * May this key repeat while it is held?
 *
 * Only the long-standing never-repeat list lives here. WHETHER A REPEAT
 * REACHES THE DOOR is decided on the SERVER, in
 * `web/backend/src/services/game-mode.service.ts` (`repeatReachesDoor`),
 * because the browser's copy of a rule only arrives when the caller reloads:
 * the sysop held `V` with a tab carrying the previous night's bundle and the
 * repeats came through anyway (2026-09-15). One rule, in the place a stale
 * client cannot opt out of - and so this file does not keep a second copy of
 * the navigation-key list to drift from it.
 */
export function mayAutoRepeat(key: string): boolean {
  return !NEVER_REPEAT.has(key);
}
