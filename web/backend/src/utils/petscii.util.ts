/**
 * PETSCII Utility - C64 PETSCII to Unicode/ANSI Converter
 *
 * Converts Commodore 64 PETSCII (PET Standard Code of Information Interchange)
 * character codes and control sequences for terminal display.
 *
 * PETSCII has TWO character set modes:
 * - Unshifted/Graphics mode (default): Uppercase letters + graphics characters
 * - Shifted/Text mode: Uppercase + lowercase letters
 *
 * Control codes 0x0E and 0x8E switch between these modes.
 *
 * PetMe64 font Unicode PUA mapping:
 * - 0xE000-0xE0FF: Unshifted/Graphics character set
 * - 0xE100-0xE1FF: Shifted/Text character set
 *
 * References:
 * - https://sta.c64.org/cbm64pet.html
 * - https://www.pagetable.com/c64ref/charset/
 * - https://www.kreativekorp.com/software/fonts/c64/
 * - https://style64.org/c64-truetype/petscii-rom-mapping
 *
 * The screen-code -> Unicode table used by the ANSI fallback path
 * (convertPetsciiToAnsi) lives in `./petscii-unicode-map.ts`; see that
 * file's own header for its normative sources (Unicode Consortium
 * MAPPINGS/C64IPRI.TXT and C64IALT.TXT).
 */

import * as fs from 'fs';
import { PETSCII_COLOR_TO_VIC, vicToSgrForeground, vicToSgrBackground } from './c64-palette';
import { SCREENCODE_TO_UNICODE } from './petscii-unicode-map';
import { petsciiInputToAscii, AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';

/**
 * PETSCII Control Codes - Complete Reference
 *
 * Lower control codes (0x00-0x1F):
 * 0x00 = NULL
 * 0x03 = STOP (Run/Stop key)
 * 0x05 = WHITE color
 * 0x08 = Disable Shift+C= key
 * 0x09 = Enable Shift+C= key
 * 0x0D = RETURN (carriage return)
 * 0x0E = Switch to lowercase/text mode (shifted charset)
 * 0x11 = Cursor DOWN
 * 0x12 = REVERSE ON
 * 0x13 = HOME (cursor to top-left)
 * 0x14 = DELETE (backspace)
 * 0x1C = RED color
 * 0x1D = Cursor RIGHT
 * 0x1E = GREEN color
 * 0x1F = BLUE color
 *
 * Upper control codes (0x80-0x9F):
 * 0x81 = ORANGE color
 * 0x83 = RUN
 * 0x85-0x8C = Function keys F1-F8
 * 0x8D = Shift+RETURN
 * 0x8E = Switch to uppercase/graphics mode (unshifted charset)
 * 0x90 = BLACK color
 * 0x91 = Cursor UP
 * 0x92 = REVERSE OFF
 * 0x93 = CLEAR SCREEN
 * 0x94 = INSERT
 * 0x95 = BROWN color
 * 0x96 = LIGHT RED (pink) color
 * 0x97 = DARK GREY color
 * 0x98 = GREY (medium) color
 * 0x99 = LIGHT GREEN color
 * 0x9A = LIGHT BLUE color
 * 0x9B = LIGHT GREY color
 * 0x9C = PURPLE color
 * 0x9D = Cursor LEFT
 * 0x9E = YELLOW color
 * 0x9F = CYAN color
 */

/**
 * State for PETSCII conversion
 */
interface PetsciiState {
  reverseVideo: boolean;
  currentColor: string;
  shiftMode: boolean;  // false = unshifted/graphics, true = shifted/text
  /**
   * A `$02` has been seen and the NEXT byte is a candidate background colour
   * (the CCGMS convention - see the reference doc, section 3). Lives on the
   * state object, not in a local, so the prefix survives a chunk boundary on
   * PetsciiStreamConverter.
   */
  bgPrefix: boolean;
  /** True while a `$02 <colour>` background is in force, so `$0E` knows to reset it. */
  backgroundSet: boolean;
}

/**
 * Create initial PETSCII state
 * C64 power-on default: pen color is light blue (VIC 14).
 */
function createPetsciiState(): PetsciiState {
  return {
    reverseVideo: false,
    currentColor: vicToSgrForeground(14), // Light blue (C64 power-on pen)
    shiftMode: false,         // Start in unshifted/graphics mode
    bgPrefix: false,
    backgroundSet: false,     // Terminal default background until a $02 <colour> says otherwise
  };
}

/**
 * Convert PETSCII byte to screen code
 *
 * PETSCII and screen codes are different! The C64 uses screen codes internally
 * for display, and PetMe64 font maps screen codes to PUA, not PETSCII directly.
 *
 * Official conversion table from sta.c64.org/cbm64pettoscr.html:
 * | PETSCII Range | Operation   | Screen Code Range |
 * |---------------|-------------|-------------------|
 * | $00-$1F       | +$80        | $80-$9F           |
 * | $20-$3F       | +$00        | $20-$3F           |
 * | $40-$5F       | -$40        | $00-$1F           |
 * | $60-$7F       | -$20        | $40-$5F           |
 * | $80-$9F       | +$40        | $C0-$DF           |
 * | $A0-$BF       | -$40        | $60-$7F           |
 * | $C0-$DF       | -$80        | $40-$5F           |
 * | $E0-$FE       | -$80        | $60-$7E           |
 * | $FF           | special     | $5E (pi)          |
 */
function petsciiToScreenCode(petscii: number): number {
  // $00-$1F: Add $80 -> $80-$9F (reverse video @ A-Z etc)
  if (petscii <= 0x1F) {
    return petscii + 0x80;
  }
  // $20-$3F: Direct mapping (space, numbers, punctuation)
  if (petscii <= 0x3F) {
    return petscii;
  }
  // $40-$5F: Subtract $40 -> $00-$1F (@ A-Z [ \ ] ^ _)
  if (petscii <= 0x5F) {
    return petscii - 0x40;
  }
  // $60-$7F: Subtract $20 -> $40-$5F (graphics chars)
  if (petscii <= 0x7F) {
    return petscii - 0x20;
  }
  // $80-$9F: Add $40 -> $C0-$DF (reverse video graphics)
  if (petscii <= 0x9F) {
    return petscii + 0x40;
  }
  // $A0-$BF: Subtract $40 -> $60-$7F (shifted graphics)
  if (petscii <= 0xBF) {
    return petscii - 0x40;
  }
  // $C0-$DF: Subtract $80 -> $40-$5F (uppercase in shifted mode)
  if (petscii <= 0xDF) {
    return petscii - 0x80;
  }
  // $E0-$FE: Subtract $80 -> $60-$7E (same as $A0-$BE)
  if (petscii <= 0xFE) {
    return petscii - 0x80;
  }
  // $FF: Pi symbol -> $5E
  return 0x5E;
}

/**
 * Convert a PETSCII byte to Unicode for PetMe64 font display
 *
 * PetMe64 font uses Unicode Private Use Area (PUA) code points:
 * - 0xE000-0xE07F: Unshifted/Graphics character set (screen codes 0x00-0x7F)
 * - 0xE080-0xE0FF: Reverse unshifted characters (screen codes 0x80-0xFF)
 * - 0xE100-0xE17F: Shifted/Text character set (screen codes 0x00-0x7F)
 * - 0xE180-0xE1FF: Reverse shifted characters (screen codes 0x80-0xFF)
 *
 * The font expects SCREEN CODES, not raw PETSCII bytes!
 *
 * @param byte - PETSCII byte code (0x00-0xFF)
 * @param state - Current conversion state (reverse video, color, shift mode)
 * @returns String output (Unicode character or ANSI escape sequence)
 */
function convertPetsciiByteForPetMe64(byte: number, state: PetsciiState): string {
  // ========================================
  // BACKGROUND: $02 <colour> (CCGMS), checked BEFORE the pen branch so the
  // colour byte is consumed as a background and never lands as ink.
  // ========================================
  const bg = takeBackgroundColor(byte, state);
  if (bg !== null) return bg;
  if (byte === 0x02) { state.bgPrefix = true; return ''; }

  // ========================================
  // COLOR CONTROL CODES
  // ========================================
  if (byte in PETSCII_COLOR_TO_VIC) {
    state.currentColor = vicToSgrForeground(PETSCII_COLOR_TO_VIC[byte]);
    return state.currentColor;
  }

  // ========================================
  // CHARACTER SET SWITCHING
  // ========================================
  if (byte === 0x0E) {
    // Switch to lowercase/text mode (shifted charset). CCGMS ties this to a
    // background reset.
    state.shiftMode = true;
    return resetBackground(state);
  }
  if (byte === 0x8E) {
    // Switch to uppercase/graphics mode (unshifted charset)
    state.shiftMode = false;
    return '';
  }

  // ========================================
  // CURSOR MOVEMENT
  // ========================================
  if (byte === 0x11) return '\x1b[B';      // Cursor down
  if (byte === 0x91) return '\x1b[A';      // Cursor up
  if (byte === 0x1D) return '\x1b[C';      // Cursor right
  if (byte === 0x9D) return '\x1b[D';      // Cursor left
  if (byte === 0x13) return '\x1b[H';      // Home (cursor to top-left)

  // ========================================
  // SCREEN CONTROL
  // ========================================
  if (byte === 0x93) return '\x1b[2J\x1b[H'; // Clear + home. No background SGR: a real C64 keeps
                                              // the background it has across a clear, so a `$02
                                              // <colour>` already in force survives ($0E resets it).
  if (byte === 0x14) return '\x08';          // Delete (backspace)
  if (byte === 0x94) return '\x1b[@';        // Insert character

  // ========================================
  // REVERSE VIDEO - state only; rendering uses the font's reverse glyph bank (+0x80)
  // ========================================
  if (byte === 0x12) { state.reverseVideo = true;  return ''; }
  if (byte === 0x92) { state.reverseVideo = false; return ''; }

  // ========================================
  // LINE BREAKS - KERNAL: RETURN ($0D) cancels reverse mode; Shift+RETURN ($8D) does not
  // ========================================
  if (byte === 0x0D) { state.reverseVideo = false; return '\r\n'; }
  if (byte === 0x8D) { return '\r\n'; }

  // ========================================
  // ALL remaining control bytes are no-ops on a C64 (audit A5): never let them
  // fall through to the printable path, where petsciiToScreenCode() would turn
  // them into reverse glyphs.
  // ========================================
  if (byte < 0x20 || (byte >= 0x80 && byte <= 0x9F)) return '';

  // ========================================
  // PRINTABLE - screen code, reverse via bit 7 (matches C64 screen RAM exactly)
  // ========================================
  const screenCode = petsciiToScreenCode(byte) | (state.reverseVideo ? 0x80 : 0);
  const baseCodePoint = state.shiftMode ? 0xE100 : 0xE000;
  return String.fromCodePoint(baseCodePoint + screenCode);
}

/**
 * CCGMS background convention, host-side. `$02` followed by one of the 16
 * standard PETSCII colour bytes sets the C64's background AND border; these
 * converters render onto xterm, where a background SGR is the honest
 * equivalent. Returns the string to emit, or null when this byte is not the
 * colour half of a `$02` pair (the caller then processes it normally - a
 * `$02` before a non-colour byte is inert).
 *
 * Without this, the catch-all control-code branch swallowed the `$02` and the
 * NEXT byte fell into the foreground-colour branch, corrupting the ink for the
 * rest of the art.
 */
function takeBackgroundColor(byte: number, state: PetsciiState): string | null {
  if (!state.bgPrefix) return null;
  state.bgPrefix = false;
  if (!(byte in PETSCII_COLOR_TO_VIC)) return null;
  state.backgroundSet = true;
  return vicToSgrBackground(PETSCII_COLOR_TO_VIC[byte]);
}

/**
 * `$0E` is both the lowercase-charset switch and, on CCGMS, a background reset.
 * Emits the "default background" SGR only when a `$02 <colour>` actually set
 * one, so the overwhelmingly common charset-prelude `$0E` still costs zero
 * bytes and every existing golden byte sequence is unchanged. The default is
 * the viewer's own background, matching `$93` on these paths - a C64 terminal
 * runs black and so does every terminal these converters feed.
 */
function resetBackground(state: PetsciiState): string {
  if (!state.backgroundSet) return '';
  state.backgroundSet = false;
  return '\x1b[49m';
}

/**
 * Convert a PETSCII byte code to ANSI output (for generic terminals without PetMe64)
 *
 * @param byte - PETSCII byte code (0x00-0xFF)
 * @param state - Current conversion state
 * @returns ANSI string output
 */
function convertPetsciiByte(byte: number, state: PetsciiState): string {
  // Background: $02 <colour> (CCGMS), before the pen branch - see takeBackgroundColor.
  const bg = takeBackgroundColor(byte, state);
  if (bg !== null) return bg;
  if (byte === 0x02) { state.bgPrefix = true; return ''; }

  // Handle color codes
  if (byte in PETSCII_COLOR_TO_VIC) {
    state.currentColor = vicToSgrForeground(PETSCII_COLOR_TO_VIC[byte]);
    return state.currentColor;
  }

  // Handle character set switching (affects character mapping)
  if (byte === 0x0E) {
    state.shiftMode = true;
    return resetBackground(state); // CCGMS: $0E also resets background/border
  }
  if (byte === 0x8E) {
    state.shiftMode = false;
    return '';
  }

  // Handle reverse video toggle
  if (byte === 0x12) {
    state.reverseVideo = true;
    return '\x1b[7m';
  }
  if (byte === 0x92) {
    state.reverseVideo = false;
    return '\x1b[27m';
  }

  // Handle cursor control codes
  if (byte === 0x11) return '\x1b[B';      // Cursor down
  if (byte === 0x91) return '\x1b[A';      // Cursor up
  if (byte === 0x1D) return '\x1b[C';      // Cursor right
  if (byte === 0x9D) return '\x1b[D';      // Cursor left
  if (byte === 0x13) return '\x1b[H';      // Home
  if (byte === 0x93) return '\x1b[2J\x1b[H'; // Clear + home. No background SGR: a real C64 keeps
                                              // the background it has across a clear, so a `$02
                                              // <colour>` already in force survives ($0E resets it).
  if (byte === 0x14) return '\x08';          // Delete
  if (byte === 0x94) return '\x1b[@';        // Insert

  // Handle line breaks - KERNAL: RETURN ($0D) cancels reverse mode; Shift+RETURN ($8D) does not
  if (byte === 0x0D) {
    if (state.reverseVideo) {
      state.reverseVideo = false;
      return '\x1b[27m\r\n';
    }
    return '\r\n';
  }
  if (byte === 0x8D) return '\r\n';

  // ALL remaining control bytes are no-ops on a C64 (audit A5)
  if (byte < 0x20 || (byte >= 0x80 && byte <= 0x9F)) return '';

  // ========================================
  // PRINTABLE CHARACTERS - screen-code lookup into the real C64 character
  // ROM, transcribed as Unicode (Box Drawing / Block Elements / Geometric
  // Shapes / Symbols for Legacy Computing). Letters, digits, punctuation and
  // graphics are all resolved by the same table lookup - see
  // petscii-unicode-map.ts. Reverse video is NOT re-wrapped here: the
  // $12/$92 handlers above already emitted SGR 7/27 into the stream, so
  // double-wrapping every printable char would toggle it right back off.
  // ========================================
  const screenCode = petsciiToScreenCode(byte) & 0x7F;
  return SCREENCODE_TO_UNICODE[state.shiftMode ? 1 : 0][screenCode];
}

/**
 * Streaming PETSCII-to-PetMe64 converter that preserves charset, color and
 * reverse-video state across multiple convert() calls. Doors emit output in
 * many small chunks (audit B2); resetting state per-chunk (as the one-shot
 * convertPetsciiToPetMe64 does) drops charset/color/reverse state at every
 * chunk boundary.
 */
export class PetsciiStreamConverter {
  private state = createPetsciiState();

  /**
   * Convert a chunk of raw PETSCII bytes, carrying state over from any
   * previous convert() call on this instance.
   */
  convert(buffer: Buffer): string {
    let out = '';
    for (let i = 0; i < buffer.length; i++) out += convertPetsciiByteForPetMe64(buffer[i], this.state);
    return out;
  }

  /**
   * One-shot full-screen conversion: resets state, emits the C64 TERMINAL
   * color prologue, converts the buffer, then resets SGR at the end. The
   * prologue sets the PEN only; the background belongs to the STREAM, not
   * to this wrapper. CCGMS's `$02 <colour>` is rendered as a background SGR
   * (takeBackgroundColor) and `$0E` - which on CCGMS resets background and
   * border along with the charset - emits `ESC[49m` back to the viewer's
   * default (resetBackground), so whatever background the door painted
   * survives the chunk boundaries this class exists to bridge.
   */
  convertScreen(buffer: Buffer): string {
    this.reset();
    return vicToSgrForeground(14) + this.convert(buffer) + '\x1b[0m';
  }

  /** Reset to the C64 terminal default state (light blue pen, unshifted, no reverse). */
  reset(): void {
    this.state = createPetsciiState();
  }
}

/**
 * One-shot per-screen wrapper over PetsciiStreamConverter: builds a fresh
 * converter (so no state leaks in from a prior call), then delegates to
 * convertScreen() for the power-on color prologue, conversion, and SGR reset.
 */
export function convertPetsciiToPetMe64(buffer: Buffer): string {
  return new PetsciiStreamConverter().convertScreen(buffer);
}

/**
 * Convert PETSCII binary data to ANSI string (for terminals without PetMe64 font)
 *
 * @param buffer - Buffer containing PETSCII data
 * @returns ANSI string suitable for terminal display
 */
export function convertPetsciiToAnsi(buffer: Buffer): string {
  const state = createPetsciiState();

  // C64 terminal state: light blue pen. No background SGR - a C64 terminal
  // (CCGMS/Novaterm) runs a fixed black screen/border, the viewer's own
  // default background; PETSCII carries no background-colour byte.
  let output = vicToSgrForeground(14);

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    output += convertPetsciiByte(byte, state);
  }

  output += '\x1b[0m';

  return output;
}

/**
 * Read and convert a PETSCII .seq file
 *
 * @param filePath - Path to .seq file
 * @returns Converted string or null if file doesn't exist
 */
export async function readPetsciiSeqFile(filePath: string): Promise<string | null> {
  try {
    if (!fs.existsSync(filePath)) {
console.log(`[PETSCII] File not found: ${filePath}`);
      return null;
    }

    const buffer = fs.readFileSync(filePath);
console.log(`[PETSCII] Read ${buffer.length} bytes from ${filePath}`);

    const converted = convertPetsciiToPetMe64(buffer);
console.log(`[PETSCII] Converted to ${converted.length} chars for PetMe64`);

    return converted;
  } catch (error: any) {
console.error(`[PETSCII] Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Check if a file is a PETSCII .seq file
 */
export function isPetsciiSeqFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.seq');
}

/**
 * Read a PETSCII .seq file synchronously
 */
export function readPetsciiSeqFileSync(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const buffer = fs.readFileSync(filePath);
    return convertPetsciiToPetMe64(buffer);
  } catch (error) {
    return null;
  }
}

/**
 * Convert ASCII/ANSI text to PETSCII binary
 *
 * Delegates to convertAsciiToPetsciiOutput() with the charset prelude
 * enabled: a power-on/reset C64 boots in unshifted/graphics mode, so a
 * .seq file with mixed-case text must switch the charset to
 * shifted/text mode (PETSCII $0E) before sending any letters, or
 * lowercase-looking bytes render as graphics characters instead (audit
 * E4). The old body here duplicated a broken half of that mapping
 * (passed uppercase ASCII through unchanged instead of case-swapping to
 * PETSCII's shifted-mode byte ranges) - deleted in favor of the single
 * source of truth in convertAsciiToPetsciiOutput().
 *
 * @param text - ASCII/ANSI text
 * @returns Buffer containing PETSCII codes, prefixed with the $0E charset prelude
 */
export function convertAnsiToPetscii(text: string): Buffer {
  return convertAsciiToPetsciiOutput(text, { charsetPrelude: true });
}

/**
 * Write text as a PETSCII .seq file
 */
export function writePetsciiSeqFile(filePath: string, text: string): boolean {
  try {
    const buffer = convertAnsiToPetscii(text);
    fs.writeFileSync(filePath, buffer);
console.log(`[PETSCII] Wrote ${buffer.length} bytes to ${filePath}`);
    return true;
  } catch (error: any) {
console.error(`[PETSCII] Error writing file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Convert a PetMe64-PUA / ANSI string to raw PETSCII bytes (one shot).
 *
 * Thin wrapper over the SDK's AnsiToPetsciiTransducer - the ONE ANSI parser
 * shared with the frontend canvas and the telnet emitter. Streaming callers
 * (connection-emitter.ts) keep a per-session instance instead so cursor,
 * charset and reverse state carry across chunks; this one-shot form is for
 * whole-string conversions and tests.
 */
export function convertUnicodePuaToPetscii(data: string): Buffer {
  const t = new AnsiToPetsciiTransducer();
  return Buffer.concat([Buffer.from(t.transduce(data)), Buffer.from(t.flush())]);
}

/**
 * Get PETSCII color name from byte code
 */
export function getPetsciiColorName(byte: number): string {
  const colorNames: { [key: number]: string } = {
    0x05: 'white',
    0x1C: 'red',
    0x1E: 'green',
    0x1F: 'blue',
    0x81: 'orange',
    0x90: 'black',
    0x95: 'brown',
    0x96: 'light red',
    0x97: 'dark grey',
    0x98: 'grey',
    0x99: 'light green',
    0x9A: 'light blue',
    0x9B: 'light grey',
    0x9C: 'purple',
    0x9E: 'yellow',
    0x9F: 'cyan',
  };

  return colorNames[byte] || 'unknown';
}

/**
 * Convert ASCII text to PETSCII bytes for C64 display (shifted mode)
 *
 * In PETSCII shifted mode (text mode), the character mapping is:
 * - To display uppercase letters: send 0xC1-0xDA (PETSCII shifted uppercase)
 * - To display lowercase letters: send 0x41-0x5A (PETSCII shifted lowercase)
 * - Numbers and punctuation: same as ASCII (0x20-0x3F, some 0x5B-0x5F)
 *
 * This is the reverse of convertPetsciiInputToAscii().
 *
 * @param text - ASCII string to convert
 * @param opts.charsetPrelude - When true, push the PETSCII $0E "switch to
 *   shifted/text charset" control byte before any converted bytes. A
 *   power-on C64 boots in unshifted/graphics mode; without this prelude
 *   the shifted-mode bytes this function emits for letters render as
 *   graphics characters instead of mixed-case text (audit E4).
 * @returns Buffer containing PETSCII bytes for C64 display
 */
export function convertAsciiToPetsciiOutput(text: string, opts?: { charsetPrelude?: boolean }): Buffer {
  const bytes: number[] = [];

  if (opts?.charsetPrelude) {
    bytes.push(0x0E);
  }

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // Carriage return
    if (char === '\r') {
      bytes.push(0x0D);
      continue;
    }

    // Line feed -> CR (C64 uses CR for newline)
    if (char === '\n') {
      bytes.push(0x0D);
      continue;
    }

    // Space, numbers, and basic punctuation (0x20-0x3F) - same as ASCII
    if (code >= 0x20 && code <= 0x3F) {
      bytes.push(code);
      continue;
    }

    // ASCII uppercase A-Z (0x41-0x5A) -> PETSCII uppercase (0xC1-0xDA)
    // In shifted mode, 0x41-0x5A displays as lowercase, so we use 0xC1-0xDA
    if (code >= 0x41 && code <= 0x5A) {
      bytes.push(code + 0x80); // 0x41 -> 0xC1, etc.
      continue;
    }

    // Additional punctuation [ \ ] ^ _ @ (0x40, 0x5B-0x5F)
    if (code === 0x40 || (code >= 0x5B && code <= 0x5F)) {
      bytes.push(code);
      continue;
    }

    // ASCII lowercase a-z (0x61-0x7A) -> PETSCII lowercase (0x41-0x5A)
    // In shifted mode, 0x41-0x5A displays as lowercase
    if (code >= 0x61 && code <= 0x7A) {
      bytes.push(code - 0x20); // 0x61 -> 0x41, etc.
      continue;
    }

    // Backspace
    if (code === 0x08 || code === 0x7F) {
      bytes.push(0x14); // PETSCII delete
      continue;
    }

    // Default: space for unknown characters
    bytes.push(0x20);
  }

  return Buffer.from(bytes);
}

/**
 * Convert PETSCII input bytes to ASCII/ANSI string.
 *
 * When a real C64 terminal (like SyncTERM in C64 mode) sends input, the
 * characters are in PETSCII encoding, not ASCII. This thin wrapper hands
 * off to the SDK's petsciiInputToAscii (sdk/petscii/petscii-input.ts),
 * which is the ONE table shared with the web canvas's keyboard path
 * (packages/terminal, BBSTerminal.tsx) - see that module's header for the
 * full byte mapping and the case-convention rationale.
 *
 * @param data - Buffer containing raw PETSCII bytes from terminal
 * @returns ASCII/ANSI string suitable for processing as user input
 */
export function convertPetsciiInputToAscii(data: Buffer): string {
  return petsciiInputToAscii(data);
}
