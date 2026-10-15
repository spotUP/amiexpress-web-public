/**
 * Brush modes for ANSI art drawing
 * Provides different drawing styles for the draw tool
 */

import type { Cell, BrushMode } from '../types';

/**
 * Half-block brush (default)
 * Uses upper/lower half block characters for pixel-precise drawing
 */
export function halfBlockBrush(x: number, y: number, fg: number, bg: number): Cell {
  return {
    char: '▀', // Upper half block
    fg,
    bg,
    blink: false
  };
}

/**
 * Quarter-block brush
 * Uses quarter-block characters for even finer detail
 */
export function quarterBlockBrush(x: number, y: number, fg: number, bg: number, quadrant: 1 | 2 | 3 | 4 = 1): Cell {
  const chars = ['▘', '▝', '▖', '▗']; // Top-left, top-right, bottom-left, bottom-right
  return {
    char: chars[quadrant - 1],
    fg,
    bg,
    blink: false
  };
}

/**
 * Full block brush
 * Solid color blocks
 */
export function fullBlockBrush(x: number, y: number, fg: number, bg: number): Cell {
  return {
    char: '█',
    fg,
    bg,
    blink: false
  };
}

/**
 * Custom character brush
 * Uses a specified character
 */
export function customCharBrush(char: string, fg: number, bg: number): Cell {
  return {
    char,
    fg,
    bg,
    blink: false
  };
}

/**
 * Shading pattern brush
 * Uses different shading characters based on intensity
 */
export function shadingBrush(intensity: 'light' | 'medium' | 'dark', fg: number, bg: number): Cell {
  const chars = {
    light: '░',   // Light shade
    medium: '▒',  // Medium shade
    dark: '▓'     // Dark shade
  };

  return {
    char: chars[intensity],
    fg,
    bg,
    blink: false
  };
}

/**
 * Colorize brush (changes colors only, preserves character)
 * Used for recoloring existing art without changing characters
 */
export function colorizeBrush(existingChar: string, fg: number, bg: number): Cell {
  return {
    char: existingChar || ' ',
    fg,
    bg,
    blink: false
  };
}

/**
 * Replace brush (conditional drawing)
 * Only replaces cells matching specific criteria
 */
export interface ReplaceCriteria {
  matchChar?: string;
  matchFg?: number;
  matchBg?: number;
}

export function replaceBrush(
  existingCell: Cell,
  newChar: string,
  newFg: number,
  newBg: number,
  criteria: ReplaceCriteria
): Cell | null {
  // Check if cell matches criteria
  if (criteria.matchChar && existingCell.char !== criteria.matchChar) {
    return null;
  }
  if (criteria.matchFg !== undefined && existingCell.fg !== criteria.matchFg) {
    return null;
  }
  if (criteria.matchBg !== undefined && existingCell.bg !== criteria.matchBg) {
    return null;
  }

  // Cell matches - replace it
  return {
    char: newChar,
    fg: newFg,
    bg: newBg,
    blink: false
  };
}

/**
 * Get brush cell based on mode and parameters
 */
export function getBrushCell(
  mode: BrushMode,
  x: number,
  y: number,
  fg: number,
  bg: number,
  customChar?: string,
  existingCell?: Cell
): Cell {
  switch (mode) {
    case 'half-block':
      return halfBlockBrush(x, y, fg, bg);

    case 'quarter-block':
      // Determine quadrant based on position (for smoother drawing)
      const quadrant = ((y % 2) * 2 + (x % 2) + 1) as 1 | 2 | 3 | 4;
      return quarterBlockBrush(x, y, fg, bg, quadrant);

    case 'custom':
      return customCharBrush(customChar || '█', fg, bg);

    case 'shading':
      // Cycle through shading intensities based on position
      const intensity = (x + y) % 3 === 0 ? 'light' : (x + y) % 3 === 1 ? 'medium' : 'dark';
      return shadingBrush(intensity, fg, bg);

    case 'colorize':
      return colorizeBrush(existingCell?.char || ' ', fg, bg);

    case 'replace':
      // For replace mode, we need additional criteria (handled separately)
      return customCharBrush(customChar || '█', fg, bg);

    default:
      return fullBlockBrush(x, y, fg, bg);
  }
}

/**
 * Mirror mode for symmetrical drawing
 */
export interface MirrorMode {
  horizontal: boolean;  // Mirror horizontally (left-right)
  vertical: boolean;    // Mirror vertically (top-bottom)
  bothAxes: boolean;    // Mirror both (quadrant symmetry)
}

/**
 * Calculate mirrored positions for a given point
 */
export function getMirroredPositions(
  x: number,
  y: number,
  canvasWidth: number,
  canvasHeight: number,
  mirrorMode: MirrorMode
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [{ x, y }];

  const centerX = Math.floor(canvasWidth / 2);
  const centerY = Math.floor(canvasHeight / 2);

  if (mirrorMode.horizontal) {
    // Mirror across vertical axis (left-right)
    const mirrorX = centerX + (centerX - x);
    if (mirrorX >= 0 && mirrorX < canvasWidth) {
      positions.push({ x: mirrorX, y });
    }
  }

  if (mirrorMode.vertical) {
    // Mirror across horizontal axis (top-bottom)
    const mirrorY = centerY + (centerY - y);
    if (mirrorY >= 0 && mirrorY < canvasHeight) {
      positions.push({ x, y: mirrorY });
    }
  }

  if (mirrorMode.bothAxes || (mirrorMode.horizontal && mirrorMode.vertical)) {
    // Mirror across both axes (quadrant symmetry)
    const mirrorX = centerX + (centerX - x);
    const mirrorY = centerY + (centerY - y);
    if (mirrorX >= 0 && mirrorX < canvasWidth && mirrorY >= 0 && mirrorY < canvasHeight) {
      positions.push({ x: mirrorX, y: mirrorY });
    }
  }

  return positions;
}

/**
 * Apply brush with mirror mode
 */
export function applyBrushWithMirror(
  canvas: Cell[][],
  x: number,
  y: number,
  cell: Cell,
  mirrorMode: MirrorMode
): void {
  const canvasHeight = canvas.length;
  const canvasWidth = canvas[0]?.length || 0;

  const positions = getMirroredPositions(x, y, canvasWidth, canvasHeight, mirrorMode);

  for (const pos of positions) {
    if (pos.y >= 0 && pos.y < canvasHeight && pos.x >= 0 && pos.x < canvasWidth) {
      canvas[pos.y][pos.x] = { ...cell };
    }
  }
}

/**
 * Brush size/radius settings
 */
export interface BrushSize {
  radius: number;  // 0 = single pixel, 1 = 3x3, 2 = 5x5, etc.
  shape: 'square' | 'circle';
}

/**
 * Get cells affected by brush size
 */
export function getBrushArea(x: number, y: number, size: BrushSize): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];

  if (size.radius === 0) {
    // Single pixel
    return [{ x, y }];
  }

  const radius = size.radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (size.shape === 'circle') {
        // Check if within circular radius
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance <= radius) {
          cells.push({ x: x + dx, y: y + dy });
        }
      } else {
        // Square brush
        cells.push({ x: x + dx, y: y + dy });
      }
    }
  }

  return cells;
}

/**
 * Dithering patterns for shading effects
 */
export const DITHER_PATTERNS = {
  // Checkerboard pattern (50% density)
  checkerboard: (x: number, y: number): boolean => (x + y) % 2 === 0,

  // Horizontal lines (50% density)
  horizontal: (x: number, y: number): boolean => y % 2 === 0,

  // Vertical lines (50% density)
  vertical: (x: number, y: number): boolean => x % 2 === 0,

  // Diagonal lines (50% density)
  diagonal: (x: number, y: number): boolean => (x - y) % 2 === 0,

  // Dense pattern (75% density)
  dense: (x: number, y: number): boolean => (x % 2 === 0 || y % 2 === 0),

  // Sparse pattern (25% density)
  sparse: (x: number, y: number): boolean => (x % 2 === 0 && y % 2 === 0),

  // Bayer matrix (ordered dithering)
  bayer2x2: (x: number, y: number): boolean => {
    const matrix = [[0, 2], [3, 1]];
    return matrix[y % 2][x % 2] >= 2;
  },

  bayer4x4: (x: number, y: number): boolean => {
    const matrix = [
      [0, 8, 2, 10],
      [12, 4, 14, 6],
      [3, 11, 1, 9],
      [15, 7, 13, 5]
    ];
    return matrix[y % 4][x % 4] >= 8;
  }
};

/**
 * Apply dithering pattern to cell
 */
export function applyDithering(
  x: number,
  y: number,
  fg: number,
  bg: number,
  pattern: keyof typeof DITHER_PATTERNS
): Cell {
  const patternFunc = DITHER_PATTERNS[pattern];
  const useFg = patternFunc(x, y);

  return {
    char: useFg ? '█' : ' ',
    fg: useFg ? fg : bg,
    bg,
    blink: false
  };
}
