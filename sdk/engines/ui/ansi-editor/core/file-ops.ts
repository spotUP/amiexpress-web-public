/**
 * File operations for ANSI editor
 * Supports .ANS (ANSI), .ASC (ASCII), .XB (XBin) formats
 */

import { decodeCP437, encodeCP437, cp437ByteToChar, charToCP437Byte } from './cp437';
import type { Cell } from '../types';
import * as Canvas from './canvas';

/**
 * SAUCE (Standard Architecture for Universal Comment Extensions) record
 * Used in ANSI art files to store metadata
 */
export interface SAUCERecord {
  id: string;           // "SAUCE00"
  version: string;      // "00"
  title: string;        // Title (35 chars)
  author: string;       // Author (20 chars)
  group: string;        // Group (20 chars)
  date: string;         // Date YYYYMMDD (8 chars)
  fileSize: number;     // Original file size
  dataType: number;     // Data type (1=Character, 5=BIN)
  fileType: number;     // File type
  tInfo1: number;       // Type info 1 (width for ANSI)
  tInfo2: number;       // Type info 2 (height for ANSI)
  tInfo3: number;       // Type info 3
  tInfo4: number;       // Type info 4
  comments: number;     // Number of comment lines
  tFlags: number;       // Type flags (bit 0 = non-blink/iCE colors)
  tInfoS: string;       // Font name (22 chars)
}

/**
 * Parse SAUCE record from buffer
 */
function parseSAUCE(data: Uint8Array): SAUCERecord | null {
  // SAUCE record is at the end of file
  // Format: ID(5) + Version(2) + Title(35) + Author(20) + Group(20) + Date(8) + ...
  const sauceOffset = data.length - 128;
  if (sauceOffset < 0) return null;

  // Check for "SAUCE" identifier
  const id = String.fromCharCode(...Array.from(data.slice(sauceOffset, sauceOffset + 5)));
  if (id !== 'SAUCE') return null;

  const decoder = { decode: (b: Uint8Array) => decodeCP437(b) };

  return {
    id,
    version: decoder.decode(data.slice(sauceOffset + 5, sauceOffset + 7)),
    title: decoder.decode(data.slice(sauceOffset + 7, sauceOffset + 42)).trim(),
    author: decoder.decode(data.slice(sauceOffset + 42, sauceOffset + 62)).trim(),
    group: decoder.decode(data.slice(sauceOffset + 62, sauceOffset + 82)).trim(),
    date: decoder.decode(data.slice(sauceOffset + 82, sauceOffset + 90)),
    fileSize: readUInt32LE(data, sauceOffset + 90),
    dataType: data[sauceOffset + 94],
    fileType: data[sauceOffset + 95],
    tInfo1: readUInt16LE(data, sauceOffset + 96),
    tInfo2: readUInt16LE(data, sauceOffset + 98),
    tInfo3: readUInt16LE(data, sauceOffset + 100),
    tInfo4: readUInt16LE(data, sauceOffset + 102),
    comments: data[sauceOffset + 104],
    tFlags: data[sauceOffset + 105],
    tInfoS: decoder.decode(data.slice(sauceOffset + 106, sauceOffset + 128)).trim()
  };
}

/**
 * Create SAUCE record buffer
 */
function createSAUCE(sauce: Partial<SAUCERecord>): Uint8Array {
  const buffer = new Uint8Array(128);
  const encoder = new TextEncoder();

  // Write fields
  writeString(buffer, 0, 'SAUCE', 5);
  writeString(buffer, 5, sauce.version || '00', 2);
  writeString(buffer, 7, sauce.title || '', 35);
  writeString(buffer, 42, sauce.author || '', 20);
  writeString(buffer, 62, sauce.group || '', 20);
  writeString(buffer, 82, sauce.date || new Date().toISOString().slice(0, 10).replace(/-/g, ''), 8);
  writeUInt32LE(buffer, 90, sauce.fileSize || 0);
  buffer[94] = sauce.dataType || 1; // 1 = Character
  buffer[95] = sauce.fileType || 1; // 1 = ANSi
  writeUInt16LE(buffer, 96, sauce.tInfo1 || 80); // Width
  writeUInt16LE(buffer, 98, sauce.tInfo2 || 25); // Height
  writeUInt16LE(buffer, 100, sauce.tInfo3 || 0);
  writeUInt16LE(buffer, 102, sauce.tInfo4 || 0);
  buffer[104] = sauce.comments || 0;
  buffer[105] = sauce.tFlags || 0;
  writeString(buffer, 106, sauce.tInfoS || '', 22);

  return buffer;
}

/**
 * Helper: Read uint32 little-endian
 */
function readUInt32LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
}

/**
 * Helper: Write uint32 little-endian
 */
function writeUInt32LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xFF;
  data[offset + 1] = (value >> 8) & 0xFF;
  data[offset + 2] = (value >> 16) & 0xFF;
  data[offset + 3] = (value >> 24) & 0xFF;
}

/**
 * Helper: Read uint16 little-endian
 */
function readUInt16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

/**
 * Helper: Write uint16 little-endian
 */
function writeUInt16LE(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xFF;
  data[offset + 1] = (value >> 8) & 0xFF;
}

/**
 * Helper: Write string with padding
 */
function writeString(data: Uint8Array, offset: number, str: string, maxLength: number): void {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  const length = Math.min(encoded.length, maxLength);

  for (let i = 0; i < maxLength; i++) {
    data[offset + i] = i < length ? encoded[i] : 0x20; // Space padding
  }
}

/**
 * Load .ANS (ANSI art) file
 */
export async function loadANSFile(data: Uint8Array): Promise<{ canvas: Cell[][], width: number, height: number, sauce?: SAUCERecord }> {
  // Parse SAUCE record (if present)
  const sauce = parseSAUCE(data) || undefined;

  // Get content (without SAUCE)
  const contentLength = sauce ? sauce.fileSize : data.length;
  const content = data.slice(0, contentLength);

  // Parse ANSI content
  const width = sauce?.tInfo1 || 80;
  const height = sauce?.tInfo2 || 25;
  const iceColors = sauce ? (sauce.tFlags & 1) === 1 : false;

  const canvas = Canvas.createCanvas(width, height);

  // Parse ANSI escape sequences
  let x = 0;
  let y = 0;
  let fg = 7; // White
  let bg = 0; // Black
  let blink = false;
  // ESC[s / ESC[u save and restore
  let savedX = 0;
  let savedY = 0;

  let i = 0;
  while (i < content.length && y < height) {
    const byte = content[i];

    // ESC sequence
    if (byte === 0x1B && i + 1 < content.length && content[i + 1] === 0x5B) { // ESC [
      // Parse SGR (Select Graphic Rendition)
      i += 2;
      let code = '';
      while (i < content.length && content[i] >= 0x30 && content[i] <= 0x39 || content[i] === 0x3B) {
        code += String.fromCharCode(content[i]);
        i++;
      }

      // Check for final character (m for SGR)
      if (i < content.length && content[i] === 0x6D) { // 'm'
        const codes = code.split(';').map(c => parseInt(c) || 0);
        for (const c of codes) {
          if (c === 0) {
            // Reset
            fg = 7;
            bg = 0;
            blink = false;
          } else if (c === 1) {
            // Bold (bright foreground)
            if (fg < 8) fg += 8;
          } else if (c === 5) {
            // Blink
            blink = true;
          } else if (c === 7) {
            // Inverse (swap fg/bg)
            [fg, bg] = [bg, fg];
          } else if (c >= 30 && c <= 37) {
            // Foreground color
            fg = c - 30;
          } else if (c >= 40 && c <= 47) {
            // Background color
            bg = c - 40;
          } else if (c >= 90 && c <= 97) {
            // Bright foreground color
            fg = c - 90 + 8;
          } else if (c >= 100 && c <= 107) {
            // Bright background color (iCE colors)
            if (iceColors) {
              bg = c - 100 + 8;
            }
          }
        }
        i++;
      }
      else {
        // Not SGR: the same ESC [ <params> <final> shape, dispatched on the
        // final byte. This used to sit in a second `else if` with an
        // identical condition, which could never be reached - so every
        // cursor-movement sequence was silently dropped.
      const final = i < content.length ? content[i] : 0;
      const parts = code.split(';').map(c => parseInt(c) || 1);
      const count = parseInt(code) || 1;

      switch (final) {
        case 0x48: // 'H' - cursor position
        case 0x66: // 'f'
          y = (parts[0] - 1) || 0;
          x = (parts[1] - 1) || 0;
          i++;
          break;
        // Relative cursor moves. Art uses ESC[C constantly to skip runs of
        // background instead of writing spaces; ignoring it collapsed every
        // such gap and shifted the rest of the line to the left.
        case 0x41: // 'A' - up
          y = Math.max(0, y - count);
          i++;
          break;
        case 0x42: // 'B' - down
          y = y + count;
          i++;
          break;
        case 0x43: // 'C' - forward
          x = x + count;
          i++;
          break;
        case 0x44: // 'D' - back
          x = Math.max(0, x - count);
          i++;
          break;
        case 0x45: // 'E' - next line, column 0
          y = y + count;
          x = 0;
          i++;
          break;
        case 0x46: // 'F' - previous line, column 0
          y = Math.max(0, y - count);
          x = 0;
          i++;
          break;
        case 0x47: // 'G' - absolute column
          x = Math.max(0, count - 1);
          i++;
          break;
        case 0x73: // 's' - save cursor
          savedX = x;
          savedY = y;
          i++;
          break;
        case 0x75: // 'u' - restore cursor
          x = savedX;
          y = savedY;
          i++;
          break;
        case 0x4A: // 'J' - erase display. The canvas starts blank, so there
        case 0x4B: // 'K' - erase line. is nothing to clear; just consume it.
          i++;
          break;
        default:
          // Unknown final byte: consume it so it is not painted as a glyph.
          if (final !== 0) i++;
          break;
      }
      }
    }
    // Newline
    else if (byte === 0x0A) {
      y++;
      x = 0;
      i++;
    }
    // Carriage return
    else if (byte === 0x0D) {
      x = 0;
      i++;
    }
    // Tab
    else if (byte === 0x09) {
      x = (Math.floor(x / 8) + 1) * 8;
      i++;
    }
    // Regular character
    else {
      // Wrap at the right margin, the way a real terminal does. Plenty of
      // art never emits a newline at all and simply runs past column 80,
      // trusting the terminal to wrap; without this those pieces collapsed
      // onto a single row and everything past column 80 was discarded.
      if (x >= width) {
        x = 0;
        y++;
        if (y >= height) break;
      }

      const char = cp437ByteToChar(byte);
      if (x < width && y < height) {
        Canvas.setCell(canvas, x, y, {
          char,
          fg,
          bg,
          blink
        });
      }
      x++;
      i++;
    }
  }

  return { canvas, width, height, sauce };
}

/**
 * Save .ANS (ANSI art) file
 */
export function saveANSFile(canvas: Cell[][], iceColors: boolean = false, sauce?: Partial<SAUCERecord>): Uint8Array {
  const height = canvas.length;
  const width = canvas[0]?.length || 0;

  // Convert canvas to ANSI codes
  let ansiContent = '';
  let currentFg = 7;
  let currentBg = 0;
  let currentBlink = false;

  for (let y = 0; y < height; y++) {
    // Reset at start of each line
    if (y > 0) {
      ansiContent += '\r\n';
    }

    for (let x = 0; x < width; x++) {
      const cell = canvas[y][x];
      const cellBlink = cell.blink ?? false;

      // Generate ANSI codes if attributes changed
      if (cell.fg !== currentFg || cell.bg !== currentBg || cellBlink !== currentBlink) {
        const codes: number[] = [];

        // Blink
        if (cellBlink !== currentBlink) {
          codes.push(cellBlink ? 5 : 25);
          currentBlink = cellBlink;
        }

        // Foreground color
        if (cell.fg !== currentFg) {
          if (cell.fg < 8) {
            codes.push(30 + cell.fg);
          } else {
            codes.push(90 + (cell.fg - 8));
          }
          currentFg = cell.fg;
        }

        // Background color
        if (cell.bg !== currentBg) {
          if (cell.bg < 8 || !iceColors) {
            codes.push(40 + (cell.bg % 8));
          } else {
            codes.push(100 + (cell.bg - 8));
          }
          currentBg = cell.bg;
        }

        if (codes.length > 0) {
          ansiContent += `\x1B[${codes.join(';')}m`;
        }
      }

      ansiContent += cell.char;
    }
  }

  // Add reset code at end
  ansiContent += '\x1B[0m';

  // Encode content as CP437, the character set the art is drawn in.
  // TextEncoder would write UTF-8 here, turning each block glyph into three
  // bytes and shifting every column after it.
  const contentData = encodeCP437(ansiContent);

  // Add SAUCE record if provided
  if (sauce) {
    const sauceData = createSAUCE({
      ...sauce,
      fileSize: contentData.length,
      dataType: 1, // Character
      fileType: 1, // ANSi
      tInfo1: width,
      tInfo2: height,
      tFlags: iceColors ? 1 : 0
    });

    // Combine content + SAUCE
    const combined = new Uint8Array(contentData.length + 1 + sauceData.length);
    combined.set(contentData, 0);
    combined[contentData.length] = 0x1A; // SUB (end-of-file marker)
    combined.set(sauceData, contentData.length + 1);

    return combined;
  }

  return contentData;
}

/**
 * Load .ASC (ASCII art) file
 */
export async function loadASCFile(data: Uint8Array): Promise<{ canvas: Cell[][], width: number, height: number }> {
  // Parse as plain text (CP437, the PC character set the art is drawn in)
  const text = decodeCP437(data);
  const lines = text.split(/\r?\n/);

  // Calculate dimensions
  const height = lines.length;
  const width = Math.max(...lines.map(line => line.length), 80);

  const canvas = Canvas.createCanvas(width, height);

  // Fill canvas with characters (no ANSI codes, all white on black)
  for (let y = 0; y < lines.length && y < height; y++) {
    const line = lines[y];
    for (let x = 0; x < line.length && x < width; x++) {
      Canvas.setCell(canvas, x, y, {
        char: line[x],
        fg: 7,  // White
        bg: 0,  // Black
        blink: false
      });
    }
  }

  return { canvas, width, height };
}

/**
 * Save .ASC (ASCII art) file
 */
export function saveASCFile(canvas: Cell[][]): Uint8Array {
  const height = canvas.length;
  const width = canvas[0]?.length || 0;

  // Convert canvas to plain text (ignore colors)
  const lines: string[] = [];

  for (let y = 0; y < height; y++) {
    let line = '';
    for (let x = 0; x < width; x++) {
      line += canvas[y][x].char;
    }
    lines.push(line);
  }

  // CP437, not UTF-8 - see the note in saveANSFile.
  return encodeCP437(lines.join('\r\n'));
}

/**
 * Load .XB (XBin) file
 * XBin is a binary ANSI art format with embedded palette
 */
export async function loadXBFile(data: Uint8Array): Promise<{ canvas: Cell[][], width: number, height: number }> {
  // Check XBin header "XBIN\x1A"
  if (data.length < 11 ||
      data[0] !== 0x58 || data[1] !== 0x42 || data[2] !== 0x49 || data[3] !== 0x4E || data[4] !== 0x1A) {
    throw new Error('Invalid XBin file format');
  }

  const width = readUInt16LE(data, 5);
  const height = readUInt16LE(data, 7);
  const fontHeight = data[9];
  const flags = data[10];

  // XBin flags
  const hasPalette = (flags & 0x01) !== 0;
  const hasFontName = (flags & 0x02) !== 0;
  const hasCompression = (flags & 0x04) !== 0;
  const hasNonBlink = (flags & 0x08) !== 0;
  const has512Chars = (flags & 0x10) !== 0;

  let offset = 11;

  // Skip palette if present (48 bytes)
  if (hasPalette) {
    offset += 48;
  }

  // Skip font name if present (variable length, null-terminated)
  if (hasFontName) {
    while (offset < data.length && data[offset] !== 0) {
      offset++;
    }
    offset++; // Skip null terminator
  }

  // Read character/attribute data
  const canvas = Canvas.createCanvas(width, height);

  if (hasCompression) {
    // Compressed format (RLE-like)
    let x = 0;
    let y = 0;

    while (offset < data.length && y < height) {
      const charByte = data[offset++];
      const attrByte = data[offset++];

      // Extract attributes
      const fg = attrByte & 0x0F;
      const bg = (attrByte >> 4) & 0x0F;
      const blink = hasNonBlink ? false : (attrByte & 0x80) !== 0;

      Canvas.setCell(canvas, x, y, {
        char: String.fromCharCode(charByte),
        fg,
        bg,
        blink
      });

      x++;
      if (x >= width) {
        x = 0;
        y++;
      }
    }
  } else {
    // Uncompressed format
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (offset + 1 >= data.length) break;

        const charByte = data[offset++];
        const attrByte = data[offset++];

        const fg = attrByte & 0x0F;
        const bg = (attrByte >> 4) & 0x07;
        const blink = hasNonBlink ? false : (attrByte & 0x80) !== 0;

        Canvas.setCell(canvas, x, y, {
          char: String.fromCharCode(charByte),
          fg,
          bg,
          blink
        });
      }
    }
  }

  return { canvas, width, height };
}

/**
 * Detect file format from content
 */
export function detectFileFormat(data: Uint8Array, filename?: string): 'ans' | 'asc' | 'xb' | 'unknown' {
  // Check XBin header
  if (data.length >= 5 &&
      data[0] === 0x58 && data[1] === 0x42 && data[2] === 0x49 && data[3] === 0x4E && data[4] === 0x1A) {
    return 'xb';
  }

  // Check for ANSI escape sequences
  for (let i = 0; i < Math.min(data.length - 1, 1000); i++) {
    if (data[i] === 0x1B && data[i + 1] === 0x5B) { // ESC [
      return 'ans';
    }
  }

  // Check filename extension
  if (filename) {
    const ext = filename.toLowerCase().split('.').pop();
    if (ext === 'ans') return 'ans';
    if (ext === 'asc' || ext === 'txt') return 'asc';
    if (ext === 'xb' || ext === 'xbin') return 'xb';
  }

  // Default to ASCII
  return 'asc';
}

/**
 * Load file (auto-detect format)
 */
export async function loadFile(data: Uint8Array, filename?: string): Promise<{ canvas: Cell[][], width: number, height: number, sauce?: SAUCERecord }> {
  const format = detectFileFormat(data, filename);

  switch (format) {
    case 'ans':
      return await loadANSFile(data);
    case 'asc':
      return await loadASCFile(data);
    case 'xb':
      return await loadXBFile(data);
    default:
      // Try as ASCII
      return await loadASCFile(data);
  }
}

/**
 * Save file (auto-detect format from filename)
 */
export function saveFile(canvas: Cell[][], filename: string, iceColors: boolean = false, sauce?: Partial<SAUCERecord>): Uint8Array {
  const ext = filename.toLowerCase().split('.').pop();

  switch (ext) {
    case 'ans':
      return saveANSFile(canvas, iceColors, sauce);
    case 'asc':
    case 'txt':
      return saveASCFile(canvas);
    default:
      // Default to ANSI
      return saveANSFile(canvas, iceColors, sauce);
  }
}
