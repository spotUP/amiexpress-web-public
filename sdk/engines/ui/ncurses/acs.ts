/**
 * ncurses Compatibility Layer - ACS (Alternate Character Set)
 *
 * This module provides ncurses-compatible line drawing characters.
 * Uses Unicode box-drawing characters for modern terminal compatibility.
 *
 * In classic ncurses, these are accessed as ACS_ULCORNER, ACS_HLINE, etc.
 * We map them to Unicode equivalents that render correctly in modern terminals.
 */

// ============================================================================
// ACS Line Drawing Characters (Unicode)
// ============================================================================

/**
 * ACS character map - Unicode box drawing characters
 * These render correctly in xterm, modern terminals, and web browsers
 */
export const ACS = {
  // Corners (single line)
  ULCORNER: '\u250C', // Upper left corner: +
  URCORNER: '\u2510', // Upper right corner: +
  LLCORNER: '\u2514', // Lower left corner: +
  LRCORNER: '\u2518', // Lower right corner: +

  // T-junctions (single line)
  RTEE: '\u2524', // Right tee: +
  LTEE: '\u251C', // Left tee: +
  BTEE: '\u2534', // Bottom tee: +
  TTEE: '\u252C', // Top tee: +

  // Lines
  HLINE: '\u2500', // Horizontal line: -
  VLINE: '\u2502', // Vertical line: |

  // Cross
  PLUS: '\u253C', // Plus (cross): +

  // Misc symbols
  S1: '\u23BA', // Scan line 1 (top)
  S3: '\u23BB', // Scan line 3
  S7: '\u23BC', // Scan line 7
  S9: '\u23BD', // Scan line 9 (bottom)
  DIAMOND: '\u25C6', // Diamond: *
  CKBOARD: '\u2592', // Checkerboard (stipple)
  DEGREE: '\u00B0', // Degree symbol
  PLMINUS: '\u00B1', // Plus/minus
  BULLET: '\u2022', // Bullet
  LARROW: '\u2190', // Left arrow: <
  RARROW: '\u2192', // Right arrow: >
  DARROW: '\u2193', // Down arrow: v
  UARROW: '\u2191', // Up arrow: ^
  BOARD: '\u2592', // Board of squares
  LANTERN: '\u2603', // Lantern symbol (snowman as fallback)
  BLOCK: '\u2588', // Solid block

  // British pound sign (legacy)
  STERLING: '\u00A3', // British pound

  // Pi symbol
  PI: '\u03C0', // Greek pi

  // Not equal and less/greater than or equal
  NEQUAL: '\u2260', // Not equal
  LEQUAL: '\u2264', // Less than or equal
  GEQUAL: '\u2265', // Greater than or equal

  // Double line box characters (extended)
  D_ULCORNER: '\u2554', // Double upper left
  D_URCORNER: '\u2557', // Double upper right
  D_LLCORNER: '\u255A', // Double lower left
  D_LRCORNER: '\u255D', // Double lower right
  D_HLINE: '\u2550', // Double horizontal
  D_VLINE: '\u2551', // Double vertical
  D_PLUS: '\u256C', // Double cross
  D_LTEE: '\u2560', // Double left tee
  D_RTEE: '\u2563', // Double right tee
  D_TTEE: '\u2566', // Double top tee
  D_BTEE: '\u2569', // Double bottom tee
};

// ============================================================================
// Individual ACS exports (ncurses compatibility)
// ============================================================================

export const ACS_ULCORNER = ACS.ULCORNER;
export const ACS_URCORNER = ACS.URCORNER;
export const ACS_LLCORNER = ACS.LLCORNER;
export const ACS_LRCORNER = ACS.LRCORNER;
export const ACS_RTEE = ACS.RTEE;
export const ACS_LTEE = ACS.LTEE;
export const ACS_BTEE = ACS.BTEE;
export const ACS_TTEE = ACS.TTEE;
export const ACS_HLINE = ACS.HLINE;
export const ACS_VLINE = ACS.VLINE;
export const ACS_PLUS = ACS.PLUS;
export const ACS_S1 = ACS.S1;
export const ACS_S3 = ACS.S3;
export const ACS_S7 = ACS.S7;
export const ACS_S9 = ACS.S9;
export const ACS_DIAMOND = ACS.DIAMOND;
export const ACS_CKBOARD = ACS.CKBOARD;
export const ACS_DEGREE = ACS.DEGREE;
export const ACS_PLMINUS = ACS.PLMINUS;
export const ACS_BULLET = ACS.BULLET;
export const ACS_LARROW = ACS.LARROW;
export const ACS_RARROW = ACS.RARROW;
export const ACS_DARROW = ACS.DARROW;
export const ACS_UARROW = ACS.UARROW;
export const ACS_BOARD = ACS.BOARD;
export const ACS_LANTERN = ACS.LANTERN;
export const ACS_BLOCK = ACS.BLOCK;
export const ACS_STERLING = ACS.STERLING;
export const ACS_PI = ACS.PI;
export const ACS_NEQUAL = ACS.NEQUAL;
export const ACS_LEQUAL = ACS.LEQUAL;
export const ACS_GEQUAL = ACS.GEQUAL;

// ============================================================================
// ASCII Fallback Map
// ============================================================================

/**
 * ASCII fallback characters for terminals that don't support Unicode
 */
export const ACS_ASCII: Record<string, string> = {
  ULCORNER: '+',
  URCORNER: '+',
  LLCORNER: '+',
  LRCORNER: '+',
  RTEE: '+',
  LTEE: '+',
  BTEE: '+',
  TTEE: '+',
  HLINE: '-',
  VLINE: '|',
  PLUS: '+',
  S1: '-',
  S3: '-',
  S7: '-',
  S9: '_',
  DIAMOND: '*',
  CKBOARD: '#',
  DEGREE: 'o',
  PLMINUS: '+',
  BULLET: 'o',
  LARROW: '<',
  RARROW: '>',
  DARROW: 'v',
  UARROW: '^',
  BOARD: '#',
  LANTERN: '#',
  BLOCK: '#',
  STERLING: 'L',
  PI: 'p',
  NEQUAL: '!',
  LEQUAL: '<',
  GEQUAL: '>',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a character is an ACS character
 */
export function isAcsChar(ch: string): boolean {
  return Object.values(ACS).includes(ch);
}

/**
 * Get ASCII fallback for an ACS character
 */
export function getAsciiFallback(ch: string): string {
  for (const [key, value] of Object.entries(ACS)) {
    if (value === ch) {
      return ACS_ASCII[key] || ch;
    }
  }
  return ch;
}

/**
 * Convert ACS character to its name
 */
export function getAcsName(ch: string): string | undefined {
  for (const [key, value] of Object.entries(ACS)) {
    if (value === ch) {
      return `ACS_${key}`;
    }
  }
  return undefined;
}
