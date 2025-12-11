/**
 * File Operations Module
 * Handles all file I/O operations for the ANSI Editor
 *
 * Supported formats:
 * - ANS: ANSI text with color codes
 * - XB: XBin format (binary with header)
 * - BIN: Raw binary format (char/attr pairs)
 * - ASC/TXT: Plain ASCII text
 * - DIZ: FILE_ID.DIZ format (limited size)
 */

import * as fs from 'fs';
import * as path from 'path';
import { Cell } from './types';

/**
 * Context interface for file operations
 * Provides access to editor state needed for file I/O
 */
export interface FileContext {
  canvas: Cell[][];
  width: number;
  height: number;
  fg: number;
  bg: number;
  filename?: string | null;
  modified?: boolean;
  doorSession?: any;
  emit?: (data: string) => void;
  refresh?: () => void;
  saveUndoState?: (chunk?: boolean) => void;
  dataDir?: string;
}

/**
 * File format type
 */
export type FileFormat = 'ans' | 'xb' | 'bin' | 'asc' | 'txt' | 'diz';

// ===== SAVE OPERATIONS =====

/**
 * Save canvas to ANSI file
 */
export function saveAnsiToFile(ctx: FileContext, filename: string): void {
  const data = canvasToANSI(ctx);
  const filepath = getFilePath(ctx, filename);
  ensureDirectoryExists(filepath);
  fs.writeFileSync(filepath, data, 'utf8');
}

/**
 * Save canvas to XBin file
 */
export function saveXBinToFile(ctx: FileContext, filename: string): void {
  const data = canvasToXBin(ctx);
  const filepath = getFilePath(ctx, filename);
  ensureDirectoryExists(filepath);
  fs.writeFileSync(filepath, data);
}

/**
 * Save canvas to BIN file
 */
export function saveBinToFile(ctx: FileContext, filename: string): void {
  const data = canvasToBIN(ctx);
  const filepath = getFilePath(ctx, filename);
  ensureDirectoryExists(filepath);
  fs.writeFileSync(filepath, data);
}

/**
 * Save canvas to ASC/TXT file
 */
export function saveAscToFile(ctx: FileContext, filename: string): void {
  const data = canvasToASC(ctx);
  const filepath = getFilePath(ctx, filename);
  ensureDirectoryExists(filepath);
  fs.writeFileSync(filepath, data, 'utf8');
}

/**
 * Save canvas to DIZ file
 */
export function saveDizToFile(ctx: FileContext, filename: string): void {
  const data = canvasToDIZ(ctx);
  const filepath = getFilePath(ctx, filename);
  ensureDirectoryExists(filepath);
  fs.writeFileSync(filepath, data, 'utf8');
}

/**
 * Generic save function that detects format from extension
 */
export function saveFile(ctx: FileContext, filename: string): void {
  const format = detectFormat(filename);

  switch (format) {
    case 'ans':
      saveAnsiToFile(ctx, filename);
      break;
    case 'xb':
      saveXBinToFile(ctx, filename);
      break;
    case 'bin':
      saveBinToFile(ctx, filename);
      break;
    case 'asc':
    case 'txt':
      saveAscToFile(ctx, filename);
      break;
    case 'diz':
      saveDizToFile(ctx, filename);
      break;
  }
}

// ===== LOAD OPERATIONS =====

/**
 * Load ANSI file into canvas
 */
export function loadAnsiFromFile(ctx: FileContext, filename: string): void {
  const filepath = getFilePath(ctx, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  parseANSI(ctx, content);
}

/**
 * Load XBin file into canvas
 */
export function loadXBinFile(ctx: FileContext, filename: string): void {
  const filepath = getFilePath(ctx, filename);
  const data = fs.readFileSync(filepath);
  parseXBin(ctx, data);
}

/**
 * Load BIN file into canvas
 */
export function loadBinFile(ctx: FileContext, filename: string): void {
  const filepath = getFilePath(ctx, filename);
  const data = fs.readFileSync(filepath);
  parseBIN(ctx, data);
}

/**
 * Load ASC/TXT/DIZ file into canvas
 */
export function loadAscFile(ctx: FileContext, filename: string): void {
  const filepath = getFilePath(ctx, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  parseASC(ctx, content);
}

/**
 * Generic load function that detects format from extension
 */
export function loadFile(ctx: FileContext, filename: string): void {
  const format = detectFormat(filename);

  switch (format) {
    case 'ans':
      loadAnsiFromFile(ctx, filename);
      break;
    case 'xb':
      loadXBinFile(ctx, filename);
      break;
    case 'bin':
      loadBinFile(ctx, filename);
      break;
    case 'asc':
    case 'txt':
    case 'diz':
      loadAscFile(ctx, filename);
      break;
  }
}

// ===== EXPORT OPERATIONS =====

/**
 * Export to ANSI format
 */
export function exportToAnsi(ctx: FileContext): string {
  return canvasToANSI(ctx);
}

/**
 * Export to XBin format
 */
export function exportToXBin(ctx: FileContext): Buffer {
  return canvasToXBin(ctx);
}

/**
 * Export to BIN format
 */
export function exportToBin(ctx: FileContext): Buffer {
  return canvasToBIN(ctx);
}

/**
 * Export to ASC/TXT format
 */
export function exportToAsc(ctx: FileContext): string {
  return canvasToASC(ctx);
}

/**
 * Export to DIZ format
 */
export function exportToDiz(ctx: FileContext): string {
  return canvasToDIZ(ctx);
}

/**
 * Export to plain text (no colors)
 */
export function exportToTxt(ctx: FileContext): string {
  return canvasToASC(ctx);
}

/**
 * Export selection to ANSI format
 */
export function exportSelectionToAnsi(
  ctx: FileContext,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  let ansi = '';
  let lastFg = -1;
  let lastBg = -1;

  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
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
  return ansi;
}

// ===== FORMAT CONVERTERS =====

/**
 * Convert canvas to ANSI format
 */
function canvasToANSI(ctx: FileContext): string {
  let ansi = '';
  let lastFg = -1;
  let lastBg = -1;

  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < ctx.width; x++) {
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
  return ansi;
}

/**
 * Convert canvas to XBin format
 */
function canvasToXBin(ctx: FileContext): Buffer {
  // XBin format specification:
  // Header: 'XBIN' (4 bytes) + 0x1A (1 byte)
  // Width: 2 bytes (little-endian)
  // Height: 2 bytes (little-endian)
  // Fontsize: 1 byte (16 for standard)
  // Flags: 1 byte (0 = no compression, no palette, no font)
  // Data: char + attr pairs (attr = fg + (bg << 4))

  const header = Buffer.from([0x58, 0x42, 0x49, 0x4E, 0x1A]); // 'XBIN' + 0x1A
  const width = Buffer.alloc(2);
  width.writeUInt16LE(ctx.width, 0);
  const height = Buffer.alloc(2);
  height.writeUInt16LE(22, 0);
  const fontsize = Buffer.from([16]);
  const flags = Buffer.from([0]);

  // Build character data
  const data: number[] = [];
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < ctx.width; x++) {
      const cell = ctx.canvas[y][x];
      data.push(cell.char.charCodeAt(0) || 32);  // Character
      data.push(cell.fg + (cell.bg << 4));        // Attribute
    }
  }

  return Buffer.concat([header, width, height, fontsize, flags, Buffer.from(data)]);
}

/**
 * Convert canvas to BIN format
 */
function canvasToBIN(ctx: FileContext): Buffer {
  // BIN format: raw character/attribute pairs
  // Each cell = char (1 byte) + attr (1 byte where attr = fg + (bg << 4))
  const data: number[] = [];
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < ctx.width; x++) {
      const cell = ctx.canvas[y][x];
      data.push(cell.char.charCodeAt(0) || 32);  // Character
      data.push(cell.fg + (cell.bg << 4));        // Attribute
    }
  }
  return Buffer.from(data);
}

/**
 * Convert canvas to ASC/TXT format
 */
function canvasToASC(ctx: FileContext): string {
  // ASC/TXT format: plain text only (no colors)
  let text = '';
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < ctx.width; x++) {
      text += ctx.canvas[y][x].char;
    }
    text += '\r\n';
  }
  return text;
}

/**
 * Convert canvas to DIZ format
 */
function canvasToDIZ(ctx: FileContext): string {
  // DIZ format: plain text, typically limited to 10 lines, 45 chars wide
  // We'll export the current canvas but trim to typical DIZ size
  let text = '';
  const maxLines = Math.min(22, 10);
  const maxWidth = Math.min(ctx.width, 45);

  for (let y = 0; y < maxLines; y++) {
    let line = '';
    for (let x = 0; x < maxWidth; x++) {
      line += ctx.canvas[y][x].char;
    }
    // Trim trailing spaces
    line = line.trimEnd();
    text += line + '\r\n';
  }
  return text;
}

// ===== FORMAT PARSERS =====

/**
 * Parse ANSI format into canvas
 */
function parseANSI(ctx: FileContext, ansi: string): void {
  // Simple ANSI parser - converts ANSI to canvas
  initCanvas(ctx);  // Clear canvas

  let x = 0;
  let y = 0;
  let fg = 7;
  let bg = 0;
  let i = 0;

  while (i < ansi.length && y < 22) {
    const ch = ansi[i];

    if (ch === '\x1b') {
      // ANSI escape sequence
      i++;

      if (ansi[i] === '[') {
        i++;
        let params = '';

        while (i < ansi.length && ansi[i] !== 'm' && ansi[i] !== 'H' && ansi[i] !== 'J') {
          params += ansi[i];
          i++;
        }

        const cmd = ansi[i];
        i++;

        if (cmd === 'm') {
          // Color codes
          const codes = params.split(';').map(s => parseInt(s, 10));
          for (const code of codes) {
            if (code === 0 || code === 22) {
              // Reset
              fg = 7;
              bg = 0;
            } else if (code >= 30 && code <= 37) {
              // Foreground color
              fg = code - 30;
            } else if (code >= 40 && code <= 47) {
              // Background color
              bg = code - 40;
            }
          }
        } else if (cmd === 'H') {
          // Cursor position
          const parts = params.split(';');
          if (parts.length === 2) {
            y = parseInt(parts[0], 10) - 1;
            x = parseInt(parts[1], 10) - 1;
          }
        }
      }
    } else if (ch === '\r') {
      i++;
    } else if (ch === '\n') {
      y++;
      x = 0;
      i++;
    } else {
      // Regular character
      if (x < ctx.width && y < 22) {
        ctx.canvas[y][x] = { char: ch, fg, bg };
        x++;
      }
      i++;
    }
  }
}

/**
 * Parse XBin format into canvas
 */
function parseXBin(ctx: FileContext, data: Buffer): void {
  // Parse XBin format
  if (data.length < 11 || data.toString('ascii', 0, 4) !== 'XBIN' || data[4] !== 0x1A) {
    throw new Error('Invalid XBin format');
  }

  const width = data.readUInt16LE(5);
  const height = data.readUInt16LE(7);
  // fontsize at byte 9, flags at byte 10

  initCanvas(ctx);

  let offset = 11;  // Start of data
  for (let y = 0; y < Math.min(height, 22); y++) {
    for (let x = 0; x < Math.min(width, ctx.width); x++) {
      if (offset + 1 >= data.length) break;

      const char = String.fromCharCode(data[offset]);
      const attr = data[offset + 1];
      const fg = attr & 0x0F;
      const bg = (attr >> 4) & 0x0F;

      ctx.canvas[y][x] = { char, fg, bg };
      offset += 2;
    }
  }
}

/**
 * Parse BIN format into canvas
 */
function parseBIN(ctx: FileContext, data: Buffer): void {
  // Parse BIN format: raw character/attribute pairs
  initCanvas(ctx);

  let offset = 0;
  for (let y = 0; y < 22; y++) {
    for (let x = 0; x < ctx.width; x++) {
      if (offset + 1 >= data.length) break;

      const char = String.fromCharCode(data[offset]);
      const attr = data[offset + 1];
      const fg = attr & 0x0F;
      const bg = (attr >> 4) & 0x0F;

      ctx.canvas[y][x] = { char, fg, bg };
      offset += 2;
    }
    if (offset >= data.length) break;
  }
}

/**
 * Parse ASC/TXT/DIZ format into canvas
 */
function parseASC(ctx: FileContext, text: string): void {
  // Parse ASC/TXT/DIZ format: plain text (no colors)
  initCanvas(ctx);

  const lines = text.split(/\r?\n/);
  for (let y = 0; y < Math.min(lines.length, 22); y++) {
    const line = lines[y];
    for (let x = 0; x < Math.min(line.length, ctx.width); x++) {
      ctx.canvas[y][x] = {
        char: line[x],
        fg: 7,  // Default white
        bg: 0   // Default black
      };
    }
  }
}

// ===== HELPER FUNCTIONS =====

/**
 * Initialize/clear canvas
 */
function initCanvas(ctx: FileContext): void {
  for (let y = 0; y < 22; y++) {
    if (!ctx.canvas[y]) {
      ctx.canvas[y] = [];
    }
    for (let x = 0; x < ctx.width; x++) {
      ctx.canvas[y][x] = { char: ' ', fg: ctx.fg, bg: ctx.bg };
    }
  }
}

/**
 * Detect file format from extension
 */
function detectFormat(filename: string): FileFormat {
  const ext = filename.toLowerCase().split('.').pop() || '';

  if (ext === 'xb') return 'xb';
  if (ext === 'bin') return 'bin';
  if (ext === 'asc') return 'asc';
  if (ext === 'txt') return 'txt';
  if (ext === 'diz') return 'diz';

  return 'ans';  // Default to ANSI
}

/**
 * Get full file path
 */
function getFilePath(ctx: FileContext, filename: string): string {
  const dataDir = ctx.dataDir || process.env.DATA_DIR || path.join(__dirname, '../../backend/data/bbs');
  const screensDir = path.join(dataDir, 'BBS', 'Screens');
  return path.join(screensDir, filename);
}

/**
 * Ensure directory exists
 */
function ensureDirectoryExists(filepath: string): void {
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Check if file exists
 */
export function fileExists(ctx: FileContext, filename: string): boolean {
  const filepath = getFilePath(ctx, filename);
  return fs.existsSync(filepath);
}

/**
 * Get list of screen files
 */
export function getScreenFiles(ctx: FileContext): string[] {
  const dataDir = ctx.dataDir || process.env.DATA_DIR || path.join(__dirname, '../../backend/data/bbs');
  const screensDir = path.join(dataDir, 'BBS', 'Screens');

  try {
    return fs.readdirSync(screensDir)
      .filter(f =>
        f.endsWith('.TXT') || f.endsWith('.ANS') || f.endsWith('.XB') ||
        f.endsWith('.BIN') || f.endsWith('.ASC') || f.endsWith('.DIZ') ||
        f.endsWith('.txt') || f.endsWith('.ans') || f.endsWith('.xb') ||
        f.endsWith('.bin') || f.endsWith('.asc') || f.endsWith('.diz')
      )
      .sort();
  } catch (error) {
    console.error('[File Ops] Error reading screens directory:', error);
    return [];
  }
}

/**
 * Deep clone canvas for backup/undo
 */
export function deepCloneCanvas(canvas: Cell[][]): Cell[][] {
  const clone: Cell[][] = [];
  for (let y = 0; y < canvas.length; y++) {
    clone[y] = [];
    for (let x = 0; x < canvas[y].length; x++) {
      clone[y][x] = { ...canvas[y][x] };
    }
  }
  return clone;
}
