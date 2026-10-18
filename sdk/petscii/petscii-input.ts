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
import { printablePetsciiToScreenCode } from './screen-codes';
import { PUA_BANK1, colourMarker } from './pua';
import { SWEDISH_PETSCII_TO_CHAR } from './swedish-charset';
import { PETSCII_COLOR_TO_VIC } from './c64-palette';

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
  // CTRL+W: C*Base's word wrap key in its message editor (C*Base 3.3.7
  // `src/ml0123.a65:1993-2006`). It reaches the board as ETB, the byte an
  // ASCII keyboard sends for the same chord, and the line editor takes it
  // (handlers/message/message-entry.handler.ts).
  0x17: '\x17',
  // CTRL+K: the board's command palette (PALETTE_KEY in
  // web/backend/src/services/door-input-routing.ts). A C64 sends `$0B` for
  // the chord and it means nothing on its screen, so it is free to carry the
  // same VT byte an ASCII keyboard sends; dropped here, the palette could not
  // be opened from a PETSCII session at all.
  0x0B: '\x0b',
  0x14: '\x7f', 0x7F: '\x7f',
  0x91: '\x1b[A', 0x11: '\x1b[B', 0x1D: '\x1b[C', 0x9D: '\x1b[D',
  0x13: '\x1b[H', 0x94: '\x1b[2~',
  0x85: '\x1bOP', 0x89: '\x1bOQ', 0x86: '\x1bOR', 0x8A: '\x1bOS',
  0x87: '\x1b[15~', 0x8B: '\x1b[17~', 0x88: '\x1b[18~', 0x8C: '\x1b[19~',
};

/**
 * The Swedish trio, read back as the Latin-1 letters the board already
 * speaks everywhere else. ONE table, in `./swedish-charset` - the output
 * side needs the same one to stop folding a caller's own name onto `aao`.
 */
const SWEDISH_IN = SWEDISH_PETSCII_TO_CHAR;

/**
 * CTRL+L: the caller switches his screen to the other character set - the
 * C*Base convention (C*Base 3.3.7 `src/ml0123.a65:1888-1901`).
 *
 * A TERMINAL COMMAND, NOT TEXT. `petsciiInputToAscii` drops it like every
 * other byte with no input meaning; the transport that holds the bytes - the
 * telnet input hook, the web canvas - looks for it first and asks the board
 * to switch (`web/backend/src/utils/petscii-session-model.ts`,
 * `togglePetsciiCase`). So no prompt, editor or door ever sees it.
 */
export const PETSCII_CASE_TOGGLE = 0x0C;

export function petsciiInputToAscii(bytes: ArrayLike<number>, swedish = false): string {
  let out = '';
  /*
   * REVERSE IS A LATCH, not a character.
   *
   * `$12`/`$92` turn reverse on and off for everything typed after them, so
   * they are carried in bit 7 of each screen code that follows rather than
   * as marks of their own - the same place the transducer reads it from.
   */
  let reverse = false;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === RVS_ON) { reverse = true; continue; }
    if (b === RVS_OFF) { reverse = false; continue; }
    const control = CONTROL_KEYS[b];
    if (control !== undefined) { out += control; continue; }
    if (swedish && SWEDISH_IN[b] !== undefined) { out += SWEDISH_IN[b]; continue; }
    if (b >= 0x41 && b <= 0x5A) { out += String.fromCharCode(b + 0x20); continue; } // unshifted -> a-z
    if (b >= 0xC1 && b <= 0xDA) { out += String.fromCharCode(b - 0x80); continue; } // shifted -> A-Z
    if ((b >= 0x20 && b <= 0x40) || (b >= 0x5B && b <= 0x5F) || (b >= 0x61 && b <= 0x7A)) { out += String.fromCharCode(b); continue; }
    if (isGraphicsByte(b)) { out += graphicMarker(b, reverse); continue; }
    /*
     * THE PEN. A caller pressing CTRL+1 on real hardware sends `$90`, and
     * it means the same thing as a chord on the web canvas or a colour a
     * caller picks on an eighty-column terminal: the ink changes from here
     * on. It is carried as the board's own marker rather than as SGR,
     * because a chat message has every ESC stripped out of it before it is
     * stored - so a form with an ESC in it could not be the one thing a
     * message and a chat line both carry.
     */
    const vic = PETSCII_COLOR_TO_VIC[b];
    if (vic !== undefined) { out += colourMarker(vic); continue; }
    // LF, CLR, background, charset: no input meaning. Background is not an
    // omission - the board is black-background board-wide. CTRL+L
    // (PETSCII_CASE_TOGGLE) is taken by the transport before this is called.
  }
  return out;
}

/** `$12` RVS ON, `$92` RVS OFF - a latch over what follows, not a glyph. */
const RVS_ON = 0x12;
const RVS_OFF = 0x92;

/**
 * THE GRAPHICS A C64 KEYBOARD CAN ACTUALLY TYPE.
 *
 * Two runs, and they are the two the KEYBOARD reaches: `$A0-$BF` is the
 * Commodore key with a letter or a digit, `$C0` and `$DB-$DF` are SHIFT with
 * the punctuation keys (`* - + £ @ ^ =`). Everything between - `$C1-$DA` -
 * is SHIFT with a LETTER, which on a real C64 is the same byte in either
 * charset and is A-Z on this board, so it is decoded above and never here.
 * There is no third run: a caller cannot type a right-hand graphic
 * distinguishably, which is the reason the board runs one charset bank.
 */
function isGraphicsByte(b: number): boolean {
  return (b >= 0xA0 && b <= 0xC0) || (b >= 0xDB && b <= 0xFF);
}

/**
 * A graphics byte as the marker that carries it through the board.
 *
 * BANK 1 ONLY (`U+E1xx`). The board runs the lowercase charset board-wide -
 * "only lowercase characters are allowed and only black background ... this
 * should apply bbs wide" (the sysop, 2026-09-14, `board-rules.ts`) - and a
 * bank-0 marker would make the transducer emit `$8E`, which reflows every
 * letter already on the caller's screen.
 */
function graphicMarker(b: number, reverse: boolean): string {
  const sc = printablePetsciiToScreenCode(b) & 0x7F;
  return String.fromCodePoint(PUA_BANK1 + (reverse ? sc | 0x80 : sc));
}
