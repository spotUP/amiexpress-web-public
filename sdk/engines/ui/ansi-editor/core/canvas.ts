/**
 * Canvas utilities for ANSI art editing
 * Provides Cell-based canvas system with drawing primitives
 */

import type { Cell, Position } from '../types';

/**
 * Create a new empty canvas
 */
export function createCanvas(width: number, height: number): Cell[][] {
  const canvas: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    canvas[y] = [];
    for (let x = 0; x < width; x++) {
      canvas[y][x] = {
        char: ' ',
        fg: 7,  // White
        bg: 0,  // Black
        blink: false
      };
    }
  }
  return canvas;
}

/**
 * Clone a canvas (deep copy)
 */
export function cloneCanvas(canvas: Cell[][]): Cell[][] {
  return canvas.map(row =>
    row.map(cell => ({ ...cell }))
  );
}

/**
 * Clear canvas to default state
 */
export function clearCanvas(canvas: Cell[][], char = ' ', fg = 7, bg = 0): void {
  for (let y = 0; y < canvas.length; y++) {
    for (let x = 0; x < canvas[y].length; x++) {
      canvas[y][x] = { char, fg, bg, blink: false };
    }
  }
}

/**
 * Set a cell in the canvas
 */
export function setCell(
  canvas: Cell[][],
  x: number,
  y: number,
  cell: Cell
): void {
  if (y >= 0 && y < canvas.length && x >= 0 && x < canvas[y].length) {
    canvas[y][x] = { ...cell };
  }
}

/**
 * Get a cell from the canvas
 */
export function getCell(canvas: Cell[][], x: number, y: number): Cell | null {
  if (y >= 0 && y < canvas.length && x >= 0 && x < canvas[y].length) {
    return { ...canvas[y][x] };
  }
  return null;
}

/**
 * Check if a cell is empty (space character with default colors)
 */
export function isCellEmpty(cell: Cell): boolean {
  return cell.char === ' ' && cell.fg === 7 && cell.bg === 0 && !cell.blink;
}

/**
 * Check if position is within canvas bounds
 */
export function isInBounds(canvas: Cell[][], x: number, y: number): boolean {
  return y >= 0 && y < canvas.length && x >= 0 && x < canvas[y].length;
}

/**
 * Draw a line using Bresenham's algorithm
 */
export function drawLine(
  canvas: Cell[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: Cell
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let x = x0;
  let y = y0;

  while (true) {
    setCell(canvas, x, y, cell);

    if (x === x1 && y === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

/**
 * Draw a box (rectangle outline)
 */
export function drawBox(
  canvas: Cell[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: Cell
): void {
  // Normalize coordinates (ensure x0 <= x1, y0 <= y1)
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  // Draw top and bottom edges
  for (let x = left; x <= right; x++) {
    setCell(canvas, x, top, cell);
    setCell(canvas, x, bottom, cell);
  }

  // Draw left and right edges
  for (let y = top; y <= bottom; y++) {
    setCell(canvas, left, y, cell);
    setCell(canvas, right, y, cell);
  }
}

/**
 * Draw a filled box (rectangle)
 */
export function drawBoxFilled(
  canvas: Cell[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cell: Cell
): void {
  // Normalize coordinates
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);

  // Fill rectangle
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      setCell(canvas, x, y, cell);
    }
  }
}

/**
 * Draw an ellipse using Bresenham's algorithm
 */
export function drawEllipse(
  canvas: Cell[][],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cell: Cell
): void {
  if (rx === 0 && ry === 0) {
    setCell(canvas, cx, cy, cell);
    return;
  }

  if (rx === 0) {
    // Vertical line
    for (let y = cy - ry; y <= cy + ry; y++) {
      setCell(canvas, cx, y, cell);
    }
    return;
  }

  if (ry === 0) {
    // Horizontal line
    for (let x = cx - rx; x <= cx + rx; x++) {
      setCell(canvas, x, cy, cell);
    }
    return;
  }

  // Bresenham's ellipse algorithm
  let x = 0;
  let y = ry;

  // Region 1
  let d1 = ry * ry - rx * rx * ry + 0.25 * rx * rx;
  let dx = 2 * ry * ry * x;
  let dy = 2 * rx * rx * y;

  // Plot initial points in all quadrants
  while (dx < dy) {
    setCell(canvas, cx + x, cy + y, cell);
    setCell(canvas, cx - x, cy + y, cell);
    setCell(canvas, cx + x, cy - y, cell);
    setCell(canvas, cx - x, cy - y, cell);

    if (d1 < 0) {
      x++;
      dx += 2 * ry * ry;
      d1 += dx + ry * ry;
    } else {
      x++;
      y--;
      dx += 2 * ry * ry;
      dy -= 2 * rx * rx;
      d1 += dx - dy + ry * ry;
    }
  }

  // Region 2
  let d2 = ry * ry * (x + 0.5) * (x + 0.5) + rx * rx * (y - 1) * (y - 1) - rx * rx * ry * ry;

  while (y >= 0) {
    setCell(canvas, cx + x, cy + y, cell);
    setCell(canvas, cx - x, cy + y, cell);
    setCell(canvas, cx + x, cy - y, cell);
    setCell(canvas, cx - x, cy - y, cell);

    if (d2 > 0) {
      y--;
      dy -= 2 * rx * rx;
      d2 += rx * rx - dy;
    } else {
      y--;
      x++;
      dx += 2 * ry * ry;
      dy -= 2 * rx * rx;
      d2 += dx - dy + rx * rx;
    }
  }
}

/**
 * Draw a filled ellipse
 */
export function drawEllipseFilled(
  canvas: Cell[][],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cell: Cell
): void {
  if (rx === 0 && ry === 0) {
    setCell(canvas, cx, cy, cell);
    return;
  }

  if (rx === 0) {
    // Vertical line
    for (let y = cy - ry; y <= cy + ry; y++) {
      setCell(canvas, cx, y, cell);
    }
    return;
  }

  if (ry === 0) {
    // Horizontal line
    for (let x = cx - rx; x <= cx + rx; x++) {
      setCell(canvas, x, cy, cell);
    }
    return;
  }

  // Draw filled ellipse by drawing horizontal lines
  for (let y = -ry; y <= ry; y++) {
    const x = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));
    for (let dx = -x; dx <= x; dx++) {
      setCell(canvas, cx + dx, cy + y, cell);
    }
  }
}

/**
 * Flood fill algorithm (stack-based, non-recursive)
 */
export function floodFill(
  canvas: Cell[][],
  x: number,
  y: number,
  fillCell: Cell
): void {
  if (!isInBounds(canvas, x, y)) return;

  const targetCell = getCell(canvas, x, y);
  if (!targetCell) return;

  // Don't fill if target is same as fill
  if (cellsEqual(targetCell, fillCell)) return;

  const stack: Position[] = [{ line: y, col: x }];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const pos = stack.pop()!;
    const key = `${pos.col},${pos.line}`;

    if (visited.has(key)) continue;
    if (!isInBounds(canvas, pos.col, pos.line)) continue;

    const currentCell = getCell(canvas, pos.col, pos.line);
    if (!currentCell || !cellsEqual(currentCell, targetCell)) continue;

    visited.add(key);
    setCell(canvas, pos.col, pos.line, fillCell);

    // Add adjacent cells to stack (4-way connectivity)
    stack.push({ line: pos.line - 1, col: pos.col }); // North
    stack.push({ line: pos.line + 1, col: pos.col }); // South
    stack.push({ line: pos.line, col: pos.col - 1 }); // West
    stack.push({ line: pos.line, col: pos.col + 1 }); // East
  }
}

/**
 * Check if two cells are equal (for flood fill comparison)
 */
function cellsEqual(a: Cell, b: Cell): boolean {
  return (
    a.char === b.char &&
    a.fg === b.fg &&
    a.bg === b.bg &&
    a.blink === b.blink
  );
}

/**
 * Copy a rectangular region from one canvas to another
 */
export function copyRegion(
  srcCanvas: Cell[][],
  destCanvas: Cell[][],
  srcX: number,
  srcY: number,
  destX: number,
  destY: number,
  width: number,
  height: number
): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = getCell(srcCanvas, srcX + x, srcY + y);
      if (cell) {
        setCell(destCanvas, destX + x, destY + y, cell);
      }
    }
  }
}

/**
 * Extract a rectangular region as a new canvas
 */
export function extractRegion(
  canvas: Cell[][],
  x: number,
  y: number,
  width: number,
  height: number
): Cell[][] {
  const region = createCanvas(width, height);
  copyRegion(canvas, region, x, y, 0, 0, width, height);
  return region;
}

/**
 * Paste a canvas onto another at specified position
 */
export function pasteCanvas(
  destCanvas: Cell[][],
  srcCanvas: Cell[][],
  x: number,
  y: number
): void {
  const height = srcCanvas.length;
  const width = height > 0 ? srcCanvas[0].length : 0;
  copyRegion(srcCanvas, destCanvas, 0, 0, x, y, width, height);
}

/**
 * Mirror canvas horizontally
 */
export function mirrorHorizontal(canvas: Cell[][]): Cell[][] {
  const height = canvas.length;
  const width = height > 0 ? canvas[0].length : 0;
  const mirrored = createCanvas(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = getCell(canvas, x, y);
      if (cell) {
        setCell(mirrored, width - 1 - x, y, cell);
      }
    }
  }

  return mirrored;
}

/**
 * Mirror canvas vertically
 */
export function mirrorVertical(canvas: Cell[][]): Cell[][] {
  const height = canvas.length;
  const width = height > 0 ? canvas[0].length : 0;
  const mirrored = createCanvas(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = getCell(canvas, x, y);
      if (cell) {
        setCell(mirrored, x, height - 1 - y, cell);
      }
    }
  }

  return mirrored;
}

/**
 * Rotate canvas 90 degrees clockwise
 */
export function rotateClockwise(canvas: Cell[][]): Cell[][] {
  const height = canvas.length;
  const width = height > 0 ? canvas[0].length : 0;
  const rotated = createCanvas(height, width); // Swap dimensions

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = getCell(canvas, x, y);
      if (cell) {
        setCell(rotated, height - 1 - y, x, cell);
      }
    }
  }

  return rotated;
}

/**
 * Rotate canvas 90 degrees counter-clockwise
 */
export function rotateCounterClockwise(canvas: Cell[][]): Cell[][] {
  const height = canvas.length;
  const width = height > 0 ? canvas[0].length : 0;
  const rotated = createCanvas(height, width); // Swap dimensions

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = getCell(canvas, x, y);
      if (cell) {
        setCell(rotated, y, width - 1 - x, cell);
      }
    }
  }

  return rotated;
}

/**
 * Convert canvas to ANSI string representation
 */
export function canvasToANSI(canvas: Cell[][], useIceColors = false): string {
  let ansi = '';
  let currentFg = -1;
  let currentBg = -1;
  let currentBlink = false;

  for (let y = 0; y < canvas.length; y++) {
    for (let x = 0; x < canvas[y].length; x++) {
      const cell = canvas[y][x];

      // Optimize ANSI codes - only emit when attributes change
      const cellBlink = cell.blink ?? false;
      if (cell.fg !== currentFg || cell.bg !== currentBg || cellBlink !== currentBlink) {
        // Build ANSI escape sequence
        let codes: number[] = [];

        // Handle blink
        if (cellBlink !== currentBlink) {
          codes.push(cellBlink ? 5 : 25);
          currentBlink = cellBlink;
        }

        // Handle foreground color
        if (cell.fg !== currentFg) {
          if (cell.fg < 8) {
            codes.push(30 + cell.fg);
          } else {
            codes.push(90 + (cell.fg - 8)); // Bright colors
          }
          currentFg = cell.fg;
        }

        // Handle background color
        if (cell.bg !== currentBg) {
          if (cell.bg < 8 || !useIceColors) {
            codes.push(40 + (cell.bg % 8));
          } else {
            codes.push(100 + (cell.bg - 8)); // Bright background (iCE colors)
          }
          currentBg = cell.bg;
        }

        if (codes.length > 0) {
          ansi += `\x1b[${codes.join(';')}m`;
        }
      }

      ansi += cell.char;
    }

    // Add newline at end of each line (except last)
    if (y < canvas.length - 1) {
      ansi += '\r\n';
    }
  }

  // Reset attributes at end
  ansi += '\x1b[0m';

  return ansi;
}

/**
 * Get canvas dimensions
 */
export function getCanvasDimensions(canvas: Cell[][]): { width: number; height: number } {
  const height = canvas.length;
  const width = height > 0 ? canvas[0].length : 0;
  return { width, height };
}

/**
 * Resize canvas (crop or expand with empty cells)
 */
export function resizeCanvas(
  canvas: Cell[][],
  newWidth: number,
  newHeight: number
): Cell[][] {
  const resized = createCanvas(newWidth, newHeight);
  const height = Math.min(canvas.length, newHeight);
  const width = canvas.length > 0 ? Math.min(canvas[0].length, newWidth) : 0;

  copyRegion(canvas, resized, 0, 0, 0, 0, width, height);

  return resized;
}
