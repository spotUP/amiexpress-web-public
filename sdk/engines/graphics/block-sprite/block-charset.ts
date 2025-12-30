/**
 * Block Character Set - Unicode Block Element Definitions
 *
 * Provides all Unicode block drawing characters (U+2580 - U+259F) for
 * creating detailed sprites at terminal resolution with optional 2x2
 * subpixel support using half and quarter blocks.
 *
 * @example
 * ```typescript
 * import { BLOCKS, getBlockChar } from './block-charset';
 *
 * // Use full block
 * const solid = BLOCKS.FULL;  // '█'
 *
 * // Get block for specific quadrants
 * const topLeft = getBlockChar(true, false, false, false);  // '▘'
 * ```
 */

/**
 * Full block characters (U+2588)
 */
export const FULL_BLOCK = '\u2588';

/**
 * Half block characters
 */
export const HALF_BLOCKS = {
  TOP: '\u2580',      // ▀ Upper half
  BOTTOM: '\u2584',   // ▄ Lower half
  LEFT: '\u258C',     // ▌ Left half
  RIGHT: '\u2590',    // ▐ Right half
} as const;

/**
 * Quarter block characters
 * Named by which quadrants are filled:
 * TL=Top Left, TR=Top Right, BL=Bottom Left, BR=Bottom Right
 */
export const QUARTER_BLOCKS = {
  BL: '\u2596',       // ▖ Lower left
  BR: '\u2597',       // ▗ Lower right
  TL: '\u2598',       // ▘ Upper left
  TL_BL_BR: '\u2599', // ▙ Upper left + lower half
  TL_BR: '\u259A',    // ▚ Upper left + lower right (diagonal)
  TL_TR_BL: '\u259B', // ▛ Upper half + lower left
  TL_TR_BR: '\u259C', // ▜ Upper half + lower right
  TR: '\u259D',       // ▝ Upper right
  TR_BL: '\u259E',    // ▞ Upper right + lower left (diagonal)
  TR_BL_BR: '\u259F', // ▟ Upper right + lower half
} as const;

/**
 * Shade block characters for anti-aliasing and gradients
 */
export const SHADE_BLOCKS = {
  LIGHT: '\u2591',    // ░ Light shade (25%)
  MEDIUM: '\u2592',   // ▒ Medium shade (50%)
  DARK: '\u2593',     // ▓ Dark shade (75%)
} as const;

/**
 * All block characters combined
 */
export const BLOCKS = {
  FULL: FULL_BLOCK,
  EMPTY: ' ',
  ...HALF_BLOCKS,
  ...QUARTER_BLOCKS,
  ...SHADE_BLOCKS,
} as const;

/**
 * Get the correct block character for a 2x2 subpixel pattern
 *
 * @param tl - Top-left quadrant filled
 * @param tr - Top-right quadrant filled
 * @param bl - Bottom-left quadrant filled
 * @param br - Bottom-right quadrant filled
 * @returns The Unicode block character that matches the pattern
 */
export function getBlockChar(tl: boolean, tr: boolean, bl: boolean, br: boolean): string {
  const index = (tl ? 8 : 0) | (tr ? 4 : 0) | (bl ? 2 : 0) | (br ? 1 : 0);

  switch (index) {
    case 0: return ' ';              // Empty
    case 1: return '\u2597';         // ▗ BR only
    case 2: return '\u2596';         // ▖ BL only
    case 3: return '\u2584';         // ▄ Bottom half
    case 4: return '\u259D';         // ▝ TR only
    case 5: return '\u2590';         // ▐ Right half
    case 6: return '\u259E';         // ▞ TR+BL diagonal
    case 7: return '\u259F';         // ▟ TR+BL+BR
    case 8: return '\u2598';         // ▘ TL only
    case 9: return '\u259A';         // ▚ TL+BR diagonal
    case 10: return '\u258C';        // ▌ Left half
    case 11: return '\u2599';        // ▙ TL+BL+BR
    case 12: return '\u2580';        // ▀ Top half
    case 13: return '\u259C';        // ▜ TL+TR+BR
    case 14: return '\u259B';        // ▛ TL+TR+BL
    case 15: return '\u2588';        // █ Full block
    default: return ' ';
  }
}

/**
 * Get quadrant pattern from a block character
 *
 * @param char - A Unicode block character
 * @returns Object with boolean flags for each quadrant, or null if not a block char
 */
export function getQuadrants(char: string): { tl: boolean; tr: boolean; bl: boolean; br: boolean } | null {
  switch (char) {
    case ' ': return { tl: false, tr: false, bl: false, br: false };
    case '\u2588': return { tl: true, tr: true, bl: true, br: true };      // █
    case '\u2580': return { tl: true, tr: true, bl: false, br: false };    // ▀
    case '\u2584': return { tl: false, tr: false, bl: true, br: true };    // ▄
    case '\u258C': return { tl: true, tr: false, bl: true, br: false };    // ▌
    case '\u2590': return { tl: false, tr: true, bl: false, br: true };    // ▐
    case '\u2596': return { tl: false, tr: false, bl: true, br: false };   // ▖
    case '\u2597': return { tl: false, tr: false, bl: false, br: true };   // ▗
    case '\u2598': return { tl: true, tr: false, bl: false, br: false };   // ▘
    case '\u259D': return { tl: false, tr: true, bl: false, br: false };   // ▝
    case '\u2599': return { tl: true, tr: false, bl: true, br: true };     // ▙
    case '\u259A': return { tl: true, tr: false, bl: false, br: true };    // ▚
    case '\u259B': return { tl: true, tr: true, bl: true, br: false };     // ▛
    case '\u259C': return { tl: true, tr: true, bl: false, br: true };     // ▜
    case '\u259E': return { tl: false, tr: true, bl: true, br: false };    // ▞
    case '\u259F': return { tl: false, tr: true, bl: true, br: true };     // ▟
    default: return null;
  }
}

/**
 * Check if a character is a block drawing character
 *
 * @param char - Character to check
 * @returns True if it's a block character (including shade blocks)
 */
export function isBlockChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x2580 && code <= 0x259F;
}

/**
 * Check if a character is a shade block
 *
 * @param char - Character to check
 * @returns True if it's a shade character (░ ▒ ▓)
 */
export function isShadeChar(char: string): boolean {
  return char === '\u2591' || char === '\u2592' || char === '\u2593';
}

/**
 * Get shade level (0-3) for a character
 *
 * @param char - Character to check
 * @returns 0 for empty, 1 for light, 2 for medium, 3 for dark, 4 for full
 */
export function getShadeLevel(char: string): number {
  switch (char) {
    case ' ': return 0;
    case '\u2591': return 1;  // ░
    case '\u2592': return 2;  // ▒
    case '\u2593': return 3;  // ▓
    case '\u2588': return 4;  // █
    default: return -1;
  }
}

/**
 * Get shade character for a given level
 *
 * @param level - Shade level 0-4
 * @returns Corresponding shade character
 */
export function getShadeChar(level: number): string {
  switch (Math.round(Math.max(0, Math.min(4, level)))) {
    case 0: return ' ';
    case 1: return '\u2591';  // ░
    case 2: return '\u2592';  // ▒
    case 3: return '\u2593';  // ▓
    case 4: return '\u2588';  // █
    default: return ' ';
  }
}

/**
 * Combine two block characters (OR operation on quadrants)
 *
 * @param a - First block character
 * @param b - Second block character
 * @returns Combined block character
 */
export function combineBlocks(a: string, b: string): string {
  const qa = getQuadrants(a);
  const qb = getQuadrants(b);

  if (!qa || !qb) {
    // If either isn't a block char, return the non-empty one
    return a !== ' ' ? a : b;
  }

  return getBlockChar(
    qa.tl || qb.tl,
    qa.tr || qb.tr,
    qa.bl || qb.bl,
    qa.br || qb.br
  );
}

/**
 * Flip a block character horizontally
 *
 * @param char - Block character to flip
 * @returns Horizontally flipped character
 */
export function flipBlockH(char: string): string {
  const q = getQuadrants(char);
  if (!q) return char;
  return getBlockChar(q.tr, q.tl, q.br, q.bl);
}

/**
 * Flip a block character vertically
 *
 * @param char - Block character to flip
 * @returns Vertically flipped character
 */
export function flipBlockV(char: string): string {
  const q = getQuadrants(char);
  if (!q) return char;
  return getBlockChar(q.bl, q.br, q.tl, q.tr);
}
