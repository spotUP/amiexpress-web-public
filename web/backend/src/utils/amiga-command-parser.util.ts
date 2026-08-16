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

export interface CommandDefinition {
  name: string;
  type: DoorType;
  location: string;
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
    if (!fs.existsSync(filePath)) {
      return tooltypes;
    }

    const buffer = fs.readFileSync(filePath);

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
      // ToolTypes are stored as sequential null-terminated strings
      // The section ends when we hit an empty string or run out of valid data
      let tooltypeCount = 0;
      const maxTooltypes = 500; // Safety limit

      while (offset < buffer.length && tooltypeCount < maxTooltypes) {
        // Check for null byte at start - end of tooltypes section
        if (buffer[offset] === 0) {
          break;
        }

        const [tooltypeStr, consumed] = readNullString(buffer, offset);
        offset += consumed;

        if (tooltypeStr.length === 0) {
          break;
        }

        // Skip strings that look like image/garbage data
        // Valid tooltypes have recognizable ASCII patterns with letters
        if (!isValidTooltypeString(tooltypeStr)) {
          continue;
        }

        // Parse the tooltype string
        const trimmed = tooltypeStr.trim();

        // Skip commented-out tooltypes (parenthesized)
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          tooltypeCount++;
          continue;
        }

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.substring(0, eqIdx).toUpperCase().trim();
          const value = trimmed.substring(eqIdx + 1);
          if (key.length > 0) {
            tooltypes.set(key, value);
          }
        } else {
          // Flag-style tooltype (no value)
          const key = trimmed.toUpperCase();
          if (key.length > 0 && /^[A-Z][A-Z0-9_.]*$/.test(key)) {
            tooltypes.set(key, 'YES');
          }
        }

        tooltypeCount++;
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

    // Skip commented tooltypes
    if ((trimmed.startsWith('(') && trimmed.endsWith(')')) || trimmed.startsWith('!')) {
      continue;
    }

    // Use the same validation as binary parser
    if (!isValidTooltypeString(trimmed)) {
      continue;
    }

    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      // Strip leading non-alphabetic chars (e.g., '%' from NewIcons length prefix bytes)
      let rawKey = trimmed.substring(0, eqIdx).toUpperCase().trim();
      const keyMatch = rawKey.match(/[A-Z][A-Z0-9_.]*/);
      const key = keyMatch ? keyMatch[0] : '';
      const value = trimmed.substring(eqIdx + 1).trim();
      // Accept any reasonable KEY=VALUE pair
      if (key && key.length >= 2 && key.length <= 32) {
        tooltypes.set(key, value);
      }
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
        let access = 0;

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
            } else if (typeStr === 'DM' || typeStr === 'DD') {
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

        // Convert Amiga paths to Unix paths
        location = location.replace(/^DOORS:/i, 'Doors/').replace(/:/g, '/');

        return {
          name,
          type,
          location,
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
    type = (DoorType[typeStr.toUpperCase() as keyof typeof DoorType]) || DoorType.SIM;
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
    toolTypes: toolTypeObject,
  };

  // Optional fields (express.e:4693-4767)
  const access = tooltypes.get('ACCESS');
  if (access) {
    cmd.access = parseInt(access, 10);
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

  cmd.resident = tooltypes.get('RESIDENT') === 'YES';
  // EXPRESS.E treats EXPERT_MODE as a flag; presence triggers doorExpertMode
  cmd.expertMode = tooltypes.has('EXPERT_MODE');
  cmd.trapOn = tooltypes.get('TRAPON') === 'YES';
  cmd.silent = tooltypes.get('SILENT') === 'YES';
  cmd.multiNode = tooltypes.get('MULTINODE') === 'YES';
  cmd.quickMode = tooltypes.get('QUICKMODE') === 'YES';
  cmd.scriptCheck = tooltypes.get('SCRIPTCHECK') === 'YES';
  cmd.logInputs = tooltypes.get('LOG_INPUTS') === 'YES';

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
 * Scan command directory for available commands
 * Implements express.e:4630-4670 command lookup hierarchy
 *
 * Priority order (highest to lowest):
 * 1. Conference-specific commands (CONFCMD)
 * 2. Node-specific commands (NODECMD)
 * 3. Global BBS commands (BBSCMD)
 */
export function scanCommandDirectory(
  baseDir: string,
  commandType: CommandType,
  conferenceId?: number,
  nodeId?: number
): Map<string, CommandDefinition> {
  const commands = new Map<string, CommandDefinition>();

  // Build search paths in priority order
  const searchPaths: string[] = [];

  if (commandType === CommandType.BBSCMD) {
    if (conferenceId) {
      for (const confName of getConferenceDirNames(conferenceId)) {
        searchPaths.push(path.join(baseDir, confName, 'Commands', 'BBSCmd'));
      }
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'BBSCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'BBSCmd'));
  } else if (commandType === CommandType.SYSCMD) {
    if (conferenceId) {
      for (const confName of getConferenceDirNames(conferenceId)) {
        searchPaths.push(path.join(baseDir, confName, 'Commands', 'SysCmd'));
      }
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'SysCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'SysCmd'));
  }

  // Scan each directory for .info files
  for (const dirPath of searchPaths) {
    console.log(`  Scanning ${commandType} directory: ${dirPath}`);
    if (!amigafs.existsSync(dirPath)) {
      console.log(`    Directory does not exist, skipping`);
      continue;
    }

    const files = amigafs.readdirSync(dirPath);
    for (const file of files) {
      if (file.endsWith('.info') || file.endsWith('.Info')) {
        const fullPath = path.join(dirPath, file);
        const cmd = loadCommandFromInfo(fullPath);

        if (cmd) {
          const existing = commands.get(cmd.name);

          // First one wins (conference/node commands have higher priority than global)
          if (!existing) {
            commands.set(cmd.name, cmd);
          }
        }
      }
    }
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
