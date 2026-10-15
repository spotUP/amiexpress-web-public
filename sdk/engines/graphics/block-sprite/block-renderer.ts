/**
 * Block Sprite Renderer
 *
 * Handles rendering block sprites to a character buffer and
 * generating optimized ANSI output.
 */

import {
  BlockSprite,
  BlockCell,
  BufferCell,
  AnsiColor,
  Rect,
} from './types';
import { getCurrentFrame } from './block-animation';
import { flipBlockH, flipBlockV } from './block-charset';

/**
 * ANSI color codes (foreground)
 */
const FG_COLORS: Record<AnsiColor, string> = {
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
};

/**
 * ANSI color codes (background)
 */
const BG_COLORS: Record<AnsiColor, string> = {
  black: '\x1b[40m',
  red: '\x1b[41m',
  green: '\x1b[42m',
  yellow: '\x1b[43m',
  blue: '\x1b[44m',
  magenta: '\x1b[45m',
  cyan: '\x1b[46m',
  white: '\x1b[47m',
  gray: '\x1b[100m',
  brightRed: '\x1b[101m',
  brightGreen: '\x1b[102m',
  brightYellow: '\x1b[103m',
  brightBlue: '\x1b[104m',
  brightMagenta: '\x1b[105m',
  brightCyan: '\x1b[106m',
  brightWhite: '\x1b[107m',
};

/**
 * ANSI reset code
 */
const RESET = '\x1b[0m';

/**
 * Create an empty buffer cell
 */
function createEmptyCell(fg: AnsiColor, bg: AnsiColor): BufferCell {
  return {
    char: ' ',
    fg,
    bg,
    dirty: false,
  };
}

/**
 * Create a render buffer
 */
export function createBuffer(
  width: number,
  height: number,
  defaultFg: AnsiColor = 'white',
  defaultBg: AnsiColor = 'black'
): BufferCell[][] {
  const buffer: BufferCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: BufferCell[] = [];
    for (let x = 0; x < width; x++) {
      row.push(createEmptyCell(defaultFg, defaultBg));
    }
    buffer.push(row);
  }

  return buffer;
}

/**
 * Clear a buffer to default state
 */
export function clearBuffer(
  buffer: BufferCell[][],
  defaultFg: AnsiColor = 'white',
  defaultBg: AnsiColor = 'black'
): void {
  for (let y = 0; y < buffer.length; y++) {
    for (let x = 0; x < buffer[y].length; x++) {
      buffer[y][x].char = ' ';
      buffer[y][x].fg = defaultFg;
      buffer[y][x].bg = defaultBg;
      buffer[y][x].dirty = true;
    }
  }
}

/**
 * Get normalized cell data from a BlockCell
 */
function normalizeCell(
  cell: BlockCell,
  defaultFg: AnsiColor,
  defaultBg: AnsiColor
): { char: string; fg: AnsiColor; bg: AnsiColor; transparent: boolean } {
  if (cell === null) {
    return { char: ' ', fg: defaultFg, bg: defaultBg, transparent: true };
  }

  if (typeof cell === 'string') {
    return {
      char: cell,
      fg: defaultFg,
      bg: defaultBg,
      transparent: cell === ' ',
    };
  }

  return {
    char: cell.char,
    fg: cell.fg ?? defaultFg,
    bg: cell.bg ?? defaultBg,
    transparent: cell.transparent ?? false,
  };
}

/**
 * Render a single sprite to the buffer
 */
export function renderSprite(
  buffer: BufferCell[][],
  sprite: BlockSprite,
  defaultFg: AnsiColor = 'white',
  defaultBg: AnsiColor = 'black'
): Rect | null {
  if (!sprite.visible) {
    return null;
  }

  const frame = getCurrentFrame(sprite);
  if (!frame) {
    return null;
  }

  const bufferHeight = buffer.length;
  const bufferWidth = buffer[0]?.length ?? 0;

  // Track dirty rectangle
  let minX = bufferWidth;
  let minY = bufferHeight;
  let maxX = 0;
  let maxY = 0;

  // Render each cell of the frame
  for (let fy = 0; fy < frame.height; fy++) {
    for (let fx = 0; fx < frame.width; fx++) {
      // Apply flip transformations for reading
      const srcX = sprite.flipX ? frame.width - 1 - fx : fx;
      const srcY = sprite.flipY ? frame.height - 1 - fy : fy;

      // Get cell data
      const row = frame.data[srcY];
      if (!row) continue;

      const cellData = row[srcX];
      const normalized = normalizeCell(cellData, defaultFg, defaultBg);

      // Skip transparent cells
      if (normalized.transparent) continue;

      // Calculate buffer position
      const bufX = Math.floor(sprite.x) + fx;
      const bufY = Math.floor(sprite.y) + fy;

      // Bounds check
      if (bufX < 0 || bufX >= bufferWidth || bufY < 0 || bufY >= bufferHeight) {
        continue;
      }

      // Apply character flip if needed
      let char = normalized.char;
      if (sprite.flipX) {
        char = flipBlockH(char);
      }
      if (sprite.flipY) {
        char = flipBlockV(char);
      }

      // Write to buffer
      const bufferCell = buffer[bufY][bufX];
      bufferCell.char = char;
      bufferCell.fg = normalized.fg;
      bufferCell.bg = normalized.bg;
      bufferCell.dirty = true;

      // Update dirty rect
      minX = Math.min(minX, bufX);
      minY = Math.min(minY, bufY);
      maxX = Math.max(maxX, bufX);
      maxY = Math.max(maxY, bufY);
    }
  }

  if (maxX < minX) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Render multiple sprites to buffer (sorted by z-index)
 */
export function renderSprites(
  buffer: BufferCell[][],
  sprites: BlockSprite[],
  defaultFg: AnsiColor = 'white',
  defaultBg: AnsiColor = 'black'
): Rect | null {
  // Sort by z-index (lower first = back)
  const sorted = [...sprites].sort((a, b) => a.z - b.z);

  let combinedRect: Rect | null = null;

  for (const sprite of sorted) {
    const rect = renderSprite(buffer, sprite, defaultFg, defaultBg);
    if (rect) {
      if (!combinedRect) {
        combinedRect = { ...rect };
      } else {
        const maxX = Math.max(combinedRect.x + combinedRect.width, rect.x + rect.width);
        const maxY = Math.max(combinedRect.y + combinedRect.height, rect.y + rect.height);
        combinedRect.x = Math.min(combinedRect.x, rect.x);
        combinedRect.y = Math.min(combinedRect.y, rect.y);
        combinedRect.width = maxX - combinedRect.x;
        combinedRect.height = maxY - combinedRect.y;
      }
    }
  }

  return combinedRect;
}

/**
 * Convert buffer to ANSI string (full buffer)
 */
export function bufferToAnsi(
  buffer: BufferCell[][],
  options: {
    optimizeColors?: boolean;
    includeReset?: boolean;
  } = {}
): string {
  const { optimizeColors = true, includeReset = true } = options;

  let output = '';
  let currentFg: AnsiColor | null = null;
  let currentBg: AnsiColor | null = null;

  for (let y = 0; y < buffer.length; y++) {
    for (let x = 0; x < buffer[y].length; x++) {
      const cell = buffer[y][x];

      if (optimizeColors) {
        // Only emit color codes when they change
        if (cell.fg !== currentFg) {
          output += FG_COLORS[cell.fg];
          currentFg = cell.fg;
        }
        if (cell.bg !== currentBg) {
          output += BG_COLORS[cell.bg];
          currentBg = cell.bg;
        }
      } else {
        output += FG_COLORS[cell.fg] + BG_COLORS[cell.bg];
      }

      output += cell.char;
    }

    // Add newline except for last row
    if (y < buffer.length - 1) {
      output += '\n';
    }
  }

  if (includeReset) {
    output += RESET;
  }

  return output;
}

/**
 * Convert buffer region to ANSI string with cursor positioning
 */
export function bufferRegionToAnsi(
  buffer: BufferCell[][],
  rect: Rect,
  options: {
    optimizeColors?: boolean;
    includeReset?: boolean;
    cursorHome?: { x: number; y: number };
  } = {}
): string {
  const { optimizeColors = true, includeReset = true, cursorHome } = options;

  let output = '';
  let currentFg: AnsiColor | null = null;
  let currentBg: AnsiColor | null = null;

  const startX = Math.max(0, rect.x);
  const startY = Math.max(0, rect.y);
  const endX = Math.min(buffer[0]?.length ?? 0, rect.x + rect.width);
  const endY = Math.min(buffer.length, rect.y + rect.height);

  for (let y = startY; y < endY; y++) {
    // Position cursor
    const cursorY = cursorHome ? cursorHome.y + y : y + 1;
    const cursorX = cursorHome ? cursorHome.x + startX : startX + 1;
    output += `\x1b[${cursorY};${cursorX}H`;

    for (let x = startX; x < endX; x++) {
      const cell = buffer[y][x];

      if (optimizeColors) {
        if (cell.fg !== currentFg) {
          output += FG_COLORS[cell.fg];
          currentFg = cell.fg;
        }
        if (cell.bg !== currentBg) {
          output += BG_COLORS[cell.bg];
          currentBg = cell.bg;
        }
      } else {
        output += FG_COLORS[cell.fg] + BG_COLORS[cell.bg];
      }

      output += cell.char;
    }
  }

  if (includeReset) {
    output += RESET;
  }

  return output;
}

/**
 * Generate differential update (only changed cells)
 */
export function bufferDiff(
  current: BufferCell[][],
  previous: BufferCell[][],
  options: {
    cursorHome?: { x: number; y: number };
    includeReset?: boolean;
  } = {}
): string {
  const { cursorHome, includeReset = true } = options;

  let output = '';
  let currentFg: AnsiColor | null = null;
  let currentBg: AnsiColor | null = null;
  let lastX = -2;
  let lastY = -1;

  const height = Math.min(current.length, previous.length);
  const width = Math.min(current[0]?.length ?? 0, previous[0]?.length ?? 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const curr = current[y][x];
      const prev = previous[y][x];

      // Check if cell changed
      if (
        curr.char !== prev.char ||
        curr.fg !== prev.fg ||
        curr.bg !== prev.bg
      ) {
        // Position cursor if not consecutive
        if (y !== lastY || x !== lastX + 1) {
          const cursorY = cursorHome ? cursorHome.y + y : y + 1;
          const cursorX = cursorHome ? cursorHome.x + x : x + 1;
          output += `\x1b[${cursorY};${cursorX}H`;
          currentFg = null;
          currentBg = null;
        }

        // Update colors
        if (curr.fg !== currentFg) {
          output += FG_COLORS[curr.fg];
          currentFg = curr.fg;
        }
        if (curr.bg !== currentBg) {
          output += BG_COLORS[curr.bg];
          currentBg = curr.bg;
        }

        output += curr.char;
        lastX = x;
        lastY = y;
      }
    }
  }

  if (includeReset && output.length > 0) {
    output += RESET;
  }

  return output;
}

/**
 * Clone a buffer
 */
export function cloneBuffer(buffer: BufferCell[][]): BufferCell[][] {
  return buffer.map(row =>
    row.map(cell => ({ ...cell }))
  );
}

/**
 * Reset dirty flags on buffer
 */
export function resetDirtyFlags(buffer: BufferCell[][]): void {
  for (const row of buffer) {
    for (const cell of row) {
      cell.dirty = false;
    }
  }
}

/**
 * Get dirty rectangle (bounding box of all dirty cells)
 */
export function getDirtyRect(buffer: BufferCell[][]): Rect | null {
  let minX = buffer[0]?.length ?? 0;
  let minY = buffer.length;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < buffer.length; y++) {
    for (let x = 0; x < buffer[y].length; x++) {
      if (buffer[y][x].dirty) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Draw a filled rectangle to the buffer
 */
export function fillRect(
  buffer: BufferCell[][],
  rect: Rect,
  char: string,
  fg: AnsiColor,
  bg: AnsiColor
): void {
  const startX = Math.max(0, rect.x);
  const startY = Math.max(0, rect.y);
  const endX = Math.min(buffer[0]?.length ?? 0, rect.x + rect.width);
  const endY = Math.min(buffer.length, rect.y + rect.height);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      buffer[y][x].char = char;
      buffer[y][x].fg = fg;
      buffer[y][x].bg = bg;
      buffer[y][x].dirty = true;
    }
  }
}

/**
 * Draw text to the buffer
 */
export function drawText(
  buffer: BufferCell[][],
  x: number,
  y: number,
  text: string,
  fg: AnsiColor,
  bg: AnsiColor
): void {
  if (y < 0 || y >= buffer.length) return;

  for (let i = 0; i < text.length; i++) {
    const bx = x + i;
    if (bx < 0 || bx >= buffer[y].length) continue;

    buffer[y][bx].char = text[i];
    buffer[y][bx].fg = fg;
    buffer[y][bx].bg = bg;
    buffer[y][bx].dirty = true;
  }
}
