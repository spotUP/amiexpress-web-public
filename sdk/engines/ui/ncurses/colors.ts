/**
 * ncurses Compatibility Layer - Colors
 *
 * This module handles ncurses color pair management.
 * Color pairs map a pair number to (foreground, background) colors.
 *
 * Usage:
 *   start_color();           // Initialize color system
 *   init_pair(1, COLOR_RED, COLOR_BLACK);  // Define pair 1
 *   attron(COLOR_PAIR(1));   // Use pair 1
 */

import {
  COLOR_BLACK,
  COLOR_RED,
  COLOR_GREEN,
  COLOR_YELLOW,
  COLOR_BLUE,
  COLOR_MAGENTA,
  COLOR_CYAN,
  COLOR_WHITE,
  COLORS,
  COLOR_PAIRS,
  OK,
  ERR,
} from './constants';
import { COLOR_PAIR, PAIR_NUMBER } from './attributes';

// ============================================================================
// Color State
// ============================================================================

/**
 * Color pair storage: Map<pairNumber, [fg, bg]>
 */
const colorPairs: Map<number, [number, number]> = new Map();

/**
 * Custom color definitions (for init_color)
 * Map<colorNumber, [r, g, b]> where r,g,b are 0-1000
 */
const customColors: Map<number, [number, number, number]> = new Map();

/**
 * Whether color system has been initialized
 */
let colorsInitialized = false;

/**
 * Whether we can change color definitions
 */
let canChangeColors = false; // Most terminals can't

// ============================================================================
// Color Initialization
// ============================================================================

/**
 * Initialize the color system
 * Must be called before using color pairs
 *
 * @returns OK on success, ERR on failure
 */
export function start_color(): number {
  if (colorsInitialized) {
    return OK; // Already initialized
  }

  // Initialize pair 0 as default (white on black)
  colorPairs.set(0, [COLOR_WHITE, COLOR_BLACK]);

  // Mark as initialized
  colorsInitialized = true;

  return OK;
}

/**
 * Check if terminal supports colors
 *
 * @returns true if colors are supported
 */
export function has_colors(): boolean {
  return true; // Modern terminals always support colors
}

/**
 * Check if terminal can change color definitions
 *
 * @returns true if colors can be redefined
 */
export function can_change_color(): boolean {
  return canChangeColors;
}

/**
 * Set whether colors can be changed
 * Used for testing or special terminal modes
 */
export function setCanChangeColor(value: boolean): void {
  canChangeColors = value;
}

// ============================================================================
// Color Pair Management
// ============================================================================

/**
 * Define a color pair
 *
 * @param pair - Pair number (1-255, 0 is reserved)
 * @param fg - Foreground color (0-255)
 * @param bg - Background color (0-255)
 * @returns OK on success, ERR on failure
 */
export function init_pair(pair: number, fg: number, bg: number): number {
  if (!colorsInitialized) {
    return ERR; // Must call start_color() first
  }

  if (pair < 0 || pair >= COLOR_PAIRS) {
    return ERR; // Invalid pair number
  }

  if (fg < 0 || fg >= COLORS || bg < 0 || bg >= COLORS) {
    return ERR; // Invalid color number
  }

  colorPairs.set(pair, [fg, bg]);
  return OK;
}

/**
 * Get the colors for a pair
 *
 * @param pair - Pair number
 * @returns [fg, bg] or undefined if not defined
 */
export function pair_content(pair: number): [number, number] | undefined {
  return colorPairs.get(pair);
}

/**
 * Get foreground color for a pair
 */
export function pair_fg(pair: number): number {
  const content = colorPairs.get(pair);
  return content ? content[0] : COLOR_WHITE;
}

/**
 * Get background color for a pair
 */
export function pair_bg(pair: number): number {
  const content = colorPairs.get(pair);
  return content ? content[1] : COLOR_BLACK;
}

// ============================================================================
// Custom Color Definition
// ============================================================================

/**
 * Define a custom color (if terminal supports it)
 *
 * @param color - Color number to redefine (0-255)
 * @param r - Red component (0-1000)
 * @param g - Green component (0-1000)
 * @param b - Blue component (0-1000)
 * @returns OK on success, ERR on failure
 */
export function init_color(color: number, r: number, g: number, b: number): number {
  if (!canChangeColors) {
    return ERR; // Terminal doesn't support color change
  }

  if (color < 0 || color >= COLORS) {
    return ERR; // Invalid color number
  }

  if (r < 0 || r > 1000 || g < 0 || g > 1000 || b < 0 || b > 1000) {
    return ERR; // Invalid RGB values
  }

  customColors.set(color, [r, g, b]);
  return OK;
}

/**
 * Get RGB values for a color
 *
 * @param color - Color number
 * @returns [r, g, b] where each is 0-1000, or undefined
 */
export function color_content(color: number): [number, number, number] | undefined {
  // Check custom colors first
  if (customColors.has(color)) {
    return customColors.get(color);
  }

  // Return default RGB for standard colors
  const defaults: Record<number, [number, number, number]> = {
    [COLOR_BLACK]: [0, 0, 0],
    [COLOR_RED]: [1000, 0, 0],
    [COLOR_GREEN]: [0, 1000, 0],
    [COLOR_YELLOW]: [1000, 1000, 0],
    [COLOR_BLUE]: [0, 0, 1000],
    [COLOR_MAGENTA]: [1000, 0, 1000],
    [COLOR_CYAN]: [0, 1000, 1000],
    [COLOR_WHITE]: [1000, 1000, 1000],
  };

  return defaults[color];
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Reset color system to initial state
 * (Used for cleanup/testing)
 */
export function resetColors(): void {
  colorPairs.clear();
  customColors.clear();
  colorsInitialized = false;
}

/**
 * Check if color system is initialized
 */
export function isColorInitialized(): boolean {
  return colorsInitialized;
}

/**
 * Get number of colors supported
 */
export function getColors(): number {
  return COLORS;
}

/**
 * Get number of color pairs supported
 */
export function getColorPairs(): number {
  return COLOR_PAIRS;
}

/**
 * Convert RGB (0-255) to ncurses RGB (0-1000)
 */
export function rgb256ToNcurses(r: number, g: number, b: number): [number, number, number] {
  return [
    Math.round((r / 255) * 1000),
    Math.round((g / 255) * 1000),
    Math.round((b / 255) * 1000),
  ];
}

/**
 * Convert ncurses RGB (0-1000) to RGB (0-255)
 */
export function ncursesToRgb256(r: number, g: number, b: number): [number, number, number] {
  return [Math.round((r / 1000) * 255), Math.round((g / 1000) * 255), Math.round((b / 1000) * 255)];
}

/**
 * Find closest color in 16-color palette to given RGB
 */
export function matchColor16(r: number, g: number, b: number): number {
  // Convert 0-1000 to 0-255 for comparison
  const r8 = Math.round((r / 1000) * 255);
  const g8 = Math.round((g / 1000) * 255);
  const b8 = Math.round((b / 1000) * 255);

  const palette: [number, number, number][] = [
    [0, 0, 0], // 0: black
    [128, 0, 0], // 1: red
    [0, 128, 0], // 2: green
    [128, 128, 0], // 3: yellow
    [0, 0, 128], // 4: blue
    [128, 0, 128], // 5: magenta
    [0, 128, 128], // 6: cyan
    [192, 192, 192], // 7: white
    [128, 128, 128], // 8: bright black (gray)
    [255, 0, 0], // 9: bright red
    [0, 255, 0], // 10: bright green
    [255, 255, 0], // 11: bright yellow
    [0, 0, 255], // 12: bright blue
    [255, 0, 255], // 13: bright magenta
    [0, 255, 255], // 14: bright cyan
    [255, 255, 255], // 15: bright white
  ];

  let bestMatch = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    // Simple Euclidean distance
    const distance = Math.sqrt(
      Math.pow(r8 - pr, 2) + Math.pow(g8 - pg, 2) + Math.pow(b8 - pb, 2)
    );
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = i;
    }
  }

  return bestMatch;
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  COLOR_BLACK,
  COLOR_RED,
  COLOR_GREEN,
  COLOR_YELLOW,
  COLOR_BLUE,
  COLOR_MAGENTA,
  COLOR_CYAN,
  COLOR_WHITE,
  COLORS,
  COLOR_PAIRS,
  COLOR_PAIR,
  PAIR_NUMBER,
};
