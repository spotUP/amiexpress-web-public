/**
 * PETSCII Utility - C64 PETSCII to ANSI Converter
 *
 * Converts Commodore 64 PETSCII (PET Standard Code of Information Interchange)
 * character codes and control sequences to ANSI escape sequences for terminal display.
 *
 * References:
 * - https://c64os.com/post/c64petsciicodes
 * - https://github.com/jalbarracinv/python-cbm-petscii-bbs
 *
 * PETSCII character set spans 256 codes (0x00-0xFF) organized into 8 blocks of 32:
 * - Blocks 1 & 5 (0x00-0x1F, 0x80-0x9F): Control codes
 * - Blocks 2 & 3 (0x20-0x3F, 0x40-0x5F): Printable characters
 * - Blocks 6 & 7 (0xA0-0xBF, 0xC0-0xDF): Graphics and uppercase in alternate modes
 * - Blocks 4 & 8 (0x60-0x7F, 0xE0-0xFF): Mirror other blocks
 */

import * as fs from 'fs';

/**
 * C64 PETSCII to ASCII character mapping
 * Maps PETSCII codes to displayable ASCII/Unicode characters
 */
const PETSCII_TO_ASCII: { [key: number]: string } = {
  // Control characters (0x00-0x1F) - most are non-printable
  0x0D: '\n',    // Carriage return
  0x14: '\x08',  // Delete (backspace)

  // Printable characters (0x20-0x5F) - mostly ASCII-compatible
  0x20: ' ',     // Space
  0x21: '!',
  0x22: '"',
  0x23: '#',
  0x24: '$',
  0x25: '%',
  0x26: '&',
  0x27: "'",
  0x28: '(',
  0x29: ')',
  0x2A: '*',
  0x2B: '+',
  0x2C: ',',
  0x2D: '-',
  0x2E: '.',
  0x2F: '/',
  // Numbers 0-9 (0x30-0x39)
  0x30: '0', 0x31: '1', 0x32: '2', 0x33: '3', 0x34: '4',
  0x35: '5', 0x36: '6', 0x37: '7', 0x38: '8', 0x39: '9',
  0x3A: ':',
  0x3B: ';',
  0x3C: '<',
  0x3D: '=',
  0x3E: '>',
  0x3F: '?',
  0x40: '@',
  // Uppercase A-Z (0x41-0x5A)
  0x41: 'A', 0x42: 'B', 0x43: 'C', 0x44: 'D', 0x45: 'E', 0x46: 'F',
  0x47: 'G', 0x48: 'H', 0x49: 'I', 0x4A: 'J', 0x4B: 'K', 0x4C: 'L',
  0x4D: 'M', 0x4E: 'N', 0x4F: 'O', 0x50: 'P', 0x51: 'Q', 0x52: 'R',
  0x53: 'S', 0x54: 'T', 0x55: 'U', 0x56: 'V', 0x57: 'W', 0x58: 'X',
  0x59: 'Y', 0x5A: 'Z',
  0x5B: '[',
  0x5C: '£',     // British pound symbol
  0x5D: ']',
  0x5E: '↑',     // Up arrow
  0x5F: '←',     // Left arrow

  // Block 4 (0x60-0x7F) - Graphics characters
  0x60: '─',     // Horizontal line
  0x61: 'a', 0x62: 'b', 0x63: 'c', 0x64: 'd', 0x65: 'e', 0x66: 'f',
  0x67: 'g', 0x68: 'h', 0x69: 'i', 0x6A: 'j', 0x6B: 'k', 0x6C: 'l',
  0x6D: 'm', 0x6E: 'n', 0x6F: 'o', 0x70: 'p', 0x71: 'q', 0x72: 'r',
  0x73: 's', 0x74: 't', 0x75: 'u', 0x76: 'v', 0x77: 'w', 0x78: 'x',
  0x79: 'y', 0x7A: 'z',
  0x7B: '│',     // Vertical line
  0x7C: '│',     // Vertical line
  0x7D: '│',     // Vertical line
  0x7E: '│',     // Vertical line
  0x7F: '│',     // Vertical line

  // Block 6 & 7 (0xA0-0xDF) - Uppercase and graphics in reverse mode
  0xA0: ' ',     // Shifted space
  // Graphics characters (0xA1-0xBF)
  0xA1: '▝', 0xA2: '▘', 0xA3: '▖', 0xA4: '▗', 0xA5: '▚', 0xA6: '▞',
  0xA7: '▌', 0xA8: '▀', 0xA9: '▐', 0xAA: '▄', 0xAB: '▔', 0xAC: '▁',
  0xAD: '▏', 0xAE: '▕', 0xAF: '▃',
  // Uppercase in graphics mode (0xC1-0xDA)
  0xC1: 'A', 0xC2: 'B', 0xC3: 'C', 0xC4: 'D', 0xC5: 'E', 0xC6: 'F',
  0xC7: 'G', 0xC8: 'H', 0xC9: 'I', 0xCA: 'J', 0xCB: 'K', 0xCC: 'L',
  0xCD: 'M', 0xCE: 'N', 0xCF: 'O', 0xD0: 'P', 0xD1: 'Q', 0xD2: 'R',
  0xD3: 'S', 0xD4: 'T', 0xD5: 'U', 0xD6: 'V', 0xD7: 'W', 0xD8: 'X',
  0xD9: 'Y', 0xDA: 'Z',

  // Block 8 (0xE0-0xFF) mirrors other blocks
  0xE0: ' ',
};

/**
 * C64 color codes to ANSI color codes
 * Maps PETSCII color control codes to ANSI foreground colors
 */
const PETSCII_COLORS: { [key: number]: string } = {
  0x05: '\x1b[0;37m',  // White
  0x1C: '\x1b[0;31m',  // Red
  0x1E: '\x1b[0;32m',  // Green
  0x1F: '\x1b[0;34m',  // Blue
  0x81: '\x1b[0;33m',  // Orange (using yellow)
  0x90: '\x1b[0;30m',  // Black
  0x95: '\x1b[0;33m',  // Brown (using yellow)
  0x96: '\x1b[0;91m',  // Light Red
  0x97: '\x1b[0;90m',  // Dark Gray
  0x98: '\x1b[0;37m',  // Medium Gray (using white)
  0x99: '\x1b[0;92m',  // Light Green
  0x9A: '\x1b[0;94m',  // Light Blue
  0x9B: '\x1b[0;37m',  // Light Gray (using white)
  0x9C: '\x1b[0;35m',  // Purple
  0x9E: '\x1b[0;93m',  // Yellow
  0x9F: '\x1b[0;36m',  // Cyan
};

/**
 * PETSCII cursor control codes to ANSI escape sequences
 */
const PETSCII_CURSOR: { [key: number]: string } = {
  0x11: '\x1b[B',      // Cursor down
  0x13: '\x1b[H',      // Cursor home
  0x91: '\x1b[A',      // Cursor up
  0x9D: '\x1b[D',      // Cursor left
  0x1D: '\x1b[C',      // Cursor right (from color codes ref)
  0x93: '\x1b[2J\x1b[H', // Clear screen + home
  0x94: '\x1b[@',      // Insert character
};

/**
 * State for reverse video mode
 */
interface PetsciiState {
  reverseVideo: boolean;
  currentColor: string;
}

/**
 * Convert a PETSCII byte code to ANSI output (for generic terminals)
 *
 * @param byte - PETSCII byte code (0x00-0xFF)
 * @param state - Current conversion state (reverse video, color)
 * @returns ANSI string output
 */
function convertPetsciiByte(byte: number, state: PetsciiState): string {
  // Handle color codes
  if (byte in PETSCII_COLORS) {
    state.currentColor = PETSCII_COLORS[byte];
    return state.currentColor;
  }

  // Handle cursor control codes
  if (byte in PETSCII_CURSOR) {
    return PETSCII_CURSOR[byte];
  }

  // Handle reverse video toggle
  if (byte === 0x12) {
    state.reverseVideo = true;
    return '\x1b[7m';  // ANSI reverse video
  }
  if (byte === 0x92) {
    state.reverseVideo = false;
    return '\x1b[27m'; // ANSI reverse video off
  }

  // Handle printable characters
  if (byte in PETSCII_TO_ASCII) {
    return PETSCII_TO_ASCII[byte];
  }

  // Unknown byte - return space
  return ' ';
}

/**
 * Convert a PETSCII byte to Unicode for PetMe64 font display
 *
 * PetMe64 font uses Unicode Private Use Area (PUA) code points 0xE000-0xE1FF
 * to encode the complete C64 character set. Each PETSCII byte maps directly:
 * PETSCII 0x00 -> U+E000, 0x01 -> U+E001, ..., 0xFF -> U+E0FF
 *
 * @param byte - PETSCII byte code (0x00-0xFF)
 * @param state - Current conversion state (reverse video, color)
 * @returns String output (Unicode character or ANSI escape sequence)
 */
function convertPetsciiByteForPetMe64(byte: number, state: PetsciiState): string {
  // Handle color codes - still use ANSI
  if (byte in PETSCII_COLORS) {
    state.currentColor = PETSCII_COLORS[byte];
    return state.currentColor;
  }

  // Handle cursor control codes - still use ANSI
  if (byte in PETSCII_CURSOR) {
    return PETSCII_CURSOR[byte];
  }

  // Handle reverse video toggle - still use ANSI
  if (byte === 0x12) {
    state.reverseVideo = true;
    return '\x1b[7m';  // ANSI reverse video
  }
  if (byte === 0x92) {
    state.reverseVideo = false;
    return '\x1b[27m'; // ANSI reverse video off
  }

  // Handle line breaks - CRITICAL for proper display
  // PETSCII 0x0D is carriage return, must become \r\n for terminal
  if (byte === 0x0D) {
    return '\r\n';
  }

  // Handle other control characters that should be ignored
  if (byte === 0x00) {
    return '';  // Null byte - ignore
  }

  // For ALL other bytes, map to PetMe64 Unicode PUA range
  // PETSCII byte 0x00 -> U+E000, 0x01 -> U+E001, etc.
  const unicodeCodePoint = 0xE000 + byte;
  return String.fromCodePoint(unicodeCodePoint);
}

/**
 * Convert PETSCII binary data to ANSI string
 *
 * Reads PETSCII byte codes and converts them to ANSI escape sequences
 * for display in a terminal emulator. Handles colors, cursor movement,
 * reverse video, and character mapping.
 *
 * @param buffer - Buffer containing PETSCII data
 * @returns ANSI string suitable for terminal display
 *
 * @example
 * ```typescript
 * const petsciiData = fs.readFileSync('welcome.seq');
 * const ansiOutput = convertPetsciiToAnsi(petsciiData);
 * socket.emit('ansi-output', ansiOutput);
 * ```
 */
export function convertPetsciiToAnsi(buffer: Buffer): string {
  const state: PetsciiState = {
    reverseVideo: false,
    currentColor: '\x1b[0;37m', // Default to white
  };

  let output = '';

  // Process each byte
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    output += convertPetsciiByte(byte, state);
  }

  // Reset at end
  output += '\x1b[0m'; // Reset all attributes

  return output;
}

/**
 * Convert PETSCII binary data to Unicode for PetMe64 font display
 *
 * This function converts PETSCII bytes to Unicode PUA code points (0xE000-0xE1FF)
 * for use with the PetMe64 C64 font. The font renders these code points as authentic
 * C64 PETSCII characters including graphics, block elements, and special characters.
 *
 * @param buffer - Buffer containing PETSCII data
 * @returns String with Unicode PUA characters and ANSI color/cursor codes
 *
 * @example
 * ```typescript
 * const petsciiData = fs.readFileSync('welcome.seq');
 * const output = convertPetsciiToPetMe64(petsciiData);
 * socket.emit('petscii-output', output); // Triggers PetMe64 font in frontend
 * ```
 */
export function convertPetsciiToPetMe64(buffer: Buffer): string {
  const state: PetsciiState = {
    reverseVideo: false,
    currentColor: '\x1b[0;37m', // Default to white
  };

  // Start with initial white color to ensure visibility
  let output = '\x1b[0;37m';

  // Process each byte
  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];
    output += convertPetsciiByteForPetMe64(byte, state);
  }

  // Reset at end
  output += '\x1b[0m'; // Reset all attributes

  return output;
}

/**
 * Read and convert a PETSCII .seq file to ANSI
 *
 * PETSCII .seq files are raw binary files containing PETSCII codes.
 * They're commonly used for C64 BBS artwork, menus, and welcome screens.
 *
 * @param filePath - Path to .seq file
 * @returns ANSI string for terminal display, or null if file doesn't exist
 *
 * @example
 * ```typescript
 * const ansi = await readPetsciiSeqFile('/path/to/welcome.seq');
 * if (ansi) {
 *   socket.emit('ansi-output', ansi);
 * }
 * ```
 */
export async function readPetsciiSeqFile(filePath: string): Promise<string | null> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.log(`[PETSCII] File not found: ${filePath}`);
      return null;
    }

    // Read file as binary
    const buffer = fs.readFileSync(filePath);
    console.log(`[PETSCII] Read ${buffer.length} bytes from ${filePath}`);

    // Convert to ANSI
    const ansi = convertPetsciiToAnsi(buffer);
    console.log(`[PETSCII] Converted to ${ansi.length} bytes of ANSI`);

    return ansi;
  } catch (error: any) {
    console.error(`[PETSCII] Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Check if a file is a PETSCII .seq file
 *
 * @param filePath - Path to file
 * @returns true if file has .seq extension
 */
export function isPetsciiSeqFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.seq');
}

/**
 * Read a PETSCII .seq file synchronously
 *
 * @param filePath - Path to .seq file
 * @returns ANSI string or null if error
 */
export function readPetsciiSeqFileSync(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const buffer = fs.readFileSync(filePath);
    return convertPetsciiToAnsi(buffer);
  } catch (error) {
    return null;
  }
}

/**
 * Convert ASCII/ANSI text to PETSCII binary
 * (Reverse conversion - useful for creating .seq files)
 *
 * @param text - ASCII/ANSI text
 * @returns Buffer containing PETSCII codes
 */
export function convertAnsiToPetscii(text: string): Buffer {
  const bytes: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = char.charCodeAt(0);

    // Simple ASCII to PETSCII mapping (inverse of PETSCII_TO_ASCII)
    if (code >= 0x20 && code <= 0x5F) {
      // Direct mapping for ASCII 0x20-0x5F
      bytes.push(code);
    } else if (code >= 0x61 && code <= 0x7A) {
      // Lowercase a-z
      bytes.push(code);
    } else if (char === '\n') {
      bytes.push(0x0D); // CR
    } else {
      // Unknown character - use space
      bytes.push(0x20);
    }
  }

  return Buffer.from(bytes);
}

/**
 * Write text as a PETSCII .seq file
 *
 * @param filePath - Output file path
 * @param text - Text to convert and write
 * @returns true if successful, false otherwise
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
 * Get PETSCII color name from byte code
 *
 * @param byte - PETSCII color code
 * @returns Color name or 'unknown'
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
    0x97: 'dark gray',
    0x98: 'medium gray',
    0x99: 'light green',
    0x9A: 'light blue',
    0x9B: 'light gray',
    0x9C: 'purple',
    0x9E: 'yellow',
    0x9F: 'cyan',
  };

  return colorNames[byte] || 'unknown';
}
