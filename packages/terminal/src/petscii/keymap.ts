import { SWEDISH_KEY_TO_PETSCII } from './swedish';
/**
 * Browser KeyboardEvent -> PETSCII byte translation.
 *
 * Maps `event.key` (plus shift state) to the PETSCII byte sequence a real
 * C64 keyboard would have sent for that key. Named/control keys use a fixed
 * table; single printable characters are case-swapped because PETSCII and
 * ASCII disagree about which case lives in which code range (uppercase
 * PETSCII letters are $41-$5A, matching lowercase ASCII bytes, and vice
 * versa - this is the "unshifted = uppercase" C64 keyboard convention).
 *
 * Pure function: no DOM access beyond the two primitive arguments, so it is
 * unit-testable without jsdom/canvas.
 */

/**
 * THE COMMODORE KEY, PLAYED BY ALT.
 *
 * A C64 keyboard has a key an ASCII keyboard does not, and it is the one
 * that draws: C= with a letter gives the left-hand graphics `$A1-$BF`, and
 * SHIFT with the punctuation keys gives `$C0` and `$DB-$DF`. This board had
 * neither, so the machine it emulates could not type the characters it is
 * famous for - "we want full petscii input <3" (the sysop, 2026-09-22).
 *
 * KEYED BY `code`, NEVER BY `key`. On macOS Alt+a reports `e.key === 'a\u030a'`
 * and Alt+s reports `'\u00df'` - the browser has already applied the modifier -
 * and those are letters a Swedish caller types for their own sake. `code`
 * names the PHYSICAL key and is the same on every layout.
 *
 * The values cross-check against the glyph table the other direction is
 * built from: C=+A is `$B0` and `unicode-to-petscii.ts` maps the top-left
 * corner to `$B0`; C=+S is `$AE`, C=+Z is `$AD`, C=+X is `$BD` - the four
 * corners of a box, on the four keys a C64 artist reaches for.
 */
const COMMODORE_KEYS: { [code: string]: number } = {
  KeyA: 0xB0, KeyB: 0xBF, KeyC: 0xBC, KeyD: 0xAC, KeyE: 0xB1,
  KeyF: 0xBB, KeyG: 0xA5, KeyH: 0xB4, KeyI: 0xA2, KeyJ: 0xB5,
  KeyK: 0xA1, KeyL: 0xB6, KeyM: 0xA7, KeyN: 0xAA, KeyO: 0xB9,
  KeyP: 0xAF, KeyQ: 0xAB, KeyR: 0xB2, KeyS: 0xAE, KeyT: 0xA3,
  KeyU: 0xB8, KeyV: 0xBE, KeyW: 0xB3, KeyX: 0xBD, KeyY: 0xB7,
  KeyZ: 0xAD,
  /*
   * The graphics a C64 gets from SHIFT and a punctuation key. Its keyboard
   * has keys a PC does not, so they are reached from the keys a PC has, and
   * all of them sit behind the same modifier - one rule for the caller to
   * learn instead of two.
   */
  Backslash: 0xC0,      // horizontal line
  Minus: 0xDD,          // vertical line
  BracketLeft: 0xDB,    // cross
  BracketRight: 0xDC,
  Quote: 0xDE,
  Equal: 0xDF,
  Space: 0xA0,          // shift-space: a blank that is not a space
};

/**
 * THE C*BASE CONTROL KEYS: CTRL+L switches the case, CTRL+W word wrap in the
 * message editor (C*Base 3.3.7 `src/ml0123.a65:1888-1901` and `:1993-2006`).
 * They send the bytes a C64 sends for the same chords; the board answers
 * them (sysop decisions D1/D2, 2026-10-04,
 * `thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md`).
 */
const BOARD_CONTROL_KEYS: { [code: string]: number } = {
  KeyL: 0x0C,
  KeyW: 0x17,
  // CTRL+K: the board's command palette, the same VT byte an ASCII keyboard
  // sends (web/backend/src/services/door-input-routing.ts PALETTE_KEY). Not a
  // C*Base key; without it the canvas let the chord go to the browser and the
  // palette never opened ("ctrl+k does nothing in petscii mode", the sysop,
  // 2026-10-18).
  KeyK: 0x0B,
};

/** RVS ON / RVS OFF, the only fill a C64 has. */
const REVERSE_KEYS: { [code: string]: number } = {
  Digit9: 0x12,
  Digit0: 0x92,
};

/**
 * THE COLOUR KEYS, WHERE A C64 KEEPS THEM.
 *
 * On real hardware CTRL and a digit gives the first eight colours and C= and
 * a digit gives the other eight, and this board asks the same two chords of
 * every terminal it serves - "let ansi users type colors the same way and it
 * gets translated to the petscii users" (the sysop, 2026-09-22).
 *
 * The values are the PETSCII colour control bytes, so a chord typed in a
 * browser and a key pressed on a real C64 arrive as the same byte and are
 * decoded in one place.
 *
 * BACKGROUND is deliberately absent. The board is black-background
 * board-wide (`sdk/petscii/board-rules.ts`).
 */
const CONTROL_COLOUR_KEYS: { [code: string]: number } = {
  Digit1: 0x90, // black
  Digit2: 0x05, // white
  Digit3: 0x1C, // red
  Digit4: 0x9F, // cyan
  Digit5: 0x9C, // purple
  Digit6: 0x1E, // green
  Digit7: 0x1F, // blue
  Digit8: 0x9E, // yellow
};

const COMMODORE_COLOUR_KEYS: { [code: string]: number } = {
  Digit1: 0x81, // orange
  Digit2: 0x95, // brown
  Digit3: 0x96, // light red
  Digit4: 0x97, // dark grey
  Digit5: 0x98, // grey
  Digit6: 0x99, // light green
  Digit7: 0x9A, // light blue
  Digit8: 0x9B, // light grey
};

/** The colour CTRL and this physical key asks for, or null. */
export function controlColourToPetscii(code: string): number | null {
  return code in CONTROL_COLOUR_KEYS ? CONTROL_COLOUR_KEYS[code] : null;
}

/**
 * The colour the COMMODORE key and this physical key asks for, or null.
 *
 * The other eight, and only the colours - `commodoreKeyToPetscii` below
 * answers for the graphics and for reverse as well, which an eighty-column
 * terminal has no way to type and no way to show.
 */
export function commodoreColourToPetscii(code: string): number | null {
  return code in COMMODORE_COLOUR_KEYS ? COMMODORE_COLOUR_KEYS[code] : null;
}

/**
 * EVERY CHORD CTRL OWNS on a C64 keyboard: the eight colours, and REVERSE on
 * and off at 9 and 0.
 *
 * One function, because the canvas asks the same question before it decides
 * whether to keep a keystroke or let the browser have it. While reverse was
 * missing here the canvas let CTRL+9 through and the browser typed a `9`
 * ("ctrl+0/9 just prints 0 or 9", the sysop, 2026-09-23).
 */
export function controlChordToPetscii(code: string): number | null {
  if (code in REVERSE_KEYS) return REVERSE_KEYS[code];
  if (code in BOARD_CONTROL_KEYS) return BOARD_CONTROL_KEYS[code];
  return controlColourToPetscii(code);
}

/**
 * The byte the Commodore key sends for this physical key, or null.
 *
 * Exported so the canvas can ask whether a chord is the board's before it
 * hands the keystroke to the browser.
 */
export function commodoreKeyToPetscii(code: string): number | null {
  if (code in COMMODORE_KEYS) return COMMODORE_KEYS[code];
  if (code in COMMODORE_COLOUR_KEYS) return COMMODORE_COLOUR_KEYS[code];
  if (code in REVERSE_KEYS) return REVERSE_KEYS[code];
  return null;
}

// Named keys that don't depend on shift state.
const NAMED_KEYS: { [key: string]: number } = {
  Enter: 0x0D,
  Backspace: 0x14,
  Delete: 0x14,
  // A C64 keyboard has neither of these, and that is why they were missing -
  // but the person at this canvas is at a real keyboard, and the board's own
  // doors navigate with them: a lobby's panes are walked with Tab and backed
  // out of with Escape. Without them a PETSCII caller reaches the TetriNET
  // lobby and then cannot move around it ("i cant tab in the tetrinet lobby
  // in petscii mode"). They travel as their ASCII bytes, which is what the
  // doors read once petsciiInputToAscii lets them back through.
  Tab: 0x09,
  Escape: 0x1B,
  ArrowDown: 0x11,
  ArrowUp: 0x91,
  ArrowRight: 0x1D,
  ArrowLeft: 0x9D,
  // C64 function keys: F1/F3/F5/F7 are the "base" keys, F2/F4/F6/F8 are
  // their shifted counterparts on the real keyboard, but browsers report
  // F1-F8 as distinct keys regardless of a shift modifier - map each
  // browser key straight to its C64 byte.
  F1: 0x85,
  F2: 0x89,
  F3: 0x86,
  F4: 0x8A,
  F5: 0x87,
  F6: 0x8B,
  F7: 0x88,
  F8: 0x8C,
};

// Keys whose byte depends on shiftKey.
const SHIFTABLE_NAMED_KEYS: { [key: string]: [unshifted: number, shifted: number] } = {
  Home: [0x13, 0x93],
};

export function keyEventToPetscii(
  key: string,
  shiftKey: boolean,
  swedish = false,
  code?: string,
  altKey = false,
  ctrlKey = false,
): number[] | null {
  /*
   * The Commodore key first, resolved through `code`: on a Mac the browser
   * has already turned Alt+a into a letter, and that letter is one somebody
   * types for its own sake.
   */
  if (altKey && code) {
    const graphic = commodoreKeyToPetscii(code);
    return graphic === null ? null : [graphic];
  }
  if (ctrlKey && code) {
    /*
     * CTRL+9 and CTRL+0 are REVERSE ON and OFF on real hardware, beside the
     * eight colour chords and reached the same way. They were only wired to
     * the Commodore key, so the browser kept the keystroke and printed the
     * digit instead ("ctrl+0/9 just prints 0 or 9", the sysop, 2026-09-23).
     */
    const chord = controlChordToPetscii(code);
    return chord === null ? null : [chord];
  }
  // A Swedish caller's own letters, where a Swedish C64 keeps them. Off by
  // default: in an ordinary session those bytes are [, pound and ].
  if (swedish && key in SWEDISH_KEY_TO_PETSCII) return [SWEDISH_KEY_TO_PETSCII[key]!];
  if (key in SHIFTABLE_NAMED_KEYS) {
    const [unshifted, shifted] = SHIFTABLE_NAMED_KEYS[key];
    return [shiftKey ? shifted : unshifted];
  }
  if (key in NAMED_KEYS) {
    return [NAMED_KEYS[key]];
  }
  if (key.length !== 1) return null;

  // `charCode`, not `code`: the parameter above names the physical key.
  const charCode = key.charCodeAt(0);
  if (charCode >= 0x61 && charCode <= 0x7A) return [charCode - 0x20]; // a-z -> $41-$5A
  if (charCode >= 0x41 && charCode <= 0x5A) return [charCode + 0x80]; // A-Z -> $C1-$DA
  if (charCode >= 0x20 && charCode <= 0x3F) return [charCode];        // digits/punctuation
  if (charCode === 0x40 || (charCode >= 0x5B && charCode <= 0x5F)) return [charCode]; // @[\]^_
  return null;
}

/**
 * PASTED TEXT as the bytes typing it would have produced.
 *
 * Beside keyEventToPetscii on purpose: a paste and a keypress must not
 * disagree about what a character is, and this is the only place that
 * decides. A line break is RETURN, CRLF is one RETURN, and anything a C64
 * keyboard could not have typed is dropped rather than sent as rubbish.
 */
export function pastedTextToPetscii(text: string, swedish = false): number[] {
  const bytes: number[] = [];
  for (const ch of text) {
    if (ch === '\r' || ch === '\n') {
      if (ch === '\n' && bytes[bytes.length - 1] === 0x0D) continue;
      bytes.push(0x0D);
      continue;
    }
    // The case is read off the character itself, so shift does not matter.
    const mapped = keyEventToPetscii(ch, false, swedish);
    if (mapped) bytes.push(...mapped);
  }
  return bytes;
}
