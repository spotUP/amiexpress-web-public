/**
 * ncurses Compatibility Layer - Attributes
 *
 * This module handles ncurses attribute manipulation.
 * Attributes are packed into 27-bit integers matching neo-blessed's format:
 *   - Bits 18-26: Flags (bold, underline, blink, reverse, dim, invis)
 *   - Bits 9-17: Foreground color (0-255, 0x1ff = default)
 *   - Bits 0-8: Background color (0-255, 0x1ff = default)
 *
 * This is compatible with neo-blessed's sattr() format.
 */

import {
  A_NORMAL,
  A_BOLD,
  A_UNDERLINE,
  A_REVERSE,
  A_BLINK,
  A_DIM,
  A_INVIS,
  A_STANDOUT,
  A_ALTCHARSET,
  A_PROTECT,
  A_CHARTEXT,
  A_ATTRIBUTES,
  A_COLOR,
  COLOR_PAIR_SHIFT,
  COLOR_PAIR,
  PAIR_NUMBER,
} from './constants';

// ============================================================================
// Attribute Types
// ============================================================================

/**
 * ncurses chtype - character with attributes
 * In ncurses, this combines a character with display attributes.
 * We represent it as a number where lower 8 bits are the character.
 */
export type chtype = number;

/**
 * ncurses attr_t - attribute type
 * Used for attribute-only operations (no character component)
 */
export type attr_t = number;

// ============================================================================
// Attribute Extraction/Manipulation
// ============================================================================

/**
 * Extract the character portion from a chtype
 */
export function extractChar(ch: chtype): string {
  const code = ch & A_CHARTEXT;
  return String.fromCharCode(code);
}

/**
 * Extract the attribute portion from a chtype
 */
export function extractAttr(ch: chtype): attr_t {
  return ch & A_ATTRIBUTES;
}

/**
 * Combine a character and attributes into a chtype
 */
export function makeChtype(ch: string | number, attr: attr_t = A_NORMAL): chtype {
  const charCode = typeof ch === 'string' ? ch.charCodeAt(0) : ch;
  return (charCode & A_CHARTEXT) | (attr & A_ATTRIBUTES);
}

/**
 * Pack color pair, foreground, and background into attribute
 */
export function packColorAttr(pair: number, fg: number, bg: number): attr_t {
  // Use color pair if specified, otherwise use direct colors
  if (pair > 0) {
    return COLOR_PAIR(pair);
  }
  // Direct color encoding: fg in bits 9-17, bg in bits 0-8
  return ((fg & 0x1ff) << 9) | (bg & 0x1ff);
}

/**
 * Extract foreground color from attribute
 */
export function extractFg(attr: attr_t): number {
  return (attr >> 9) & 0x1ff;
}

/**
 * Extract background color from attribute
 */
export function extractBg(attr: attr_t): number {
  return attr & 0x1ff;
}

/**
 * Extract flags from attribute
 */
export function extractFlags(attr: attr_t): number {
  return attr >> 18;
}

// ============================================================================
// Attribute Flags Helpers
// ============================================================================

/**
 * Check if attribute has bold flag
 */
export function isBold(attr: attr_t): boolean {
  return (attr & A_BOLD) !== 0;
}

/**
 * Check if attribute has underline flag
 */
export function isUnderline(attr: attr_t): boolean {
  return (attr & A_UNDERLINE) !== 0;
}

/**
 * Check if attribute has reverse flag
 */
export function isReverse(attr: attr_t): boolean {
  return (attr & A_REVERSE) !== 0;
}

/**
 * Check if attribute has blink flag
 */
export function isBlink(attr: attr_t): boolean {
  return (attr & A_BLINK) !== 0;
}

/**
 * Check if attribute has dim flag
 */
export function isDim(attr: attr_t): boolean {
  return (attr & A_DIM) !== 0;
}

/**
 * Check if attribute has invisible flag
 */
export function isInvis(attr: attr_t): boolean {
  return (attr & A_INVIS) !== 0;
}

// ============================================================================
// ANSI Escape Code Generation
// ============================================================================

/**
 * Convert ncurses attribute to ANSI escape sequence
 * This generates the SGR (Select Graphic Rendition) sequence
 */
export function attrToAnsi(attr: attr_t): string {
  const codes: number[] = [];

  // Reset first if we have any attributes
  codes.push(0);

  // Text attributes
  if (attr & A_BOLD) codes.push(1);
  if (attr & A_DIM) codes.push(2);
  if (attr & A_UNDERLINE) codes.push(4);
  if (attr & A_BLINK) codes.push(5);
  if (attr & A_REVERSE) codes.push(7);
  if (attr & A_INVIS) codes.push(8);

  // Foreground color
  const fg = extractFg(attr);
  if (fg !== 0x1ff) {
    // 0x1ff means default
    if (fg < 8) {
      codes.push(30 + fg); // Standard colors
    } else if (fg < 16) {
      codes.push(90 + (fg - 8)); // Bright colors
    } else {
      codes.push(38, 5, fg); // 256-color mode
    }
  }

  // Background color
  const bg = extractBg(attr);
  if (bg !== 0x1ff) {
    // 0x1ff means default
    if (bg < 8) {
      codes.push(40 + bg); // Standard colors
    } else if (bg < 16) {
      codes.push(100 + (bg - 8)); // Bright colors
    } else {
      codes.push(48, 5, bg); // 256-color mode
    }
  }

  if (codes.length === 1 && codes[0] === 0) {
    return '\x1b[0m'; // Just reset
  }

  return `\x1b[${codes.join(';')}m`;
}

/**
 * Convert ncurses attribute to neo-blessed style object
 */
export function attrToStyle(attr: attr_t): Record<string, unknown> {
  const style: Record<string, unknown> = {};

  // Text attributes
  if (attr & A_BOLD) style.bold = true;
  if (attr & A_UNDERLINE) style.underline = true;
  if (attr & A_BLINK) style.blink = true;
  if (attr & A_REVERSE) style.inverse = true;
  if (attr & A_INVIS) style.invisible = true;

  // Colors
  const fg = extractFg(attr);
  if (fg !== 0x1ff) {
    style.fg = fg;
  }

  const bg = extractBg(attr);
  if (bg !== 0x1ff) {
    style.bg = bg;
  }

  return style;
}

/**
 * Convert neo-blessed style object to ncurses attribute
 */
export function styleToAttr(style: Record<string, unknown>): attr_t {
  let attr = A_NORMAL;

  // Text attributes
  if (style.bold) attr |= A_BOLD;
  if (style.underline) attr |= A_UNDERLINE;
  if (style.blink) attr |= A_BLINK;
  if (style.inverse) attr |= A_REVERSE;
  if (style.invisible) attr |= A_INVIS;

  // Foreground color
  if (typeof style.fg === 'number') {
    attr |= (style.fg & 0x1ff) << 9;
  } else {
    attr |= 0x1ff << 9; // Default foreground
  }

  // Background color
  if (typeof style.bg === 'number') {
    attr |= style.bg & 0x1ff;
  } else {
    attr |= 0x1ff; // Default background
  }

  return attr;
}

// ============================================================================
// Default Attribute
// ============================================================================

/**
 * Default attribute: default colors, no special attributes
 * Foreground: default (0x1ff), Background: default (0x1ff), Flags: none
 */
export const DEFAULT_ATTR: attr_t = (0x1ff << 9) | 0x1ff;

/**
 * Create a default attribute with specific colors
 */
export function defaultAttrWithColors(fg: number, bg: number): attr_t {
  return ((fg & 0x1ff) << 9) | (bg & 0x1ff);
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

export {
  A_NORMAL,
  A_BOLD,
  A_UNDERLINE,
  A_REVERSE,
  A_BLINK,
  A_DIM,
  A_INVIS,
  A_STANDOUT,
  A_ALTCHARSET,
  A_PROTECT,
  A_CHARTEXT,
  A_ATTRIBUTES,
  A_COLOR,
  COLOR_PAIR_SHIFT,
  COLOR_PAIR,
  PAIR_NUMBER,
};
