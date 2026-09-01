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
