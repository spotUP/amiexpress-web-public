/**
 * File operations for ANSI editor
 * Supports .ANS (ANSI), .ASC (ASCII), .XB (XBin) formats
 */

import {
  decodeCP437, encodeCP437,
  isAmigaText, isAmigaFont, latin1ByteToChar, cp437ByteToChar, encodeLatin1Art,
} from './cp437';
import type { Cell } from '../types';
import { bgCode } from '../../../../core/ansi-background';
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
export async function loadANSFile(
  data: Uint8Array,
  opts: { fileName?: string } = {},
): Promise<{ canvas: Cell[][], width: number, height: number, sauce?: SAUCERecord, amiga: boolean }> {
  // Parse SAUCE record (if present)
  const sauce = parseSAUCE(data) || undefined;

  /*
   * Get content (without SAUCE) - EVERYTHING before the record, and SAUCE's
   * own fileSize is not allowed to shorten it.
   *
   * fileSize says where the DRAWING ends, and on a BBS screen that is not
   * where the file ends. The board writes its codes on the lines BELOW the
   * art and does not restamp the record an art program left - `Conf2/bull20.txt`
   * on the live board is 3542 bytes with fileSize 3378, and the 35 bytes
   * between them are `~SP`, `~f`, `~CC_ctop` and `~XISUBSCAN`. Cutting at
   * fileSize hid all four from the editor ("i only see the tag above the logo
   * not the ones under it", sysop 2026-09-18) - and saving then wrote back
   * only the rows it had, which DELETED them.
   *
   * The board's own reader strips the record and nothing else
   * (`amiga-text-decode.util.ts` - it finds the marker and cuts there), so
   * this is also what a caller is actually served. The editor has to see the
   * same bytes or it is editing a different file.
   *
   * The same lesson as the row count below: SAUCE is the artist's note about
   * their drawing, not a description of the screen the board built around it.
   */
  let contentLength = data.length;
  if (sauce) {
    const beforeSauce = Math.max(0, data.length - 128);
    contentLength = beforeSauce > 0 && data[beforeSauce - 1] === 0x1a
      ? beforeSauce - 1
      : beforeSauce;
  }
  const content = data.slice(0, contentLength);

  // Parse ANSI content
  const width = sauce?.tInfo1 || 80;

  // Amiga art is Latin-1, not CP437 (see isAmigaText). Eleven of the
  // sixteen Super Qix backgrounds are Amiga pieces, and every one of them
  // came out as box-drawing before this.
  // Which of the two, by the rule the board reads the same file with
  // (isAmigaText): an unstamped Amiga screen is Latin-1 here too.
  const amiga = isAmigaText(content, sauce, opts.fileName);
  const byteToChar = amiga ? latin1ByteToChar : cp437ByteToChar;

  /*
   * SAUCE's row count is a HINT, not a limit - the same lesson as its
   * fileSize just above.
   *
   * An art program writes the height of the picture it drew. A BBS screen is
   * that picture plus the MCI codes the board runs, and those sit on lines
   * BELOW it: a 21-row piece in a file of 24 lines, with ~SP, ~f and ~CC_ctop
   * underneath. Parsing to the declared height stops before them, so the
   * editor never saw them - and saving wrote back only the rows it had, which
   * deleted them.
   *
   * Counting newlines is a lower bound (cursor positioning can reach further)
   * and it is the case that actually occurs.
   */
  const declaredHeight = sauce?.tInfo2 || 25;
  let lineCount = 1;
  for (let n = 0; n < content.length - 1; n++) {
    // Stopping one short of the end is deliberate: a newline that ENDS the
    // file closes the last row, it does not open another. Counting it would
    // add a blank row, and saving writes the canvas back - so a screen would
    // grow a line every time a sysop opened and saved it.
    if (content[n] === 0x0a) lineCount++;
  }
  const height = Math.max(declaredHeight, lineCount);
  const iceColors = sauce ? (sauce.tFlags & 1) === 1 : false;

  const canvas = Canvas.createCanvas(width, height);

  // Parse ANSI escape sequences
  let x = 0;
  let y = 0;
  let fg = 7; // White
  let bg = 0; // Black
  let blink = false;
  /**
   * Bold is an ATTRIBUTE that outlives the colour code beside it.
   *
   * `ESC[1;33m` is how ANSI art has always written bright yellow, and this
   * parser applied the codes in the order they arrived: 1 brightened the
   * colour that was current, then 33 replaced it with plain brown. Every
   * bright colour in every imported drawing came out as its dim twin -
   * bright green as dark green, bright yellow as brown - which is what an
   * artist saw comparing our editor against Moebius (2026-09-14).
   */
  let bold = false;
  /** The colour the file asked for, before bold is applied to it. */
  let baseFg = 7;
  const applyFg = (): void => { fg = bold && baseFg < 8 ? baseFg + 8 : baseFg; };
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
            baseFg = 7;
            bold = false;
            applyFg();
            bg = 0;
            blink = false;
          } else if (c === 1) {
            // Bold: brightens whatever colour is named, before OR after it.
            bold = true;
            applyFg();
          } else if (c === 22) {
            // Normal intensity - the way out of bold.
            bold = false;
            applyFg();
          } else if (c === 5) {
            // Blink
            blink = true;
          } else if (c === 7) {
            // Inverse (swap fg/bg)
            [fg, bg] = [bg, fg];
            baseFg = fg;
          } else if (c >= 30 && c <= 37) {
            // Foreground color - bold, if it is on, still applies to it.
            baseFg = c - 30;
            applyFg();
          } else if (c >= 40 && c <= 47) {
            // Background color
            bg = c - 40;
          } else if (c >= 90 && c <= 97) {
            // Bright foreground color, named outright.
            baseFg = c - 90 + 8;
            applyFg();
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

      const char = byteToChar(byte);
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

  return { canvas, width, height, sauce, amiga };
}

/**
 * Save .ANS (ANSI art) file
 */
export function saveANSFile(
  canvas: Cell[][],
  iceColors: boolean = false,
  sauce?: Partial<SAUCERecord>,
  /** The character set the file was read in (loadANSFile's `amiga`); absent, the SAUCE font decides. */
  amiga?: boolean,
): Uint8Array {
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
            codes.push(bgCode(cell.bg % 8));
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

  // Encode in the character set the art is drawn in - the one its SAUCE font
  // names, as loadANSFile decoded it (isAmigaText): CP437, or Latin-1 for
  // Amiga art. TextEncoder would write UTF-8 here, turning each block glyph
  // into three bytes and shifting every column after it.
  const contentData = (amiga ?? isAmigaFont(sauce?.tInfoS)) ? encodeLatin1Art(ansiContent) : encodeCP437(ansiContent);

  /**
   * A file that USES iCE colours has to SAY it uses them.
   *
   * The iCE flag lives in SAUCE's tFlags, and this only wrote a SAUCE record
   * when the caller handed one in. So `saveANSFile(canvas, true)` with no
   * SAUCE wrote ESC[100m..107m for the bright backgrounds and then shipped a
   * file with nothing to declare them - and loadANSFile, which reads the flag
   * before honouring those codes, dropped every one of them. A bright
   * background saved and reloaded came back BLACK, in the editor that had
   * just drawn it.
   *
   * So iCE implies a SAUCE record. Without iCE the behaviour is unchanged: no
   * SAUCE unless a caller asked for one.
   */
  if (sauce || iceColors) {
    const sauceData = createSAUCE({
      ...sauce,
      fileSize: contentData.length,
      dataType: 1, // Character
      fileType: 1, // ANSi
      tInfo1: width,
      tInfo2: height,
      // iCE is bit 0; the record's other flags (letter spacing, aspect
      // ratio) are the artist's and survive the save.
      tFlags: ((sauce?.tFlags ?? 0) & ~1) | (iceColors ? 1 : 0),
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

  // Read for the record and deliberately unused: this loader renders with the
  // host's own font, so the XBin font height and the 512-character flag change
  // nothing about the canvas it produces. Named rather than skipped, because
  // the next person reading this wants the header's shape.
  void fontHeight;
  void has512Chars;

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

/**
 * How many 24-bit colour sequences a file carries.
 *
 * PabloDraw and Moebius write true colour as `ESC[0;r;g;bt` (foreground) and
 * `ESC[1;r;g;bt` (background) - the one CSI this parser does not model, because
 * a `Cell` holds a 0-15 palette index and has nowhere to put an RGB triple.
 *
 * The sequences are consumed and ignored on load, which is survivable for
 * LOOKING at a screen. It is not survivable for SAVING one: `canvasToANSI`
 * writes from the cells, so a load-and-save round trip drops every one of them.
 * Measured on `!ASCII-Art/ansi/H7/h7-up_rough_doors.asc` (2026-09-16): 337
 * sequences in, zero out, 6,838 bytes down to 2,459 - an artist's true-colour
 * drawing flattened to sixteen colours with nothing said.
 *
 * So a host that can write files asks this BEFORE opening an editor on one,
 * and says what editing would cost. Counting rather than a boolean because the
 * number is what makes the warning concrete.
 */
export function countTrueColourCodes(bytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] !== 0x1b || bytes[i + 1] !== 0x5b) continue;  // ESC [
    let j = i + 2;
    while (j < bytes.length && ((bytes[j] >= 0x30 && bytes[j] <= 0x39) || bytes[j] === 0x3b)) j++;
    if (j < bytes.length && bytes[j] === 0x74) count++;  // final 't'
  }
  return count;
}

/**
 * The sixteen ANSI colours as RGB, in SGR order: 0-7 normal, 8-15 bright.
 *
 * The VGA hardware values, because that is what the art carries. PabloDraw and
 * Moebius write a document's PALETTE out as explicit RGB, so ordinary
 * sixteen-colour art arrives full of `ESC[1;r;g;bt` with values that are the
 * palette entries plus a rounding wobble - `255,87,87` for bright red,
 * `171,0,171` for magenta.
 *
 * One owner, here, because the board folds these for byte transports too
 * (web/backend/src/utils/true-colour-fold.util.ts) and a second table would
 * drift. A near-miss on one side and not the other means a screen the editor
 * refuses and the wire flattens, or the reverse.
 */
export const ANSI_16_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0],
  [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
  [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85],
  [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
];

/** Which of the sixteen a colour is closest to, by squared RGB distance. */
export function nearestAnsi16(r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ANSI_16_RGB.length; i++) {
    const [pr, pg, pb] = ANSI_16_RGB[i];
    const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * The most a colour may miss the palette by and still count as palette art.
 *
 * The board's own files miss by at most 12. 64 is eight units on one channel:
 * past any rounding an editor does, short of a colour chosen off the palette.
 */
export const PALETTE_ROUNDING_TOLERANCE = 64;

/**
 * How far this file's 24-bit colours sit from the sixteen, at worst.
 *
 * Zero when there are none, or when every one IS a palette entry. A dozen
 * means palette art whose RGB carries a rounding wobble. A large number means
 * somebody really did paint with colours the sixteen cannot hold.
 *
 * `countTrueColourCodes` says how a file was WRITTEN; this says what it holds,
 * and only the second decides whether opening it would cost the artist
 * anything ("he never actively tried to make it 24-bit", the sysop, via the
 * artist, 2026-09-17).
 */
export function worstPaletteDistance(bytes: Uint8Array): number {
  let worst = 0;
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] !== 0x1b || bytes[i + 1] !== 0x5b) continue;  // ESC [
    let j = i + 2;
    let params = '';
    while (j < bytes.length && ((bytes[j] >= 0x30 && bytes[j] <= 0x39) || bytes[j] === 0x3b)) {
      params += String.fromCharCode(bytes[j]);
      j++;
    }
    if (j >= bytes.length || bytes[j] !== 0x74) continue;  // final 't'

    const parts = params.split(';').map(p => Number.parseInt(p, 10));
    // Only the two COLOUR forms; `ESC[8;24;80t` is a window resize, not a
    // colour, and measuring it against a palette would be meaningless.
    if (parts.length < 4 || parts.slice(0, 4).some(n => !Number.isFinite(n))) continue;
    const [mode, r, g, b] = parts;
    if (mode !== 0 && mode !== 1) continue;

    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    const [cr, cg, cb] = [clamp(r), clamp(g), clamp(b)];
    const [pr, pg, pb] = ANSI_16_RGB[nearestAnsi16(cr, cg, cb)];
    worst = Math.max(worst, (pr - cr) ** 2 + (pg - cg) ** 2 + (pb - cb) ** 2);
  }
  return worst;
}

/** Whether every 24-bit colour in `bytes` is a palette colour after all. */
export function isPaletteArt(bytes: Uint8Array): boolean {
  return worstPaletteDistance(bytes) <= PALETTE_ROUNDING_TOLERANCE;
}
