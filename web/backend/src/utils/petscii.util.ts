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
 */

import * as fs from 'fs';

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
 * C64 color codes to ANSI color codes
 * Maps all 16 C64 colors to closest ANSI equivalents
 */
const PETSCII_COLORS: { [key: number]: string } = {
  0x05: '\x1b[97m',   // White (bright white)
  0x1C: '\x1b[31m',   // Red
  0x1E: '\x1b[32m',   // Green
  0x1F: '\x1b[34m',   // Blue
  0x81: '\x1b[33m',   // Orange (using yellow - no true orange in ANSI)
  0x90: '\x1b[30m',   // Black
  0x95: '\x1b[33m',   // Brown (using yellow)
  0x96: '\x1b[91m',   // Light Red (pink)
  0x97: '\x1b[90m',   // Dark Grey
  0x98: '\x1b[37m',   // Grey (medium)
  0x99: '\x1b[92m',   // Light Green
  0x9A: '\x1b[94m',   // Light Blue
  0x9B: '\x1b[37m',   // Light Grey
  0x9C: '\x1b[35m',   // Purple
  0x9E: '\x1b[93m',   // Yellow
  0x9F: '\x1b[36m',   // Cyan
};

/**
 * State for PETSCII conversion
 */
interface PetsciiState {
  reverseVideo: boolean;
  currentColor: string;
  shiftMode: boolean;  // false = unshifted/graphics, true = shifted/text
}

/**
 * Create initial PETSCII state
 * Default is unshifted/graphics mode with white color
 */
function createPetsciiState(): PetsciiState {
  return {
    reverseVideo: false,
    currentColor: '\x1b[97m', // White
    shiftMode: false,         // Start in unshifted/graphics mode
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
 * Convert screen code back to PETSCII byte
 *
 * This is the reverse of petsciiToScreenCode(), used when sending
 * Unicode PUA content back to real C64 terminals.
 *
 * Reverse conversion table:
 * | Screen Code   | Operation   | PETSCII Range     |
 * |---------------|-------------|-------------------|
 * | $00-$1F       | +$40        | $40-$5F           |
 * | $20-$3F       | +$00        | $20-$3F           |
 * | $40-$5F       | +$20        | $60-$7F           |
 * | $60-$7F       | +$40        | $A0-$BF           |
 * | $80-$9F       | -$80        | $00-$1F           |
 * | $C0-$DF       | -$40        | $80-$9F           |
 */
function screenCodeToPetscii(screenCode: number): number {
  // $00-$1F: Add $40 -> $40-$5F (@ A-Z)
  if (screenCode <= 0x1F) {
    return screenCode + 0x40;
  }
  // $20-$3F: Direct mapping (space, numbers, punctuation)
  if (screenCode <= 0x3F) {
    return screenCode;
  }
  // $40-$5F: Add $20 -> $60-$7F (graphics) OR add $80 -> $C0-$DF (letters)
  // We'll use $C0-$DF for letters since that's more common in PETSCII files
  if (screenCode <= 0x5F) {
    return screenCode + 0x80;
  }
  // $60-$7F: Add $40 -> $A0-$BF (shifted graphics)
  if (screenCode <= 0x7F) {
    return screenCode + 0x40;
  }
  // $80-$9F: Subtract $80 -> $00-$1F (control codes displayed as reverse)
  if (screenCode <= 0x9F) {
    return screenCode - 0x80;
  }
  // $C0-$DF: Subtract $40 -> $80-$9F
  if (screenCode <= 0xDF) {
    return screenCode - 0x40;
  }
  // Fallback - return space
  return 0x20;
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
  // COLOR CONTROL CODES
  // ========================================
  if (byte in PETSCII_COLORS) {
    state.currentColor = PETSCII_COLORS[byte];
    return state.currentColor;
  }

  // ========================================
  // CHARACTER SET SWITCHING
  // ========================================
  if (byte === 0x0E) {
    // Switch to lowercase/text mode (shifted charset)
    state.shiftMode = true;
    return '';
  }
  if (byte === 0x8E) {
    // Switch to uppercase/graphics mode (unshifted charset)
    state.shiftMode = false;
    return '';
  }

  // ========================================
  // REVERSE VIDEO
  // ========================================
  if (byte === 0x12) {
    state.reverseVideo = true;
    return '\x1b[7m';  // ANSI reverse video on
  }
  if (byte === 0x92) {
    state.reverseVideo = false;
    return '\x1b[27m'; // ANSI reverse video off
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
  if (byte === 0x93) return '\x1b[2J\x1b[H'; // Clear screen + home
  if (byte === 0x14) return '\x08';          // Delete (backspace)
  if (byte === 0x94) return '\x1b[@';        // Insert character

  // ========================================
  // LINE BREAKS
  // ========================================
  if (byte === 0x0D) return '\r\n';  // Carriage return
  if (byte === 0x8D) return '\r\n';  // Shift+Return (same as return)

  // ========================================
  // IGNORED CONTROL CODES
  // ========================================
  if (byte === 0x00) return '';  // NULL
  if (byte === 0x03) return '';  // STOP
  if (byte === 0x08) return '';  // Disable Shift+C=
  if (byte === 0x09) return '';  // Enable Shift+C=
  if (byte === 0x83) return '';  // RUN
  // Function keys F1-F8 (0x85-0x8C) - ignore in terminal context
  if (byte >= 0x85 && byte <= 0x8C) return '';

  // ========================================
  // PRINTABLE CHARACTERS
  // Convert PETSCII to screen code, then map to PetMe64 PUA
  // ========================================
  const screenCode = petsciiToScreenCode(byte);

  // PetMe64 PUA layout:
  // 0xE000-0xE0FF: Unshifted/Graphics charset
  // 0xE100-0xE1FF: Shifted/Text charset
  const baseCodePoint = state.shiftMode ? 0xE100 : 0xE000;
  return String.fromCodePoint(baseCodePoint + screenCode);
}

/**
 * Convert a PETSCII byte code to ANSI output (for generic terminals without PetMe64)
 *
 * @param byte - PETSCII byte code (0x00-0xFF)
 * @param state - Current conversion state
 * @returns ANSI string output
 */
function convertPetsciiByte(byte: number, state: PetsciiState): string {
  // Handle color codes
  if (byte in PETSCII_COLORS) {
    state.currentColor = PETSCII_COLORS[byte];
    return state.currentColor;
  }

  // Handle character set switching (affects character mapping)
  if (byte === 0x0E) {
    state.shiftMode = true;
    return '';
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
  if (byte === 0x93) return '\x1b[2J\x1b[H'; // Clear screen + home
  if (byte === 0x14) return '\x08';          // Delete
  if (byte === 0x94) return '\x1b[@';        // Insert

  // Handle line breaks
  if (byte === 0x0D || byte === 0x8D) return '\r\n';

  // Ignore other control codes
  if (byte === 0x00) return '';
  if (byte === 0x03) return '';
  if (byte === 0x08) return '';
  if (byte === 0x09) return '';
  if (byte === 0x83) return '';
  if (byte >= 0x85 && byte <= 0x8C) return '';

  // ========================================
  // PRINTABLE CHARACTERS - ASCII approximation
  // ========================================

  // Space
  if (byte === 0x20 || byte === 0xA0 || byte === 0xE0) return ' ';

  // Numbers 0-9
  if (byte >= 0x30 && byte <= 0x39) return String.fromCharCode(byte);

  // Punctuation (0x21-0x2F, 0x3A-0x40, 0x5B-0x5F)
  if (byte >= 0x21 && byte <= 0x2F) return String.fromCharCode(byte);
  if (byte >= 0x3A && byte <= 0x40) return String.fromCharCode(byte);
  if (byte === 0x5B) return '[';
  if (byte === 0x5C) return '\\';
  if (byte === 0x5D) return ']';
  if (byte === 0x5E) return '^';
  if (byte === 0x5F) return '_';

  // Letters - depends on shift mode
  if (state.shiftMode) {
    // Shifted mode: 0x41-0x5A = uppercase, 0x61-0x7A = lowercase
    if (byte >= 0x41 && byte <= 0x5A) return String.fromCharCode(byte); // A-Z
    if (byte >= 0x61 && byte <= 0x7A) return String.fromCharCode(byte); // a-z
    // 0xC1-0xDA also maps to uppercase in shifted mode
    if (byte >= 0xC1 && byte <= 0xDA) return String.fromCharCode(byte - 0xC1 + 0x41);
  } else {
    // Unshifted mode: 0x41-0x5A = uppercase, 0x61-0x7A = graphics (show as lowercase approximation)
    if (byte >= 0x41 && byte <= 0x5A) return String.fromCharCode(byte); // A-Z
    if (byte >= 0x61 && byte <= 0x7A) return String.fromCharCode(byte); // a-z (graphics approximation)
    // 0xC1-0xDA maps to uppercase
    if (byte >= 0xC1 && byte <= 0xDA) return String.fromCharCode(byte - 0xC1 + 0x41);
  }

  // Graphics characters - use Unicode block elements as approximation
  // 0xA0-0xBF range - various graphics
  if (byte >= 0xA0 && byte <= 0xBF) {
    const graphicsMap: { [key: number]: string } = {
      0xA0: ' ',  // Shifted space
      0xA1: '\u2598', // Quadrant upper left
      0xA2: '\u259D', // Quadrant upper right
      0xA3: '\u2580', // Upper half block
      0xA4: '\u2596', // Quadrant lower left
      0xA5: '\u258C', // Left half block
      0xA6: '\u259E', // Quadrant upper right and lower left
      0xA7: '\u259B', // Quadrant upper left and upper right and lower left
      0xA8: '\u2597', // Quadrant lower right
      0xA9: '\u259A', // Quadrant upper left and lower right
      0xAA: '\u2590', // Right half block
      0xAB: '\u259C', // Quadrant upper left and upper right and lower right
      0xAC: '\u2584', // Lower half block
      0xAD: '\u2599', // Quadrant upper left and lower left and lower right
      0xAE: '\u259F', // Quadrant upper right and lower left and lower right
      0xAF: '\u2588', // Full block
      // 0xB0-0xBF - more graphics
      0xB0: '\u2500', // Horizontal line
      0xB1: '\u2502', // Vertical line
      0xB2: '\u250C', // Corner top-left
      0xB3: '\u2510', // Corner top-right
      0xB4: '\u2514', // Corner bottom-left
      0xB5: '\u2518', // Corner bottom-right
      0xB6: '\u251C', // T-left
      0xB7: '\u2524', // T-right
      0xB8: '\u252C', // T-top
      0xB9: '\u2534', // T-bottom
      0xBA: '\u253C', // Cross
    };
    return graphicsMap[byte] || '\u2588'; // Default to full block
  }

  // 0xC0-0xDF range in unshifted mode - graphics characters
  if (!state.shiftMode && byte >= 0xC0 && byte <= 0xDF) {
    // Horizontal line character commonly at 0xC0
    if (byte === 0xC0) return '\u2500'; // Horizontal line
    // Return block character for other graphics
    return '\u2588';
  }

  // 0xE0-0xFF range - mirrors 0x60-0x7F or 0xA0-0xBF
  if (byte >= 0xE0 && byte <= 0xFF) {
    return ' '; // Simplified - usually shifted space or graphics
  }

  // Unknown - return space
  return ' ';
}

/**
 * Convert PETSCII binary data to Unicode for PetMe64 font display
 *
 * This function converts PETSCII bytes to Unicode PUA code points (0xE000-0xE1FF)
 * for use with the PetMe64 C64 font. The font renders these code points as authentic
 * C64 PETSCII characters including graphics, block elements, and special characters.
 *
 * Handles character set switching via 0x0E (shifted/text) and 0x8E (unshifted/graphics).
 *
 * @param buffer - Buffer containing PETSCII data
 * @returns String with Unicode PUA characters and ANSI color/cursor codes
 */
export function convertPetsciiToPetMe64(buffer: Buffer): string {
  const state = createPetsciiState();

  // Start with white color
  let output = state.currentColor;

  // Process each byte
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    output += convertPetsciiByteForPetMe64(byte, state);
  }

  // Reset at end
  output += '\x1b[0m';

  return output;
}

/**
 * Convert PETSCII binary data to ANSI string (for terminals without PetMe64 font)
 *
 * @param buffer - Buffer containing PETSCII data
 * @returns ANSI string suitable for terminal display
 */
export function convertPetsciiToAnsi(buffer: Buffer): string {
  const state = createPetsciiState();

  let output = state.currentColor;

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
 * @param text - ASCII/ANSI text
 * @returns Buffer containing PETSCII codes
 */
export function convertAnsiToPetscii(text: string): Buffer {
  const bytes: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    if (code >= 0x20 && code <= 0x5F) {
      bytes.push(code);
    } else if (code >= 0x61 && code <= 0x7A) {
      // Lowercase a-z
      bytes.push(code);
    } else if (char === '\n') {
      bytes.push(0x0D);
    } else {
      bytes.push(0x20);
    }
  }

  return Buffer.from(bytes);
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
 * Convert Unicode PUA (PetMe64 format) back to raw PETSCII bytes
 * Used when sending to real C64 terminals
 *
 * @param data - String containing Unicode PUA characters and ANSI codes
 * @returns Buffer containing raw PETSCII byte codes
 */
export function convertUnicodePuaToPetscii(data: string): Buffer {
  const bytes: number[] = [];
  let i = 0;
  let currentShiftMode = false; // Track shift mode for output

  while (i < data.length) {
    const char = data[i];
    const code = char.charCodeAt(0);

    // Check for ANSI escape sequence
    if (char === '\x1b' && i + 1 < data.length && data[i + 1] === '[') {
      let j = i + 2;
      let ansiCode = '';
      while (j < data.length && !/[A-Za-z]/.test(data[j])) {
        ansiCode += data[j];
        j++;
      }
      const terminator = data[j] || '';

      // Convert ANSI codes back to PETSCII
      if (terminator === 'm') {
        const petsciiColor = ansiColorToPetscii(ansiCode);
        if (petsciiColor !== null) {
          bytes.push(petsciiColor);
        }
      } else if (terminator === 'A') {
        bytes.push(0x91); // Cursor up
      } else if (terminator === 'B') {
        bytes.push(0x11); // Cursor down
      } else if (terminator === 'C') {
        bytes.push(0x1D); // Cursor right
      } else if (terminator === 'D') {
        bytes.push(0x9D); // Cursor left
      } else if (terminator === 'H') {
        if (ansiCode === '' || ansiCode === '1;1') {
          bytes.push(0x13); // Home
        }
      } else if (terminator === 'J' && ansiCode === '2') {
        bytes.push(0x93); // Clear screen
      }

      i = j + 1;
      continue;
    }

    // Check for Unicode PUA range (U+E000-E1FF)
    // The PUA contains SCREEN CODES, so we need to convert back to PETSCII
    if (code >= 0xE000 && code <= 0xE0FF) {
      // Unshifted charset - if we were in shifted mode, switch
      if (currentShiftMode) {
        bytes.push(0x8E); // Switch to unshifted
        currentShiftMode = false;
      }
      const screenCode = code - 0xE000;
      bytes.push(screenCodeToPetscii(screenCode));
    } else if (code >= 0xE100 && code <= 0xE1FF) {
      // Shifted charset - if we were in unshifted mode, switch
      if (!currentShiftMode) {
        bytes.push(0x0E); // Switch to shifted
        currentShiftMode = true;
      }
      const screenCode = code - 0xE100;
      bytes.push(screenCodeToPetscii(screenCode));
    } else if (char === '\r') {
      // Skip CR, we'll handle LF
    } else if (char === '\n') {
      bytes.push(0x0D); // PETSCII return
    } else if (code < 128) {
      // Regular ASCII - pass through
      bytes.push(code);
    }

    i++;
  }

  return Buffer.from(bytes);
}

/**
 * Convert ANSI color code to PETSCII color byte
 */
function ansiColorToPetscii(ansiCode: string): number | null {
  const ansiToPetscii: { [key: string]: number } = {
    '97': 0x05,   // Bright white -> White
    '37': 0x9B,   // White -> Light grey
    '31': 0x1C,   // Red
    '32': 0x1E,   // Green
    '34': 0x1F,   // Blue
    '33': 0x9E,   // Yellow
    '30': 0x90,   // Black
    '91': 0x96,   // Bright red -> Light red
    '92': 0x99,   // Bright green -> Light green
    '94': 0x9A,   // Bright blue -> Light blue
    '93': 0x9E,   // Bright yellow -> Yellow
    '35': 0x9C,   // Magenta -> Purple
    '36': 0x9F,   // Cyan
    '90': 0x97,   // Dark grey
    '0': 0x05,    // Reset -> White
    '7': 0x12,    // Reverse on
    '27': 0x92,   // Reverse off
  };

  return ansiToPetscii[ansiCode] ?? null;
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
 * @returns Buffer containing PETSCII bytes for C64 display
 */
export function convertAsciiToPetsciiOutput(text: string): Buffer {
  const bytes: number[] = [];

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
 * Convert PETSCII input bytes to ASCII string
 *
 * When a real C64 terminal (like SyncTERM in C64 mode) sends input,
 * the characters are in PETSCII encoding, not ASCII. This function
 * converts those PETSCII bytes to standard ASCII for processing.
 *
 * PETSCII character mapping for user input:
 * - 0x0D = RETURN (carriage return) -> '\r'
 * - 0x14 = DELETE (backspace) -> '\x7f'
 * - 0x20-0x3F = Same as ASCII (space, numbers, punctuation)
 * - 0x41-0x5A = Uppercase A-Z (same as ASCII)
 * - 0xC1-0xDA = Lowercase a-z in PETSCII (convert to ASCII 0x61-0x7A)
 * - Control codes are stripped
 *
 * @param data - Buffer containing raw PETSCII bytes from terminal
 * @returns ASCII string suitable for processing as user input
 */
export function convertPetsciiInputToAscii(data: Buffer): string {
  let result = '';

  for (let i = 0; i < data.length; i++) {
    const byte = data[i];

    // Carriage return (0x0D) or shifted return (0x8D)
    if (byte === 0x0D || byte === 0x8D) {
      result += '\r';
      continue;
    }

    // Line feed (sometimes sent with CR) - skip in PETSCII mode
    // C64 doesn't typically send LF, but telnet layer might add it
    if (byte === 0x0A) {
      // Skip LF - C64 uses CR only for line endings
      continue;
    }

    // DELETE/backspace (PETSCII delete is 0x14)
    if (byte === 0x14 || byte === 0x7F) {
      result += '\x7f';
      continue;
    }

    // Space, numbers, and punctuation (0x20-0x3F) - same as ASCII
    if (byte >= 0x20 && byte <= 0x3F) {
      result += String.fromCharCode(byte);
      continue;
    }

    // Uppercase letters A-Z (0x41-0x5A) - same as ASCII
    if (byte >= 0x41 && byte <= 0x5A) {
      result += String.fromCharCode(byte);
      continue;
    }

    // Additional punctuation/symbols that are same as ASCII
    if (byte === 0x40) { // @
      result += '@';
      continue;
    }
    if (byte >= 0x5B && byte <= 0x5F) { // [ \ ] ^ _
      result += String.fromCharCode(byte);
      continue;
    }

    // PETSCII lowercase letters (0xC1-0xDA) -> ASCII lowercase (0x61-0x7A)
    // In PETSCII, lowercase 'a' is 0xC1, not 0x61 like ASCII
    if (byte >= 0xC1 && byte <= 0xDA) {
      result += String.fromCharCode(byte - 0xC1 + 0x61); // Convert to ASCII lowercase
      continue;
    }

    // PETSCII also uses 0x61-0x7A for graphics in unshifted mode,
    // but in shifted/text mode they can be lowercase letters
    // SyncTERM typically sends 0xC1-0xDA for lowercase
    if (byte >= 0x61 && byte <= 0x7A) {
      result += String.fromCharCode(byte); // Pass through as lowercase
      continue;
    }

    // Skip other bytes (control codes, graphics, etc.)
    // These are typically not relevant for text input
  }

  return result;
}
