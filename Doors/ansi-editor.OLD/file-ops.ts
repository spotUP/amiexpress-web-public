/**
 * File operations for ANSI Editor
 * Handles loading, saving, importing, and exporting ANSI/ASCII art
 * Supports formats: ANS, ASC, BIN, XB, TXT
 */

import * as fs from 'fs';
import * as path from 'path';
import { Cell, EditorState, FileMetadata, ANSI } from './types.js';
import { cloneCanvas } from './canvas.js';

const SCREENS_DIR = process.env.SCREENS_DIR || path.join(process.cwd(), 'Screens');

// =============================================================================
// FILE LOADING
// =============================================================================

export async function loadFile(state: EditorState, filename: string): Promise<boolean> {
  const filepath = path.join(SCREENS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filename}`);
  }

  const content = fs.readFileSync(filepath, 'utf8');
  const format = detectFormat(filename);

  switch (format) {
    case 'ANS':
      return loadANSI(state, content, filename);
    case 'ASC':
    case 'TXT':
      return loadASCII(state, content, filename);
    case 'BIN':
      return loadBinary(state, filepath, filename);
    case 'XB':
      return loadXBin(state, filepath, filename);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function detectFormat(filename: string): 'ANS' | 'ASC' | 'BIN' | 'XB' | 'TXT' {
  const ext = path.extname(filename).toLowerCase();

  switch (ext) {
    case '.ans':
      return 'ANS';
    case '.asc':
      return 'ASC';
    case '.bin':
      return 'BIN';
    case '.xb':
      return 'XB';
    case '.txt':
      return 'TXT';
    default:
      return 'TXT';
  }
}

// =============================================================================
// ANSI FORMAT (.ANS)
// =============================================================================

function loadANSI(state: EditorState, content: string, filename: string): boolean {
  // Parse ANSI escape sequences into canvas
  let x = 0;
  let y = 0;
  let currentFg = 7;
  let currentBg = 0;
  let bold = false;
  let blink = false;

  let i = 0;
  while (i < content.length) {
    const char = content[i];

    // Handle ANSI escape sequences
    if (char === '\x1b' && content[i + 1] === '[') {
      // Find end of escape sequence
      let j = i + 2;
      while (j < content.length && !content[j].match(/[A-Za-z]/)) {
        j++;
      }

      const escapeCode = content.substring(i + 2, j);
      const command = content[j];

      // Parse escape sequence
      if (command === 'm') {
        // Color/style codes
        const codes = escapeCode.split(';').map(c => parseInt(c) || 0);

        for (const code of codes) {
          if (code === 0) {
            // Reset
            currentFg = 7;
            currentBg = 0;
            bold = false;
            blink = false;
          } else if (code === 1) {
            bold = true;
          } else if (code === 5) {
            blink = true;
          } else if (code >= 30 && code <= 37) {
            currentFg = code - 30;
            if (bold) currentFg += 8;
          } else if (code >= 40 && code <= 47) {
            currentBg = code - 40;
          } else if (code >= 90 && code <= 97) {
            currentFg = code - 90 + 8;
          } else if (code >= 100 && code <= 107) {
            currentBg = code - 100 + 8;
          }
        }
      } else if (command === 'H' || command === 'f') {
        // Cursor position
        const params = escapeCode.split(';').map(c => parseInt(c) || 1);
        y = Math.max(0, Math.min(state.height - 1, (params[0] || 1) - 1));
        x = Math.max(0, Math.min(state.width - 1, (params[1] || 1) - 1));
      }

      i = j + 1;
      continue;
    }

    // Handle control characters
    if (char === '\r') {
      x = 0;
      i++;
      continue;
    }

    if (char === '\n') {
      y++;
      x = 0;
      i++;
      continue;
    }

    // Regular character
    if (y < state.height && x < state.width) {
      state.canvas[y][x] = {
        char,
        fg: currentFg,
        bg: currentBg,
        blink,
      };
      x++;

      if (x >= state.width) {
        x = 0;
        y++;
      }
    }

    i++;
  }

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

// =============================================================================
// ASCII FORMAT (.ASC, .TXT)
// =============================================================================

function loadASCII(state: EditorState, content: string, filename: string): boolean {
  // Simple ASCII - no color codes, just text
  const lines = content.split(/\r?\n/);

  for (let y = 0; y < Math.min(lines.length, state.height); y++) {
    const line = lines[y];
    for (let x = 0; x < Math.min(line.length, state.width); x++) {
      state.canvas[y][x] = {
        char: line[x],
        fg: 7,
        bg: 0,
      };
    }
  }

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

// =============================================================================
// BINARY FORMAT (.BIN)
// =============================================================================

function loadBinary(state: EditorState, filepath: string, filename: string): boolean {
  const buffer = fs.readFileSync(filepath);

  // Binary format: 2 bytes per cell (char + attribute)
  // Attribute byte: [blink][bg2][bg1][bg0][bright][fg2][fg1][fg0]
  let offset = 0;

  for (let y = 0; y < state.height && offset < buffer.length; y++) {
    for (let x = 0; x < state.width && offset < buffer.length; x++) {
      const char = String.fromCharCode(buffer[offset]);
      const attr = buffer[offset + 1];

      const fg = (attr & 0x0f); // Low 4 bits
      const bg = ((attr & 0x70) >> 4); // High 3 bits of low nibble
      const blink = (attr & 0x80) !== 0; // High bit

      state.canvas[y][x] = { char, fg, bg, blink };
      offset += 2;
    }
  }

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

// =============================================================================
// XBIN FORMAT (.XB)
// =============================================================================

function loadXBin(state: EditorState, filepath: string, filename: string): boolean {
  const buffer = fs.readFileSync(filepath);

  // XBin header: "XBIN\x1a" + header data
  if (buffer.toString('ascii', 0, 4) !== 'XBIN') {
    throw new Error('Invalid XBin file format');
  }

  // Read header (simplified - full XBin spec is more complex)
  const width = buffer.readUInt16LE(5);
  const height = buffer.readUInt16LE(7);
  const flags = buffer.readUInt8(11);

  // Start of image data (after header + optional palette + optional font)
  let offset = 11;

  // Skip palette if present
  if (flags & 0x01) {
    offset += 48; // 16 colors * 3 bytes (RGB)
  }

  // Skip font data if present
  if (flags & 0x02) {
    const fontHeight = buffer.readUInt8(9);
    offset += 256 * fontHeight; // 256 chars * height bytes
  }

  // Read image data
  for (let y = 0; y < Math.min(height, state.height) && offset < buffer.length; y++) {
    for (let x = 0; x < Math.min(width, state.width) && offset < buffer.length; x++) {
      const char = String.fromCharCode(buffer[offset]);
      const attr = buffer[offset + 1];

      const fg = attr & 0x0f;
      const bg = (attr & 0x70) >> 4;
      const blink = (attr & 0x80) !== 0;

      state.canvas[y][x] = { char, fg, bg, blink };
      offset += 2;
    }
  }

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

// =============================================================================
// FILE SAVING
// =============================================================================

export async function saveFile(state: EditorState, filename: string): Promise<boolean> {
  const filepath = path.join(SCREENS_DIR, filename);
  const format = detectFormat(filename);

  // Ensure directory exists
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  switch (format) {
    case 'ANS':
      return saveANSI(state, filepath, filename);
    case 'ASC':
    case 'TXT':
      return saveASCII(state, filepath, filename);
    case 'BIN':
      return saveBinary(state, filepath, filename);
    case 'XB':
      return saveXBin(state, filepath, filename);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function saveANSI(state: EditorState, filepath: string, filename: string): boolean {
  let output = '';
  let lastFg = -1;
  let lastBg = -1;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.canvas[y][x];

      // Output ANSI codes if colors changed
      if (cell.fg !== lastFg || cell.bg !== lastBg) {
        output += ANSI.colors(cell.fg, cell.bg);
        lastFg = cell.fg;
        lastBg = cell.bg;
      }

      // Add blink if enabled
      if (cell.blink && state.iceColorsEnabled) {
        output += ANSI.BLINK;
      }

      output += cell.char;
    }

    // Line ending
    if (y < state.height - 1) {
      output += '\r\n';
    }
  }

  // Reset at end
  output += ANSI.RESET;

  fs.writeFileSync(filepath, output, 'utf8');

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

function saveASCII(state: EditorState, filepath: string, filename: string): boolean {
  let output = '';

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      output += state.canvas[y][x].char;
    }
    if (y < state.height - 1) {
      output += '\r\n';
    }
  }

  fs.writeFileSync(filepath, output, 'utf8');

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

function saveBinary(state: EditorState, filepath: string, filename: string): boolean {
  const buffer = Buffer.alloc(state.width * state.height * 2);
  let offset = 0;

  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.canvas[y][x];

      // Char byte
      buffer.writeUInt8(cell.char.charCodeAt(0), offset);

      // Attribute byte: [blink][bg2][bg1][bg0][bright][fg2][fg1][fg0]
      let attr = cell.fg & 0x0f;
      attr |= (cell.bg & 0x07) << 4;
      if (cell.blink) attr |= 0x80;

      buffer.writeUInt8(attr, offset + 1);
      offset += 2;
    }
  }

  fs.writeFileSync(filepath, buffer);

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

function saveXBin(state: EditorState, filepath: string, filename: string): boolean {
  // Simplified XBin format (no palette, no font)
  const headerSize = 11;
  const dataSize = state.width * state.height * 2;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // Write header
  buffer.write('XBIN', 0, 'ascii');
  buffer.writeUInt8(0x1a, 4); // EOF char
  buffer.writeUInt16LE(state.width, 5);
  buffer.writeUInt16LE(state.height, 7);
  buffer.writeUInt8(16, 9); // Font height (default)
  buffer.writeUInt8(0, 10); // Flags (no palette, no font)
  buffer.writeUInt8(0, 11); // Reserved

  // Write image data
  let offset = headerSize;
  for (let y = 0; y < state.height; y++) {
    for (let x = 0; x < state.width; x++) {
      const cell = state.canvas[y][x];

      buffer.writeUInt8(cell.char.charCodeAt(0), offset);

      let attr = cell.fg & 0x0f;
      attr |= (cell.bg & 0x07) << 4;
      if (cell.blink) attr |= 0x80;

      buffer.writeUInt8(attr, offset + 1);
      offset += 2;
    }
  }

  fs.writeFileSync(filepath, buffer);

  state.currentFilename = filename;
  state.modified = false;
  return true;
}

// =============================================================================
// FILE LISTING
// =============================================================================

export function listFiles(pattern: string = '*'): string[] {
  if (!fs.existsSync(SCREENS_DIR)) {
    return [];
  }

  const files = fs.readdirSync(SCREENS_DIR);

  // Filter by pattern
  const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'), 'i');

  return files
    .filter(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.ans', '.asc', '.bin', '.xb', '.txt'].includes(ext) && regex.test(f);
    })
    .sort();
}

// =============================================================================
// IMPORT/EXPORT
// =============================================================================

export async function importFile(state: EditorState, filename: string, x: number, y: number): Promise<boolean> {
  // Import loads file into clipboard at cursor position
  const filepath = path.join(SCREENS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    throw new Error(`File not found: ${filename}`);
  }

  const content = fs.readFileSync(filepath, 'utf8');

  // Parse into temporary canvas
  const tempCanvas: Cell[][] = [];
  for (let ty = 0; ty < state.height; ty++) {
    tempCanvas[ty] = [];
    for (let tx = 0; tx < state.width; tx++) {
      tempCanvas[ty][tx] = { char: ' ', fg: 7, bg: 0 };
    }
  }

  // Parse ANSI (simplified)
  const lines = content.split(/\r?\n/);
  for (let ty = 0; ty < Math.min(lines.length, state.height); ty++) {
    const line = lines[ty];
    for (let tx = 0; tx < Math.min(line.length, state.width); tx++) {
      // Skip ANSI codes for simplicity in import
      const char = line[tx];
      if (char && char !== '\x1b') {
        tempCanvas[ty][tx] = { char, fg: 7, bg: 0 };
      }
    }
  }

  // Copy relevant portion to clipboard
  state.clipboard = [];
  for (let ty = y; ty < state.height; ty++) {
    const row: Cell[] = [];
    for (let tx = x; tx < state.width; tx++) {
      row.push({ ...tempCanvas[ty][tx] });
    }
    state.clipboard.push(row);
  }

  return true;
}

export async function exportSelection(
  state: EditorState,
  filename: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Promise<boolean> {
  // Export selection to file
  const filepath = path.join(SCREENS_DIR, filename);
  const format = detectFormat(filename);

  // Create temporary state with selection only
  const tempState: EditorState = { ...state };
  tempState.width = x2 - x1 + 1;
  tempState.height = y2 - y1 + 1;
  tempState.canvas = [];

  for (let y = y1; y <= y2; y++) {
    const row: Cell[] = [];
    for (let x = x1; x <= x2; x++) {
      row.push({ ...state.canvas[y][x] });
    }
    tempState.canvas.push(row);
  }

  return saveFile(tempState, filename);
}

// =============================================================================
// FILE UTILITIES
// =============================================================================

export function getFileMetadata(filename: string): FileMetadata | null {
  const filepath = path.join(SCREENS_DIR, filename);

  if (!fs.existsSync(filepath)) {
    return null;
  }

  const stats = fs.statSync(filepath);
  const format = detectFormat(filename);

  return {
    filename,
    width: 80, // Default, would parse from file for accurate value
    height: 24,
    format,
    iceColors: false,
    created: stats.birthtime,
    modified: stats.mtime,
  };
}

export function fileExists(filename: string): boolean {
  const filepath = path.join(SCREENS_DIR, filename);
  return fs.existsSync(filepath);
}

// =============================================================================
// ADDITIONAL FILE OPERATIONS (from old editor)
// =============================================================================

/**
 * Deep clone canvas (for revert functionality)
 */
export function deepCloneCanvas(canvas: Cell[][]): Cell[][] {
  const cloned: Cell[][] = [];
  for (let y = 0; y < canvas.length; y++) {
    cloned[y] = [];
    for (let x = 0; x < canvas[y].length; x++) {
      cloned[y][x] = { ...canvas[y][x] };
    }
  }
  return cloned;
}

/**
 * Export to FILE_ID.DIZ format
 * DIZ files are plain text descriptions, typically 10-20 lines
 */
export async function exportToDiz(state: EditorState, filename: string): Promise<boolean> {
  try {
    const filepath = path.join(SCREENS_DIR, filename);

    // Convert canvas to plain ASCII text (no ANSI codes)
    let content = '';
    for (let y = 0; y < Math.min(state.height, 20); y++) {  // DIZ files typically 10-20 lines
      let line = '';
      for (let x = 0; x < state.width; x++) {
        line += state.canvas[y][x].char;
      }
      // Trim trailing spaces
      line = line.trimEnd();
      content += line + '\r\n';
    }

    // Write to file
    fs.writeFileSync(filepath, content, 'ascii');
    return true;
  } catch (error) {
    console.error('Error exporting to DIZ:', error);
    return false;
  }
}
