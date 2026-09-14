/**
 * What key an ON-SCREEN keystroke is, as a browser key event.
 *
 * A physical keyboard gives the page two things per key: the character
 * (`onData`, "q") and the EDGE (`keydown`/`keyup`, `{key:'q', code:'KeyQ'}`).
 * Game mode uses the second and ignores the first, because a game needs to
 * know a key is HELD - so `sendInput` drops characters while it is on.
 *
 * An on-screen keyboard has only the first. On a phone that means a door in
 * game mode receives nothing at all: the sysop, 2026-09-14, on the tip door -
 * "the osd keyboard doesnt seem to reach it q does nothing". The door itself
 * exits on any key; no key was arriving.
 *
 * So a tapped key is turned into the edge a real one would have produced, and
 * sent down the same path the mobile game pads already use. `null` means "not
 * a single keystroke" - a paste, a mouse report, an escape sequence nobody
 * types - and the caller leaves those alone rather than inventing an edge for
 * them.
 */

export interface InjectedKeyEvent {
  /** KeyboardEvent.key, as the browser would report it. */
  key: string;
  /** KeyboardEvent.code - the PHYSICAL key, which is what held-key tracking pairs on. */
  code: string;
}

/** The escape sequences the on-screen keyboard's own nav row sends. */
const SEQUENCES: Readonly<Record<string, InjectedKeyEvent>> = {
  '\x1b[A': { key: 'ArrowUp', code: 'ArrowUp' },
  '\x1b[B': { key: 'ArrowDown', code: 'ArrowDown' },
  '\x1b[C': { key: 'ArrowRight', code: 'ArrowRight' },
  '\x1b[D': { key: 'ArrowLeft', code: 'ArrowLeft' },
  '\x1bOA': { key: 'ArrowUp', code: 'ArrowUp' },
  '\x1bOB': { key: 'ArrowDown', code: 'ArrowDown' },
  '\x1bOC': { key: 'ArrowRight', code: 'ArrowRight' },
  '\x1bOD': { key: 'ArrowLeft', code: 'ArrowLeft' },
};

/** The single control characters, named the way a KeyboardEvent names them. */
const CONTROLS: Readonly<Record<string, InjectedKeyEvent>> = {
  '\r': { key: 'Enter', code: 'Enter' },
  '\n': { key: 'Enter', code: 'Enter' },
  '\t': { key: 'Tab', code: 'Tab' },
  '\x1b': { key: 'Escape', code: 'Escape' },
  '\x7f': { key: 'Backspace', code: 'Backspace' },
  '\b': { key: 'Backspace', code: 'Backspace' },
  ' ': { key: ' ', code: 'Space' },
};

/**
 * `code` for a printable character.
 *
 * It names the PHYSICAL key, so it is case-insensitive - a shifted `Q` and a
 * plain `q` are one key pressed twice, and held-key tracking pairs a release
 * with its press through this. Anything that is not a letter or a digit has no
 * portable code, and the character itself is a stable enough identity for one.
 */
function codeFor(ch: string): string {
  if (ch >= 'a' && ch <= 'z') return `Key${ch.toUpperCase()}`;
  if (ch >= 'A' && ch <= 'Z') return `Key${ch}`;
  if (ch >= '0' && ch <= '9') return `Digit${ch}`;
  return ch;
}

export function injectedKeyEvent(data: string): InjectedKeyEvent | null {
  if (!data) return null;

  const sequence = SEQUENCES[data];
  if (sequence) return sequence;

  const control = CONTROLS[data];
  if (control) return control;

  /*
   * ONE character, and a printable one. A longer string is a paste or a
   * terminal report; a control character this module has not named is
   * something no on-screen key sends. Both are left to the caller, which
   * treats "no event" as "nothing to press" rather than guessing.
   */
  if (data.length !== 1) return null;
  const code = data.charCodeAt(0);
  if (code < 0x20 || code === 0x7f) return null;

  return { key: data, code: codeFor(data) };
}
