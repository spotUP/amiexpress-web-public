/**
 * PETSCII keyboard bytes -> the ASCII/ANSI input string the BBS command
 * path already understands. ONE table for both directions of arrival:
 * the web canvas (keymap.ts bytes, BBSTerminal.tsx) and real C64 telnet
 * callers (index.ts's connection 'data' hook). Escape sequences are the
 * ones blessed's program.ts parseKey and doors/client-door-bridge.ts decode.
 *
 * Case rule: on a real C64 the UNSHIFTED key sends $41-$5A and displays
 * uppercase in bank 0, but the BBS runs the text bank where $41-$5A IS
 * lowercase - so unshifted = lowercase ASCII, matching keymap.ts (a-z ->
 * $41-$5A) and SyncTERM's C64-mode convention ($C1-$DA for shifted/
 * uppercase). This is the inverse of the pre-SDK backend
 * convertPetsciiInputToAscii, which disagreed with the web keymap.
 */
const CONTROL_KEYS: { [byte: number]: string } = {
  0x0D: '\r', 0x8D: '\r',
  // Not C64 keys - no C64 keyboard has Tab or Escape - but the web PETSCII
  // canvas is driven by a real keyboard and sends them (keymap.ts), and the
  // doors navigate with them. Without these two entries the bytes fall
  // through every branch below and are dropped as "no input meaning".
  0x09: '\t', 0x1B: '\x1b',
  // RUN/STOP on a real C64, Ctrl+C on the web canvas: the same byte and the
  // same meaning - stop what you are doing. Without it the board's abort key
  // could not be pressed at all in PETSCII (2026-09-13, sysop: "ctrl+c and
  // paste doesnt work at all in petscii mode"), so a caller could not leave
  // the operator chat.
  0x03: '\x03',
  0x14: '\x7f', 0x7F: '\x7f',
  0x91: '\x1b[A', 0x11: '\x1b[B', 0x1D: '\x1b[C', 0x9D: '\x1b[D',
  0x13: '\x1b[H', 0x94: '\x1b[2~',
  0x85: '\x1bOP', 0x89: '\x1bOQ', 0x86: '\x1bOR', 0x8A: '\x1bOS',
  0x87: '\x1b[15~', 0x8B: '\x1b[17~', 0x88: '\x1b[18~', 0x8C: '\x1b[19~',
};

/**
 * The Swedish trio, read back as the Latin-1 letters the board already speaks
 * everywhere else. A session that is not Swedish keeps [, pound and ].
 */
const SWEDISH_IN: { [byte: number]: string } = { 0x5B: '\u00e4', 0x5C: '\u00f6', 0x5D: '\u00e5' };

export function petsciiInputToAscii(bytes: ArrayLike<number>, swedish = false): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    const control = CONTROL_KEYS[b];
    if (control !== undefined) { out += control; continue; }
    if (swedish && SWEDISH_IN[b] !== undefined) { out += SWEDISH_IN[b]; continue; }
    if (b >= 0x41 && b <= 0x5A) { out += String.fromCharCode(b + 0x20); continue; } // unshifted -> a-z
    if (b >= 0xC1 && b <= 0xDA) { out += String.fromCharCode(b - 0x80); continue; } // shifted -> A-Z
    if ((b >= 0x20 && b <= 0x40) || (b >= 0x5B && b <= 0x5F) || (b >= 0x61 && b <= 0x7A)) { out += String.fromCharCode(b); continue; }
    // LF, CLR, colors, every other control/graphics byte: no input meaning.
  }
  return out;
}
