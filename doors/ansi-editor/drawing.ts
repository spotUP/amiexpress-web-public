/**
 * Drawing tools module for ANSI Editor
 * Handles brush modes, line drawing, box drawing, ellipses, flood fill, and color picker
 */

import { Cell, BrushMode, Tool } from './types';

// Drawing context interface - contains all state needed by drawing operations
export interface DrawingContext {
  // Canvas state
  canvas: Cell[][];
  width: number;
  height: number;

  // Cursor state
  cursorX: number;
  cursorY: number;

  // Drawing state
  currentFg: number;
  currentBg: number;
  currentChar: string;
  currentTool: Tool;

  // Brush state
  brushSize: number;
  brushMode: BrushMode;

  // Mirror mode
  mirrorModeEnabled: boolean;

  // Guide overlay
  guideOverlayEnabled: boolean;
  guideType: 'none' | '80x25' | '80x40' | '44x22' | 'grid';
  gridSpacing: number;

  // Numpad mode
  numpadModeEnabled: boolean;

  // File state
  modified: boolean;

  // Methods needed
  refresh: () => void;
  showStatusBar: () => void;
  emit: (data: string) => void;
  moveCursor: (x: number, y: number) => void;
  setColors: (fg: number, bg: number) => void;
  saveUndoState: (chunk?: boolean) => void;
}

// ========== BRUSH SYSTEM ==========

/**
 * Draw with brush - supports brush size and different brush modes
 * @param ctx - Drawing context
 * @param centerX - Center X coordinate of brush
 * @param centerY - Center Y coordinate of brush
 * @param useBg - If true, use background color (right-click behavior)
 */
export function drawWithBrush(ctx: DrawingContext, centerX: number, centerY: number, useBg: boolean = false): void {
  const halfSize = Math.floor(ctx.brushSize / 2);

  for (let dy = -halfSize; dy <= halfSize; dy++) {
    for (let dx = -halfSize; dx <= halfSize; dx++) {
      const x = centerX + dx;
      const y = centerY + dy;

      // Skip out of bounds
      if (x < 0 || x >= ctx.width || y < 0 || y >= 22) continue;

      // Apply brush mode
      applyBrushMode(ctx, x, y, useBg);
    }
  }

  ctx.modified = true;
}

/**
 * Apply brush mode to a single cell
 */
export function applyBrushMode(ctx: DrawingContext, x: number, y: number, useBg: boolean): void {
  const cell = ctx.canvas[y][x];

  switch (ctx.brushMode) {
    case 'half-block':
      // Half-block mode: draw with current character
      ctx.canvas[y][x] = {
        char: ctx.currentChar,
        fg: useBg ? ctx.currentBg : ctx.currentFg,
        bg: useBg ? ctx.currentFg : ctx.currentBg
      };
      break;

    case 'shading':
      // Progressive shading: 176 → 177 → 178 → 219 (light → dark)
      const shadingChars = [' ', String.fromCharCode(176), String.fromCharCode(177), String.fromCharCode(178), String.fromCharCode(219)];
      let currentIndex = shadingChars.indexOf(cell.char);
      if (currentIndex === -1) currentIndex = 0;

      if (useBg) {
        // Right-click: decrease shading
        currentIndex = Math.max(0, currentIndex - 1);
      } else {
        // Left-click: increase shading
        currentIndex = Math.min(shadingChars.length - 1, currentIndex + 1);
      }

      ctx.canvas[y][x] = {
        char: shadingChars[currentIndex],
        fg: ctx.currentFg,
        bg: ctx.currentBg
      };
      break;

    case 'colorize':
      // Colorize mode: change colors only, preserve character
      if (useBg) {
        // Right-click: change background only
        ctx.canvas[y][x].bg = ctx.currentBg;
      } else {
        // Left-click: change foreground and background
        ctx.canvas[y][x].fg = ctx.currentFg;
        ctx.canvas[y][x].bg = ctx.currentBg;
      }
      break;

    case 'custom':
      // Custom character mode: same as half-block but explicitly named
      ctx.canvas[y][x] = {
        char: ctx.currentChar,
        fg: useBg ? ctx.currentBg : ctx.currentFg,
        bg: useBg ? ctx.currentFg : ctx.currentBg
      };
      break;

    case 'blink':
      // Blink mode: toggle blink attribute (colors 8-15)
      // Note: iCE colors must be enabled for this to work
      if (useBg) {
        // Right-click: remove blink (colors 8-15 → 0-7)
        if (cell.fg >= 8) ctx.canvas[y][x].fg = cell.fg - 8;
        if (cell.bg >= 8) ctx.canvas[y][x].bg = cell.bg - 8;
      } else {
        // Left-click: add blink (colors 0-7 → 8-15)
        if (cell.fg < 8) ctx.canvas[y][x].fg = cell.fg + 8;
        if (cell.bg < 8) ctx.canvas[y][x].bg = cell.bg + 8;
      }
      break;

    case 'replace':
      // Replace background with foreground color
      ctx.canvas[y][x].bg = ctx.currentFg;
      break;
  }
}

/**
 * Legacy drawCell method - kept for compatibility with line/box tools
 * Now supports mirror mode (horizontal symmetry)
 */
export function drawCell(ctx: DrawingContext, x: number, y: number): void {
  if (x < 0 || x >= ctx.width || y < 0 || y >= 22) return;

  ctx.canvas[y][x] = {
    char: ctx.currentChar,
    fg: ctx.currentFg,
    bg: ctx.currentBg
  };

  ctx.moveCursor(x, y);
  ctx.setColors(ctx.currentFg, ctx.currentBg);
  ctx.emit(ctx.currentChar);
  ctx.modified = true;

  // Mirror mode: Draw at mirrored position (horizontal symmetry)
  if (ctx.mirrorModeEnabled) {
    const mirrorX = ctx.width - 1 - x;  // Mirror across vertical center
    if (mirrorX !== x && mirrorX >= 0 && mirrorX < ctx.width) {
      ctx.canvas[y][mirrorX] = {
        char: ctx.currentChar,
        fg: ctx.currentFg,
        bg: ctx.currentBg
      };
      ctx.moveCursor(mirrorX, y);
      ctx.setColors(ctx.currentFg, ctx.currentBg);
      ctx.emit(ctx.currentChar);
    }
  }
}

/**
 * Check if cell should show a guide overlay
 */
export function isGuideOverlayCell(ctx: DrawingContext, x: number, y: number): boolean {
  if (!ctx.guideOverlayEnabled) return false;

  switch (ctx.guideType) {
    case '80x25':
      // Standard BBS screen: border at edges
      return x === 0 || x === 79 || y === 0 || y === 21;

    case '80x40':
      // Double-height screen: border at edges and midline
      return x === 0 || x === 79 || y === 0 || y === 21 || y === 11;

    case '44x22':
      // Amiga screen size (44 columns): vertical borders at columns 18 and 61
      return (x === 18 || x === 61) || y === 0 || y === 21;

    case 'grid':
      // Custom grid with configurable spacing
      return (x % ctx.gridSpacing === 0) || (y % ctx.gridSpacing === 0);

    default:
      return false;
  }
}

/**
 * Toggle mirror mode (horizontal symmetry drawing)
 */
export function toggleMirrorMode(ctx: DrawingContext): void {
  ctx.mirrorModeEnabled = !ctx.mirrorModeEnabled;
  ctx.refresh();
}

/**
 * Cycle through guide overlay types
 */
export function cycleGuideOverlay(ctx: DrawingContext): void {
  const types: Array<'none' | '80x25' | '80x40' | '44x22' | 'grid'> = ['none', '80x25', '80x40', '44x22', 'grid'];
  const currentIndex = types.indexOf(ctx.guideType);
  const nextIndex = (currentIndex + 1) % types.length;
  ctx.guideType = types[nextIndex];
  ctx.guideOverlayEnabled = ctx.guideType !== 'none';
  ctx.refresh();
}

/**
 * Toggle numpad drawing mode (Phase 9.2)
 * When enabled, keyboard keys (7-9, u-o, j-l) act as numpad directions
 */
export function toggleNumpadMode(ctx: DrawingContext): void {
  ctx.numpadModeEnabled = !ctx.numpadModeEnabled;
  ctx.refresh();
}

/**
 * Handle numpad drawing (keyboard-based directional drawing)
 * Maps keyboard keys to numpad directions:
 *   7 8 9  (up-left, up, up-right)
 *   u i o  (left, stay, right)
 *   j k l  (down-left, down, down-right)
 * Returns true if key was handled
 */
export function handleNumpadDraw(ctx: DrawingContext, key: string): boolean {
  // Map keys to direction deltas
  const dirMap: { [key: string]: { dx: number; dy: number } } = {
    // Top row: 7 8 9
    '7': { dx: -1, dy: -1 },  // up-left
    '8': { dx:  0, dy: -1 },  // up
    '9': { dx:  1, dy: -1 },  // up-right
    // Middle row: u i o
    'u': { dx: -1, dy:  0 },  // left
    'i': { dx:  0, dy:  0 },  // center (draw without moving)
    'o': { dx:  1, dy:  0 },  // right
    // Bottom row: j k l
    'j': { dx: -1, dy:  1 },  // down-left
    'k': { dx:  0, dy:  1 },  // down
    'l': { dx:  1, dy:  1 },  // down-right
  };

  const dir = dirMap[key.toLowerCase()];
  if (!dir) return false;

  // Draw at current position
  ctx.saveUndoState(true);  // Chunked undo for continuous drawing
  drawCell(ctx, ctx.cursorX, ctx.cursorY);

  // Move cursor in the specified direction
  ctx.cursorX = Math.max(0, Math.min(ctx.width - 1, ctx.cursorX + dir.dx));
  ctx.cursorY = Math.max(0, Math.min(22 - 1, ctx.cursorY + dir.dy));

  ctx.refresh();
  return true;
}

// ========== LINE DRAWING ==========

/**
 * Draw line using Bresenham's line algorithm
 */
export function drawLine(ctx: DrawingContext, x1: number, y1: number, x2: number, y2: number): void {
  // Bresenham's line algorithm
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  let x = x1;
  let y = y1;

  while (true) {
    drawCell(ctx, x, y);

    if (x === x2 && y === y2) break;

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

// ========== BOX DRAWING ==========

/**
 * Draw box outline
 */
export function drawBox(ctx: DrawingContext, x1: number, y1: number, x2: number, y2: number): void {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);

  // Top and bottom
  for (let x = left; x <= right; x++) {
    drawCell(ctx, x, top);
    drawCell(ctx, x, bottom);
  }

  // Left and right
  for (let y = top; y <= bottom; y++) {
    drawCell(ctx, left, y);
    drawCell(ctx, right, y);
  }
}

// ========== ELLIPSE DRAWING ==========

/**
 * Draw ellipse outline using midpoint ellipse algorithm
 */
export function drawEllipse(ctx: DrawingContext, cx: number, cy: number, rx: number, ry: number): void {
  // Midpoint ellipse algorithm
  let x = 0;
  let y = ry;

  // Region 1
  let d1 = (ry * ry) - (rx * rx * ry) + (0.25 * rx * rx);
  let dx = 2 * ry * ry * x;
  let dy = 2 * rx * rx * y;

  // Plot 4-way symmetric points for region 1
  while (dx < dy) {
    drawEllipsePoints(ctx, cx, cy, x, y);

    if (d1 < 0) {
      x++;
      dx = dx + (2 * ry * ry);
      d1 = d1 + dx + (ry * ry);
    } else {
      x++;
      y--;
      dx = dx + (2 * ry * ry);
      dy = dy - (2 * rx * rx);
      d1 = d1 + dx - dy + (ry * ry);
    }
  }

  // Region 2
  let d2 = ((ry * ry) * ((x + 0.5) * (x + 0.5))) + ((rx * rx) * ((y - 1) * (y - 1))) - (rx * rx * ry * ry);

  while (y >= 0) {
    drawEllipsePoints(ctx, cx, cy, x, y);

    if (d2 > 0) {
      y--;
      dy = dy - (2 * rx * rx);
      d2 = d2 + (rx * rx) - dy;
    } else {
      y--;
      x++;
      dx = dx + (2 * ry * ry);
      dy = dy - (2 * rx * rx);
      d2 = d2 + dx - dy + (rx * rx);
    }
  }
}

/**
 * Draw 4-way symmetric ellipse points
 */
export function drawEllipsePoints(ctx: DrawingContext, cx: number, cy: number, x: number, y: number): void {
  drawCell(ctx, cx + x, cy + y);
  drawCell(ctx, cx - x, cy + y);
  drawCell(ctx, cx + x, cy - y);
  drawCell(ctx, cx - x, cy - y);
}

/**
 * Draw filled ellipse using scan-line algorithm
 */
export function drawEllipseFilled(ctx: DrawingContext, cx: number, cy: number, rx: number, ry: number): void {
  // Draw horizontal scan lines
  for (let y = -ry; y <= ry; y++) {
    // Calculate x based on ellipse equation: (x/rx)² + (y/ry)² = 1
    // Solving for x: x = rx * sqrt(1 - (y/ry)²)
    const x = Math.floor(rx * Math.sqrt(1 - (y * y) / (ry * ry)));

    // Draw horizontal line from -x to +x
    for (let dx = -x; dx <= x; dx++) {
      drawCell(ctx, cx + dx, cy + y);
    }
  }
}

// ========== SHIFTER TOOL ==========

/**
 * Shifter tool: shift half-blocks left/right or clear
 * CP437 chars: 221 (left half), 222 (right half), 219 (full block), 32 (space)
 */
export function shiftCell(ctx: DrawingContext, direction: 'left' | 'right', clear: boolean = false): void {
  const x = ctx.cursorX;
  const y = ctx.cursorY;

  if (x < 0 || x >= ctx.width || y < 0 || y >= 22) return;

  const cell = ctx.canvas[y][x];
  const charCode = cell.char.charCodeAt(0);

  if (clear) {
    // Shift+Arrow: Clear to space
    ctx.canvas[y][x] = { char: ' ', fg: cell.fg, bg: cell.bg };
  } else {
    // Arrow only: Shift blocks
    if (direction === 'left') {
      // Left arrow: 222→221, 219→221, space→221
      if (charCode === 222 || charCode === 219 || charCode === 32) {
        ctx.canvas[y][x] = { char: String.fromCharCode(221), fg: ctx.currentFg, bg: ctx.currentBg };
      }
    } else if (direction === 'right') {
      // Right arrow: 221→222, 219→222, space→222
      if (charCode === 221 || charCode === 219 || charCode === 32) {
        ctx.canvas[y][x] = { char: String.fromCharCode(222), fg: ctx.currentFg, bg: ctx.currentBg };
      }
    }
  }
}

// ========== FLOOD FILL ==========

/**
 * Flood fill with current color/character
 */
export function floodFill(ctx: DrawingContext, x: number, y: number): void {
  if (x < 0 || x >= ctx.width || y < 0 || y >= 22) return;

  const targetCell = ctx.canvas[y][x];
  const target = `${targetCell.char}:${targetCell.fg}:${targetCell.bg}`;
  const replacement = `${ctx.currentChar}:${ctx.currentFg}:${ctx.currentBg}`;

  if (target === replacement) return;

  const stack: Array<{x: number, y: number}> = [{x, y}];
  const visited = new Set<string>();

  while (stack.length > 0) {
    const pos = stack.pop()!;
    const key = `${pos.x},${pos.y}`;

    if (visited.has(key)) continue;
    if (pos.x < 0 || pos.x >= ctx.width || pos.y < 0 || pos.y >= 22) continue;

    const cell = ctx.canvas[pos.y][pos.x];
    const current = `${cell.char}:${cell.fg}:${cell.bg}`;

    if (current !== target) continue;

    visited.add(key);
    drawCell(ctx, pos.x, pos.y);

    // Add neighbors
    stack.push({x: pos.x + 1, y: pos.y});
    stack.push({x: pos.x - 1, y: pos.y});
    stack.push({x: pos.x, y: pos.y + 1});
    stack.push({x: pos.x, y: pos.y - 1});
  }
}

// ========== COLOR PICKER ==========

/**
 * Pick cell attributes (color picker tool)
 */
export function pickCell(ctx: DrawingContext, x: number, y: number): void {
  if (x < 0 || x >= ctx.width || y < 0 || y >= 22) return;

  const cell = ctx.canvas[y][x];
  ctx.currentChar = cell.char;
  ctx.currentFg = cell.fg;
  ctx.currentBg = cell.bg;

  ctx.showStatusBar();
}
