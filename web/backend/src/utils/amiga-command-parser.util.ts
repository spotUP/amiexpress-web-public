/**
 * Amiga Command File Parser
 * Parses AmiExpress .info files (tooltypes) and .CMD files
 *
 * Maintains 100% Amiga compatibility for importing real BBS data
 * Based on express.e:4630-4820 command loading system
 */

import * as fs from 'fs';
import * as amigafs from './amigafs';
import * as path from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { SysopDebugUtil, DebugSeverity } from './sysop-debug.util';
import { isRealInfoFile } from './info-file.util';

// Door/Command types from axenums.e:15
export enum DoorType {
  XIM = 'XIM',       // eXpress Internal Module
  AIM = 'AIM',       // Amiga Internal Module
  SIM = 'SIM',       // Standard Internal Module (script)
  TIM = 'TIM',       // Text Internal Module
  IIM = 'IIM',       // Interactive Internal Module
  MCI = 'MCI',       // MCI command
  AEM = 'AEM',       // AmiExpress Module
  SUP = 'SUP',       // Support module
  FIM = 'FIM',       // FAME Interface Module (FAME BBS door compat)
  DD = 'DD',         // DayDream Interface Module (DayDream BBS door compat)
  TS = 'TS',         // TypeScript door (AmiExpress-Web extension)
  PYTHON = 'PYTHON', // Python door (AmiExpress-Web extension)
  PY = 'PY',         // Python door shorthand (AmiExpress-Web extension)
  AREXX = 'AREXX',   // ARexx door (AmiExpress-Web extension)
  REXX = 'REXX'      // REXX door shorthand (AmiExpress-Web extension)
}

// Command types from axenums.e:11
export enum CommandType {
  BBSCMD = 'BBSCMD',
  SYSCMD = 'SYSCMD',
  CUSTOM = 'CUSTOM'
}

// Tooltype levels (express.e:4630-4670)
export enum ToolTypeLevel {
  CONFCMD = 'CONFCMD',       // Conference-specific command
  NODECMD = 'NODECMD',       // Node-specific command
  BBSCMD = 'BBSCMD',         // Global BBS command
  CONFSYSCMD = 'CONFSYSCMD', // Conference-specific sysop command
  NODESYSCMD = 'NODESYSCMD', // Node-specific sysop command
  SYSCMD = 'SYSCMD'          // Global sysop command
}

/**
 * Spellings a TYPE tooltype carries that are not the enum's own name.
 *
 * The installer writes `TYPE=typescript` (door-installer.ts:132) and the admin
 * offers the same word in its Door Type list, but the enum member is `TS` - so
 * the lookup below missed and every one of those doors was registered as SIM,
 * a 68K door. The board then looked for a 68K executable inside the door's
 * directory, found none, and the door exited the moment a caller ran it:
 * "LOCATION points to directory /app/data/bbs/Doors/card-lobby but no matching
 * executable found". Reported from the board 2026-09-08 as "cardlobby exits on
 * the live server".
 *
 * It also made the admin's round trip lossy: the API served the misparsed
 * `SIM`, the form saved back what it had been shown, and a door's own .info
 * lost the type it was installed with.
 */
const TYPE_ALIASES: Record<string, DoorType> = {
  TYPESCRIPT: DoorType.TS,
  NODE: DoorType.TS,
  JS: DoorType.TS,
};

export interface CommandDefinition {
  name: string;
  type: DoorType;
  location: string;
  /** LOCATION exactly as the icon spells it: express.e runDoor's cmd, which the door's CLI carries as cli_CommandName. */
  invokedName?: string;
  access?: number;          // Minimum security level (express.e:4693)
  password?: string;        // Command password (express.e:4697-4709)
  priority?: string;        // Task priority (express.e:4746-4751)
  stack?: number;           // Stack size (express.e:4753)
  resident?: boolean;       // Keep in memory (express.e:4755)
  expertMode?: boolean;     // Expert mode flag (express.e:4757)
  trapOn?: boolean;         // Trap mode (express.e:4759)
  silent?: boolean;         // Silent mode (express.e:4761)
  banner?: string;          // Banner screen (express.e:4763)
  mimicVer?: string;        // Mimic version (express.e:4765)
  logInputs?: boolean;      // Log inputs (express.e:4767)
  scriptCheck?: boolean;    // Check script flag (express.e:4772)
  multiNode?: boolean;      // Multi-node support
  quickMode?: boolean;      // Quick mode (express.e:4739)
  internal?: string;        // Internal command (express.e:4711)
  passParameters?: number;  // Pass parameters mode (express.e:4712)
  mciText?: string;         // MCI text for MCI type doors (express.e:4295)
  args?: string;            // Command-line arguments to pass to door (ARGS tooltype)
  toolTypes?: Record<string, string>; // All parsed tooltypes (uppercased keys)
  overclockFactor?: number; // CPU overclocking multiplier (OVERCLOCK tooltype: 0=auto, 1-50=specific, -1=disable)
  pagination?: number; // Pagination override (PAGINATION tooltype: 0=door handles, >0=auto-pause at N lines, -1=use user setting)
}

/**
 * Amiga .info file binary parser
 *
 * Properly parses the DiskObject structure to find tooltypes at their actual location,
 * rather than scanning for strings (which picks up garbage from image data).
 *
 * File format:
 * - DiskObject header (78 bytes)
 * - First Image struct (20 bytes) + image data (if GadgetRender != 0)
 * - Second Image struct (20 bytes) + image data (if SelectRender != 0)
 * - DrawerData (56 bytes, if type is drawer and do_DrawerData != 0)
 * - DefaultTool string (null-terminated, if do_DefaultTool != 0)
 * - ToolTypes (sequential null-terminated strings, if do_ToolTypes != 0)
 * - ToolWindow string (null-terminated, if do_ToolWindow != 0)
 */

// DiskObject structure offsets
const DO_MAGIC = 0;           // UWORD - 0xE310
const DO_VERSION = 2;         // UWORD
const DO_GADGET = 4;          // struct Gadget (44 bytes)
const DO_TYPE = 48;           // UBYTE
const DO_DEFAULT_TOOL = 50;   // APTR (flag)
const DO_TOOL_TYPES = 54;     // APTR (flag)
const DO_CURRENT_X = 58;      // LONG
const DO_CURRENT_Y = 62;      // LONG
const DO_DRAWER_DATA = 66;    // APTR (flag)
const DO_TOOL_WINDOW = 70;    // APTR (flag)
const DO_STACK_SIZE = 74;     // LONG
const DISK_OBJECT_SIZE = 78;

// Gadget structure offsets (within DiskObject at offset 4)
const GG_WIDTH = 12;          // WORD (relative to DO_GADGET)
const GG_HEIGHT = 14;         // WORD
const GG_GADGET_RENDER = 22;  // APTR (flag for 1st image)
const GG_SELECT_RENDER = 26;  // APTR (flag for 2nd image)

// Image structure size (struct Image { LeftEdge, TopEdge, Width, Height, Depth, ... })
const IMAGE_STRUCT_SIZE = 20;
const IMG_WIDTH = 4;          // WORD — offset past LeftEdge(2)+TopEdge(2)
const IMG_HEIGHT = 6;         // WORD
const IMG_DEPTH = 8;          // WORD

// DrawerData structure size
const DRAWER_DATA_SIZE = 56;

// Workbench icon types
const WBDISK = 1;
const WBDRAWER = 2;
const WBGARBAGE = 5;

/**
 * Check if a string looks like a valid tooltype (not image garbage)
 * Valid tooltypes: KEY=VALUE or just KEY
 * Invalid: repeated characters, no letters, random binary data
 */
function isValidTooltypeString(str: string): boolean {
  const trimmed = str.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;

  // Must contain at least one letter
  if (!/[A-Za-z]/.test(trimmed)) return false;

  // Reject strings with too many repeated characters (image data patterns)
  // e.g., "UUUUUUU" or "EUUPUUX"
  const letterCount: Record<string, number> = {};
  let maxRepeat = 0;
  for (const char of trimmed.toUpperCase()) {
    if (/[A-Z]/.test(char)) {
      letterCount[char] = (letterCount[char] || 0) + 1;
      maxRepeat = Math.max(maxRepeat, letterCount[char]);
    }
  }
  // If one letter appears more than 60% of all letters, it's likely garbage
  const totalLetters = Object.values(letterCount).reduce((a, b) => a + b, 0);
  if (totalLetters > 4 && maxRepeat > totalLetters * 0.6) return false;

  // For KEY=VALUE format, validate the key part
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    let key = trimmed.substring(0, eqIdx).trim();
    // Strip leading non-alpha chars (NewIcons length prefixes like '%')
    const keyMatch = key.match(/[A-Za-z][A-Za-z0-9_.]*/);
    if (!keyMatch) return false;
    const cleanKey = keyMatch[0].toUpperCase();
    // Key must be a reasonable tooltype name
    if (cleanKey.length < 2) return false;
    // NewIcons stores icon image data as IM1=/IM2= tooltypes — reject them
    if (/^IM\d+$/.test(cleanKey)) return false;
  }

  return true;
}

/**
 * Calculate image data size in bytes
 * RASSIZE(w, h) = ((w + 15) >> 4) << 1 * h bytes per plane
 */
function calcImageDataSize(width: number, height: number, depth: number): number {
  const bytesPerRow = Math.floor((width + 15) / 16) * 2;
  return bytesPerRow * height * depth;
}

/**
 * Read a big-endian 16-bit word from buffer
 */
function readWord(buffer: Buffer, offset: number): number {
  if (offset + 2 > buffer.length) return 0;
  return (buffer[offset] << 8) | buffer[offset + 1];
}

/**
 * Read a big-endian 32-bit long from buffer
 */
function readLong(buffer: Buffer, offset: number): number {
  if (offset + 4 > buffer.length) return 0;
  return ((buffer[offset] << 24) | (buffer[offset + 1] << 16) |
          (buffer[offset + 2] << 8) | buffer[offset + 3]) >>> 0;
}

/**
 * Read a null-terminated string from buffer
 * Returns [string, bytesConsumed]
 */
function readNullString(buffer: Buffer, offset: number): [string, number] {
  let str = '';
  let i = offset;
  while (i < buffer.length && buffer[i] !== 0) {
    str += String.fromCharCode(buffer[i]);
    i++;
  }
  return [str, i - offset + 1]; // +1 for null terminator
}

/**
 * Add one raw tooltype string to the map.
 *
 * Shared by every reader below so that a tooltype means the same thing however
 * it was found: parenthesised entries are Workbench's way of commenting one
 * out, a bare word is a flag worth YES, and everything else splits on the
 * first '='.
 */
function absorbTooltype(tooltypes: Map<string, string>, raw: string): void {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return;

  // Workbench comments a tooltype out by wrapping it in parentheses.
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) return;

  // FindToolType returns the FIRST entry that matches (tooltypes.e:215-218),
  // so a key written twice resolves to the earlier one. This map used to keep
  // the later, which is a different answer than the board gives: bbsConfig.info
  // holds FTPDATAPORT twice, and last-wins turned its port list into a bare
  // flag. info-file.util's tooltypeMap has always done it this way.
  const remember = (key: string, value: string): void => {
    if (key.length === 0 || tooltypes.has(key)) return;
    tooltypes.set(key, value);
  };

  const eqIdx = trimmed.indexOf('=');
  if (eqIdx !== -1) {
    remember(trimmed.substring(0, eqIdx).toUpperCase().trim(), trimmed.substring(eqIdx + 1));
    return;
  }

  const key = trimmed.toUpperCase();
  if (/^[A-Z][A-Z0-9_.]*$/.test(key)) {
    remember(key, 'YES');
  }
}

/**
 * Read the ToolTypes array exactly as icon.library wrote it.
 *
 * On disk `do_ToolTypes` is a LENGTH-PREFIXED array, not a run of
 * null-terminated strings: a ULONG holding (entries + 1) * 4, then for every
 * entry a ULONG byte count followed by that many bytes, the last of which is
 * the NUL. Reading it as bare strings loses whichever entries the string
 * scanner cannot tell from the binary around them - and the prefix itself is
 * the trap, because a 32-character tooltype carries the length byte 0x21,
 * which prints as '!' and glues itself to the front of the entry.
 *
 * Every field is checked against the next: a byte count that does not land on
 * its own NUL means this is not the array, and the caller is told so rather
 * than handed a half-read map. That check is what makes it safe to go looking
 * for the array when the computed offset misses it.
 *
 * @returns the entries and the offset just past the array, or null if the
 *          bytes at `offset` are not a well-formed ToolTypes array
 */
function readToolTypeArray(buffer: Buffer, offset: number): { entries: string[]; end: number } | null {
  if (offset < 0 || offset + 4 > buffer.length) return null;

  const arraySize = readLong(buffer, offset);
  if (arraySize < 4 || arraySize % 4 !== 0) return null;

  const entryCount = arraySize / 4 - 1;
  if (entryCount < 1 || entryCount > 500) return null;

  const entries: string[] = [];
  let cursor = offset + 4;

  for (let i = 0; i < entryCount; i++) {
    if (cursor + 4 > buffer.length) return null;
    const length = readLong(buffer, cursor);
    cursor += 4;

    if (length < 1 || cursor + length > buffer.length) return null;
    // The declared length includes the terminator, so the last byte must be it
    // and no byte before it may be one.
    if (buffer[cursor + length - 1] !== 0) return null;
    if (buffer.indexOf(0, cursor) !== cursor + length - 1) return null;

    entries.push(buffer.subarray(cursor, cursor + length - 1).toString('latin1'));
    cursor += length;
  }

  return { entries, end: cursor };
}

/**
 * Are the bytes from `offset` to the end text a tool appended, or an image?
 *
 * A tooltype written past the array's end arrives as plain `KEY=VALUE` bytes
 * and a NUL. A NewIcons or ICONFACE payload is a binary IFF chunk that happens
 * to contain printable runs, and scraping those invents tooltypes nobody wrote.
 * Text, and nothing else, is the licence to read past the array.
 */
function isAppendedText(buffer: Buffer, offset: number): boolean {
  const trailing = buffer.subarray(offset);
  if (trailing.length === 0) return false;
  // Terminated the way a tooltype is terminated. A run of letters that simply
  // ends is a bitmap reading as text.
  if (trailing[trailing.length - 1] !== 0) return false;

  for (const byte of trailing) {
    if (byte === 0) continue;
    // Latin-1 and UTF-8 both live above 0x7e in these files; a control byte
    // does not belong in a tooltype.
    if (byte < 0x20 || byte === 0x7f) return false;
  }

  const records = trailing.toString('latin1').split('\0').filter(r => r.length > 0);
  const KEY = /^[A-Za-z0-9][A-Za-z0-9_.<>-]*$/;
  // A record is `KEY=VALUE` or a BARE KEY - the Amiga's way of writing a
  // flag, and one this rejected outright, which threw away the whole array
  // when a door declared `SILENT` on a line of its own.
  return records.length > 0 && records.every(record => {
    const eqIdx = record.indexOf('=');
    if (eqIdx === -1) return KEY.test(record.trim());
    return eqIdx > 0 && KEY.test(record.slice(0, eqIdx).trim());
  });
}

/**
 * Find the ToolTypes array when the computed offset does not land on it.
 *
 * The offset is computed by walking optional images whose sizes come from the
 * icon's own header, and a NewIcons or otherwise unusual icon can put the
 * walk off by a few bytes. Rather than give up on the real array and fall back
 * to scanning for printable runs, look for it: `readToolTypeArray` rejects
 * anything whose lengths do not agree with its own NULs, so a hit is a hit.
 * At least one entry must look like a KEY=VALUE, which image data will not.
 */
function findToolTypeArray(buffer: Buffer, from: number): { entries: string[]; end: number } | null {
  // Every offset, not every second one: an icon's array is not required to be
  // word-aligned, and this board's FCheck/LHA.info keeps its array at 439.
  for (let offset = from; offset + 8 <= buffer.length; offset += 1) {
    const array = readToolTypeArray(buffer, offset);
    if (array && array.entries.some(entry => isValidTooltypeString(entry) && entry.includes('='))) {
      return array;
    }
  }
  return null;
}

/**
 * Extract tooltypes from Amiga .info file using proper binary structure parsing.
 *
 * NOTE: This function returns Map<string, string> of tooltypes only.
 * For full .info file parsing (including binary data preservation), use
 * info-file.util.ts::parseInfoFile() instead.
 *
 * @param filePath - Path to the .info file
 * @param session - Optional BBS session for sysop debug messages
 * @param socket - Optional socket for sysop debug messages
 */
export function extractTooltypesFromInfoFile(filePath: string, session?: any, socket?: any): Map<string, string> {
  const tooltypes = new Map<string, string>();

  try {
    // Case-insensitive, because the .info name often comes from a door: a door
    // asking for tooltypes of "mtop" must reach "MTOP.info". Fixing the READER
    // rather than each caller is the single-source option - every caller of
    // this function (XIMProtocol, DoorMessageHandler, loadCommandFromInfo,
    // scanCommandDirectory, ...) inherits it, and a caller that already passes
    // an amigafs-resolved path is unaffected: amigafs fast-paths on an exact
    // hit. Callers used to guard with amigafs.existsSync and then hand the
    // UNRESOLVED path here, so on the container the guard passed and this
    // returned an empty map.
    if (!amigafs.existsSync(filePath)) {
      return tooltypes;
    }

    const buffer = amigafs.readFileSync(filePath) as Buffer;

    // For small files or non-standard .info files, use fallback string extraction
    if (buffer.length < DISK_OBJECT_SIZE) {
      return parseInfoFileFallback(buffer, filePath, session, socket);
    }

    // Verify magic number (0xE310)
    const magic = readWord(buffer, DO_MAGIC);
    if (magic !== 0xE310) {
      // Not a valid Workbench icon file, fall back to string extraction
      return parseInfoFileFallback(buffer, filePath, session, socket);
    }

    // Read key fields from DiskObject header
    const doType = buffer[DO_TYPE];
    const hasDefaultTool = readLong(buffer, DO_DEFAULT_TOOL) !== 0;
    const hasToolTypes = readLong(buffer, DO_TOOL_TYPES) !== 0;
    const hasDrawerData = readLong(buffer, DO_DRAWER_DATA) !== 0;
    const hasToolWindow = readLong(buffer, DO_TOOL_WINDOW) !== 0;

    // Check for images in Gadget structure
    const hasFirstImage = readLong(buffer, DO_GADGET + GG_GADGET_RENDER) !== 0;
    const hasSecondImage = readLong(buffer, DO_GADGET + GG_SELECT_RENDER) !== 0;

    // Calculate offset to data section (after header and images)
    let offset = DISK_OBJECT_SIZE;

    // Skip first image if present
    if (hasFirstImage && offset + IMAGE_STRUCT_SIZE <= buffer.length) {
      const imgWidth = readWord(buffer, offset + IMG_WIDTH);
      const imgHeight = readWord(buffer, offset + IMG_HEIGHT);
      const imgDepth = readWord(buffer, offset + IMG_DEPTH);
      const imageDataSize = calcImageDataSize(imgWidth, imgHeight, imgDepth);
      offset += IMAGE_STRUCT_SIZE + imageDataSize;
    }

    // Skip second image if present
    if (hasSecondImage && offset + IMAGE_STRUCT_SIZE <= buffer.length) {
      const imgWidth = readWord(buffer, offset + IMG_WIDTH);
      const imgHeight = readWord(buffer, offset + IMG_HEIGHT);
      const imgDepth = readWord(buffer, offset + IMG_DEPTH);
      const imageDataSize = calcImageDataSize(imgWidth, imgHeight, imgDepth);
      offset += IMAGE_STRUCT_SIZE + imageDataSize;
    }

    // Skip DrawerData if present (for drawer/disk/garbage icons)
    if (hasDrawerData && (doType === WBDISK || doType === WBDRAWER || doType === WBGARBAGE)) {
      offset += DRAWER_DATA_SIZE;
    }

    // Skip DefaultTool string if present
    if (hasDefaultTool && offset < buffer.length) {
      const [, consumed] = readNullString(buffer, offset);
      offset += consumed;
    }

    // Now we're at the ToolTypes section
    if (hasToolTypes && offset < buffer.length) {
      const array = readToolTypeArray(buffer, offset) ?? findToolTypeArray(buffer, DISK_OBJECT_SIZE);

      if (array) {
        for (const entry of array.entries) {
          // Image data that survived the length checks is still not a tooltype.
          if (!isValidTooltypeString(entry)) continue;
          absorbTooltype(tooltypes, entry);
        }

        // Anything written past the end of the array was appended by a tool
        // that did not grow the array's own count - this BBS has done it. A
        // real Amiga would never see those, but this one has been reading them
        // for as long as they have been there. They come last, so a key the
        // array already carries keeps the array's value: FindToolType answers
        // with the first match, and an appended entry is not a reason to give
        // a different answer than the board would.
        //
        // Only when the tail is TEXT, though. Most icons end in a NewIcons IFF
        // chunk, and scraping printable runs out of a bitmap invents tooltypes
        // that were never written: `FCheck/LHA.info` grew an `SOPTIONS` that
        // exists nowhere in the file, out of the bytes of its ICONFACE image.
        if (array.end < buffer.length && isAppendedText(buffer, array.end)) {
          const trailing = parseInfoFileFallback(
            buffer.subarray(array.end), filePath, session, socket
          );
          for (const [key, value] of trailing) {
            if (!tooltypes.has(key)) tooltypes.set(key, value);
          }
        }
      }
    }

    // If we found tooltypes, we're done
    if (tooltypes.size > 0) {
      return tooltypes;
    }

    // Fallback: if binary parsing found nothing, try string extraction
    // This handles non-standard or corrupted .info files
    return parseInfoFileFallback(buffer, filePath, session, socket);

  } catch (error) {
    SysopDebugUtil.debugFileError(socket, session, 'parse', filePath, error as Error, DebugSeverity.WARNING);
  }

  return tooltypes;
}

/**
 * Fallback parser using string extraction for non-standard .info files
 * Only used when binary parsing fails or finds no tooltypes
 */
function parseInfoFileFallback(buffer: Buffer, filePath: string, session?: any, socket?: any): Map<string, string> {
  const tooltypes = new Map<string, string>();

  // Extract all printable ASCII sequences
  const extractedStrings: string[] = [];
  let currentString = '';

  for (let i = 0; i < buffer.length; i++) {
    const charCode = buffer[i];
    if (charCode >= 32 && charCode <= 126) {
      currentString += String.fromCharCode(charCode);
    } else {
      if (currentString.length >= 2) {
        extractedStrings.push(currentString);
      }
      currentString = '';
    }
  }
  if (currentString.length >= 2) extractedStrings.push(currentString);

  for (const line of extractedStrings) {
    const trimmed = line.trim();

    // Skip commented tooltypes. Parentheses are Workbench's comment marker and
    // the only one: a leading '!' is not a convention, it is the low byte of
    // the entry's own 32-bit length (0x21 = a 32-character tooltype) printing
    // as a character and gluing itself to the front of the run. Dropping those
    // cost this board every command whose LOCATION happened to be that long -
    // BADD, BS, M, MOSEARCH, mobnup and _s all vanished from the registry.
    if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      continue;
    }

    // Use the same validation as binary parser
    if (!isValidTooltypeString(trimmed)) {
      continue;
    }

    // A COMMENT IS NOT A FLAG. `#` and `;` open a comment in these files,
    // and while only `KEY=VALUE` records were kept they fell out on their
    // own. Read as bare flags, `# Type setting` becomes the key TYPE with an
    // empty value - and first-wins then beats the real `TYPE=TIM` below it.
    if (trimmed.startsWith('#') || trimmed.startsWith(';')) {
      continue;
    }

    // A TOOLTYPE NEEDS NO VALUE. `SILENT` on a line of its own is how the
    // Amiga writes a flag, and express.e reads exactly that with
    // `checkToolTypeExists` (4774). This kept only `KEY=VALUE` records, so a
    // bare flag was dropped here and no existence test downstream could ever
    // see it - the board's logoff batch could not be silenced, and painted
    // over the logoff screen (sysop, 2026-09-14).
    //
    // Stored with an EMPTY value, which is what FindToolType answers for one.
    const eqIdx = trimmed.indexOf('=');
    // Strip leading non-alphabetic chars (e.g., '%' from NewIcons length prefix bytes)
    const rawKey = (eqIdx === -1 ? trimmed : trimmed.substring(0, eqIdx)).toUpperCase().trim();
    const keyMatch = rawKey.match(/[A-Z][A-Z0-9_.]*/);
    const key = keyMatch ? keyMatch[0] : '';
    const value = eqIdx === -1 ? '' : trimmed.substring(eqIdx + 1).trim();
    // Accept any reasonable KEY=VALUE pair, and keep the FIRST of a
    // repeated key - the answer FindToolType would give.
    if (key && key.length >= 2 && key.length <= 32 && !tooltypes.has(key)) {
      tooltypes.set(key, value);
    }
  }

  return tooltypes;
}

/**
 * Parse Amiga .CMD file
 *
 * Format: *COMMAND_NAME TYPE LOCATION
 * Example: *WEEK XM050Doors:WeekConfTop/WeekConfTop.XIM
 */
export function parseCmdFile(filePath: string, session?: any, socket?: any): CommandDefinition | null {
  try {
    if (!amigafs.existsSync(filePath)) {
      return null;
    }

    const content = amigafs.readFileSync(filePath, 'utf8').toString();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || !trimmed.startsWith('*')) {
        continue;
      }

      // Parse: *COMMAND_NAME TYPE+ACCESS LOCATION
      // Example: *WEEK     XM050Doors:WeekConfTop/WeekConfTop.XIM
      const parts = trimmed.substring(1).split(/\s+/).filter((p: string) => p.length > 0);

      if (parts.length >= 2) {
        const name = parts[0];
        const typeAndAccess = parts[1];
        // Location might be part of the same token (e.g., "XM050Doors:...")
        let location = parts.slice(2).join(' ');

        // Check if location is embedded in typeAndAccess
        // Only match if there's a path-like string (starts with letter or colon)
        const locationMatch = typeAndAccess.match(/^([A-Z]{2,3})(\d+)([A-Za-z:].+)$/);
        if (locationMatch && locationMatch[3]) {
          location = locationMatch[3];
        }

        // Parse type (first 2-3 chars) and access level (remaining digits)
        let type = DoorType.XIM;
        let access: number | undefined;

        if (typeAndAccess.length >= 2) {
          // Match type and access: e.g., "XM050" or "XIM050"
          const parseMatch = typeAndAccess.match(/^([A-Z]{2,3})(\d+)/i);
          if (parseMatch) {
            const typeStr = parseMatch[1].toUpperCase();
            if (typeStr === 'XM' || typeStr === 'XI' || typeStr === 'XIM') {
              type = DoorType.XIM;
            } else if (typeStr === 'AM' || typeStr === 'AI' || typeStr === 'AIM') {
              type = DoorType.AIM;
            } else if (typeStr === 'SM' || typeStr === 'SI' || typeStr === 'SIM') {
              type = DoorType.SIM;
            } else if (typeStr === 'TM' || typeStr === 'TI' || typeStr === 'TIM') {
              type = DoorType.TIM;
            } else if (typeStr === 'IM' || typeStr === 'II' || typeStr === 'IIM') {
              type = DoorType.IIM;
            } else if (typeStr === 'MC' || typeStr === 'MCI') {
              type = DoorType.MCI;
            } else if (typeStr === 'FM' || typeStr === 'FI' || typeStr === 'FIM') {
              type = DoorType.FIM;
            } else if (typeStr === 'DD') {
              // DayDream doors don't have an established 2-3-char TYPE=
              // convention the way FAME's FM/FI/FIM do (DayDream's own
              // .info/config format never needed one); accept 'DD' as the
              // primary/only alias since that's the string
              // analyze-all-doors.sh and door-installer.ts already emit.
              type = DoorType.DD;
            }

            // Extract access level
            if (parseMatch[2]) {
              access = parseInt(parseMatch[2], 10);
            }
          }
        }

        const invokedName = location.trim();
        // Convert Amiga paths to Unix paths
        location = location.replace(/^DOORS:/i, 'Doors/').replace(/:/g, '/');

        return {
          name,
          type,
          location,
          invokedName,
          access
        };
      }
    }
  } catch (error) {
    SysopDebugUtil.debugFileError(socket, session, 'parse', filePath, error as Error, DebugSeverity.CRITICAL);
console.error(`Error parsing .CMD file ${filePath}:`, error);
  }

  return null;
}

function getConferenceDirNames(confNumber: number): string[] {
  // reference-board data uses unpadded ConfX; avoid padded variants to prevent Conf01 creation
  return [`Conf${confNumber}`];
}

/**
 * Load command definition from .info file
 * Implements express.e:4630-4820 command loading logic
 */
export function loadCommandFromInfo(filePath: string): CommandDefinition | null {
  const tooltypes = extractTooltypesFromInfoFile(filePath);

  if (tooltypes.size === 0) {
    return null;
  }

  // Extract command name from BBSCMD or SYSCMD tooltype, or fall back to filename.
  // Many .info files don't have explicit BBSCMD/SYSCMD - the filename IS the command.
  // e.g., AEDOOR.info -> AEDOOR, WHO.info -> WHO
  const commandNameFromTooltype = tooltypes.get('BBSCMD') || tooltypes.get('SYSCMD');
  const baseName = path.basename(filePath);
  const nameFromFile = baseName.replace(/\.info$/i, '').toUpperCase();
  const name = commandNameFromTooltype ? commandNameFromTooltype.toUpperCase() : nameFromFile;

  // Preserve all tooltypes for downstream consumers (uppercased keys)
  const toolTypeObject = Object.fromEntries(tooltypes.entries());

  // Required field: LOCATION
  const locationKey = tooltypes.get('LOCATION') || tooltypes.get('PATH');
  if (!locationKey) {
    return null;
  }

  // Get TYPE (default to SIM if not specified - express.e:4676)
  let type = DoorType.SIM;
  const typeStr = tooltypes.get('TYPE');
  if (typeStr) {
    const spelled = typeStr.toUpperCase();
    type = TYPE_ALIASES[spelled]
      ?? (DoorType[spelled as keyof typeof DoorType]) ?? DoorType.SIM;
  }

  // Build command definition - normalize Amiga paths to Unix
  // Handle common Amiga path prefixes:
  // - doors:xxx -> doors/xxx
  // - BBS:doors/xxx -> doors/xxx (BBS: is the BBS root)
  // - BBS:Doors/xxx -> Doors/xxx
  const normalizedLocation = locationKey
    .replace(/^BBS:/i, '')           // Strip BBS: prefix (it's the BBS root)
    .replace(/^doors:/i, 'Doors/')   // Convert doors: to Doors/ (preserve case for Linux)
    .replace(/:/g, '/');

  const cmd: CommandDefinition = {
    name,
    type,
    location: normalizedLocation, // Convert Amiga paths to Unix
    invokedName: locationKey.trim(),
    toolTypes: toolTypeObject,
  };

  // Optional fields (express.e:4693-4767)
  const access = tooltypes.get('ACCESS');
  if (access !== undefined) {
    // Unparseable ACCESS stays undefined = absent = everyone, never 0 = nobody.
    const level = parseInt(access, 10);
    if (Number.isFinite(level)) cmd.access = level;
  }

  const password = tooltypes.get('PASSWORD');
  if (password) {
    cmd.password = password;
  }

  const priority = tooltypes.get('PRIORITY');
  if (priority) {
    cmd.priority = priority;
  }

  const stack = tooltypes.get('STACK');
  if (stack) {
    cmd.stack = parseInt(stack, 10);
  }

  // Parse OVERCLOCK tooltype (CPU overclocking factor)
  // 0 = auto (10x for batch, 0x for interactive)
  // 1-50 = specific multiplier
  // -1 = force disable (even for batch doors)
  const overclock = tooltypes.get('OVERCLOCK');
  if (overclock) {
    const factor = parseInt(overclock, 10);
    if (!isNaN(factor)) {
      cmd.overclockFactor = factor;
console.log(`[loadCommandFromInfo] OVERCLOCK=${factor} for ${cmd.name || cmd.location}`);
    }
  }

  // Parse PAGINATION tooltype (pagination behavior)
  // 0 or not set = door handles its own pagination (default)
  // >0 = auto-pause after N lines
  // -1 = use user's screen height setting
  const pagination = tooltypes.get('PAGINATION');
  if (pagination) {
    const lines = parseInt(pagination, 10);
    if (!isNaN(lines)) {
      cmd.pagination = lines;
console.log(`[loadCommandFromInfo] PAGINATION=${lines} for ${cmd.name || cmd.location}`);
    }
  }

  // A FLAG TOOLTYPE IS ITS PRESENCE, NOT ITS VALUE.
  //
  // express.e reads every one of these with `checkToolTypeExists` - RESIDENT
  // 4769, EXPERT_MODE 4770, TRAPON 4772, SILENT 4774, LOG_INPUTS 4780,
  // SCRIPTCHECK 4784, QUICKMODE 4755 - so the Amiga convention of a bare
  // `SILENT` line on its own turns the flag on. This asked whether the VALUE
  // was the string 'YES', so a bare flag read as FALSE: the board's logoff
  // batch could not be silenced and painted its maintenance output over the
  // logoff screen (sysop, 2026-09-14). `SILENT=YES` still works - a tooltype
  // with a value exists too.
  //
  // MULTINODE is NOT in this list on purpose: express.e has no such tooltype
  // at all, it is this board's own, and its `.info` files carry
  // `MULTINODE=NO` meaning it.
  const flagSet = (name: string): boolean => tooltypes.has(name);
  cmd.resident = flagSet('RESIDENT');
  cmd.expertMode = flagSet('EXPERT_MODE');
  cmd.trapOn = flagSet('TRAPON');
  cmd.silent = flagSet('SILENT');
  cmd.multiNode = tooltypes.get('MULTINODE') === 'YES';
  cmd.quickMode = flagSet('QUICKMODE');
  cmd.scriptCheck = flagSet('SCRIPTCHECK');
  cmd.logInputs = flagSet('LOG_INPUTS');

  const banner = tooltypes.get('BANNER');
  if (banner) {
    cmd.banner = banner;
  }

  const mimicVer = tooltypes.get('MIMICVER');
  if (mimicVer) {
    cmd.mimicVer = mimicVer;
  }

  const internal = tooltypes.get('INTERNAL');
  if (internal) {
    cmd.internal = internal;

    const passParams = tooltypes.get('PASS_PARAMETERS');
    if (passParams) {
      cmd.passParameters = parseInt(passParams, 10);
    }
  }

  // MCI_TEXT for MCI type doors (express.e:4295)
  const mciText = tooltypes.get('MCI_TEXT');
  if (mciText && type === DoorType.MCI) {
    cmd.mciText = mciText;
  }

  // ARGS for command-line arguments to pass to door
  const args = tooltypes.get('ARGS');
  if (args) {
    cmd.args = args;
  }

  return cmd;
}

/**
 * Is there anything behind this registration?
 *
 * A <CMD>.info whose LOCATION resolves to nothing cannot run, but it still
 * OWNS the command name: dispatch finds it in the cache and answers with an
 * error instead of falling through, and the internal-command router hands
 * any name present in commandCache.bbscmd straight to the door
 * (command-handler/internal-commands.ts). On 30 August a Doors/ wipe left 277
 * such registrations across the Commands tree - `BR`, `BV`, `BADD`,
 * `BROADCAST`, and `G`, which is 5D-LogOff registered under the internal
 * goodbye command's name, so logging off was impossible until the .info was
 * removed by hand.
 *
 * This diverges from express.e deliberately. express.e resolves the .info
 * (configFileExists, express.e:4632) and then LoadSegs whatever LOCATION
 * names, error and all; a real board's registrations do not go stale behind
 * the sysop's back, and this one's did.
 *
 * The rule is conservative on purpose. A MISSING FILE inside an existing door
 * directory stays registered: that is exactly what a TypeScript door
 * replacing an Amiga binary looks like - nothing named Doors/bbslink/bbslink
 * has ever existed on this board and 24 live commands point at it. Only a
 * registration whose DIRECTORY is gone as well counts as dead, which is the
 * shape a wiped door leaves behind.
 *
 * @param baseDir absolute path to the BBS data directory
 * @param cmd a definition from loadCommandFromInfo (its location is already
 *            normalised: assigns stripped, ':' turned into '/')
 */
export function commandLocationIsLive(baseDir: string, cmd: CommandDefinition): boolean {
  // express.e:4732 - INTERNAL is read and dispatched BEFORE LOCATION is
  // looked at, so an internal alias needs nothing on disk.
  if (cmd.internal) return true;

  // express.e:4295 - an MCI command IS its MCI_TEXT; there is no file to find.
  if (cmd.type === DoorType.MCI) return true;

  if (!cmd.location) return true;

  const resolved = path.isAbsolute(cmd.location)
    ? cmd.location
    : path.join(baseDir, cmd.location);

  // amigafs, not fs: an Amiga volume is case-insensitive and a LOCATION is
  // written in whatever case the sysop's icon carries.
  if (amigafs.existsSync(resolved)) return true;
  return amigafs.existsSync(path.dirname(resolved));
}

/**
 * Scan command directory for available commands
 * Implements express.e:4630-4670 command lookup hierarchy
 *
 * Priority order (highest to lowest):
 * 1. Conference-specific commands (CONFCMD)
 * 2. Node-specific commands (NODECMD)
 * 3. Global BBS commands (BBSCMD)
 */
export function getCommandSearchPaths(
  baseDir: string,
  commandType: CommandType,
  conferenceId?: number,
  nodeId?: number
): string[] {
  const searchPaths: string[] = [];
  const leaf = commandType === CommandType.BBSCMD ? 'BBSCmd'
    : commandType === CommandType.SYSCMD ? 'SysCmd'
    : null;

  if (leaf === null) {
    return searchPaths;
  }

  if (conferenceId) {
    for (const confName of getConferenceDirNames(conferenceId)) {
      searchPaths.push(path.join(baseDir, confName, 'Commands', leaf));
    }
  }
  if (nodeId) {
    searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', leaf));
  }
  searchPaths.push(path.join(baseDir, 'Commands', leaf));

  return searchPaths;
}

export function scanCommandDirectory(
  baseDir: string,
  commandType: CommandType,
  conferenceId?: number,
  nodeId?: number
): Map<string, CommandDefinition> {
  const commands = new Map<string, CommandDefinition>();
  const skipped: string[] = [];

  // Build search paths in priority order — shared with the freshness check
  // in command-execution.handler.ts, which must watch exactly the
  // directories this scan reads and no others.
  const searchPaths = getCommandSearchPaths(baseDir, commandType, conferenceId, nodeId);

  // Scan each directory for .info files
  for (const dirPath of searchPaths) {
    console.log(`  Scanning ${commandType} directory: ${dirPath}`);
    if (!amigafs.existsSync(dirPath)) {
      console.log(`    Directory does not exist, skipping`);
      continue;
    }

    const files = amigafs.readdirSync(dirPath);
    for (const file of files) {
      if (isRealInfoFile(file)) {
        const fullPath = path.join(dirPath, file);
        const cmd = loadCommandFromInfo(fullPath);

        if (cmd) {
          // A registration with nothing behind it is not a command. Dropped
          // here rather than at dispatch so it disappears from the cache,
          // the door registry and every list built from them at once, and
          // so the internal command it was shadowing becomes reachable
          // again. See commandLocationIsLive.
          if (!commandLocationIsLive(baseDir, cmd)) {
            skipped.push(`${cmd.name} -> ${cmd.location}`);
            continue;
          }

          const existing = commands.get(cmd.name);

          // First one wins (conference/node commands have higher priority than global)
          if (!existing) {
            commands.set(cmd.name, cmd);
          }
        }
      }
    }
  }

  // Say what was dropped and where it pointed. A sysop looking for a command
  // that "just stopped answering" needs to see the LOCATION that no longer
  // resolves, not silence.
  if (skipped.length > 0) {
    console.warn(
      `  [${commandType}] ${skipped.length} registration(s) skipped - LOCATION missing: ${skipped.join(', ')}`
    );
  }

  return commands;
}

/**
 * Find command definition by name
 * Implements the command lookup logic from express.e:4630-4670
 */
export function findCommand(
  baseDir: string,
  commandName: string,
  commandType: CommandType,
  conferenceId?: number,
  nodeId?: number
): CommandDefinition | null {
  const commands = scanCommandDirectory(baseDir, commandType, conferenceId, nodeId);
  return commands.get(commandName.toUpperCase()) || null;
}

/**
 * Backward-compatible alias for extractTooltypesFromInfoFile.
 *
 * DEPRECATED: Use extractTooltypesFromInfoFile() for clarity, or
 * info-file.util.ts::parseInfoFile() for full .info file parsing.
 *
 * @deprecated Use extractTooltypesFromInfoFile instead
 */
export { extractTooltypesFromInfoFile as parseInfoFile };
