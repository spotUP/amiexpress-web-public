/**
 * Sprite Sheet Management
 *
 * Utilities for loading, creating, and extracting sprites from
 * sprite sheets (tiled collections of sprite frames).
 */

import {
  BlockFrame,
  BlockCell,
  SpriteSheetDef,
  AnsiColor,
} from './types';

/**
 * A loaded sprite sheet with extracted frames
 */
export interface SpriteSheet {
  /** Sheet name */
  name: string;
  /** Cell width in characters */
  cellWidth: number;
  /** Cell height in characters */
  cellHeight: number;
  /** Number of columns in the sheet */
  columns: number;
  /** Number of rows in the sheet */
  rows: number;
  /** Raw sheet data */
  data: BlockCell[][];
  /** Pre-extracted sprites by name */
  sprites: Map<string, BlockFrame[]>;
}

/**
 * Create a sprite sheet from data
 */
export function createSpriteSheet(def: SpriteSheetDef): SpriteSheet {
  const dataHeight = def.data.length;
  const dataWidth = def.data[0]?.length ?? 0;

  const columns = Math.floor(dataWidth / def.cellWidth);
  const rows = Math.floor(dataHeight / def.cellHeight);

  const sheet: SpriteSheet = {
    name: def.name,
    cellWidth: def.cellWidth,
    cellHeight: def.cellHeight,
    columns,
    rows,
    data: def.data,
    sprites: new Map(),
  };

  // Extract defined sprites
  for (const [name, spriteDef] of Object.entries(def.sprites)) {
    const frames: BlockFrame[] = [];

    for (const [col, row] of spriteDef.cells) {
      const frame = extractCell(sheet, col, row);
      if (frame) {
        frame.duration = spriteDef.duration;
        frame.origin = spriteDef.origin;
        frames.push(frame);
      }
    }

    sheet.sprites.set(name, frames);
  }

  return sheet;
}

/**
 * Extract a single cell from a sprite sheet
 */
export function extractCell(
  sheet: SpriteSheet,
  col: number,
  row: number
): BlockFrame | null {
  if (col < 0 || col >= sheet.columns || row < 0 || row >= sheet.rows) {
    return null;
  }

  const startX = col * sheet.cellWidth;
  const startY = row * sheet.cellHeight;

  const data: BlockCell[][] = [];

  for (let y = 0; y < sheet.cellHeight; y++) {
    const rowData: BlockCell[] = [];
    for (let x = 0; x < sheet.cellWidth; x++) {
      const cell = sheet.data[startY + y]?.[startX + x] ?? null;
      rowData.push(cell);
    }
    data.push(rowData);
  }

  return {
    width: sheet.cellWidth,
    height: sheet.cellHeight,
    data,
  };
}

/**
 * Extract a range of cells as animation frames
 */
export function extractRange(
  sheet: SpriteSheet,
  startCol: number,
  startRow: number,
  count: number,
  direction: 'horizontal' | 'vertical' = 'horizontal'
): BlockFrame[] {
  const frames: BlockFrame[] = [];

  for (let i = 0; i < count; i++) {
    const col = direction === 'horizontal' ? startCol + i : startCol;
    const row = direction === 'vertical' ? startRow + i : startRow;

    const frame = extractCell(sheet, col, row);
    if (frame) {
      frames.push(frame);
    }
  }

  return frames;
}

/**
 * Get pre-extracted sprite frames from sheet
 */
export function getSprite(sheet: SpriteSheet, name: string): BlockFrame[] | undefined {
  return sheet.sprites.get(name);
}

/**
 * Create a BlockFrame from ASCII art strings
 *
 * @param lines - Array of strings (one per row)
 * @param colorMap - Map of characters to colors
 * @param transparent - Characters to treat as transparent
 */
export function frameFromAscii(
  lines: string[],
  colorMap?: Record<string, { fg?: AnsiColor; bg?: AnsiColor }>,
  transparent: string = ' '
): BlockFrame {
  const height = lines.length;
  const width = Math.max(...lines.map(l => l.length));

  const data: BlockCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: BlockCell[] = [];
    const line = lines[y] || '';

    for (let x = 0; x < width; x++) {
      const char = line[x] || ' ';

      if (char === transparent) {
        row.push(null);
      } else if (colorMap && colorMap[char]) {
        row.push({
          char,
          fg: colorMap[char].fg,
          bg: colorMap[char].bg,
        });
      } else {
        row.push(char);
      }
    }

    data.push(row);
  }

  return {
    width,
    height,
    data,
  };
}

/**
 * Create a BlockFrame from block characters with uniform color
 */
export function frameFromBlocks(
  lines: string[],
  fg?: AnsiColor,
  bg?: AnsiColor
): BlockFrame {
  const height = lines.length;
  const width = Math.max(...lines.map(l => l.length));

  const data: BlockCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: BlockCell[] = [];
    const line = lines[y] || '';

    for (let x = 0; x < width; x++) {
      const char = line[x] || ' ';

      if (char === ' ') {
        row.push(null);
      } else {
        row.push({
          char,
          fg,
          bg,
        });
      }
    }

    data.push(row);
  }

  return {
    width,
    height,
    data,
  };
}

/**
 * Create a colored BlockFrame from data arrays
 *
 * @param chars - 2D array of characters
 * @param fgColors - 2D array of foreground colors (optional)
 * @param bgColors - 2D array of background colors (optional)
 */
export function frameFromArrays(
  chars: string[][],
  fgColors?: (AnsiColor | null)[][],
  bgColors?: (AnsiColor | null)[][]
): BlockFrame {
  const height = chars.length;
  const width = Math.max(...chars.map(r => r.length));

  const data: BlockCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: BlockCell[] = [];

    for (let x = 0; x < width; x++) {
      const char = chars[y]?.[x] ?? ' ';
      const fg = fgColors?.[y]?.[x] ?? undefined;
      const bg = bgColors?.[y]?.[x] ?? undefined;

      if (char === ' ' && !fg && !bg) {
        row.push(null);
      } else if (fg || bg) {
        row.push({ char, fg: fg ?? undefined, bg: bg ?? undefined });
      } else {
        row.push(char);
      }
    }

    data.push(row);
  }

  return {
    width,
    height,
    data,
  };
}

/**
 * Flip a frame horizontally
 */
export function flipFrameH(frame: BlockFrame): BlockFrame {
  return {
    ...frame,
    data: frame.data.map(row => [...row].reverse()),
  };
}

/**
 * Flip a frame vertically
 */
export function flipFrameV(frame: BlockFrame): BlockFrame {
  return {
    ...frame,
    data: [...frame.data].reverse(),
  };
}

/**
 * Rotate a frame 90 degrees clockwise
 */
export function rotateFrame90(frame: BlockFrame): BlockFrame {
  const newWidth = frame.height;
  const newHeight = frame.width;
  const data: BlockCell[][] = [];

  for (let y = 0; y < newHeight; y++) {
    const row: BlockCell[] = [];
    for (let x = 0; x < newWidth; x++) {
      row.push(frame.data[newWidth - 1 - x]?.[y] ?? null);
    }
    data.push(row);
  }

  return {
    width: newWidth,
    height: newHeight,
    data,
    duration: frame.duration,
    origin: frame.origin ? { x: frame.origin.y, y: frame.origin.x } : undefined,
  };
}

/**
 * Scale a frame by integer factor
 */
export function scaleFrame(frame: BlockFrame, factor: number): BlockFrame {
  if (factor <= 0) factor = 1;
  factor = Math.floor(factor);

  const newWidth = frame.width * factor;
  const newHeight = frame.height * factor;
  const data: BlockCell[][] = [];

  for (let y = 0; y < newHeight; y++) {
    const row: BlockCell[] = [];
    const srcY = Math.floor(y / factor);

    for (let x = 0; x < newWidth; x++) {
      const srcX = Math.floor(x / factor);
      row.push(frame.data[srcY]?.[srcX] ?? null);
    }

    data.push(row);
  }

  return {
    width: newWidth,
    height: newHeight,
    data,
    duration: frame.duration,
    origin: frame.origin
      ? { x: frame.origin.x * factor, y: frame.origin.y * factor }
      : undefined,
  };
}

/**
 * Recolor a frame
 */
export function recolorFrame(
  frame: BlockFrame,
  fg?: AnsiColor,
  bg?: AnsiColor
): BlockFrame {
  return {
    ...frame,
    data: frame.data.map(row =>
      row.map(cell => {
        if (cell === null) return null;
        if (typeof cell === 'string') {
          return { char: cell, fg, bg };
        }
        return {
          ...cell,
          fg: fg ?? cell.fg,
          bg: bg ?? cell.bg,
        };
      })
    ),
  };
}

/**
 * Combine two frames (overlay second on first)
 */
export function overlayFrames(base: BlockFrame, overlay: BlockFrame, offsetX: number = 0, offsetY: number = 0): BlockFrame {
  const width = Math.max(base.width, overlay.width + offsetX);
  const height = Math.max(base.height, overlay.height + offsetY);

  const data: BlockCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: BlockCell[] = [];

    for (let x = 0; x < width; x++) {
      // Check overlay first
      const ox = x - offsetX;
      const oy = y - offsetY;

      if (ox >= 0 && ox < overlay.width && oy >= 0 && oy < overlay.height) {
        const overlayCell = overlay.data[oy]?.[ox];
        if (overlayCell !== null) {
          row.push(overlayCell);
          continue;
        }
      }

      // Fall back to base
      row.push(base.data[y]?.[x] ?? null);
    }

    data.push(row);
  }

  return {
    width,
    height,
    data,
    duration: base.duration,
    origin: base.origin,
  };
}
