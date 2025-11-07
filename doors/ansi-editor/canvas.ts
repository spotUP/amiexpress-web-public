/**
 * Canvas operations module for ANSI Editor
 * Handles undo/redo, selection, copy/paste, transformations, and canvas manipulations
 */

import { Cell, Point, SelectionBounds, OperationMode } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Editor context interface - contains all state needed by canvas operations
export interface EditorContext {
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

  // Undo/redo stacks
  undoStack: Cell[][][];
  redoStack: Cell[][][];
  maxUndoLevels: number;

  // Chunked undo
  lastUndoTime: number;
  undoChunkTimeout: number;
  pendingUndoChunk: boolean;

  // Selection state
  selecting: boolean;
  selectionStart: Point | null;
  selectionEnd: Point | null;
  clipboard: Cell[][];
  operationMode: OperationMode;

  // File state
  modified: boolean;

  // Methods needed
  refresh: () => void;
  showStatusBar: () => void;
  emit: (data: string) => void;
  getInput: () => Promise<string>;
  sleep: (ms: number) => Promise<void>;
}

// ========== UNDO/REDO SYSTEM ==========

export function saveUndoState(ctx: EditorContext, chunk: boolean = false): void {
  const now = Date.now();

  // Chunked undo: Group rapid consecutive operations
  if (chunk) {
    // If within chunk timeout, skip saving (we'll save when chunk ends)
    if (now - ctx.lastUndoTime < ctx.undoChunkTimeout) {
      ctx.pendingUndoChunk = true;
      ctx.lastUndoTime = now;
      return;
    }

    // Chunk timeout expired - save if we had pending operations
    if (ctx.pendingUndoChunk) {
      // Fall through to save state
      ctx.pendingUndoChunk = false;
    }
  }

  // Save current canvas state to undo stack
  const snapshot: Cell[][] = [];
  for (let y = 0; y < ctx.height; y++) {
    snapshot[y] = [];
    for (let x = 0; x < ctx.width; x++) {
      snapshot[y][x] = { ...ctx.canvas[y][x] };
    }
  }
  ctx.undoStack.push(snapshot);
  if (ctx.undoStack.length > ctx.maxUndoLevels) {
    ctx.undoStack.shift();
  }
  // Clear redo stack when new action is performed
  ctx.redoStack = [];
  ctx.modified = true;
  ctx.lastUndoTime = now;
}

/**
 * Force save any pending chunked undo operations
 * Call this when switching tools, exiting modes, etc.
 */
export function flushUndoChunk(ctx: EditorContext): void {
  if (ctx.pendingUndoChunk) {
    ctx.pendingUndoChunk = false;
    // Save the current state
    const snapshot: Cell[][] = [];
    for (let y = 0; y < ctx.height; y++) {
      snapshot[y] = [];
      for (let x = 0; x < ctx.width; x++) {
        snapshot[y][x] = { ...ctx.canvas[y][x] };
      }
    }
    ctx.undoStack.push(snapshot);
    if (ctx.undoStack.length > ctx.maxUndoLevels) {
      ctx.undoStack.shift();
    }
    ctx.redoStack = [];
    ctx.modified = true;
  }
}

export function undo(ctx: EditorContext): void {
  // Flush any pending chunks before undo
  flushUndoChunk(ctx);

  if (ctx.undoStack.length === 0) return;

  // Save current state to redo stack
  const current: Cell[][] = [];
  for (let y = 0; y < ctx.height; y++) {
    current[y] = [];
    for (let x = 0; x < ctx.width; x++) {
      current[y][x] = { ...ctx.canvas[y][x] };
    }
  }
  ctx.redoStack.push(current);

  // Restore previous state
  const prev = ctx.undoStack.pop()!;
  ctx.canvas = prev;
  ctx.refresh();
}

export function redo(ctx: EditorContext): void {
  // Flush any pending chunks before redo
  flushUndoChunk(ctx);

  if (ctx.redoStack.length === 0) return;

  // Save current state to undo stack
  const current: Cell[][] = [];
  for (let y = 0; y < ctx.height; y++) {
    current[y] = [];
    for (let x = 0; x < ctx.width; x++) {
      current[y][x] = { ...ctx.canvas[y][x] };
    }
  }
  ctx.undoStack.push(current);

  // Restore next state
  const next = ctx.redoStack.pop()!;
  ctx.canvas = next;
  ctx.refresh();
}

// ========== SELECTION SYSTEM ==========

export function startSelection(ctx: EditorContext): void {
  // Flush any pending chunks before starting selection
  flushUndoChunk(ctx);
  ctx.selecting = true;
  ctx.selectionStart = { x: ctx.cursorX, y: ctx.cursorY };
  ctx.selectionEnd = { x: ctx.cursorX, y: ctx.cursorY };
}

export function updateSelection(ctx: EditorContext): void {
  if (ctx.selecting) {
    ctx.selectionEnd = { x: ctx.cursorX, y: ctx.cursorY };
  }
}

export function getSelectionBounds(ctx: EditorContext): SelectionBounds | null {
  if (!ctx.selectionStart || !ctx.selectionEnd) return null;
  return {
    x1: Math.min(ctx.selectionStart.x, ctx.selectionEnd.x),
    y1: Math.min(ctx.selectionStart.y, ctx.selectionEnd.y),
    x2: Math.max(ctx.selectionStart.x, ctx.selectionEnd.x),
    y2: Math.max(ctx.selectionStart.y, ctx.selectionEnd.y)
  };
}

export function copySelection(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  ctx.clipboard = [];
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    const row: Cell[] = [];
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      row.push({ ...ctx.canvas[y][x] });
    }
    ctx.clipboard.push(row);
  }
}

export function cutSelection(ctx: EditorContext): void {
  saveUndoState(ctx);
  copySelection(ctx);
  eraseSelection(ctx);
}

export function eraseSelection(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      ctx.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
    }
  }
  clearSelection(ctx);
  ctx.refresh();
}

export function pasteSelection(ctx: EditorContext): void {
  if (ctx.clipboard.length === 0) return;

  saveUndoState(ctx);
  for (let y = 0; y < ctx.clipboard.length; y++) {
    for (let x = 0; x < ctx.clipboard[y].length; x++) {
      const targetY = ctx.cursorY + y;
      const targetX = ctx.cursorX + x;
      if (targetY < 22 && targetX < ctx.width) {
        ctx.canvas[targetY][targetX] = { ...ctx.clipboard[y][x] };
      }
    }
  }
  ctx.refresh();
}

/**
 * Import file as selection (loads into clipboard for pasting)
 * Supports: ANS, XB, BIN, ASC, TXT
 */
export async function importFileAsSelection(ctx: EditorContext): Promise<boolean> {
  ctx.emit('\r\n\r\nFilename to import (no path): ');

  const filename = await ctx.getInput();
  if (!filename || filename.length === 0) {
    ctx.emit('\x1b[31mImport cancelled.\x1b[0m\r\n');
    await ctx.sleep(1000);
    return false;
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../backend/data/bbs');
  const filepath = path.join(dataDir, 'BBS', 'Screens', filename);

  if (!fs.existsSync(filepath)) {
    ctx.emit(`\x1b[31mFile not found: ${filename}\x1b[0m\r\n`);
    await ctx.sleep(2000);
    return false;
  }

  try {
    const content = fs.readFileSync(filepath, 'utf8');

    // Parse into temporary canvas
    const tempCanvas: Cell[][] = [];
    for (let y = 0; y < 22; y++) {
      tempCanvas[y] = [];
      for (let x = 0; x < ctx.width; x++) {
        tempCanvas[y][x] = { char: ' ', fg: 7, bg: 0 };
      }
    }

    // Parse ANSI into temp canvas
    let x = 0;
    let y = 0;
    let currentFg = 7;
    let currentBg = 0;
    let inEscape = false;
    let escapeSeq = '';

    for (let i = 0; i < content.length; i++) {
      const char = content[i];

      if (inEscape) {
        escapeSeq += char;
        if (char === 'm') {
          // Parse color codes
          const matches = escapeSeq.match(/\[([0-9;]+)m/);
          if (matches) {
            const codes = matches[1].split(';');
            for (const code of codes) {
              const num = parseInt(code);
              if (num === 0) {
                currentFg = 7;
                currentBg = 0;
              } else if (num >= 30 && num <= 37) {
                currentFg = num - 30;
              } else if (num >= 40 && num <= 47) {
                currentBg = num - 40;
              }
            }
          }
          inEscape = false;
          escapeSeq = '';
        }
      } else if (char === '\x1b') {
        inEscape = true;
        escapeSeq = '';
      } else if (char === '\r') {
        // Ignore CR
      } else if (char === '\n') {
        y++;
        x = 0;
        if (y >= 22) break;
      } else {
        if (y < 22 && x < ctx.width) {
          tempCanvas[y][x] = { char, fg: currentFg, bg: currentBg };
          x++;
        }
      }
    }

    // Find bounding box of non-space content
    let minX = ctx.width, maxX = -1, minY = 22, maxY = -1;
    for (let cy = 0; cy < 22; cy++) {
      for (let cx = 0; cx < ctx.width; cx++) {
        if (tempCanvas[cy][cx].char !== ' ' || tempCanvas[cy][cx].bg !== 0) {
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
        }
      }
    }

    // If nothing found, use entire canvas
    if (maxX === -1) {
      minX = 0;
      maxX = ctx.width - 1;
      minY = 0;
      maxY = 21;
    }

    // Extract to clipboard
    ctx.clipboard = [];
    for (let cy = minY; cy <= maxY; cy++) {
      const row: Cell[] = [];
      for (let cx = minX; cx <= maxX; cx++) {
        row.push({ ...tempCanvas[cy][cx] });
      }
      ctx.clipboard.push(row);
    }

    const width = maxX - minX + 1;
    const height = maxY - minY + 1;

    ctx.emit(`\x1b[32mImported: ${filename} (${width}x${height}) - use Ctrl+V to paste\x1b[0m\r\n`);
    await ctx.sleep(2000);
    return true;

  } catch (error) {
    ctx.emit(`\x1b[31mError importing: ${error}\x1b[0m\r\n`);
    await ctx.sleep(2000);
    return false;
  }
}

/**
 * Export selection to file
 * Supports: ANS, XB, BIN
 */
export async function exportSelectionToFile(ctx: EditorContext): Promise<boolean> {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) {
    ctx.emit('\r\n\x1b[31mNo selection to export.\x1b[0m\r\n');
    await ctx.sleep(1500);
    return false;
  }

  ctx.emit('\r\n\r\nFilename to export (no path): ');

  const filename = await ctx.getInput();
  if (!filename || filename.length === 0) {
    ctx.emit('\x1b[31mExport cancelled.\x1b[0m\r\n');
    await ctx.sleep(1000);
    return false;
  }

  const dataDir = process.env.DATA_DIR || path.join(__dirname, '../../backend/data/bbs');
  const screensDir = path.join(dataDir, 'BBS', 'Screens');

  if (!fs.existsSync(screensDir)) {
    fs.mkdirSync(screensDir, { recursive: true });
  }

  const filepath = path.join(screensDir, filename);

  try {
    // Convert selection to ANSI
    let ansi = '';
    let lastFg = -1;
    let lastBg = -1;

    for (let y = bounds.y1; y <= bounds.y2; y++) {
      for (let x = bounds.x1; x <= bounds.x2; x++) {
        const cell = ctx.canvas[y][x];

        // Only emit color codes when colors change
        if (cell.fg !== lastFg || cell.bg !== lastBg) {
          ansi += `\x1b[0;3${cell.fg};4${cell.bg}m`;
          lastFg = cell.fg;
          lastBg = cell.bg;
        }

        ansi += cell.char;
      }
      ansi += '\r\n';
    }

    ansi += '\x1b[0m';  // Reset at end

    fs.writeFileSync(filepath, ansi, 'utf8');

    const width = bounds.x2 - bounds.x1 + 1;
    const height = bounds.y2 - bounds.y1 + 1;

    ctx.emit(`\x1b[32mExported: ${filename} (${width}x${height})\x1b[0m\r\n`);
    await ctx.sleep(1500);
    return true;

  } catch (error) {
    ctx.emit(`\x1b[31mError exporting: ${error}\x1b[0m\r\n`);
    await ctx.sleep(2000);
    return false;
  }
}

export function clearSelection(ctx: EditorContext): void {
  ctx.selecting = false;
  ctx.selectionStart = null;
  ctx.selectionEnd = null;
}

/**
 * Fill selection with current foreground color
 */
export function fillSelection(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  saveUndoState(ctx);
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      // Fill with current foreground color as background
      ctx.canvas[y][x].bg = ctx.currentFg;
    }
  }
  clearSelection(ctx);
  ctx.refresh();
}

/**
 * Rotate selection 90 degrees clockwise
 */
export function rotateSelection(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  saveUndoState(ctx);

  // Extract selection into temp array
  const width = bounds.x2 - bounds.x1 + 1;
  const height = bounds.y2 - bounds.y1 + 1;
  const temp: Cell[][] = [];
  for (let y = 0; y < height; y++) {
    temp[y] = [];
    for (let x = 0; x < width; x++) {
      temp[y][x] = { ...ctx.canvas[bounds.y1 + y][bounds.x1 + x] };
    }
  }

  // Rotate: new[x][height-1-y] = old[y][x]
  const rotated: Cell[][] = [];
  for (let x = 0; x < width; x++) {
    rotated[x] = [];
    for (let y = 0; y < height; y++) {
      rotated[x][y] = temp[height - 1 - y][x];
    }
  }

  // Store rotated selection in clipboard
  ctx.clipboard = rotated;
  clearSelection(ctx);
  ctx.refresh();
}

/**
 * Flip selection horizontally
 */
export function flipSelectionX(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  saveUndoState(ctx);
  const width = bounds.x2 - bounds.x1 + 1;

  for (let y = bounds.y1; y <= bounds.y2; y++) {
    for (let x = 0; x < Math.floor(width / 2); x++) {
      const temp = ctx.canvas[y][bounds.x1 + x];
      ctx.canvas[y][bounds.x1 + x] = ctx.canvas[y][bounds.x2 - x];
      ctx.canvas[y][bounds.x2 - x] = temp;
    }
  }
  ctx.refresh();
}

/**
 * Flip selection vertically
 */
export function flipSelectionY(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  saveUndoState(ctx);
  const height = bounds.y2 - bounds.y1 + 1;

  for (let y = 0; y < Math.floor(height / 2); y++) {
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      const temp = ctx.canvas[bounds.y1 + y][x];
      ctx.canvas[bounds.y1 + y][x] = ctx.canvas[bounds.y2 - y][x];
      ctx.canvas[bounds.y2 - y][x] = temp;
    }
  }
  ctx.refresh();
}

/**
 * Center selection horizontally on canvas
 */
export function centerSelection(ctx: EditorContext): void {
  const bounds = getSelectionBounds(ctx);
  if (!bounds) return;

  saveUndoState(ctx);

  const selWidth = bounds.x2 - bounds.x1 + 1;
  const targetX = Math.floor((ctx.width - selWidth) / 2);

  // If already centered, nothing to do
  if (targetX === bounds.x1) {
    return;
  }

  const offset = targetX - bounds.x1;

  // Extract selection
  const temp: Cell[][] = [];
  for (let y = bounds.y1; y <= bounds.y2; y++) {
    const row: Cell[] = [];
    for (let x = bounds.x1; x <= bounds.x2; x++) {
      row.push({ ...ctx.canvas[y][x] });
      // Clear original position
      ctx.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
    }
    temp.push(row);
  }

  // Place at centered position
  for (let y = 0; y < temp.length; y++) {
    for (let x = 0; x < temp[y].length; x++) {
      const targetXPos = targetX + x;
      if (targetXPos >= 0 && targetXPos < ctx.width) {
        ctx.canvas[bounds.y1 + y][targetXPos] = temp[y][x];
      }
    }
  }

  // Update selection bounds
  ctx.selectionStart = { x: targetX, y: bounds.y1 };
  ctx.selectionEnd = { x: targetX + selWidth - 1, y: bounds.y2 };
  ctx.refresh();
}

/**
 * Move selection (M key) - cuts and allows placement
 */
export function moveSelection(ctx: EditorContext): void {
  copySelection(ctx);
  eraseSelection(ctx);
  // Selection is now in clipboard, ready to paste
}

/**
 * Cycle through operation modes (T/O/U keys)
 */
export function cycleOperationMode(ctx: EditorContext, mode: OperationMode): void {
  ctx.operationMode = mode;
  ctx.showStatusBar();
}

/**
 * Paste with respect to operation mode
 */
export function pasteWithMode(ctx: EditorContext): void {
  if (ctx.clipboard.length === 0) return;

  saveUndoState(ctx);
  for (let y = 0; y < ctx.clipboard.length; y++) {
    for (let x = 0; x < ctx.clipboard[y].length; x++) {
      const targetY = ctx.cursorY + y;
      const targetX = ctx.cursorX + x;
      if (targetY < 22 && targetX < ctx.width) {
        const srcCell = ctx.clipboard[y][x];
        const destCell = ctx.canvas[targetY][targetX];

        switch (ctx.operationMode) {
          case 'transparent':
            // Skip spaces (they become transparent)
            if (srcCell.char !== ' ') {
              ctx.canvas[targetY][targetX] = { ...srcCell };
            }
            break;
          case 'over':
            // Always draw over existing
            ctx.canvas[targetY][targetX] = { ...srcCell };
            break;
          case 'underneath':
            // Only draw where destination is space
            if (destCell.char === ' ') {
              ctx.canvas[targetY][targetX] = { ...srcCell };
            }
            break;
          case 'normal':
          default:
            // Normal paste (replace all)
            ctx.canvas[targetY][targetX] = { ...srcCell };
            break;
        }
      }
    }
  }
  ctx.refresh();
}

// ========== COLOR CONTROLS ==========

export function cycleFgUp(ctx: EditorContext): void {
  ctx.currentFg = (ctx.currentFg + 1) % 16;
  ctx.showStatusBar();
}

export function cycleFgDown(ctx: EditorContext): void {
  ctx.currentFg = (ctx.currentFg - 1 + 16) % 16;
  ctx.showStatusBar();
}

export function cycleBgUp(ctx: EditorContext): void {
  ctx.currentBg = (ctx.currentBg + 1) % 16;
  ctx.showStatusBar();
}

export function cycleBgDown(ctx: EditorContext): void {
  ctx.currentBg = (ctx.currentBg - 1 + 16) % 16;
  ctx.showStatusBar();
}

// ========== LINE OPERATIONS ==========

export function leftJustifyLine(ctx: EditorContext): void {
  saveUndoState(ctx);
  const y = ctx.cursorY;
  const row = ctx.canvas[y];

  // Find first non-space
  let firstNonSpace = 0;
  for (let x = 0; x < ctx.width; x++) {
    if (row[x].char !== ' ') {
      firstNonSpace = x;
      break;
    }
  }

  // Shift left
  if (firstNonSpace > 0) {
    for (let x = 0; x < ctx.width - firstNonSpace; x++) {
      row[x] = row[x + firstNonSpace];
    }
    for (let x = ctx.width - firstNonSpace; x < ctx.width; x++) {
      row[x] = { char: ' ', fg: 7, bg: 0 };
    }
  }
  ctx.refresh();
}

export function rightJustifyLine(ctx: EditorContext): void {
  saveUndoState(ctx);
  const y = ctx.cursorY;
  const row = ctx.canvas[y];

  // Find last non-space
  let lastNonSpace = ctx.width - 1;
  for (let x = ctx.width - 1; x >= 0; x--) {
    if (row[x].char !== ' ') {
      lastNonSpace = x;
      break;
    }
  }

  // Shift right
  const shift = ctx.width - 1 - lastNonSpace;
  if (shift > 0) {
    for (let x = ctx.width - 1; x >= shift; x--) {
      row[x] = row[x - shift];
    }
    for (let x = 0; x < shift; x++) {
      row[x] = { char: ' ', fg: 7, bg: 0 };
    }
  }
  ctx.refresh();
}

export function centerLine(ctx: EditorContext): void {
  saveUndoState(ctx);
  const y = ctx.cursorY;
  const row = ctx.canvas[y];

  // Find first and last non-space
  let firstNonSpace = -1;
  let lastNonSpace = -1;
  for (let x = 0; x < ctx.width; x++) {
    if (row[x].char !== ' ') {
      if (firstNonSpace === -1) firstNonSpace = x;
      lastNonSpace = x;
    }
  }

  if (firstNonSpace === -1) return;

  const contentLength = lastNonSpace - firstNonSpace + 1;
  const leftPad = Math.floor((ctx.width - contentLength) / 2);

  // Copy content
  const content: Cell[] = [];
  for (let x = firstNonSpace; x <= lastNonSpace; x++) {
    content.push({ ...row[x] });
  }

  // Clear row
  for (let x = 0; x < ctx.width; x++) {
    row[x] = { char: ' ', fg: 7, bg: 0 };
  }

  // Paste centered
  for (let x = 0; x < content.length; x++) {
    if (leftPad + x < ctx.width) {
      row[leftPad + x] = content[x];
    }
  }
  ctx.refresh();
}

export function eraseLine(ctx: EditorContext): void {
  saveUndoState(ctx);
  const y = ctx.cursorY;
  for (let x = 0; x < ctx.width; x++) {
    ctx.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
  }
  ctx.refresh();
}

export function eraseToStartOfLine(ctx: EditorContext): void {
  saveUndoState(ctx);
  const y = ctx.cursorY;
  for (let x = 0; x <= ctx.cursorX; x++) {
    ctx.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
  }
  ctx.refresh();
}

export function eraseToEndOfLine(ctx: EditorContext): void {
  saveUndoState(ctx);
  const y = ctx.cursorY;
  for (let x = ctx.cursorX; x < ctx.width; x++) {
    ctx.canvas[y][x] = { char: ' ', fg: 7, bg: 0 };
  }
  ctx.refresh();
}

// ========== ROW/COLUMN OPERATIONS ==========

export function insertRow(ctx: EditorContext): void {
  saveUndoState(ctx);
  // Remove bottom row and insert blank row at cursor
  ctx.canvas.splice(21, 1);
  const newRow: Cell[] = [];
  for (let x = 0; x < ctx.width; x++) {
    newRow.push({ char: ' ', fg: 7, bg: 0 });
  }
  ctx.canvas.splice(ctx.cursorY, 0, newRow);
  ctx.refresh();
}

export function deleteRow(ctx: EditorContext): void {
  saveUndoState(ctx);
  // Remove current row and add blank row at bottom
  ctx.canvas.splice(ctx.cursorY, 1);
  const newRow: Cell[] = [];
  for (let x = 0; x < ctx.width; x++) {
    newRow.push({ char: ' ', fg: 7, bg: 0 });
  }
  ctx.canvas.splice(21, 0, newRow);
  ctx.refresh();
}

export function insertColumn(ctx: EditorContext): void {
  saveUndoState(ctx);
  for (let y = 0; y < 22; y++) {
    ctx.canvas[y].splice(ctx.width - 1, 1);
    ctx.canvas[y].splice(ctx.cursorX, 0, { char: ' ', fg: 7, bg: 0 });
  }
  ctx.refresh();
}

export function deleteColumn(ctx: EditorContext): void {
  saveUndoState(ctx);
  for (let y = 0; y < 22; y++) {
    ctx.canvas[y].splice(ctx.cursorX, 1);
    ctx.canvas[y].splice(ctx.width - 1, 0, { char: ' ', fg: 7, bg: 0 });
  }
  ctx.refresh();
}

export function eraseColumn(ctx: EditorContext): void {
  saveUndoState(ctx);
  for (let y = 0; y < 22; y++) {
    ctx.canvas[y][ctx.cursorX] = { char: ' ', fg: 7, bg: 0 };
  }
  ctx.refresh();
}

export function eraseToStartOfColumn(ctx: EditorContext): void {
  saveUndoState(ctx);
  for (let y = 0; y <= ctx.cursorY; y++) {
    ctx.canvas[y][ctx.cursorX] = { char: ' ', fg: 7, bg: 0 };
  }
  ctx.refresh();
}

export function eraseToEndOfColumn(ctx: EditorContext): void {
  saveUndoState(ctx);
  for (let y = ctx.cursorY; y < 22; y++) {
    ctx.canvas[y][ctx.cursorX] = { char: ' ', fg: 7, bg: 0 };
  }
  ctx.refresh();
}

// ========== CANVAS SCROLLING ==========

export function scrollCanvasUp(ctx: EditorContext): void {
  saveUndoState(ctx);
  // Remove first row and add empty row at bottom
  ctx.canvas.shift();
  ctx.canvas.push(Array(ctx.width).fill(0).map(() => ({ char: ' ', fg: 7, bg: 0 })));
  ctx.refresh();
}

export function scrollCanvasDown(ctx: EditorContext): void {
  saveUndoState(ctx);
  // Remove last row and add empty row at top
  ctx.canvas.pop();
  ctx.canvas.unshift(Array(ctx.width).fill(0).map(() => ({ char: ' ', fg: 7, bg: 0 })));
  ctx.refresh();
}

export function scrollCanvasLeft(ctx: EditorContext): void {
  saveUndoState(ctx);
  // Remove first column from each row and add empty column at right
  for (let y = 0; y < 22; y++) {
    ctx.canvas[y].shift();
    ctx.canvas[y].push({ char: ' ', fg: 7, bg: 0 });
  }
  ctx.refresh();
}

export function scrollCanvasRight(ctx: EditorContext): void {
  saveUndoState(ctx);
  // Remove last column from each row and add empty column at left
  for (let y = 0; y < 22; y++) {
    ctx.canvas[y].pop();
    ctx.canvas[y].unshift({ char: ' ', fg: 7, bg: 0 });
  }
  ctx.refresh();
}
