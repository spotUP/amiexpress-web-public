/**
 * Screen Handler - Display BBS screen files with MCI code parsing
 *
 * Handles loading and displaying screen files (.TXT) from the BBS directory structure.
 * Based on express.e await displayScreen() functions.
 */

import * as fs from 'fs';
import * as amigafs from '../utils/amigafs';
import * as path from 'path';

import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { BBSPaths } from '../utils/bbs-paths.util';
// iconv-lite for character encoding conversion
// Auto-detects between CP437 (PC ANSI) and ISO-8859-1 (Amiga ANSI)
// Also supports iCE colors from SAUCE metadata (16 background colors)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iconv = require('iconv-lite');
import { db } from '../database';
import { flaggedFilesManager } from '../services/FlaggedFilesManager';
import { sequentialFileManager, formatNumberedFilename } from '../services/SequentialFileManager';
import { HIDE_CURSOR, SHOW_CURSOR } from '../utils/ansi-output.util';
import { findCaseInsensitive, resolvePath as amigaResolvePath } from '../utils/amigafs';
import { isPetsciiSeqFile, convertPetsciiToPetMe64 } from '../utils/petscii.util';
import { getSystemTime, formatLongDate, formatLongTime, formatLongDateTime } from '../utils/date-time.util';
import { findSecurityScreen } from '../utils/screen-security.util';
import { checkConfAccess } from './message/message-scan.handler';
import { notifySysop } from '../utils/sysop-alert.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { DebugLogger } from '../utils/debug-logger.util';
import { formatBytes as formatBytesUtil } from '../utils/byte-format.util';
import { parseWipeMCI, getWipeFrames, type WipeType } from '../utils/screen-wipe.util';
import { emitText, emitPrompt, flushOutput } from '../utils/output.util';
import { fileCache } from '../utils/file-cache.util';

/**
 * Detect if content is an ANSI animation that should play at modem speed
 *
 * ANSI animations use many cursor positioning codes to draw frame-by-frame.
 * They need to play at 14.4kbps (14400 bps) for proper timing, regardless of
 * the user's current modem speed setting.
 *
 * Detection criteria:
 * - High density of cursor positioning codes (\x1b[y;xH or \x1b[y;xf)
 * - Many ANSI escape sequences relative to content size
 *
 * @param content - Raw screen content
 * @returns true if content appears to be an ANSI animation
 */
function isAnsiAnimation(content: string): boolean {
  // Skip PETSCII files
  if (!content || content.length < 100) return false;

  // Count cursor positioning codes: ESC[y;xH or ESC[y;xf
  const cursorMoves = content.match(/\x1b\[\d+;\d+[Hf]/g) || [];
  const cursorMoveCount = cursorMoves.length;

  // Count all ANSI escape sequences
  const ansiCodes = content.match(/\x1b\[[0-9;?]*[A-Za-z]/g) || [];
  const ansiCount = ansiCodes.length;

  // Animation threshold: High density of cursor positioning
  // Typical animations have 50+ cursor moves per 1KB of content
  const contentKb = content.length / 1024;
  const cursorDensity = cursorMoveCount / Math.max(0.1, contentKb);
  const ansiDensity = ansiCount / Math.max(0.1, contentKb);

  // Consider it an animation if:
  // - High cursor positioning density (50+ per KB)
  // - OR very high overall ANSI density (100+ per KB) with some cursor moves
  const isAnimation = cursorDensity > 50 || (ansiDensity > 100 && cursorMoveCount > 10);

  if (isAnimation) {
    console.log(`[ANSI-ANIM] Detected animation: ${cursorMoveCount} cursor moves, ${ansiCount} total ANSI codes, ${content.length} bytes`);
    console.log(`[ANSI-ANIM] Density: ${cursorDensity.toFixed(1)} cursor/KB, ${ansiDensity.toFixed(1)} ANSI/KB`);
  }

  return isAnimation;
}

/**
 * Screen directory type - matches express.e:6544-6640
 * Each screen type uses a specific base directory
 */
enum ScreenDirType {
  NODE = 'node',      // nodeScreenDir - Node{X}/ or Node{X}/Screens/
  CONF = 'conf',      // confScreenDir - Conf{X}/Screens/
  GLOBAL = 'global',  // cmds.bbsLoc - global Screens/ directory
}

/**
 * Map screen names to their directory type (express.e:6544-6640)
 * This is a 1:1 port of express.e displayScreen() CASE statements
 */
const SCREEN_DIR_MAP: Record<string, ScreenDirType> = {
  // nodeScreenDir screens (express.e:6546-6634)
  'AWAITSCREEN': ScreenDirType.NODE,
  'NODE_BULL': ScreenDirType.NODE,  // SCREEN_NODE_BULL uses nodeScreenDir + 'BULL'
  'LOGOFF': ScreenDirType.NODE,
  'LOGON': ScreenDirType.NODE,
  'BBSTITLE': ScreenDirType.NODE,
  'JOIN': ScreenDirType.NODE,
  'JOINED': ScreenDirType.NODE,
  'JOINCONF': ScreenDirType.NODE,
  'JOINMSGBASE': ScreenDirType.NODE,
  'NEWUSERPW': ScreenDirType.NODE,
  'NONEWUSERS': ScreenDirType.NODE,
  'GUESTLOGON': ScreenDirType.NODE,
  'LOCKOUT0': ScreenDirType.NODE,
  'LOCKOUT1': ScreenDirType.NODE,
  'PRIVATE': ScreenDirType.NODE,

  // confScreenDir screens (express.e:6557-6608)
  'CONF_BULL': ScreenDirType.CONF,  // SCREEN_CONF_BULL uses confScreenDir + 'BULL'
  'MENU': ScreenDirType.CONF,
  'CONF_JOINMSGBASE': ScreenDirType.CONF,
  'DOWNLOADMSG': ScreenDirType.CONF,
  'FILEHELP': ScreenDirType.CONF,
  'UPLOADMSG': ScreenDirType.CONF,
  'NOUPLOADS': ScreenDirType.CONF,

  // cmds.bbsLoc screens (express.e:6548-6550, 6637-6640, 6615-6653)
  'BULL': ScreenDirType.GLOBAL,  // SCREEN_BULL uses cmds.bbsLoc + 'BULL'
  'ONENODE': ScreenDirType.GLOBAL,
  'LOGON24': ScreenDirType.GLOBAL,
  // express.e:6615-6653 - additional global screens
  'NONEWATBAUD': ScreenDirType.NODE,    // SCREEN_NONEWATBAUD: nodeScreenDir + 'NONEWAT' + baud
  'NOTTIME': ScreenDirType.NODE,        // SCREEN_NOT_TIME: nodeScreenDir + 'NOTTIME' + baud
  'NOCALLERSAT': ScreenDirType.NODE,    // SCREEN_NOCALLERSATBAUD: nodeScreenDir + 'NOCALLERSAT' + baud
  'LANGUAGES': ScreenDirType.GLOBAL,   // SCREEN_LANGUAGES: cmds.bbsLoc + 'Languages'
  'INTERNETNAMES': ScreenDirType.GLOBAL, // SCREEN_INTERNETNAMES: cmds.bbsLoc + 'InternetNames'
  'REALNAMES': ScreenDirType.GLOBAL,   // SCREEN_REALNAMES: cmds.bbsLoc + 'RealNames'
  'MAILSCAN': ScreenDirType.GLOBAL,    // SCREEN_MAILSCAN: cmds.bbsLoc + 'MailScan'
};

/**
 * Get the actual screen file name for special screen types
 * Some screens use different file names (e.g., NODE_BULL -> BULL, CONF_BULL -> BULL)
 */
function getScreenFileName(screenName: string): string {
  const upper = screenName.toUpperCase();
  // NODE_BULL and CONF_BULL both use 'BULL' as the file name
  if (upper === 'NODE_BULL' || upper === 'CONF_BULL') {
    return 'BULL';
  }
  // DOWNLOADMSG, UPLOADMSG -> DownloadMsg, UploadMsg
  if (upper === 'DOWNLOADMSG') return 'DownloadMsg';
  if (upper === 'UPLOADMSG') return 'UploadMsg';
  return screenName;
}

/**
 * Get screen directory type from screen name
 * Returns the directory type for known screens, or null for unknown screens
 */
function getScreenDirType(screenName: string): ScreenDirType | null {
  const upper = screenName.toUpperCase();
  return SCREEN_DIR_MAP[upper] || null;
}

/**
 * SAUCE metadata structure (Standard Architecture for Universal Comment Extensions)
 * Used primarily by PC ANSI art to store metadata
 */
interface SauceInfo {
  hasSauce: boolean;
  dataType?: number;    // 1=Character, 2=Graphics, etc
  fileType?: number;    // For dataType 1: 0=ASCII, 1=ANSI, 2=ANSiMation, etc
  tInfo1?: number;      // Width in characters
  tInfo2?: number;      // Height in characters
  tInfoFlags?: number;  // Flags: bit 0 = non-blink (iCE colors), bits 1-2 = letter spacing, bits 3-4 = aspect ratio
  iceColors?: boolean;  // True if iCE colors (blink disabled, 16 bg colors)
}

function parseSauceMetadata(buffer: Buffer): SauceInfo {
  const sauceMarker = Buffer.from('SAUCE00', 'ascii');
  const markerIndex = buffer.lastIndexOf(sauceMarker);

  if (markerIndex === -1) {
    return { hasSauce: false };
  }

  // SAUCE record is 128 bytes starting at marker
  // Offset 94: DataType (1 byte)
  // Offset 95: FileType (1 byte)
  // Offset 96: TInfo1 (2 bytes, little endian) - width
  // Offset 97: TInfo2 (2 bytes, little endian) - height
  // Offset 104: TInfoFlags (1 byte) - bit 0 = iCE colors
  try {
    const dataType = buffer[markerIndex + 94];
    const fileType = buffer[markerIndex + 95];
    const tInfo1 = buffer.readUInt16LE(markerIndex + 96);
    const tInfo2 = buffer.readUInt16LE(markerIndex + 98);
    const tInfoFlags = buffer[markerIndex + 104] || 0;

    // iCE colors: bit 0 of TInfoFlags (also called ANSiFlags)
    // When set, blink attribute becomes high-intensity background
    const iceColors = (tInfoFlags & 0x01) !== 0;

    return {
      hasSauce: true,
      dataType,
      fileType,
      tInfo1,
      tInfo2,
      tInfoFlags,
      iceColors
    };
  } catch (e) {
    return { hasSauce: true }; // Has SAUCE but couldn't parse details
  }
}

function stripSauceMetadata(buffer: Buffer): Buffer {
  const sauceMarker = Buffer.from('SAUCE00', 'ascii');
  const markerIndex = buffer.lastIndexOf(sauceMarker);
  if (markerIndex === -1) {
    return buffer;
  }
  // Remove any leading SUB (0x1A) preceding the SAUCE block
  const subIndex = buffer.lastIndexOf(0x1A, markerIndex);
  const cutIndex = subIndex === -1 ? markerIndex : subIndex;
  return buffer.slice(0, cutIndex);
}

/**
 * Auto-detect encoding from buffer content
 *
 * Detection strategy:
 * 1. If has SAUCE metadata -> CP437 (PC ANSI standard)
 * 2. If contains CP437 box-drawing characters (0xB0-0xDF range patterns) -> CP437
 * 3. If file extension is .ans -> CP437 (PC ANSI convention)
 * 4. Default -> ISO-8859-1 (Amiga convention)
 *
 * Key character differences:
 * - 0xB0: CP437 = light shade (░), ISO-8859-1 = degree (°)
 * - 0xB1: CP437 = medium shade (▒), ISO-8859-1 = plus-minus (±)
 * - 0xB2: CP437 = dark shade (▓), ISO-8859-1 = superscript 2 (²)
 * - 0xB3-0xDA: CP437 = box drawing characters, ISO-8859-1 = various symbols
 * - 0xDB-0xDF: CP437 = block elements (█▄▌▐▀), ISO-8859-1 = letters
 */
function detectEncoding(buffer: Buffer, filePath: string, sauceInfo: SauceInfo): 'cp437' | 'iso-8859-1' {
  // Rule 1: SAUCE metadata indicates PC ANSI -> CP437
  if (sauceInfo.hasSauce) {
    return 'cp437';
  }

  // Rule 2: .ans extension is PC ANSI convention -> CP437
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ans') {
    return 'cp437';
  }

  // Rule 3: Detect CP437 box-drawing patterns
  // CP437 box-drawing chars (0xB3-0xDA) often appear in sequences
  // Count occurrences of likely CP437 characters
  let cp437Score = 0;
  let latin1Score = 0;

  for (let i = 0; i < buffer.length; i++) {
    const byte = buffer[i];

    // Skip ANSI escape sequences
    if (byte === 0x1B && i + 1 < buffer.length && buffer[i + 1] === 0x5B) {
      // Skip past the escape sequence
      while (i < buffer.length && buffer[i] !== 0x6D && buffer[i] !== 0x48 &&
             buffer[i] !== 0x4A && buffer[i] !== 0x4B && buffer[i] !== 0x41 &&
             buffer[i] !== 0x42 && buffer[i] !== 0x43 && buffer[i] !== 0x44) {
        i++;
      }
      continue;
    }

    // CP437 box-drawing and block characters (very common in PC ANSI)
    // Exclude ISO-8859-1 fractions: 0xBC (¼), 0xBD (½), 0xBE (¾)
    // These are commonly used in Amiga ANSI art as decorative characters
    if (byte >= 0xB3 && byte <= 0xDA && byte !== 0xBC && byte !== 0xBD && byte !== 0xBE) {
      cp437Score += 3; // Strong indicator
    }
    // CP437 shading characters
    if (byte >= 0xB0 && byte <= 0xB2) {
      cp437Score += 2;
    }
    // CP437 block elements
    if (byte >= 0xDB && byte <= 0xDF) {
      cp437Score += 3;
    }

    // ISO-8859-1 fraction characters (common in Amiga ANSI art)
    // 0xBC = ¼, 0xBD = ½, 0xBE = ¾
    if (byte === 0xBC || byte === 0xBD || byte === 0xBE) {
      latin1Score += 3; // Strong indicator for ISO-8859-1
    }

    // ISO-8859-1 accented letters (common in European text)
    // Lowercase accented: 0xE0-0xFF (àáâ...ÿ)
    // Uppercase accented: 0xC0-0xDF (ÀÁÂ...ß) but overlaps with CP437 blocks
    if (byte >= 0xE0 && byte <= 0xFF) {
      latin1Score += 1; // Weaker indicator since these could be CP437 graphics too
    }

    // ISO-8859-1 specific non-letter symbols that aren't common in ANSI art
    // 0xA0-0xBF range has punctuation in ISO-8859-1
    if (byte === 0xA9 || byte === 0xAE || byte === 0xB7) { // ©, ®, ·
      latin1Score += 2;
    }
  }

  // Decision based on scores
  // CP437 box-drawing is very distinctive, so even a moderate score suggests CP437
  if (cp437Score >= 10 && cp437Score > latin1Score * 2) {
    return 'cp437';
  }

  // Default to ISO-8859-1 for Amiga compatibility
  return 'iso-8859-1';
}

interface ReadScreenResult {
  text: string;
  encoding: 'cp437' | 'iso-8859-1' | 'utf-8';
  iceColors: boolean;
  width?: number;
  height?: number;
}

function readScreenBuffer(filePath: string): Buffer {
  // Use file cache for better performance (70-90% reduction in disk I/O)
  // Cache returns raw buffer, we process SAUCE metadata after
  const rawBuffer = fileCache.readBuffer(filePath);
  return stripSauceMetadata(rawBuffer);
}

function readScreenTextWithMetadata(filePath: string): ReadScreenResult {
  // Use file cache for better performance (70-90% reduction in disk I/O)
  // Cache automatically invalidates when file modified (maintains express.e behavior)
  const rawBuffer = fileCache.readBuffer(filePath);
  const sauceInfo = parseSauceMetadata(rawBuffer);
  const buffer = stripSauceMetadata(rawBuffer);
  const ext = path.extname(filePath).toLowerCase();

  // PETSCII .seq files stay UTF-8 so downstream PETSCII handling is preserved
  if (ext === '.seq') {
    return {
      text: buffer.toString('utf-8'),
      encoding: 'utf-8',
      iceColors: false
    };
  }

  // Auto-detect encoding
  const encoding = detectEncoding(buffer, filePath, sauceInfo);

  try {
    const text = iconv.decode(buffer, encoding);
    return {
      text,
      encoding,
      iceColors: sauceInfo.iceColors || false,
      width: sauceInfo.tInfo1,
      height: sauceInfo.tInfo2
    };
  } catch (error) {
console.warn(`[SCREEN] ${encoding} decode failed, falling back to utf-8:`, (error as Error).message);
    return {
      text: buffer.toString('utf-8'),
      encoding: 'utf-8',
      iceColors: false
    };
  }
}

// Legacy function for backward compatibility
function readScreenText(filePath: string): string {
  return readScreenTextWithMetadata(filePath).text;
}

/**
 * Smart screen file reader with auto-detection and transformation
 * - Auto-detects encoding (CP437 vs ISO-8859-1)
 * - Applies iCE colors transformation when detected in SAUCE metadata
 * - Logs encoding detection results for debugging
 */
function readScreenWithTransforms(filePath: string): ReadScreenResult {
  const result = readScreenTextWithMetadata(filePath);
  const debugEnabled = process.env.SCREEN_DEBUG !== '0';

  // Log encoding detection
  if (debugEnabled) {
console.log(`[SCREEN] readScreenWithTransforms: ${filePath}`);
console.log(`[SCREEN]   Encoding: ${result.encoding}, iCE: ${result.iceColors}`);
    if (result.width || result.height) {
console.log(`[SCREEN]   SAUCE dimensions: ${result.width}x${result.height}`);
    }
  }

  // Apply iCE colors transformation if needed
  if (result.iceColors) {
    if (debugEnabled) {
console.log(`[SCREEN]   Applying iCE colors transformation`);
    }
    result.text = transformIceColors(result.text);
  }

  return result;
}

/**
 * Transform ANSI for iCE colors mode
 *
 * In iCE colors mode (common in PC ANSI art):
 * - The blink attribute (SGR 5) becomes high-intensity background instead of blinking
 * - This gives 16 background colors (8 normal + 8 bright)
 *
 * Standard ANSI backgrounds: 40-47 (black, red, green, yellow, blue, magenta, cyan, white)
 * iCE bright backgrounds: 100-107 (same colors but bright)
 *
 * Transformation rules:
 * - When SGR 5 (blink) is combined with background 40-47:
 *   Replace with bright background 100-107 and remove the blink
 * - Track state to handle sequences like: ESC[5m (enable blink) then ESC[44m (set bg)
 */
function transformIceColors(content: string): string {
  // Track ANSI state
  let blinkEnabled = false;
  let currentBg = -1; // -1 = default, 40-47 = normal bg, 100-107 = bright bg

  // Process the content, transforming SGR sequences
  return content.replace(/\x1b\[([0-9;]*)m/g, (match, params) => {
    if (!params) {
      // ESC[m = reset all
      blinkEnabled = false;
      currentBg = -1;
      return match;
    }

    const codes = params.split(';').map((c: string) => parseInt(c, 10) || 0);
    const newCodes: number[] = [];
    let needsBrightBg = false;

    for (let i = 0; i < codes.length; i++) {
      const code = codes[i];

      if (code === 0) {
        // Reset - clear state
        blinkEnabled = false;
        currentBg = -1;
        newCodes.push(code);
      } else if (code === 5) {
        // Blink attribute - in iCE mode, this enables bright background
        blinkEnabled = true;
        // Don't add blink to output - we'll convert to bright bg instead
        if (currentBg >= 40 && currentBg <= 47) {
          needsBrightBg = true;
        }
      } else if (code === 25) {
        // Turn off blink
        blinkEnabled = false;
        newCodes.push(code);
      } else if (code >= 40 && code <= 47) {
        // Background color
        currentBg = code;
        if (blinkEnabled) {
          // Convert to bright background (100-107)
          newCodes.push(code + 60);
        } else {
          newCodes.push(code);
        }
      } else if (code >= 100 && code <= 107) {
        // Already bright background
        currentBg = code;
        newCodes.push(code);
      } else if (code === 49) {
        // Default background
        currentBg = -1;
        newCodes.push(code);
      } else {
        // Other codes pass through unchanged
        newCodes.push(code);
      }
    }

    // If we need to apply bright background to existing bg
    if (needsBrightBg && currentBg >= 40 && currentBg <= 47) {
      // Find and replace background code in newCodes
      for (let i = 0; i < newCodes.length; i++) {
        if (newCodes[i] >= 40 && newCodes[i] <= 47) {
          newCodes[i] = newCodes[i] + 60;
          currentBg = newCodes[i];
        }
      }
    }

    if (newCodes.length === 0) {
      return ''; // Remove empty sequence
    }

    return `\x1b[${newCodes.join(';')}m`;
  });
}

// Screen/MCI debugging: always log unless explicitly disabled
const SCREEN_DEBUG_ENABLED = process.env.SCREEN_DEBUG !== '0';
const screenDebug = (...args: any[]) => {
  if (SCREEN_DEBUG_ENABLED) {
console.log('[SCREEN]', ...args);
  }
};
const SCREEN_FLOW_SCREENS = new Set([
  'AWAITSCREEN',
  'BBSTITLE',
  'LOGON',
  'BULL',
  'NODE_BULL',
  'CONF_BULL',
  'MENU',
]);
const screenFlowLog = (screenName: string, ...args: any[]) => {
  if (SCREEN_FLOW_SCREENS.has(screenName.toUpperCase())) {
console.log('[SCREEN FLOW]', ...args);
  }
};

// Modem emulation: classic speeds in bits per second
const MODEM_SPEEDS = [
  1200,
  2400,
  4800,
  7200,
  9600,
  12000,
  14400,
  16800,
  19200,
  21600,
  24000,
  28800,
  33600,
  56000,
];
function resolveModemBps(session: BBSSession): number {
  const preferred = session.modemBps || session.user?.baud || 0;
  if (preferred <= 0) return 0; // 0/undefined = full speed
  if (MODEM_SPEEDS.includes(preferred)) {
    return preferred;
  }
  // Snap to closest classic speed
  let closest = 56000;
  let minDelta = Number.MAX_SAFE_INTEGER;
  for (const s of MODEM_SPEEDS) {
    const d = Math.abs(s - preferred);
    if (d < minDelta) {
      minDelta = d;
      closest = s;
    }
  }
  return closest;
}

interface Conference {
  id: number;
  name: string;
}

// This will be injected from index.ts
let conferences: Conference[] = [];

export function setConferences(confs: Conference[]) {
  conferences = confs;
}

function resolvePetsciiPath(originalPath: string, petsciiEnabled: boolean): string {
  if (!petsciiEnabled) return originalPath;
  if (isPetsciiSeqFile(originalPath)) return originalPath;
  const parsed = path.parse(originalPath);
  const seqCandidate = findCaseInsensitive(parsed.dir, `${parsed.name}.seq`);
  if (seqCandidate) {
    screenDebug(`[loadScreenFile] PETSCII variant preferred: ${originalPath} -> ${seqCandidate}`);
    return seqCandidate;
  }
  return originalPath;
}

/**
 * Check if a file is a RIP graphics file
 * express.e:6765 - StriCmp(extension,'.rip')
 */
function isRipFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.rip';
}

function getConferenceScreensCandidates(baseDir: string, relConfNum: number): Array<{ dir: string; desc: string }> {
  // reference-board data uses unpadded ConfX; avoid padded variants to prevent Conf01 creation
  const names: string[] = [`Conf${relConfNum}`];

  const results: Array<{ dir: string; desc: string }> = [];
  const seen = new Set<string>();

  for (const name of names) {
    const confRootDir = path.join(baseDir, name);
    if (!seen.has(confRootDir)) {
      results.push({ dir: confRootDir, desc: `${name}` });
      seen.add(confRootDir);
    }
    const confScreensDir = path.join(baseDir, name, 'Screens');
    if (!seen.has(confScreensDir)) {
      results.push({ dir: confScreensDir, desc: `${name}/Screens` });
      seen.add(confScreensDir);
    }

  }

  return results;
}

// Screens that should start with a full clear (express.e shows a blank frame first)
// NOTE: BBSTITLE is intentionally NOT in this list - express.e clears screen at START
// of processLogon (line 29477), then displays BBSTITLE without clearing (line 29552),
// and login prompts appear below with just a newline (line 29571).
const SCREENS_REQUIRE_CLEAR = new Set([
  'LOGON',
  'BULL',
  'NODE_BULL',
  'CONF_BULL',
  'MENU',
]);

/**
 * Parse MCI codes in screen content
 * Replaces AmiExpress MCI variables like %B, %CF, %U, etc.
 *
 * @param content - Screen file content with MCI codes
 * @param session - Current BBS session
 * @param bbsName - BBS name for %B variable
 * @param sysopName - Sysop name for %S variable
 * @param location - BBS location for %L variable
 * @returns Parsed content with MCI codes replaced
 */
/**
 * Parse MCI codes and return both parsed content and commands to execute
 * Returns tuple: [parsedContent, commandsToExecute]
 * NOTE: This is async to fetch message base and file area data from database
 */
export async function parseMciCodes(
  content: string,
  session: BBSSession,
  bbsName: string = 'AmiExpress-Web',
  sysopName: string = 'Sysop',
  location: string = 'The Internet',
  socket?: any  // When provided, execute inline (express.e outdata=NIL mode)
): Promise<{ parsed: string; commands: string[]; hasPause: boolean; slowmo?: number; slowmoCount?: number; inlineEmitted?: boolean; pendingInlineContent?: string }> {
  let parsed = content;
  const commandsToExecute: string[] = [];
  let hasPause = false;
  let slowmo = session?.slowmo || 0;
  const inlineMode = socket !== undefined;  // True = execute inline, False = build string
  let inlineEmitted = false;  // Track if content was emitted inline (skip frame buffer later)
  let slowmoCount = session?.slowmoCount || 0;
  let slowmoApplied = slowmo;
  let slowmoAppliedCount = slowmoCount;

  // Helper: formatBytes imported from '../utils/byte-format.util'
  const formatBytes = formatBytesUtil;

  // PHASE 5: ~Dx MCI Terminator Support (express.e:5651-5735)
  // Parse ~D<char> codes to change MCI terminator dynamically
  // Default terminator is |, but ~D. changes it to . for subsequent codes
  // Example: ~D. changes terminator to ., then ~c3RED~c4GREEN. uses . instead of |
  let mciTerminator = '|'; // Default MCI terminator

  // Extract all ~D terminator changes and apply them sequentially
  // This allows screen files to change terminators mid-stream
  const terminatorRegex = /~D(.)/g;
  let match;
  const terminatorChanges: Array<{index: number, char: string}> = [];

  while ((match = terminatorRegex.exec(parsed)) !== null) {
    terminatorChanges.push({
      index: match.index,
      char: match[1]
    });
  }

  // Helper function to escape special regex characters
  const escapeRegex = (char: string): string => {
    return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Helper function to build MCI regex with current terminator
  const mciRegex = (code: string): RegExp => {
    const escapedTerm = escapeRegex(mciTerminator);
    return new RegExp(`~${code}${escapedTerm}`, 'g');
  };

  // Remove ~D codes from output (they're control codes, not display codes)
  parsed = parsed.replace(terminatorRegex, (match, newTerm) => {
    screenDebug(`[MCI] Terminator changed from '${mciTerminator}' to '${newTerm}'`);
    mciTerminator = newTerm;
    return '';
  });

  // Get user data safely
  const user = session.user || {};
  const username = user.username || 'Guest';
  const secLevel = user.secLevel || 0;
  const timesCalled = user.timesCalled || 0;
  const messagesPosted = user.messagesPosted || 0;
  const uploads = user.uploads || 0;
  const downloads = user.downloads || 0;
  const uploadBytes = user.uploadBytes || 0;
  const downloadBytes = user.downloadBytes || 0;

  // Date/Time setup
  const now = getSystemTime();
  // Logon time: session.logonTime is Unix seconds (set by time-tracking.util.ts)
  // Fall back to session.loginTime (ms) or current time if logonTime not yet set
  const logonDate = session.logonTime
    ? new Date(session.logonTime * 1000)
    : (session.loginTime ? new Date(session.loginTime) : now);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[now.getDay()];
  const day = String(now.getDate()).padStart(2, '0');
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  // fullDateTime uses current time (used by legacy % codes)
  const fullDateTime = `${dayName} ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  // timeStr = current time (used by legacy %T)
  const timeStr = `${hours}:${minutes}:${seconds}`;

  // Process multi-character MCI codes FIRST to avoid collisions

  // ~XC - Execute Command (CRITICAL for NI/NO tools)
  // Format: ~XC_<command> <params>||
  // Example: ~XC_DOORS:who/NI ~N||
screenDebug('[MCI] ========== PROCESSING MCI CODES ==========');
screenDebug('[MCI] Content length:', content.length);
screenDebug('[MCI] Looking for ~XC_ and ~XI codes...');

  // Debug log start of MCI parsing
  DebugLogger.mci((session as any).socket?.id || 'unknown', `Parsing MCI codes (${content.length} bytes)`);

  const xcRegex = /~XC_([^\|]+)\|\|/g;
  parsed = parsed.replace(xcRegex, (_fullMatch: string, commandStr: string) => {
    screenDebug('[MCI] *** FOUND ~XC_ COMMAND:', commandStr);
    commandsToExecute.push(commandStr.trim());
    screenDebug('[MCI] Added command to execution queue');
    DebugLogger.mci((session as any).socket?.id || 'unknown', `Found MCI: ~XC_ (Execute Command)`, { command: commandStr });
    return '';
  });

  // ~XI - Execute XIM door (express.e format: ~XI<doorpath>)
  // Format: ~XIDOORS:who/NI or ~XIDOORS:who/No
  // This executes XIM doors silently from screen files
  const xiRegex = /~XI([^\s\r\n]+)/g;
  parsed = parsed.replace(xiRegex, (_fullMatch: string, doorPath: string) => {
    screenDebug('[MCI] *** FOUND ~XI DOOR:', doorPath);
    commandsToExecute.push(doorPath.trim());
    screenDebug('[MCI] Added XIM door to execution queue');
    return '';
  });

screenDebug('[MCI] Total commands to execute:', commandsToExecute.length);
  if (commandsToExecute.length > 0) {
    screenDebug('[MCI] Commands:', commandsToExecute);
  }

  // Conference/Message Board Lists (express.e:5588-5620)
  if (parsed.includes('~CL.')) {
    // express.e:5588-5607 - ~CL: vertical list, one conf per row, filtered by access.
    // Format: "                     [32m<num>[3][33m) [35m<name padEnd 30>[36m[0m\r\n"
    // Only include conferences the user has access to (checkConfAccess per entry).
    let confList = '';
    let num = 0;
    for (let i = 0; i < conferences.length; i++) {
      const confId = conferences[i].id;
      if (!checkConfAccess(session.user, confId)) continue;
      num++;
      const confName = conferences[i].name.padEnd(30, ' ');
      confList += `                     \x1b[32m${String(num).padStart(3)}\x1b[33m) \x1b[35m${confName}\x1b[36m\x1b[0m\r\n`;
    }
    parsed = parsed.replace(/~CL\./g, confList);
  }

  if (parsed.includes('~CD.')) {
    // express.e:5608-5620 - ~CD: 2-column numbered list, filtered by access.
    // Format: "   [34m[[0m<num right-padded 3>[34m] [0m<name padEnd 30>" then \r\n every 2 entries.
    let confDir = '';
    let num = 0;
    for (let i = 0; i < conferences.length; i++) {
      const confId = conferences[i].id;
      if (!checkConfAccess(session.user, confId)) continue;
      num++;
      const confName = conferences[i].name.padEnd(30, ' ');
      confDir += `   \x1b[34m[\x1b[0m${String(num).padStart(3)}\x1b[34m] \x1b[0m${confName}`;
      if (num % 2 === 0) confDir += '\r\n';
    }
    // Add final newline if odd number of entries
    if (num % 2 !== 0) confDir += '\r\n';
    parsed = parsed.replace(/~CD\./g, confDir);
  }

  if (parsed.includes('~ML.')) {
    // ~ML. - Message Base List (express.e:5621-5635)
    let msgBaseList = '';
    try {
      const messageBases = await db.getMessageBases(session.currentConf);
      if (messageBases.length > 0) {
        for (let i = 0; i < messageBases.length; i++) {
          const num = i + 1;
          const name = messageBases[i].name || 'Default';
          const namePadded = name.padEnd(30, ' ');
          msgBaseList += `                     \x1b[32m${num}\x1b[33m) \x1b[35m${namePadded}\x1b[36m\x1b[0m\r\n`;
        }
      } else {
        // If no message bases, show default
        msgBaseList = '                     \x1b[32m1\x1b[33m) \x1b[35mDefault                       \x1b[36m\x1b[0m\r\n';
      }
    } catch (error) {
console.error('[parseMciCodes] Error getting message base list:', error);
      SysopDebugUtil.debug(
        null,
        session,
        'MCI',
        'Error parsing ~ML. (message base list)',
        { error: (error as Error).message },
        DebugSeverity.WARNING
      );
      msgBaseList = '                     \x1b[32m1\x1b[33m) \x1b[35mDefault                       \x1b[36m\x1b[0m\r\n';
    }
    parsed = parsed.replace(/~ML\./g, msgBaseList);
  }

  if (parsed.includes('~MD.')) {
    // ~MD. - Message Base Description (express.e:5636-5650)
    let msgBaseDesc = '';
    try {
      const messageBases = await db.getMessageBases(session.currentConf);
      if (messageBases.length > 0) {
        for (let i = 0; i < messageBases.length; i++) {
          const num = i + 1;
          const name = messageBases[i].name || 'Default';
          msgBaseDesc += `   \x1b[34m[\x1b[0m${num}\x1b[34m] \x1b[0m${name.padEnd(30, ' ')}`;
          if (num % 2 === 0) msgBaseDesc += '\r\n'; // Two per line
        }
        // Add final newline if odd number
        if (messageBases.length % 2 !== 0) msgBaseDesc += '\r\n';
      } else {
        msgBaseDesc = '   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0mDefault                       \r\n';
      }
    } catch (error) {
console.error('[parseMciCodes] Error getting message base descriptions:', error);
      SysopDebugUtil.debug(
        null,
        session,
        'MCI',
        'Error parsing ~MD. (message base descriptions)',
        { error: (error as Error).message },
        DebugSeverity.WARNING
      );
      msgBaseDesc = '   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0mDefault                       \r\n';
    }
    parsed = parsed.replace(/~MD\./g, msgBaseDesc);
  }

  // Process %NODELIST before %N to avoid collision
  if (parsed.includes('%NODELIST')) {
    let nodeList = '';
    const sysConfig = await db.getConfigRepository().getSystemConfig();
    const totalNodes = sysConfig?.max_nodes || 255;
    const currentNode = session.nodeId || 0;
    
    // Import nodeStatusManager dynamically to avoid circular dependencies
    const { nodeStatusManager } = require('../nodes/NodeStatusManager');
    const activeNodes = nodeStatusManager.getActiveNodes();
    
    for (let i = 0; i < totalNodes; i++) {
      let status = 'Waiting';
      const nodeInfo = nodeStatusManager.getNodeInfo(i);
      
      if (i === currentNode) {
        status = '\x1b[32mYou\x1b[0m';
      } else if (nodeInfo && nodeInfo.status !== -1) { // -1 is NodeStatus.ENV_NOTACTIVE
        status = nodeInfo.handle || 'Active';
      }
      
      // Only show up to 10 nodes in this simple list to avoid blowing up the screen
      // unless specifically requested. AmiExpress usually only showed 8.
      if (i < 10 || (nodeInfo && nodeInfo.status !== -1)) {
        nodeList += `Node ${i}:  ${status}\r\n`;
      }
    }
    parsed = parsed.replace(/%NODELIST/g, nodeList);
  }

  // User Information Codes (express.e:5291-5400)
  // NOTE: Using dynamic MCI terminator from Phase 5 implementation
  parsed = parsed.replace(mciRegex('N'), username);           // N - Username
  parsed = parsed.replace(/~N(?=\s|$)/g, username);
  parsed = parsed.replace(mciRegex('P'), '');  // P - Password (security - intentionally blank)
  parsed = parsed.replace(mciRegex('UL'), user.location || '');  // UL - User Location
  parsed = parsed.replace(mciRegex('#'), user.phoneNumber || '');  // # - Phone Number
  parsed = parsed.replace(mciRegex('TC'), timesCalled.toString());  // TC - Times Called
  parsed = parsed.replace(mciRegex('TT'), (user.callsToday || 0).toString());  // TT - Today's Calls
  // ~LC - Last Call (express.e:5315-5318) - formatLongDateTime(loggedOnUser.timeLastOn)
  // Formats using the full "DDD DD-MMM-YYYY HH:MM:SS" pattern (MiscFuncs.e:320-341)
  // user.lastLogin is a Date (database/types.ts:36); user.timeLastOn is an alias
  const lcRaw = user.lastLogin || user.timeLastOn;
  const lcDate: Date | null = lcRaw instanceof Date ? lcRaw : (lcRaw ? new Date(lcRaw) : null);
  parsed = parsed.replace(mciRegex('LC'), lcDate ? formatLongDateTime(lcDate) : 'Never');  // LC - Last Call
  parsed = parsed.replace(mciRegex('M'), messagesPosted.toString());  // M - Messages Posted
  parsed = parsed.replace(mciRegex('A'), secLevel.toString());  // A - Access/Security Level
  parsed = parsed.replace(mciRegex('S'), user.id?.toString() || '0');  // S - Slot Number (user ID)
  parsed = parsed.replace(mciRegex('CA'), user.confAccess || 'XXX');  // CA - Conference Access String
  parsed = parsed.replace(mciRegex('BR'), '57600');  // BR - Baud Rate
  parsed = parsed.replace(mciRegex('HW'), 'Web Browser');  // HW - Hardware/Computer Type
  parsed = parsed.replace(mciRegex('TL'), Math.floor((user.dailyTimeLimit || 120) / 60).toString());  // TL - Time Limit
  parsed = parsed.replace(mciRegex('TR'), Math.floor(session.timeRemaining / 60).toString());  // TR - Time Remaining
  parsed = parsed.replace(mciRegex('UB'), uploadBytes.toString());  // UB - Upload Bytes
  parsed = parsed.replace(mciRegex('DB'), downloadBytes.toString());  // DB - Download Bytes
  // ~SU / ~SD - Upload/Download Size (express.e:5359-5366) - calcSizeText()
  // express.e calcSizeText() divides by 1024 repeatedly until value < 1024,
  // appending lowercase unit suffix: b, kb, mb, gb, tb, pb (MiscFuncs.e:3336-3370)
  const calcSizeText = (bytes: number): string => {
    const units = ['b', 'kb', 'mb', 'gb', 'tb', 'pb'];
    let val = bytes;
    let i = 0;
    while (val >= 1024 && i < units.length - 1) {
      val = Math.round(val / 1024);
      i++;
    }
    return `${val}${units[i]}`;
  };
  parsed = parsed.replace(mciRegex('SU'), calcSizeText(uploadBytes));  // SU - Upload Size
  parsed = parsed.replace(mciRegex('SD'), calcSizeText(downloadBytes));  // SD - Download Size
  parsed = parsed.replace(mciRegex('FU'), uploads.toString());  // FU - Files Uploaded
  parsed = parsed.replace(mciRegex('FD'), downloads.toString());  // FD - Files Downloaded
  parsed = parsed.replace(mciRegex('BD'), (user.byteLimit || 0).toString());  // BD - Today's Byte Limit
  // ~ON / ~LG - Node Number (express.e:5379-5382) - StringF(tempstr,'\d',node)
  const nodeNumStr = (session.nodeId || 1).toString();
  parsed = parsed.replace(mciRegex('ON'), nodeNumStr);  // ON - Node Number
  parsed = parsed.replace(mciRegex('LG'), nodeNumStr);  // LG - Node Number (alias)
  parsed = parsed.replace(mciRegex('IN'), user.email || '');  // IN - Internet Name (email)
  parsed = parsed.replace(mciRegex('RN'), user.realName || username);  // RN - Real Name

  // Conference Information (express.e:5413-5427)
  // ~CF = Conference Number (relConfNum) - express.e:5413-5416
  // ~CN = Conference Name (currentConfName) - express.e:5417-5419
  parsed = parsed.replace(mciRegex('CF'), ((session.currentConf || 0) + 1).toString());  // CF - Conference Number
  parsed = parsed.replace(mciRegex('CN'), session.currentConfName || 'Main');  // CN - Conference Name

  // ~MB - Current Message Base Number (express.e:5442)
  const currentMsgBase = session.currentMsgBase || 1;
  parsed = parsed.replace(mciRegex('MB'), currentMsgBase.toString());

  // ~MN - Message Base Name (express.e:5443)
  let msgBaseName = 'Default';
  try {
    const messageBases = await db.getMessageBases(session.currentConf);
    if (messageBases.length > 0 && currentMsgBase <= messageBases.length) {
      msgBaseName = messageBases[currentMsgBase - 1]?.name || 'Default';
    }
  } catch (error) {
console.error('[parseMciCodes] Error getting message base name:', error);
    SysopDebugUtil.debug(
      null,
      session,
      'MCI',
      'Error parsing ~MN| (message base name)',
      { error: (error as Error).message },
      DebugSeverity.WARNING
    );
  }
  parsed = parsed.replace(mciRegex('MN'), msgBaseName);

  // ~CT - Current Time (express.e:5431-5434) - formatLongTime(logonTime)
  // express.e uses logonTime (session start), NOT current time
  parsed = parsed.replace(mciRegex('CT'), formatLongTime(logonDate));  // CT - Logon Time
  parsed = parsed.replace(mciRegex('VD'), '2.00');  // VD - Version Number (display)
  parsed = parsed.replace(mciRegex('VE'), 'AmiExpress-Web 2.0');  // VE - Version (full)

  // System Information
  // ~ND - Node Number (express.e:5409-5412) - StringF(tempstr,'\d',node)
  parsed = parsed.replace(mciRegex('ND'), (session.nodeId || 1).toString());  // ND - Node Number
  // ~DT - Date (express.e:5435-5438) - formatLongDate(getSystemTime()) - current system date
  parsed = parsed.replace(mciRegex('DT'), formatLongDate(now));  // DT - Current Date (FORMAT_USA: MM-DD-YY)
  // ~OT - Online Time (express.e:5395-5398) - formatLongTime(logonTime) - session start time
  parsed = parsed.replace(mciRegex('OT'), formatLongTime(logonDate));  // OT - Logon Time
  // ~OD - Online Date (express.e:5391-5394) - formatLongDate(logonTime) - session start date
  parsed = parsed.replace(mciRegex('OD'), formatLongDate(logonDate));  // OD - Logon Date (FORMAT_USA: MM-DD-YY)

  // ~SC - System Calls Today (express.e:5407)
  // Use SystemStatsService to get real call count
  const { systemStats } = await import('../services/SystemStatsService');
  const todayCalls = systemStats.getTodayCalls();
  parsed = parsed.replace(mciRegex('SC'), todayCalls.toString());

  // File Area Codes - Flagged Files (express.e:5439-5454)
  // ~FC - Flagged Files Count (express.e:5442-5445 returns flagFilesList.count())
  // ~FF - Flagged Files display space-separated (express.e:5439-5441 calls showFlaggedFiles)
  // ~FL - Flagged Files List one per line (express.e:5446-5454)
  const userId = session.user?.id || 0;
  const sessionFlaggedFiles = flaggedFilesManager.getFiles(userId);

  // ~FC - Count of flagged files (express.e:5442-5445)
  parsed = parsed.replace(mciRegex('FC'), sessionFlaggedFiles.length.toString());

  // ~FF - Flagged Files space-separated (express.e:5439-5441 calls showFlaggedFiles)
  // Format: filenames separated by spaces
  const flaggedFilesSpaceSep = sessionFlaggedFiles.map(f => f.fileName).join(' ');
  parsed = parsed.replace(mciRegex('FF'), flaggedFilesSpaceSep);

  // ~FL - Flagged Files List one per line (express.e:5446-5454)
  // Format: "                     filename\b\n"
  let flaggedFilesList = '';
  for (const file of sessionFlaggedFiles) {
    // Format matches express.e: 21 spaces + filename + backspace + newline
    flaggedFilesList += `                     ${file.fileName}\b\r\n`;
  }
  parsed = parsed.replace(mciRegex('FL'), flaggedFilesList);

  // AK - Access Keys (express.e:5428-5430 calls displayKeys())
  // express.e:29863-29871 - Displays sysop function key shortcuts
  const accessKeysDisplay = [
    '         \x1b[44;33m F1 \x1b[40;35m  }- \x1b[33mSysop Login             \x1b[44;33m F2 \x1b[40;35m  }- \x1b[33mLocal Login',
    '         \x1b[44;33m F3 \x1b[40;35m  }- \x1b[33mInstant Remote Logon    \x1b[44;33m F4 \x1b[40;35m  }- \x1b[33mReserve for a user',
    '         \x1b[44;33m F5 \x1b[40;35m  }- \x1b[33mConference Maintenance  \x1b[44;33m F6 \x1b[40;35m  }- \x1b[33mAccount Editing',
    '       \x1b[44;33m SH+F5 \x1b[40;35m }- \x1b[33mOpen Shell            \x1b[44;33m SH+F6 \x1b[40;35m }- \x1b[33mView Callerslog',
    '         \x1b[44;33m F7 \x1b[40;35m  }- \x1b[33mChat Toggle             \x1b[44;33m F8 \x1b[40;35m  }- \x1b[33mReprogram modem',
    '         \x1b[44;33m F9 \x1b[40;35m  }- \x1b[33mExit BBS               \x1b[44;33m F10 \x1b[40;35m  }- \x1b[33mExit BBS \x1b[33m(\x1b[37moff hook\x1b[33m)\x1b[0m',
    '                                       \x1b[44;33m SH+F10 \x1b[40;35m }- \x1b[33mClear tooltype cache\x1b[0m'
  ].join('\r\n');
  parsed = parsed.replace(mciRegex('AK'), accessKeysDisplay);
  parsed = parsed.replace(mciRegex('SP'), ' ');  // SP - Space
  // ~CR - Keypress wait (express.e:5462-5468) - readChar(INPUT_TIMEOUT) — waits for any key
  // WEB_: express.e:5462 does readChar(INPUT_TIMEOUT); in string-replace mode we cannot
  // perform an async character read mid-substitution. Emit \r\n as a visible line break.
  // Inline mode with a socket is the correct place to implement a real keypress wait (future work).
  parsed = parsed.replace(mciRegex('CR'), '\r\n');  // CR - line break (WEB_ deviation: should be keypress wait)
  // ~NS - Non-Stop display flag (express.e uses nonStopText/nonStopDisplayFlag)
  // Setting this suppresses all subsequent pause prompts for this file display.
  parsed = parsed.replace(mciRegex('NS'), () => {
    if (session) {
      (session as any).nonStopText = true;
    }
    return '';
  });  // NS - set nonStopText flag, no output
  // Some screens use bare ~SP (no delimiter) to pause; strip and mark pause
  parsed = parsed.replace(/~SP(\s|$)/g, () => {
    hasPause = true;
    return '';
  });

  // Color codes (c0-c7, b0-b7/z0-z7, n1-n9) (express.e:5651-5735)
  // NOTE: Using dynamic MCI terminator from Phase 5 implementation
  // Foreground colors (c0-c7) - express.e:5651-5674
  parsed = parsed.replace(mciRegex('c0'), '\x1b[30m');  // Black
  parsed = parsed.replace(mciRegex('c1'), '\x1b[31m');  // Red (express.e:5655)
  parsed = parsed.replace(mciRegex('c2'), '\x1b[32m');  // Green
  parsed = parsed.replace(mciRegex('c3'), '\x1b[33m');  // Yellow (express.e:5661)
  parsed = parsed.replace(mciRegex('c4'), '\x1b[34m');  // Blue (express.e:5664)
  parsed = parsed.replace(mciRegex('c5'), '\x1b[35m');  // Magenta
  parsed = parsed.replace(mciRegex('c6'), '\x1b[36m');  // Cyan (express.e:5670)
  parsed = parsed.replace(mciRegex('c7'), '\x1b[37m');  // White

  // Background colors (b0-b7, z0-z7) - express.e:5675-5698
  parsed = parsed.replace(mciRegex('b0'), '\x1b[40m');  // Black bg
  parsed = parsed.replace(mciRegex('b1'), '\x1b[41m');  // Red bg (express.e:5679)
  parsed = parsed.replace(mciRegex('b2'), '\x1b[42m');  // Green bg
  parsed = parsed.replace(mciRegex('b3'), '\x1b[43m');  // Yellow bg (express.e:5685)
  parsed = parsed.replace(mciRegex('b4'), '\x1b[44m');  // Blue bg (express.e:5688)
  parsed = parsed.replace(mciRegex('b5'), '\x1b[45m');  // Magenta bg
  parsed = parsed.replace(mciRegex('b6'), '\x1b[46m');  // Cyan bg (express.e:5694)
  parsed = parsed.replace(mciRegex('b7'), '\x1b[47m');  // White bg
  parsed = parsed.replace(mciRegex('z0'), '\x1b[40m');  // z0-z7 same as b0-b7
  parsed = parsed.replace(mciRegex('z1'), '\x1b[41m');  // Red bg
  parsed = parsed.replace(mciRegex('z2'), '\x1b[42m');  // Green bg
  parsed = parsed.replace(mciRegex('z3'), '\x1b[43m');  // Yellow bg
  parsed = parsed.replace(mciRegex('z4'), '\x1b[44m');  // Blue bg
  parsed = parsed.replace(mciRegex('z5'), '\x1b[45m');  // Magenta bg
  parsed = parsed.replace(mciRegex('z6'), '\x1b[46m');  // Cyan bg
  parsed = parsed.replace(mciRegex('z7'), '\x1b[47m');

  // Blank lines (express.e:5699-5725) - ~n1 through ~n9 output 1-9 blank lines
  // These call blankLines(n) which outputs n newlines
  parsed = parsed.replace(mciRegex('n1'), '\r\n');                    // 1 blank line
  parsed = parsed.replace(mciRegex('n2'), '\r\n\r\n');                // 2 blank lines
  parsed = parsed.replace(mciRegex('n3'), '\r\n\r\n\r\n');            // 3 blank lines
  parsed = parsed.replace(mciRegex('n4'), '\r\n\r\n\r\n\r\n');        // 4 blank lines
  parsed = parsed.replace(mciRegex('n5'), '\r\n\r\n\r\n\r\n\r\n');    // 5 blank lines
  parsed = parsed.replace(mciRegex('n6'), '\r\n\r\n\r\n\r\n\r\n\r\n');              // 6 blank lines
  parsed = parsed.replace(mciRegex('n7'), '\r\n\r\n\r\n\r\n\r\n\r\n\r\n');          // 7 blank lines
  parsed = parsed.replace(mciRegex('n8'), '\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n');      // 8 blank lines
  parsed = parsed.replace(mciRegex('n9'), '\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n');  // 9 blank lines

  // ~f - Fill character (express.e:5471-5480)
  // Format: ~f or ~f<char> - clears screen or fills with character
  // For now, implement ~f as screen clear
  parsed = parsed.replace(/~f(\||(?=\s|$))/g, '\x1b[2J\x1b[H');  // Clear screen + home cursor

  // Standalone ~ - Clear screen (common shorthand in Amiga BBS files)
  // When ~ appears alone (not followed by a code), it clears the screen
  parsed = parsed.replace(/^~\s*$/gm, '\x1b[2J\x1b[H');  // Clear screen if ~ is alone on a line
  parsed = parsed.replace(/^~$/gm, '\x1b[2J\x1b[H');  // Clear screen if ~ is the only content

  // ~w - Word wrap / Delay (express.e:5481-5489)
  // Format: ~w or ~w<ms> - delay/pause
  // In screen files, this is typically ignored or minimal delay
  // We'll just remove it from output (delay would be client-side)
  const escapedTerm = escapeRegex(mciTerminator);
  parsed = parsed.replace(new RegExp(`~w\\d*${escapedTerm}`, 'g'), '');

  // ~x - X position (cursor column) (express.e:5491-5500)
  // Format: ~x<number>| - moves cursor to column <number>
  // ANSI: ESC[<col>G (move to column)
  const xRegex = new RegExp(`~x(\\d+)${escapedTerm}`, 'g');
  parsed = parsed.replace(xRegex, (match, col) => {
    const colNum = parseInt(col, 10);
    if (colNum >= 0) {
      return `\x1b[${colNum}G`;  // ANSI: Move to column
    }
    return '';
  });

  // ~y - Y position (cursor row) (express.e:5501-5510)
  // Format: ~y<number>| - moves cursor to row <number>
  // ANSI: ESC[<row>;H (move to row, column 1)
  const yRegex = new RegExp(`~y(\\d+)${escapedTerm}`, 'g');
  parsed = parsed.replace(yRegex, (match, row) => {
    const rowNum = parseInt(row, 10);
    if (rowNum >= 0) {
      return `\x1b[${rowNum};H`;  // ANSI: Move to row
    }
    return '';
  });

  // ~q - Query/Prompt reset (express.e:5571-5573)
  // Sends ANSI reset code [0m
  parsed = parsed.replace(mciRegex('q'), '\x1b[0m');

  // ~h - Hotkey/Backspace (express.e:5574-5576)
  // Sends backspace character
  parsed = parsed.replace(mciRegex('h'), '\x08');

  // === INLINE MODE: SEQUENTIAL MCI PROCESSING ===
  // express.e:5768-5802 processMci() iterates through content sequentially:
  // 1. Find next ~ character
  // 2. Output text before it (aePuts2)
  // 3. Call processMciCmd to handle the MCI code immediately
  // 4. Continue from new position
  // We must process MCI codes in EXACT DOCUMENT ORDER like express.e does.
  if (inlineMode) {
    const { processCommand } = require('./command.handler');

    // Regex to find inline MCI codes that need immediate execution
    // ~f, ~CC_, ~SS_, ~SR_ (with optional numeric prefix for ~SR_)
    const inlineMciRegex = /~([fF]|CC_[^\s|~\r\n]+|(?:SS_|2S)[^\s|~\r\n]+|\d*SR_[^\s|~\r\n]+)(?:\|{1,2})?/g;

    // Regex to find ~SP codes - express.e:5455-5461
    // ~SP followed by . (SP.), | (mciterminator), whitespace, or end of string
    const spRegex = /~SP(?:\.|[\s|]|$)/;

    let lastIndex = 0;
    let match;

    // Helper to emit text, checking for ~SP and handling immediate pause
    // express.e:5455-5461 - ~SP causes immediate doPause(), then continues
    // Returns: { emitted: boolean, foundSp: boolean, textAfterSp: string }
    const emitTextWithSpCheck = (text: string): { emitted: boolean; foundSp: boolean; remainingContent: string } => {
      const spMatch = text.match(spRegex);
      if (spMatch && spMatch.index !== undefined) {
        // Found ~SP - emit text before it, then stop
        const textBeforeSp = text.substring(0, spMatch.index);
        const spCodeLen = spMatch[0].length;
        const textAfterSp = text.substring(spMatch.index + spCodeLen);

        if (textBeforeSp.length > 0) {
          let toEmit = addAnsiEscapes(textBeforeSp);
          toEmit = toEmit.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          emitText(socket, toEmit);
        }

        // Return remaining content (text after ~SP + rest of parsed content)
        return { emitted: textBeforeSp.length > 0, foundSp: true, remainingContent: textAfterSp };
      } else {
        // No ~SP - emit all text
        if (text.length > 0) {
          let toEmit = addAnsiEscapes(text);
          toEmit = toEmit.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          emitText(socket, toEmit);
        }
        return { emitted: text.length > 0, foundSp: false, remainingContent: '' };
      }
    };

    while ((match = inlineMciRegex.exec(parsed)) !== null) {
      const fullMatch = match[0];
      const code = match[1];

      // express.e:5793-5794 - Output text before this MCI code
      const textBefore = parsed.substring(lastIndex, match.index);
      if (textBefore.length > 0) {
        // Check for ~SP and emit text up to it (express.e:5455-5461)
        const result = emitTextWithSpCheck(textBefore);
        if (result.foundSp) {
          // express.e:5455-5461 - ~SP causes immediate pause
          hasPause = true;
          // Store remaining content for processing after pause
          // Remaining = text after ~SP + current MCI code + rest of parsed content
          const remainingParsed = result.remainingContent + parsed.substring(match.index);
          screenDebug('[MCI] Sequential: ~SP found, pausing with remaining content');
          inlineEmitted = true;
          // Return with pending content - caller will handle pause and continuation
          return {
            parsed: '',
            commands: commandsToExecute,
            hasPause: true,
            slowmo: slowmoApplied,
            slowmoCount: slowmoAppliedCount,
            inlineEmitted: true,
            pendingInlineContent: remainingParsed
          };
        }
        screenDebug('[MCI] Sequential: emitted text before ~' + code.substring(0, 10));
      }

      // Update position to after this match
      lastIndex = match.index + fullMatch.length;

      // Process the MCI code immediately (express.e:5799 processMciCmd)
      if (code === 'f' || code === 'F') {
        // express.e:5469-5471 - sendCLS()
        emitText(socket, '\x1b[2J\x1b[H');
        screenDebug('[MCI] Sequential: ~f sendCLS()');
      } else if (code.startsWith('CC_')) {
        // express.e:5555-5563 - processSysCommand()
        const commandStr = code.substring(3).replace(/\|+$/, '').trim();
console.log('[MCI][CC_] EXECUTING INLINE COMMAND:', commandStr, 'state:', session.state, 'subState:', session.subState);
        screenDebug('[MCI] Sequential: ~CC_ processSysCommand:', commandStr);
        const spacePos = commandStr.indexOf(' ');
        const cmdCode = spacePos >= 0 ? commandStr.substring(0, spacePos) : commandStr;
        const cmdParams = spacePos >= 0 ? commandStr.substring(spacePos + 1) : '';
        // Save subState so any door launched here (68K or TS) can't clobber it.
        // Door executors set DOOR_RUNNING and may not restore it on early exit.
        const subStateBeforeInlineCmd = session.subState;
        // express.e:5555-5563 calls processSysCommand() which always allows SYSCMD
        const result = await processCommand(socket, session, cmdCode, cmdParams, true);
        if (session.subState !== subStateBeforeInlineCmd) {
          session.subState = subStateBeforeInlineCmd;
        }
console.log('[MCI][CC_] COMMAND RESULT:', commandStr, '→', result);
      } else if (code.startsWith('SS_') || code.startsWith('2S')) {
        // express.e:5496-5504 - displayFile()
        const prefix = code.startsWith('SS_') ? 3 : 2;
        const filename = code.substring(prefix).replace(/\|+$/, '').trim();
        screenDebug('[MCI] Sequential: ~SS_ displayFile:', filename);
        await displayScreen(socket, session, filename, false);
      } else if (code.includes('SR_')) {
        // express.e:5533-5554 - display random file
        const srMatch = code.match(/(\d*)SR_(.+)/);
        if (srMatch) {
          const maxCountRaw = srMatch[1];
          let basePath = srMatch[2].replace(/\|+$/, '').trim();
          screenDebug('[MCI] Sequential: ~SR_ random file:', basePath);

          // Resolve Amiga assign paths
          if (basePath.includes(':')) {
            const { config } = require('../config');
            const baseDir = config.getConfig().dataDir;
            const colonIdx = basePath.indexOf(':');
            const assign = basePath.substring(0, colonIdx).toUpperCase();
            const subpath = basePath.substring(colonIdx + 1);

            if (assign === 'WORK' || assign === 'BBS') {
              let resolvedSubpath = subpath;
              if (resolvedSubpath.toLowerCase().startsWith('bbs/')) {
                resolvedSubpath = resolvedSubpath.substring(4);
              }
              basePath = path.join(baseDir, resolvedSubpath);
            } else if (assign === 'SCREENS') {
              basePath = path.join(baseDir, 'Screens', subpath);
            }
          }

          const maxCount = Math.max(1, maxCountRaw ? parseInt(maxCountRaw, 10) : 99);
          const randomNum = Math.floor(Math.random() * maxCount) + 1;
          const randomFile = formatNumberedFilename(basePath, randomNum);
          screenDebug('[MCI] Sequential: ~SR_ selected:', randomFile);
          await displayScreen(socket, session, randomFile, false);
        }
      }
    }

    // Output any remaining text after the last MCI code
    if (lastIndex < parsed.length) {
      const remaining = parsed.substring(lastIndex);
      if (remaining.length > 0) {
        // Check for ~SP and emit text up to it (express.e:5455-5461)
        const result = emitTextWithSpCheck(remaining);
        if (result.foundSp) {
          // express.e:5455-5461 - ~SP causes immediate pause
          hasPause = true;
          screenDebug('[MCI] Sequential: ~SP found in remaining text, pausing');
          inlineEmitted = true;
          // Return with pending content for processing after pause
          return {
            parsed: '',
            commands: commandsToExecute,
            hasPause: true,
            slowmo: slowmoApplied,
            slowmoCount: slowmoAppliedCount,
            inlineEmitted: true,
            pendingInlineContent: result.remainingContent
          };
        }
        if (result.emitted) {
          screenDebug('[MCI] Sequential: emitted remaining text');
          inlineEmitted = true;
        }
      }
    }

    // Mark that we've emitted content inline (even if just executing codes)
    // This tells displayScreen to skip its frame buffer emission
    if (lastIndex > 0) {
      inlineEmitted = true;
    }

    // Clear parsed since we've already emitted everything
    parsed = '';
  }

  // Advanced File Display Codes (express.e:5490-5560)
  // NOTE: In inline mode, these are already handled above in sequential processing
  // ~SS_ - Show String / Display File (express.e:5490-5500)
  // Format: ~SS_<filename>| or ~SS_<filename>|| - displays another screen file
  // express.e uses single | as mciterminator, some screens use || for compatibility
  screenDebug('[MCI DEBUG] Looking for ~SS_ codes in:', parsed.substring(0, 200));
  // Support both ~SS_ and ~2S (short form)
  // Path stops at whitespace, tilde (next MCI code), or newline
  // Terminator is | or || (optional, consumed by regex if present)
  const ssRegex = /~(?:SS_|2S)([^\s|~\r\n]+)(?:\|{1,2})?/g;
  const filesToDisplay: string[] = [];

  // Keep provided extensions; only trim whitespace/terminators.
  const normalizeScreenReference = (screenRef: string): string => screenRef.trim();

  // NOTE: Inline mode is fully handled in sequential processing above (parsed is empty)
  // String mode: Create placeholders for later replacement
  if (!inlineMode) {
    parsed = parsed.replace(ssRegex, (_match, ref) => {
      const filename = normalizeScreenReference(ref.trim());
      screenDebug('[MCI DEBUG] Found ~SS_ code referencing file:', filename);
      filesToDisplay.push(filename);
      return `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
    });
    screenDebug('[MCI DEBUG] Total ~SS_ MCI codes found in screen:', filesToDisplay.length);
  }

  // ~SX_ - String Exact / Sequential File Display (express.e:5505-5530)
  // Format: ~SX_<path>/<basename>|| - displays files sequentially (file.1, file.2, file.3...)
  // Reads counter from persistent file, increments, displays next file in sequence
  const sxRegex = /~SX_([^|]+)\|\|/g;
  let sxMatch;
  while ((sxMatch = sxRegex.exec(parsed)) !== null) {
    let basePath = sxMatch[1].trim();
    screenDebug('[MCI] Found ~SX_ sequential file request:', basePath);

    // Resolve Amiga assign paths using centralized resolver
    if (basePath.includes(':')) {
      const { config } = require('../config');
      const baseDir = config.getConfig().dataDir;
      const bbsPaths = new BBSPaths(baseDir);
      basePath = bbsPaths.resolveAmigaPath(basePath, session?.nodeId || 0);
      screenDebug('[MCI] ~SX_ resolved path to:', basePath);
    }

    // Get next sequential file
    const nextFile = sequentialFileManager.getNextFile(basePath);
    screenDebug('[MCI] ~SX_ next file:', nextFile.filename, '(counter:', nextFile.number + ')');

    // Try to load the file - if it doesn't exist, reset counter and try file.1
    let foundFile = false;
    if (loadScreenFile(nextFile.filename, session.currentConf, 0, session)) {
      filesToDisplay.push(nextFile.filename);
      foundFile = true;
    } else {
      // File doesn't exist - reset to 1 and try again
      screenDebug('[MCI] ~SX_ file not found, resetting to 1');
      sequentialFileManager.resetCounter(basePath);
      const firstFile = sequentialFileManager.getNextFile(basePath);
      if (loadScreenFile(firstFile.filename, session.currentConf, 0, session)) {
        filesToDisplay.push(firstFile.filename);
        foundFile = true;
      }
    }

    if (foundFile) {
      parsed = parsed.replace(sxMatch[0], `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`);
    } else {
      // No files found - remove code
      parsed = parsed.replace(sxMatch[0], '');
    }
  }

  // ~SR_ - String Replace / Random File Display (express.e:5531-5560)
  // Format: ~<max>SR_<path>/<basename> - displays random file from numbered set (max optional, defaults to 99)
  // Example: ~SR_WORK:bbs/Screens/logoff/logoff displays 001.logoff.txt, 002.logoff.txt, etc.
  // Note: Path stops at whitespace, tilde (next MCI code), or newline
  // Terminator is | or || (optional, consumed by regex if present)
  const srRegex = /~(\d*)SR_([^\s|~\r\n]+)(?:\|{1,2})?/g;

  // NOTE: Inline mode is fully handled in sequential processing above (parsed is empty)
  // String mode: Create placeholders for later replacement
  if (!inlineMode) {
    let srMatch;
    while ((srMatch = srRegex.exec(parsed)) !== null) {
      const maxCountRaw = srMatch[1];
      let basePath = srMatch[2].trim();
      screenDebug('[MCI] Found ~SR_ random file request:', basePath);

      // Resolve Amiga assign paths using centralized resolver
      if (basePath.includes(':')) {
        const { config } = require('../config');
        const baseDir = config.getConfig().dataDir;
        const bbsPaths = new BBSPaths(baseDir);
        basePath = bbsPaths.resolveAmigaPath(basePath, session?.nodeId || 0);
        screenDebug('[MCI] ~SR_ resolved path to:', basePath);
      }

      const maxCount = Math.max(1, maxCountRaw ? parseInt(maxCountRaw, 10) : 99);
      const randomNum = Math.floor(Math.random() * maxCount) + 1;
      const randomFile = formatNumberedFilename(basePath, randomNum);

      screenDebug('[MCI] ~SR_ selected random file:', randomFile);

      // String mode: Create placeholder for later replacement
      filesToDisplay.push(randomFile);
      const placeholder = `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
console.log(`[MCI] ~SR_ creating placeholder: ${srMatch[0]} -> ${placeholder}`);
      parsed = parsed.replace(srMatch[0], placeholder);
    }
  }

  // ~SP. - Stop Pause (express.e:5455-5461)
  // Displays pause prompt and waits for keypress
  parsed = parsed.replace(/~SP\./g, () => {
    hasPause = true;
    // Pause is enforced by pagination; no extra inline prompt to avoid duplicates
    return '';
  });

  // ~NSF - Non-Stop Flag (express.e pause control)
  parsed = parsed.replace(/~NSF/g, () => {
    if (session) {
      (session as any).nonStopText = true;
    }
    return '';
  });

  // ~CR. - Character Read (express.e:5462-5468)
  // Waits for single keypress without prompt
  parsed = parsed.replace(/~CR\./g, () => {
    // Set session state to wait for character
    // Note: In web version, this is silent - no visible output
    // The actual character read handling needs to be implemented in the command handler
    return '';
  });

  // ~F / ~f - Form feed / clear screen (common in legacy screens)
  // NOTE: In inline mode, ~f is handled in sequential processing above (express.e:5469-5471)
  if (!inlineMode) {
    parsed = parsed.replace(/~[Ff]/g, '\x1b[2J\x1b[H');
  }

  // ~CC_ - Custom Command Execution (express.e:5555-5563)
  // Format: ~CC_<command>| or ~CC_<command>|| - executes a BBS command from the screen,
  // and some classic files only include a single trailing pipe (e.g. the reference-board V-AWAIT trigger),
  // so we accept either delimiter length like express.e did.
  // reference-board screens sometimes omit the pipe and just terminate with whitespace/~SP.
  // Accept either a pipe delimiter or whitespace/end of line.
  // NOTE: In inline mode, ~CC_ is handled in sequential processing above (express.e:5555-5563)
  const ccRegex = /~CC_([^\s|~\r\n]+)(\|{1,2})?/g;

  if (!inlineMode) {
    // String mode: Queue commands for later execution
    parsed = parsed.replace(ccRegex, (_fullMatch: string, commandStr: string) => {
      commandsToExecute.push(commandStr.trim());
      return '';
    });
  }

  // ~CR_ - Prompted keypress (express.e:5571-5580)
  // Format: ~CR_<prompt>|| - displays prompt and waits for keypress
  const crRegex = /~CR_([^|]+)\|\|/g;
  parsed = parsed.replace(crRegex, (match, promptText) => {
    hasPause = true;
    return promptText;
  });

  // ~SM_ - Set Mode / Menu Name (express.e:5575-5585)
  // Format: ~SM_<menuname>|| - sets current menu name for context tracking
  const smRegex = /~SM_([^|]+)\|\|/g;
  parsed = parsed.replace(smRegex, (match, menuName) => {
    // Store current menu name in session for context
    session.currentMenuName = menuName.trim();
    screenDebug(`[MCI] ~SM_ set menu name to: ${session.currentMenuName}`);
    return ''; // Code doesn't display anything
  });

  // ~SMO - Screen Mode On / Slow Mode On (express.e:5726-5736)
  // Format: ~SMO<speed>| where speed is 1-5
  // Note: Slow mode is a display effect, not applicable to web
  parsed = parsed.replace(/~SMO(-?\d*)\|/gi, (_m: string, digits: string) => {
    // express.e sets slowmo:=1, slowmoCount+=60*slowmo before reading value
    slowmoCount += 60;
    let speed = parseInt(digits, 10);
    if (!speed || Number.isNaN(speed)) speed = 1;
    // AmiExpress valid range 1-5; allow web extension -1..-3 for slower-than-1
    if (speed > 5) speed = 1;
    if (speed === 0) speed = 1;
    if (speed < -3) speed = -3;
    slowmo = speed;
    slowmoApplied = slowmo;
    slowmoAppliedCount = slowmoCount;
    return '';
  });

  // ~SMC - Screen Mode Clear / Slow Mode Clear (express.e:5737-5739)
  // Disables slow mode
  parsed = parsed.replace(/~SMC\|/gi, () => {
    slowmo = 0;
    slowmoCount = 0;
    return '';
  });

  // Legacy % codes (for compatibility)
  parsed = parsed.replace(/%B/g, bbsName);
  parsed = parsed.replace(/%S/g, sysopName);
  parsed = parsed.replace(/%L/g, location);
  parsed = parsed.replace(/%CF/g, session.currentConfName || 'Main');
  parsed = parsed.replace(/%R/g, session.user ? Math.floor(session.timeRemaining / 60).toString() : '57600');
  parsed = parsed.replace(/%D/g, fullDateTime);
  parsed = parsed.replace(/%T/g, timeStr);
  parsed = parsed.replace(/%U/g, username);
  parsed = parsed.replace(/%N/g, '1');
  parsed = parsed.replace(/%C/g, conferences.length.toString());

  // MultiTop bulletin codes - @READUSERKEYS directive (strip it, it's not displayed)
  parsed = parsed.replace(/@READUSERKEYS\s*/gi, '');

  // MultiTop bulletin codes - %XX.YYCC format for user ranking data
  // Format: %XX.YYCC where XX=slot(01-30), YY=field width, CC=code type
  // Code types: UB=Upload Bytes, DB=Download Bytes, UC=Upload CPS, DC=Download CPS,
  //             MS=Messages, TU=Total Users, SC=System Calls
  const multiTopRegex = /%(\d{2})\.(\d{2})([A-Z]{2})/g;
  let multiTopMatch;
  const multiTopReplacements: Array<{match: string; slot: number; width: number; code: string}> = [];

  // Collect all MultiTop codes first
  while ((multiTopMatch = multiTopRegex.exec(parsed)) !== null) {
    multiTopReplacements.push({
      match: multiTopMatch[0],
      slot: parseInt(multiTopMatch[1], 10),
      width: parseInt(multiTopMatch[2], 10),
      code: multiTopMatch[3]
    });
  }

  // Process MultiTop codes if any found
  if (multiTopReplacements.length > 0) {
    // Fetch users sorted by different criteria for ranking
    let rankedUsers: {
      byUploadBytes: any[];
      byDownloadBytes: any[];
      byMessages: any[];
    } = { byUploadBytes: [], byDownloadBytes: [], byMessages: [] };

    try {
      const allUsers = await db.getUsers({ limit: 100 });
      rankedUsers.byUploadBytes = [...allUsers].sort((a, b) => (b.uploadBytes || 0) - (a.uploadBytes || 0));
      rankedUsers.byDownloadBytes = [...allUsers].sort((a, b) => (b.downloadBytes || 0) - (a.downloadBytes || 0));
      rankedUsers.byMessages = [...allUsers].sort((a, b) => (b.messagesPosted || 0) - (a.messagesPosted || 0));
    } catch (error) {
console.error('[parseMciCodes] Error fetching users for MultiTop codes:', error);
    }

    // Get total users count
    let totalUsers = 0;
    try {
      totalUsers = rankedUsers.byUploadBytes.length;
    } catch (error) {
      // Ignore
    }

    // Replace each MultiTop code
    for (const rep of multiTopReplacements) {
      const slotIdx = rep.slot - 1; // Convert to 0-indexed
      let value = '';

      switch (rep.code) {
        case 'UB': // Upload Bytes
          if (slotIdx >= 0 && slotIdx < rankedUsers.byUploadBytes.length) {
            const bytes = rankedUsers.byUploadBytes[slotIdx].uploadBytes || 0;
            value = formatBytes(bytes);
          }
          break;
        case 'DB': // Download Bytes
          if (slotIdx >= 0 && slotIdx < rankedUsers.byDownloadBytes.length) {
            const bytes = rankedUsers.byDownloadBytes[slotIdx].downloadBytes || 0;
            value = formatBytes(bytes);
          }
          break;
        case 'UC': // Upload CPS (use uploadBytes / timesCalled as approximation)
          if (slotIdx >= 0 && slotIdx < rankedUsers.byUploadBytes.length) {
            const user = rankedUsers.byUploadBytes[slotIdx] as any;
            const cps = user.timesCalled > 0 ? Math.floor((user.uploadBytes || 0) / user.timesCalled) : 0;
            value = cps.toString();
          }
          break;
        case 'DC': // Download CPS (use downloadBytes / timesCalled as approximation)
          if (slotIdx >= 0 && slotIdx < rankedUsers.byDownloadBytes.length) {
            const user = rankedUsers.byDownloadBytes[slotIdx] as any;
            const cps = user.timesCalled > 0 ? Math.floor((user.downloadBytes || 0) / user.timesCalled) : 0;
            value = cps.toString();
          }
          break;
        case 'MS': // Messages Posted
          if (slotIdx >= 0 && slotIdx < rankedUsers.byMessages.length) {
            value = (rankedUsers.byMessages[slotIdx].messagesPosted || 0).toString();
          }
          break;
        case 'TU': // Total Users
          value = totalUsers.toString();
          break;
        case 'SC': // System Calls (use todayCalls from stats)
          value = todayCalls.toString();
          break;
        default:
          value = '0';
      }

      // Pad to field width
      value = value.padStart(rep.width, ' ');
      parsed = parsed.replace(rep.match, value);
    }
  }

  // Process ~SS_ file display codes (express.e:5490-5500)
  // Replace {{DISPLAY_FILE:N}} placeholders with actual file content
  for (let i = 0; i < filesToDisplay.length; i++) {
    const filename = filesToDisplay[i];
    const placeholder = `{{DISPLAY_FILE:${i}}}`;

    // Load the file content - loadScreenFile now handles Amiga paths
    let screenData = loadScreenFile(filename, session.currentConf, 0, session);

    if (screenData) {
      // Recursively process MCI codes in the embedded file
      const embedded = await parseMciCodes(screenData.content, session, bbsName, sysopName, location);
      // Add any commands from embedded file to our command list
      commandsToExecute.push(...embedded.commands);
      if (embedded.hasPause) {
        hasPause = true;
      }
      // Add ESC prefix to bare ANSI sequences in embedded content (like FLT logos)
      let embeddedContent = embedded.parsed;
      if (!screenData.isPetscii) {
        embeddedContent = addAnsiEscapes(embeddedContent);
      }
      // Replace placeholder with embedded content
console.log(`[MCI] Replacing placeholder ${placeholder} with ${embeddedContent.length} bytes from ${filename}`);
      parsed = parsed.replace(placeholder, embeddedContent);
    } else {
      // File not found - remove placeholder
console.log(`[MCI] File not found, removing placeholder: ${filename}`);
      screenDebug(`[MCI] ~SS_ file not found: ${filename}`);
      parsed = parsed.replace(placeholder, '');
    }
  }

  // ~~ - Literal tilde (express.e escape character)
  // This must be processed LAST so it doesn't interfere with other ~ codes
  parsed = parsed.replace(/~~/g, '~');

  if (session) {
    session.lastScreenHadPause = hasPause;
  }

  return { parsed, commands: commandsToExecute, hasPause, slowmo: slowmoApplied, slowmoCount: slowmoAppliedCount, inlineEmitted };
}

/**
 * Load screen file from disk
 * Searches in priority order: Conference  Node  Global BBS screens
 * Like express.e await displayScreen() - loads from BBS:Node{X}/Screens/ or BBS:Conf{X}/Screens/
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns Screen file content or null if not found
 */
export function loadScreenFile(
  screenName: string,
  conferenceId?: number,
  nodeId: number = 0,
  session?: BBSSession
): { content: string; isPetscii: boolean; isRip: boolean; filePath: string } | null {
  // BBS directory structure matches original Amiga AmiExpress
  // Use dataDir from config which points to project root
  const { config } = require('../config');
  const baseDir = config.getConfig().dataDir;
  const bbsPaths = new BBSPaths(baseDir);
  const paths = [];

  const normalizeAbsoluteCaseInsensitive = (absPath: string): string => {
    if (!path.isAbsolute(absPath)) return absPath;
    const resolved = amigaResolvePath(absPath);
    if (resolved) return resolved;
    return absPath;
  };

  // Normalize common absolute-path-without-leading-slash cases (e.g. "Users/spot/..."),
  // since MCI-resolved absolute paths sometimes lose the leading separator.
  let effectiveName = screenName;
  const baseDirNoSlash = baseDir.replace(new RegExp(`^${path.sep}`), '');
  if (!path.isAbsolute(effectiveName) && (effectiveName.startsWith(baseDir) || effectiveName.startsWith(baseDirNoSlash))) {
    effectiveName = path.join(path.sep, effectiveName);
  }

  screenDebug(`[loadScreenFile] Loading screen: ${effectiveName}`);
  screenDebug(`[loadScreenFile] Base directory: ${baseDir}`);
  screenDebug(`[loadScreenFile] Conference ID: ${conferenceId}, Node ID: ${nodeId}`);
  screenDebug(`[loadScreenFile] Terminal type: ${session?.terminalType || 'unknown'} (${session?.screenWidth}x${session?.screenHeight})`);
  screenDebug(`[loadScreenFile] PETSCII mode: ${session?.petsciiMode ? 'YES' : 'NO'}`);
  const userSecLevel = session?.user?.secLevel ?? 0;

  // express.e:6551-6558 - Some screen types use different file names
  // NODE_BULL and CONF_BULL both look for 'BULL' files in their respective directories
  const actualFileName = getScreenFileName(screenName);
  const screenBaseNoExt = actualFileName.replace(/\.[^/.]+$/, ''); // strip extension for security search
  if (actualFileName !== screenName) {
    screenDebug(`[loadScreenFile] Screen ${screenName} uses file name: ${actualFileName}`);
  }
  const isAssignPath = effectiveName.includes(':');
  let isAbsolutePath = path.isAbsolute(effectiveName);
  const normalizedName = effectiveName.toLowerCase();

  // Handle explicit absolute filesystem paths (already resolved)
  if (isAbsolutePath) {
    const normalizedAbs = normalizeAbsoluteCaseInsensitive(effectiveName);
    const dir = path.dirname(normalizedAbs);
    const base = path.basename(normalizedAbs);
    const resolved = findCaseInsensitive(dir, base) || normalizedAbs;
    paths.push(resolvePetsciiPath(resolved, !!session?.petsciiMode));
  } else if (effectiveName.includes(':')) {
    // Use centralized BBS path resolver for Amiga assigns (BBS:, WORK:, NODE:, etc.)
    const resolved = bbsPaths.resolveAmigaPath(effectiveName, nodeId);
    const dir = path.dirname(resolved);
    const base = path.basename(resolved);
    const ci = findCaseInsensitive(dir, base) || resolved;
    const normalized = resolvePetsciiPath(ci, !!session?.petsciiMode).replace(new RegExp(`^${baseDir}/bbs/`, 'i'), `${baseDir}/`);
    if (normalized !== ci) {
console.log(`[SCREEN_DEBUG] Stripping leading 'bbs' component: ${ci} -> ${normalized}`);
    }
    paths.push(normalized);
    screenDebug(`[MCI] ~SS_ resolving Amiga path: ${screenName} -> ${normalized}`);
  } else if (screenName.includes('/')) {
  } else if (effectiveName.includes('/')) {
    // Relative path with slashes - treat as dataDir-relative (no extra "Screens" prefix)
    const fsPath = path.join(baseDir, ...effectiveName.split('/'));
    const resolved = findCaseInsensitive(path.dirname(fsPath), path.basename(fsPath));
    const normalized = (resolved || fsPath).replace(new RegExp(`^${baseDir}/bbs/`, 'i'), `${baseDir}/`);
    if (normalized !== (resolved || fsPath)) {
console.log(`[SCREEN_DEBUG] Stripping leading 'bbs' component: ${(resolved || fsPath)} -> ${normalized}`);
    }
    paths.push(normalized);
  }

  // Define search directories and filenames to try (case-insensitive, AmigaOS compatible)
  // We try multiple filename variations: FILENAME.TXT, filename.txt, Filename.txt, etc.
  const searchLocations: Array<{ dir: string; desc: string }> = [];
  const hasSlash = !isAbsolutePath && effectiveName.includes('/');

  // Only populate default search locations when no explicit path/assign is given.
  if (!isAbsolutePath && !isAssignPath && !hasSlash) {
    // express.e:6544-6640 - Each screen type uses a SPECIFIC directory priority.
    const screenDirType = getScreenDirType(screenName);
    const nodeDir = path.join(baseDir, `Node${nodeId}`);
    const globalScreensDir = path.join(baseDir, 'Screens');

    // Add prioritized location based on screen type
    if (screenDirType === ScreenDirType.NODE) {
      searchLocations.push({ dir: nodeDir, desc: `Node${nodeId}` });
      searchLocations.push({ dir: path.join(nodeDir, 'Screens'), desc: `Node${nodeId}/Screens` });
    } else if (screenDirType === ScreenDirType.CONF) {
      // Use provided ID or fallback to session relative conference number
      const actualConfId = conferenceId || session?.relConfNum;
      if (actualConfId) {
        const candidateDirs = getConferenceScreensCandidates(baseDir, actualConfId);
        candidateDirs.forEach(candidate => {
          searchLocations.push({ dir: candidate.dir, desc: candidate.desc });
        });
      }
    } else if (screenDirType === ScreenDirType.GLOBAL) {
      searchLocations.push({ dir: globalScreensDir, desc: 'Screens' });
      searchLocations.push({ dir: path.join(baseDir, 'Bulletins'), desc: 'Bulletins' });
    }

    // Add standard fallbacks based on screen type to ensure compatibility
    // with systems that share screens or use simplified directory structures.
    if (!searchLocations.some(l => l.dir === nodeDir)) {
      searchLocations.push({ dir: nodeDir, desc: `Node${nodeId} (Fallback)` });
      searchLocations.push({ dir: path.join(nodeDir, 'Screens'), desc: `Node${nodeId}/Screens (Fallback)` });
    }
    // Add global Screens/ fallback EXCEPT for NODE_BULL
    // NODE_BULL must NOT fallback to Screens/ because BULL already displays Screens/BULL.TXT
    // This prevents the same bulletin from being shown twice during login flow.
    // Per express.e:6551-6553, NODE_BULL specifically uses nodeScreenDir for BULL.TXT
    const isNodeBull = screenName.toUpperCase() === 'NODE_BULL';
    if (!isNodeBull && !searchLocations.some(l => l.dir === globalScreensDir)) {
      searchLocations.push({ dir: globalScreensDir, desc: 'Screens (Fallback)' });
    }
    
    screenDebug(`[loadScreenFile] Search locations for ${screenName}:`, searchLocations.map(l => l.desc));
  }

  // Possible filename variations (case-insensitive search will handle actual matching)
  // In PETSCII mode, prefer .seq files over .TXT files
  // For real C64 clients (terminalType === 'c64'), prioritize _C64.seq variants
  const isC64Client = session?.terminalType === 'c64';
  // Preserve explicit extensions; build variant lists depending on ANSI vs PETSCII
  const addAnsiVariants = (name: string) => {
    const variants = new Set<string>();
    variants.add(name);
    variants.add(`${name}.TXT`);
    variants.add(`${name}.txt`);
    variants.add(`${name}.logoff`);
    variants.add(`${name}.logoff.txt`);
    variants.add(`${name}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const addPetsciiVariants = (name: string) => {
    const variants = new Set<string>();
    // Prefer PETSCII .seq first
    variants.add(`${name}.seq`);
    variants.add(`${name}.SEQ`);
    // Also allow explicit name as-is (in case a .txt was provided)
    variants.add(name);
    // Fall back to ANSI text if no .seq exists
    variants.add(`${name}.TXT`);
    variants.add(`${name}.txt`);
    variants.add(`${name}.logoff`);
    variants.add(`${name}.logoff.txt`);
    variants.add(`${name}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const addRipVariants = (name: string) => {
    const variants = new Set<string>();
    // Prefer RIP .rip first
    variants.add(`${name}.rip`);
    variants.add(`${name}.RIP`);
    // Also allow explicit name as-is
    variants.add(name);
    // Fall back to ANSI text if no .rip exists
    variants.add(`${name}.TXT`);
    variants.add(`${name}.txt`);
    variants.add(`${name}.logoff`);
    variants.add(`${name}.logoff.txt`);
    variants.add(`${name}.LOGOFF.TXT`);
    return Array.from(variants);
  };

  const filenameVariations = (() => {
    // Special-case BBSTITLE: try .TXT first to avoid noisy extensionless probes
    if (screenName.toUpperCase() === 'BBSTITLE') {
      if (session?.petsciiMode) {
        return [...addPetsciiVariants(screenName)];
      } else if (session?.ripMode) {
        return [...addRipVariants(screenName)];
      }
      return ['BBSTITLE.TXT', 'BBSTITLE.txt', 'BBSTITLE'];
    }
    if (screenName.toUpperCase() === 'AWAITSCREEN') {
      if (session?.petsciiMode) {
        return [...addPetsciiVariants(screenName)];
      } else if (session?.ripMode) {
        return [...addRipVariants(screenName)];
      }
      return ['AWAITSCREEN.TXT', 'AWAITSCREEN.txt'];
    }
    // Use actualFileName for mapped screen types (e.g., NODE_BULL -> BULL)
    const fileToFind = actualFileName;
    if (session?.petsciiMode) {
      return isC64Client ? addPetsciiVariants(`${fileToFind}_C64`) : addPetsciiVariants(fileToFind);
    }
    if (session?.ripMode) {
      return addRipVariants(fileToFind);
    }
    return addAnsiVariants(fileToFind);
  })();

  // Try each location with case-insensitive matching
  screenDebug(`[loadScreenFile] Trying ${searchLocations.length} location(s) with case-insensitive matching:`);
  let attemptNum = 0;

  for (const location of searchLocations) {
    // Skip security-numbered lookup when the screen already used an assign (bbs:, node:, etc.)
    if (!isAssignPath) {
      const securityBasePath = path.join(location.dir, screenBaseNoExt);
      const securityVariant = findSecurityScreen(securityBasePath, userSecLevel, null, session?.ripMode ?? false);
      if (securityVariant) {
        screenDebug(`[loadScreenFile]  Found security screen for ${screenName} at: ${securityVariant}`);
        try {
          // Check if it's a PETSCII .seq file - convert for PetMe64 font display
          if (isPetsciiSeqFile(securityVariant)) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            const petsciiBuffer = readScreenBuffer(securityVariant);
            const content = convertPetsciiToPetMe64(petsciiBuffer);
            return { content, isPetscii: true, isRip: false, filePath: securityVariant };
          }
          // Check if it's a RIP file - send raw content (express.e:6776-6780)
          if (isRipFile(securityVariant)) {
            screenDebug(`[loadScreenFile] RIP .rip file detected, sending raw content`);
            return { content: readScreenText(securityVariant), isPetscii: false, isRip: true, filePath: securityVariant };
          }
          return { content: readScreenWithTransforms(securityVariant).text, isPetscii: false, isRip: false, filePath: securityVariant };
        } catch (error) {
          SysopDebugUtil.debugFileError(null, session, 'read', securityVariant, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error reading security screen: ${(error as Error).message})`);
        }
      }
    }
    for (const filename of filenameVariations) {
      attemptNum++;
      const expectedPath = path.join(location.dir, filename);
      screenDebug(`[loadScreenFile]   [${attemptNum}/${searchLocations.length * filenameVariations.length}] ${expectedPath}`);

      // Try case-insensitive match
      const foundPath = findCaseInsensitive(location.dir, filename);
      if (foundPath) {
        screenDebug(`[loadScreenFile]  Found screen ${screenName} at: ${foundPath}`);
        let fileToUse: string = foundPath;
        try {
          fileToUse = resolvePetsciiPath(foundPath, !!session?.petsciiMode);
          const isPetsciiFile = isPetsciiSeqFile(fileToUse);
          if (isPetsciiFile) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            try {
              const petsciiBuffer = readScreenBuffer(fileToUse);
              const content = convertPetsciiToPetMe64(petsciiBuffer);
              return { content, isPetscii: true, isRip: false, filePath: fileToUse };
            } catch (error) {
              SysopDebugUtil.debug(null, session, 'PETSCII', `Failed to convert ${fileToUse}`, { error: (error as Error).message }, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error converting PETSCII):`, error);
            }
          } else if (isRipFile(fileToUse)) {
            screenDebug(`[loadScreenFile] RIP .rip file detected, sending raw content`);
            return { content: readScreenText(fileToUse), isPetscii: false, isRip: true, filePath: fileToUse };
          } else {
            const content = readScreenWithTransforms(fileToUse).text;
            try {
              const fs = require('fs');
              fs.appendFileSync('debug-screen-loads.log', `[${new Date().toISOString()}] Loaded ${screenName} from ${fileToUse} (content length: ${content.length})\n`);
            } catch (e) { /* ignore */ }
            return { content, isPetscii: false, isRip: false, filePath: fileToUse };
          }
        } catch (error) {
          SysopDebugUtil.debugFileError(null, session, 'read', fileToUse, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error reading file: ${(error as Error).message})`);
        }
      } else {
        screenDebug(`[loadScreenFile]     (not found)`);
      }
    }
  }

  // If we have paths from Amiga-style handling, try those too
  for (let i = 0; i < paths.length; i++) {
    const filePath = paths[i];
    attemptNum++;
    screenDebug(`[loadScreenFile]   [${attemptNum}] ${filePath}`);

    // For assign paths (bbs:, node:, work:), also honor security-numbered variants (LOGON20.TXT, etc.)
    if (isAssignPath) {
      const baseWithoutExt = filePath.replace(/\.[^/.]+$/, '');
      const secPath = findSecurityScreen(baseWithoutExt, userSecLevel, null, session?.ripMode ?? false);
      if (secPath) {
        screenDebug(`[loadScreenFile]  Found security screen for assign path: ${secPath}`);
        try {
          if (isPetsciiSeqFile(secPath)) {
            const petsciiBuffer = readScreenBuffer(secPath);
            const content = convertPetsciiToPetMe64(petsciiBuffer);
            return { content, isPetscii: true, isRip: false, filePath: secPath };
          }
            if (isRipFile(secPath)) {
              return { content: readScreenText(secPath), isPetscii: false, isRip: true, filePath: secPath };
            }
            return { content: readScreenWithTransforms(secPath).text, isPetscii: false, isRip: false, filePath: secPath };
        } catch (error) {
          SysopDebugUtil.debugFileError(null, session, 'read', secPath, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error reading security screen: ${(error as Error).message})`);
        }
      }
    }

    try {
      const candidatePath = resolvePetsciiPath(filePath, !!session?.petsciiMode);
      // Try the path as-is, then with common extensions (.txt, .TXT, .ans, .ANS)
      // This handles ~SR_ which generates paths like "001.logoff" but files are "001.logoff.txt"
      const pathsToTry = [candidatePath];
      if (!candidatePath.match(/\.(txt|ans|seq)$/i)) {
        pathsToTry.push(candidatePath + '.txt', candidatePath + '.TXT', candidatePath + '.ans', candidatePath + '.ANS');
      }

      for (const tryPath of pathsToTry) {
        if (amigafs.existsSync(tryPath)) {
          screenDebug(`[loadScreenFile]  Found screen ${screenName} at: ${tryPath}`);
          if (isPetsciiSeqFile(tryPath)) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            try {
              const petsciiBuffer = readScreenBuffer(tryPath);
              const content = convertPetsciiToPetMe64(petsciiBuffer);
              return { content, isPetscii: true, isRip: false, filePath: tryPath };
            } catch (error) {
              SysopDebugUtil.debug(null, session, 'PETSCII', `Failed to convert ${tryPath}`, { error: (error as Error).message }, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error converting PETSCII):`, error);
            }
          } else if (isRipFile(tryPath)) {
            screenDebug(`[loadScreenFile] RIP .rip file detected, sending raw content`);
            return { content: readScreenText(tryPath), isPetscii: false, isRip: true, filePath: tryPath };
          } else {
            return { content: readScreenWithTransforms(tryPath).text, isPetscii: false, isRip: false, filePath: tryPath };
          }
        }
      }
      screenDebug(`[loadScreenFile]     (not found after trying extensions)`);
    } catch (error) {
      SysopDebugUtil.debugFileError(null, session, 'read', filePath, error as Error, DebugSeverity.WARNING);
console.error(`[loadScreenFile]     (error: ${(error as Error).message})`);
    }
  }

  // express.e:6544-6640 - Screens are loaded from specific directories based on type:
  // - NODE screens (LOGON, NODE_BULL, etc.): nodeScreenDir (NodeN/Screens/)
  // - CONF screens (MENU, CONF_BULL, etc.): confScreenDir (ConfN/Screens/)
  // - GLOBAL screens (BULL, ONENODE, etc.): cmds.bbsLoc (Screens/)
  // If a screen isn't found in its designated directory, express.e simply doesn't
  // display it (returns FALSE from displayScreen). No cross-directory fallbacks.
  const upper = screenName.toUpperCase();
  const screenDirType = getScreenDirType(screenName);
  const expectedDir = screenDirType === ScreenDirType.NODE ? `Node${nodeId}/Screens/` :
                      screenDirType === ScreenDirType.CONF ? `Conf${conferenceId || session?.relConfNum}/Screens/` :
                      'Screens/';
console.warn(`[loadScreenFile]  Screen file not found: ${screenName}`);
console.warn(`[loadScreenFile]  Expected location: ${expectedDir}${getScreenFileName(screenName)}.TXT`);
console.warn(`[loadScreenFile]  Per express.e:6544-6640, ${screenName} screens should be in ${expectedDir}`);
console.warn(`[loadScreenFile] Tried ${attemptNum} locations`);
try {
  const fs = require('fs');
  fs.appendFileSync('debug-screen-loads.log', `[${new Date().toISOString()}] NOT FOUND: ${screenName} (nodeId: ${nodeId}, conferenceId: ${conferenceId})\n`);
} catch (e) { /* ignore */ }
  SysopDebugUtil.warn(null, session, 'Screen File', `Screen "${screenName}" not found after trying ${attemptNum} locations`);

  if (screenName.toUpperCase() === 'AWAITSCREEN') {
    const nodeFallbackDir = path.join(baseDir, 'Node1');

    // Prefer ANSI text fallback for the await screen
    const ansiFallback = findCaseInsensitive(nodeFallbackDir, 'bbstitle.txt') || findCaseInsensitive(nodeFallbackDir, 'bbstitle.TXT');
    if (ansiFallback) {
      try {
        const content = readScreenText(ansiFallback);
        screenDebug(`[loadScreenFile]  Using ANSI fallback screen ${ansiFallback}`);
        return { content, isPetscii: false, isRip: false, filePath: ansiFallback };
      } catch (error) {
console.error(`[loadScreenFile]     (error reading ANSI fallback screen: ${(error as Error).message})`);
        SysopDebugUtil.debugFileError(
          null,
          session,
          'read',
          ansiFallback,
          error as Error,
          DebugSeverity.WARNING
        );
      }
    }

    const petsciiFallback = findCaseInsensitive(nodeFallbackDir, 'bbstitle.seq');
    if (petsciiFallback) {
      try {
        const buffer = readScreenBuffer(petsciiFallback);
        const content = convertPetsciiToPetMe64(buffer);
        screenDebug(`[loadScreenFile]  Using PETSCII fallback screen ${petsciiFallback}`);
        return { content, isPetscii: true, isRip: false, filePath: petsciiFallback };
      } catch (error) {
console.error(`[loadScreenFile]     (error reading fallback screen: ${(error as Error).message})`);
        SysopDebugUtil.debugFileError(
          null,
          session,
          'read',
          petsciiFallback,
          error as Error,
          DebugSeverity.WARNING
        );
      }
    }
  }

  return null;
}

/**
 * Add ESC character prefix to bare ANSI sequences
 * Screen files contain [XXm without ESC (0x1B) prefix
 * This matches original Amiga behavior where ESC was stored as actual byte
 *
 * @param content - Screen content with bare ANSI codes
 * @returns Content with proper ESC prefixes
 */
export function addAnsiEscapes(content: string): string {
  // Match ANSI sequences: ESC?[digits;digits+][A-Za-z] or ESC?[HJK] or ESC?2J
  // Avoid double-prefixing sequences that already contain ESC (express.e stores ESC bytes)
  return content.replace(/(\x1b)?\[([0-9;]*[A-Za-z]|[HJK]|2J)/g, (_m, esc, body) => {
    // If ESC was already present, preserve a single ESC; otherwise add one
    return `\x1b[${body}`;
  });
}

/**
 * Display a screen file to the user
 * Like express.e await displayScreen(screenName) - express.e:28566, 28571, 28586
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session
 * @param screenName - Name of screen to display
 * @returns true if screen was displayed successfully, false otherwise
 */
export async function displayScreen(socket: any, session: BBSSession, screenName: string, runCommands: boolean = true, silent: boolean = false): Promise<boolean> {
  screenDebug(`[displayScreen] ========================================`);
  screenDebug(`[displayScreen] REQUESTED SCREEN: ${screenName}`);
  screenDebug(`[displayScreen] Conference ID: ${session.currentConf || 'none'}`);
  screenDebug(`[displayScreen] User: ${session.user?.name || 'guest'}`);
  screenDebug(`[displayScreen] ========================================`);

  // CRITICAL: Flush any buffered output before displaying screen (express.e behavior)
  // This ensures prompts/content from previous operations are visible before screen transition
  flushOutput(socket);

  screenFlowLog(screenName, `Display request for ${screenName} (runCommands=${runCommands}) state=${session.subState} node=${session.nodeId || 0}`);
  const upperName = screenName.toUpperCase();
  const isMenuScreen = upperName === 'MENU';
  const isFlowScreen = SCREEN_FLOW_SCREENS.has(upperName);
  const shouldClear = SCREENS_REQUIRE_CLEAR.has(upperName);

  // Express.e:6567 - reset cmdShortcuts before attempting to load the menu screen
  if (isMenuScreen) {
    session.cmdShortcuts = false;
    if ((session as any).shortcuts && typeof (session as any).shortcuts.clear === 'function') {
      (session as any).shortcuts.clear();
    }
  }

  const screenData = loadScreenFile(screenName, session.currentConf, session.nodeId || 0, session);

  if (screenData) {
    const { content, isPetscii, filePath } = screenData;
    // Express.e:6567  MENU resets cmdShortcuts/shortcuts before checking for .keys
    session.lastScreenFilePath = filePath;

    // [NEWLINE-DEBUG] Log raw content newlines
    const rawNewlines = (content.match(/\n/g) || []).length;
    const rawCRLF = (content.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] RAW CONTENT (${screenName}): ${content.length} bytes, ${rawNewlines} \\n, ${rawCRLF} \\r\\n`);

    screenDebug(`[displayScreen]  Screen loaded successfully: ${screenName}`);
    screenDebug(`[displayScreen] Content length: ${content.length} bytes`);
    screenDebug(`[displayScreen] PETSCII: ${isPetscii ? 'YES' : 'NO'}`);
    screenDebug(`[displayScreen] Render event: ${screenName} (node ${session.nodeId || 0})`);
    screenFlowLog(screenName, `Loaded ${screenName} file=${filePath} petscii=${isPetscii ? 'Y' : 'N'} bytes=${content.length}`);

    // Log screen display
    DebugLogger.screen(socket.id, `Displaying screen: ${screenName}`, {
      file: filePath,
      size: `${content.length} bytes`,
      isPetscii,
      conference: session.currentConf
    });

    // ANSI Animation Detection: Force 14.4kbps playback for animated screens
    // Animations need proper timing to play frame-by-frame, regardless of user's modem speed
    const isAnimation = !isPetscii && isAnsiAnimation(content);

    if (isAnimation) {
      // Save current modem state in session for later restoration
      session.savedModemState = {
        enabled: session.modemEmulationEnabled || false,
        bps: session.modemBps || 0
      };

      // Force 14.4kbps modem emulation for animation playback
      const { getModemEmulator } = require('../utils/modem-emulator.util');
      const modemEmulator = getModemEmulator(socket);
      modemEmulator.install();
      modemEmulator.enable(14400);
      session.modemEmulationEnabled = true;
      session.modemBps = 14400;

      // Disable AnsiBuffer batching when modem emulation is enabled
      const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
      const ansiBuffer = getAnsiBuffer(socket);
      ansiBuffer.setFlushDelay(0);

      console.log(`[ANSI-ANIM] Enabled 14.4kbps modem emulation for ${screenName} (was: ${session.savedModemState.bps} bps)`);
      DebugLogger.screen(socket.id, `ANSI animation detected - forced 14.4kbps playback`, {
        screen: screenName,
        previousSpeed: session.savedModemState.bps
      });
    }

    let parsed: string;
    let commands: any[] = [];
    let inlineEmitted = false;  // Track if parseMciCodes already emitted content inline

    // === Screen Wipe Detection (BEFORE MCI parsing) ===
    // Must detect wipe codes before parseMciCodes runs in inline mode,
    // because inline mode emits content directly and sets parsed='',
    // preventing later wipe detection.
    const earlyWipeResult = parseWipeMCI(content);
    const hasEarlyWipeAnimation = earlyWipeResult.wipeType !== null;
    // Use content without wipe code for MCI processing
    let contentForMci = content;
    // When wipe is detected, disable inline mode so parsed contains full content for animation
    // (inline mode emits content directly and sets parsed='', breaking wipe animation)
    const mciSocket = hasEarlyWipeAnimation ? undefined : socket;
    if (hasEarlyWipeAnimation) {
      contentForMci = earlyWipeResult.content; // Remove wipe code from content before MCI processing
      console.log(`[WIPE-EARLY] Detected wipe ${earlyWipeResult.wipeType} in ${screenName}, disabled inline mode`);
    }

    // === MCI Guard: allowMCI check (express.e:6800-6806) ===
    // MCI processing is only enabled when the file's first line starts with '~'.
    // Files that don't start with '~' are displayed as raw text with no MCI substitution.
    const firstNewline = contentForMci.indexOf('\n');
    const firstLine = firstNewline >= 0 ? contentForMci.slice(0, firstNewline) : contentForMci;
    const allowMCI = firstLine.trimEnd().length > 0 && firstLine[0] === '~';

    // eventName is used throughout the display path after MCI processing
    const eventName = isPetscii ? 'petscii-output' : 'ansi-output';

    if (!allowMCI) {
      // Raw display: no MCI processing. Return content directly as parsed output.
      screenDebug(`[displayScreen] allowMCI=FALSE for ${screenName} (first line does not start with '~'), skipping MCI`);
      parsed = contentForMci;
      commands = [];
      session.lastScreenHadPause = false;
    } else {

    // === ~SP (Soft Pause) Segment Processing ===
    // express.e:5455-5461 - ~SP pauses IMMEDIATELY at each occurrence
    // Split content at ~SP boundaries and process one segment at a time
    // Each segment contains content up to (but not including) the ~SP code

    // Check if raw content has ~SP codes (before parsing removes them)
    // express.e:5455-5461 - ~SP causes immediate pause when followed by terminator
    // Terminators: whitespace, | (mciterminator), . (SP.), or end of string
    const hasSoftPauses = /~SP(?:\s|\||\.|$)/.test(contentForMci);

    if (isFlowScreen && hasSoftPauses && !session.screenSegments) {
      // Split content at ~SP boundaries
      // express.e parses synchronously and calls doPause() at each ~SP
      // We achieve the same by splitting into segments and processing with pauses between
      const segments = contentForMci.split(/~SP(?:\s|\||\.)/)
        .map(s => s.trim())
        .filter(s => s.length > 0);

console.log(`[SEGMENT] SETUP: ${segments.length} segments for ${screenName}`);
      segments.forEach((s, i) => console.log(`[SEGMENT]   ${i}: "${s.substring(0, 60).replace(/\n/g, '\\n')}..."`));
      screenDebug(`[displayScreen] ~SP segment processing: ${segments.length} segments for ${screenName}`);

      if (segments.length > 1) {
        // Store remaining segments for later processing
        session.screenSegments = {
          segments: segments.slice(1),  // Everything after first segment
          currentIndex: 0,
          screenName,
          inlineMode: true,
          eventName,
          isFlowScreen: true
        };

        // Process only the first segment now
        screenDebug(`[displayScreen] Processing segment 0/${segments.length}: ${segments[0].substring(0, 50)}...`);
        const segmentResult = await parseMciCodes(segments[0], session, 'AmiExpress-Web', 'Sysop', 'The Internet', mciSocket);
        parsed = segmentResult.parsed;
        commands = segmentResult.commands;
        if (segmentResult.slowmo !== undefined) session.slowmo = segmentResult.slowmo;
        if (segmentResult.slowmoCount !== undefined) session.slowmoCount = segmentResult.slowmoCount;
        if (segmentResult.inlineEmitted) inlineEmitted = true;

        // express.e:5455-5461 - Handle pendingInlineContent from ~SP in inline mode
        // If inline processing found ~SP, prepend remaining content to segment list
        if (segmentResult.pendingInlineContent && segmentResult.pendingInlineContent.length > 0) {
          session.screenSegments!.segments.unshift(segmentResult.pendingInlineContent);
          console.log(`[~SP] Prepended pendingInlineContent to segments (${segmentResult.pendingInlineContent.length} bytes)`);
        }

        // [NEWLINE-DEBUG] Log parsed segment newlines
        const parsedSegmentNewlines = (parsed.match(/\n/g) || []).length;
        const parsedSegmentCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER parseMciCodes SEGMENT 0: ${parsed.length} bytes, ${parsedSegmentNewlines} \\n, ${parsedSegmentCRLF} \\r\\n`);

        // DON'T set lastScreenHadPause here - let pauseDisplayFlow handle the pause
        // to avoid double pause prompts. screenSegments is already set for subsequent segments.
        // express.e:28556-28557: IF (displayScreen(SCREEN_BULL)) THEN doPause()
        session.lastScreenHadPause = false;

        // Continue to display this segment (no pause from displayScreen, pauseDisplayFlow will handle it)
        // Fall through to normal display logic below
      } else {
        // Only one segment (or ~SP at end), process normally
        const result = await parseMciCodes(contentForMci, session, 'AmiExpress-Web', 'Sysop', 'The Internet', mciSocket);
        parsed = result.parsed;
        commands = result.commands;
        if (result.slowmo !== undefined) session.slowmo = result.slowmo;
        if (result.slowmoCount !== undefined) session.slowmoCount = result.slowmoCount;
        if (result.inlineEmitted) inlineEmitted = true;
        session.lastScreenHadPause = result.hasPause;

        // express.e:5455-5461 - Handle pendingInlineContent from ~SP in inline mode
        if (result.pendingInlineContent && result.pendingInlineContent.length > 0) {
          session.screenSegments = {
            segments: [result.pendingInlineContent],
            currentIndex: 0,
            screenName,
            inlineMode: true,
            eventName,
            isFlowScreen: true
          };
          console.log(`[~SP] Stored pendingInlineContent in single segment branch (${result.pendingInlineContent.length} bytes)`);
        }

        // [NEWLINE-DEBUG] Log parsed content newlines (single segment case)
        const parsedNewlines = (parsed.match(/\n/g) || []).length;
        const parsedCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER parseMciCodes SINGLE: ${parsed.length} bytes, ${parsedNewlines} \\n, ${parsedCRLF} \\r\\n`);
      }
    } else {
      // Normal processing (no ~SP segments or not a flow screen)
      // Always parse MCI so ~SS_ and other codes work even in PETSCII screens
      // Pass mciSocket (undefined when wipe detected) to control inline mode
      const result = await parseMciCodes(contentForMci, session, 'AmiExpress-Web', 'Sysop', 'The Internet', mciSocket);
      parsed = result.parsed;
      commands = result.commands;
      if (result.slowmo !== undefined) {
        session.slowmo = result.slowmo;
      }
      if (result.slowmoCount !== undefined) {
        session.slowmoCount = result.slowmoCount;
      }
      if (result.inlineEmitted) inlineEmitted = true;
      session.lastScreenHadPause = result.hasPause;

      // express.e:5455-5461 - Handle pendingInlineContent from ~SP in inline mode
      // When ~SP is found during inline MCI processing, remaining content is returned here
      // Store it in screenSegments for processing after pause is dismissed
      if (result.pendingInlineContent && result.pendingInlineContent.length > 0) {
        session.screenSegments = {
          segments: [result.pendingInlineContent],
          currentIndex: 0,
          screenName,
          inlineMode: true,
          eventName,
          isFlowScreen: true
        };
        console.log(`[~SP] Stored pendingInlineContent (${result.pendingInlineContent.length} bytes) for processing after pause`);
      }

      // [NEWLINE-DEBUG] Log parsed content newlines (normal case)
      const parsedNormalNewlines = (parsed.match(/\n/g) || []).length;
      const parsedNormalCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER parseMciCodes NORMAL: ${parsed.length} bytes, ${parsedNormalNewlines} \\n, ${parsedNormalCRLF} \\r\\n`);
    }

    } // end else (allowMCI) — express.e:6800-6806

    // Log MCI parsing results
    if (commands.length > 0) {
      DebugLogger.mciSuccess(socket.id, `MCI codes found in ${screenName}`, {
        commandCount: commands.length,
        commands: commands  // Commands are strings, not objects
      });
    }

    // Add ESC prefix to bare ANSI sequences only for ANSI paths
    if (!isPetscii) {
      parsed = addAnsiEscapes(parsed);
      // [NEWLINE-DEBUG] Log after addAnsiEscapes
      const afterAnsiNewlines = (parsed.match(/\n/g) || []).length;
      const afterAnsiCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER addAnsiEscapes: ${parsed.length} bytes, ${afterAnsiNewlines} \\n, ${afterAnsiCRLF} \\r\\n`);
    }

    // Normalize line endings for terminal display
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // [NEWLINE-DEBUG] Log after line ending normalization (CRITICAL)
    const afterNormalizeNewlines = (parsed.match(/\n/g) || []).length;
    const afterNormalizeCRLF = (parsed.match(/\r\n/g) || []).length;
console.log(`[NEWLINE-DEBUG] AFTER NORMALIZE: ${parsed.length} bytes, ${afterNormalizeNewlines} \\n, ${afterNormalizeCRLF} \\r\\n`);

    // For flow screens (BULL/NODE_BULL/CONF_BULL/LOGON/etc.), ensure the frame ends
    // with a newline so the pause prompt does not collide with the final line of content.
    if (isFlowScreen && !parsed.endsWith('\r\n')) {
      parsed += '\r\n';
    }

    // Screen Wipe Animations (~WM, ~WH, ~WV, ~WS, ~WC, ~WR, ~WB, ~WN, ~WT, ~WE, ~WX)
    // Use early detection result (detected BEFORE MCI parsing to handle inline mode)
    const hasWipeAnimation = hasEarlyWipeAnimation;
    const wipeType = earlyWipeResult.wipeType;
console.log(`[WIPE-DEBUG] Screen: ${screenName}, hasWipeAnimation: ${hasWipeAnimation}, wipeType: ${wipeType}`);
    if (hasWipeAnimation) {
      screenDebug(`[displayScreen] Screen wipe detected: ${wipeType}`);
      DebugLogger.mci(socket.id, `Screen wipe animation: ~W${wipeType?.toUpperCase().charAt(0)}`, {
        wipeType: wipeType
      });
    }

    // Auto-paginate long screens (e.g., >25 lines like real AmiExpress More prompt)
    const pageHeight = session?.screenHeight || 25;
    const lines = parsed.split(/\r\n|\n/);
    const pageSize = Math.max(1, pageHeight - 1); // leave room for prompt line

    // [NEWLINE-DEBUG] Log line splitting
console.log(`[NEWLINE-DEBUG] SPLIT INTO LINES: ${lines.length} lines`);
console.log(`[NEWLINE-DEBUG] FIRST 5 LINES:`, lines.slice(0, 5).map((line, i) => `  [${i}] len=${line.length}: ${line.substring(0, 80)}`).join('\n'));

    // Note: eventName defined earlier for ~SP segment processing
    const slowmoSpeed = session.slowmo || 0;
    let slowmoCount = session.slowmoCount || 0;

    // emitWithModem handles modem speed throttling dynamically by checking session state each call

    const emitWithModem = async (payload: string) => {
      // When we do our OWN throttling, use directEmit to bypass ModemEmulator (avoid double-throttling)
      // When we DON'T throttle, use socket.emit so ModemEmulator can intercept if it's enabled
      const directEmit = (socket as any)._directEmit || socket.emit.bind(socket);

      // Check CURRENT session state for modem emulation (not captured value)
      // This allows the user to enable modem emulation mid-session
      const currentModemEnabled = session.modemEmulationEnabled;
      const currentModemBps = currentModemEnabled ? (session.modemBps || session.user?.baud || 0) : 0;
      const currentModemActive = currentModemBps > 0;
      const currentBytesPerSec = currentModemActive ? Math.max(1, Math.floor(currentModemBps / 10)) : 0;

      if (!currentModemActive || currentBytesPerSec <= 0) {
        // NOT doing our own throttling - use socket.emit so ModemEmulator can intercept
        socket.emit(eventName, payload);
        return;
      }
      // Tokenize ANSI so we never split escape sequences
      const tokens: string[] = [];
      const ansiRegex = /\x1b\[[0-9;?]*[A-Za-z]/g;
      let lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = ansiRegex.exec(payload)) !== null) {
        if (match.index > lastIndex) {
          tokens.push(payload.slice(lastIndex, match.index));
        }
        tokens.push(match[0]); // keep escape as a unit
        lastIndex = match.index + match[0].length;
      }
      if (lastIndex < payload.length) {
        tokens.push(payload.slice(lastIndex));
      }

      const start = process.hrtime.bigint();
      let sentBytes = 0;
      const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

      for (const tok of tokens) {
        const buf = Buffer.from(tok, 'utf-8');
        const isEscape = tok.startsWith('\x1b');
        if (isEscape) {
          directEmit(eventName, tok);
          continue;
        }
        let offset = 0;
        while (offset < buf.length) {
          const now = process.hrtime.bigint();
          const elapsedMs = Number(now - start) / 1_000_000;
          const allowed = Math.max(0, Math.floor(currentBytesPerSec * (elapsedMs / 1000)) - sentBytes);
          if (allowed <= 0) {
            await sleep(2);
            continue;
          }
          const toSend = Math.min(allowed, buf.length - offset, 256);
          const chunk = buf.slice(offset, offset + toSend).toString('utf-8');
          directEmit(eventName, chunk);
          offset += toSend;
          sentBytes += toSend;
        }
      }
    };

    const emitPage = async (startIdx: number, endIdx: number, prompt: boolean) => {
      const chunk = lines.slice(startIdx, endIdx).join('\r\n');
      const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)?' : '';
      const prefix = shouldClear && startIdx === 0 ? '\x1b[2J\x1b[H' : '';
      await emitWithModem(prefix + chunk + promptLine);
    };

    screenFlowLog(
      screenName,
      `Parsed ${screenName}: event=${eventName} commands=${commands.length} pause=${session.lastScreenHadPause ? 'Y' : 'N'} pages=${lines.length}`
    );

    const executeScreenCommands = () => {
      if (commands.length === 0) {
        session.pendingScreenCommand = undefined;
        session.screenCommandResolver = null;
        return;
      }

      if (!runCommands) {
        session.queuedScreenCommands = commands;
        session.pendingScreenCommand = undefined;
        session.screenCommandResolver = null;
        screenFlowLog(screenName, `Queued ${commands.length} screen command(s) for deferred execution`);
        return;
      }

      screenDebug(`[displayScreen] ==========================================`);
      screenDebug(`[displayScreen] EXECUTING ${commands.length} COMMANDS FROM SCREEN FILE: ${screenName}`);
      screenDebug(`[displayScreen] Commands:`, commands);
      screenDebug(`[displayScreen] ==========================================`);
      screenFlowLog(screenName, `Executing ${commands.length} command(s) from ${screenName}`);
      const { handleCommand } = require('./command-handler/core');

      session.pendingScreenCommand = new Promise<void>(resolve => {
        session.screenCommandResolver = resolve;
      });

      setImmediate(async () => {
        session.executingScreenCommand = true;
        try {
          for (let i = 0; i < commands.length; i++) {
            const commandStr = commands[i];
            screenDebug(`[displayScreen] ------------------------------------------`);
            screenDebug(`[displayScreen] EXECUTING COMMAND ${i + 1}/${commands.length}:`, commandStr);
            screenDebug(`[displayScreen] Command type:`, commandStr.includes(':') ? 'DOOR PATH' : 'BBSCMD');
            try {
              screenDebug(`[displayScreen] Calling handleCommand with:`, commandStr);
              const result = await handleCommand(socket, session, commandStr);
              screenDebug(`[displayScreen]  Command completed:`, commandStr, 'Result:', result);
            } catch (error) {
console.error(`[displayScreen]  ERROR executing command ${commandStr}:`, error);
console.error(`[displayScreen] Error stack:`, (error as Error).stack);
              SysopDebugUtil.debug(
                socket,
                session,
                'SCREEN',
                `Error executing screen command: ${commandStr}`,
                { error: (error as Error).message, stack: (error as Error).stack },
                DebugSeverity.CRITICAL
              );
            }
          }
          screenDebug(`[displayScreen] ==========================================`);
          screenDebug(`[displayScreen] ALL COMMANDS COMPLETED FROM: ${screenName}`);
          screenDebug(`[displayScreen] ==========================================`);
          screenFlowLog(screenName, `Completed ${commands.length} command(s) from ${screenName}`);
        } finally {
          session.executingScreenCommand = false;
          if (session.screenCommandResolver) {
            session.screenCommandResolver();
            session.screenCommandResolver = null;
            session.pendingScreenCommand = undefined;
          }
        }
      });
    };

    const emitSlowmoFrame = async (text: string) => {
      // Match express.e throughput for positive speeds: 60*speed bytes per 10ms => 6*speed bytes/ms.
      // Web-only extension: negative speeds map to slower-than-SMO1 fixed scalars.
      let bytesPerMs: number;
      if (slowmoSpeed > 0) {
        bytesPerMs = 6 * slowmoSpeed;
      } else {
        const scaleMap: Record<number, number> = {
          [-1]: 4, // ~1.5 KB/s
          [-2]: 8, // ~0.75 KB/s
          [-3]: 12 // ~0.5 KB/s
        };
        const scale = scaleMap[slowmoSpeed] || 4;
        bytesPerMs = 6 / scale;
      }
      // If modem emulation is active and its link is slower than this slowmo rate,
      // cap to modem speed; if slowmo is already slower, leave it untouched.
      // Check CURRENT session state (not captured value)
      const currentModemBps = session.modemEmulationEnabled ? (session.modemBps || session.user?.baud || 0) : 0;
      if (currentModemBps > 0) {
        const currentBytesPerSec = Math.max(1, Math.floor(currentModemBps / 10));
        const modemBytesPerMs = currentBytesPerSec / 1000;
        if (modemBytesPerMs < bytesPerMs) {
          bytesPerMs = modemBytesPerMs;
        }
      }

      // Pad with a final newline so the last rendered line scrolls offscreen for a cleaner edge
      const streamText = text + '\r\n';
      const buffer = Buffer.from(
        (shouldClear ? '\x1b[2J\x1b[H' : '') + HIDE_CURSOR + '\x1b[H' + streamText + '\x1b[0m' + SHOW_CURSOR,
        'utf-8'
      );
      let offset = 0;
      let carry = 0;
      let last = Date.now();
      const maxPerFrame = 128; // cap burst size to avoid chunky frames

      const step = async (): Promise<void> => {
        const now = Date.now();
        const dt = Math.max(1, now - last);
        last = now;
        let budget = bytesPerMs * dt + carry;
        let toSend = Math.floor(budget);
        if (toSend < 1) toSend = 1;
        carry = budget - toSend;
        if (toSend > maxPerFrame) {
          carry += toSend - maxPerFrame;
          toSend = maxPerFrame;
        }
        if (offset + toSend > buffer.length) {
          toSend = buffer.length - offset;
          carry = 0;
        }
        const chunk = buffer.slice(offset, offset + toSend).toString('utf-8');
        socket.emit(eventName, chunk);
        offset += toSend;
        if (offset < buffer.length) {
          await new Promise(resolve => setTimeout(resolve, 16)); // ~60fps pacing
          return step();
        }
      };

      await step();
      session.slowmoCount = 0;
    };

    // Bulletin/logon flow screens should render as a single frame like express.e.
    // Skip auto-pagination for flow screens; rely on explicit ~SP/pauses instead.
    const allowPagination = !isFlowScreen && slowmoSpeed === 0;

    // Skip slowmo if wipe animation is active - wipes handle their own timing
    if (slowmoSpeed !== 0 && !hasWipeAnimation) {
      await emitSlowmoFrame(parsed);

      if (session.lastScreenHadPause) {
        session.paginatedScreen = {
          lines: [''], // no additional content, just hold for a key
          nextIndex: 1,
          pageSize: 1,
          eventName,
          commands,
          kind: 'bbs',
        };
        if (commands.length > 0) {
          session.queuedScreenCommands = commands;
          screenFlowLog(screenName, `Queued ${commands.length} command(s) to run after pause`);
        }
        emitPrompt(socket, '\r\n(Pause)...Space To Resume: ');
        restoreModemState(socket, session);
        return true;
      }

      executeScreenCommands();
      session.slowmo = 0;
      session.slowmoCount = 0;
      restoreModemState(socket, session);
      return true;
    }

  // Skip pagination if wipe animation is active - wipes handle their own display
  if (allowPagination && !session.lastScreenHadPause && lines.length > pageHeight && !hasWipeAnimation) {
    session.paginatedScreen = {
      lines,
      nextIndex: pageSize,
      pageSize,
      eventName,
      commands,
      kind: 'bbs',
    };
    if (commands.length > 0) {
      session.queuedScreenCommands = commands;
    }
    await emitPage(0, pageSize, true);
    session.lastScreenHadPause = true;
    restoreModemState(socket, session);
    return true;
  }

    // Screen Wipe Animation Playback
    // If a wipe animation is detected, generate and send frames instead of direct output
console.log(`[WIPE-CHECK] hasWipeAnimation=${hasWipeAnimation}, wipeType=${wipeType}, screenName=${screenName}`);
    if (hasWipeAnimation && wipeType) {
console.log(`[WIPE] Starting wipe animation: ${wipeType}`);
      screenDebug(`[displayScreen] Playing wipe animation: ${wipeType}`);

      // Generate animation frames
      const wipeFrames = getWipeFrames(wipeType, parsed);
console.log(`[WIPE] Generated ${wipeFrames.length} frames`);

      // Get direct socket emit (bypasses modem emulator wrapper if installed)
      // This ensures wipe animation controls its own timing without modem interference
      const directSocketEmit = (socket as any)._directEmit || socket.emit.bind(socket);

      // Play each frame with timing
      // IMPORTANT: We emit directly to socket (bypass modem emulator) and use
      // setImmediate to yield to event loop, allowing socket buffer to flush
      for (let i = 0; i < wipeFrames.length; i++) {
        const frame = wipeFrames[i];
        const isLastFrame = i === wipeFrames.length - 1;

        // Build frame buffer with cursor control
        const frameContent =
          HIDE_CURSOR +      // Hide cursor during animation
          frame.content +    // Wipe frame content (includes clear/positioning)
          (isLastFrame ? '\x1b[0m' + SHOW_CURSOR : ''); // Reset and show cursor on last frame

        // Emit frame directly (bypass modem emulator)
        directSocketEmit(eventName, frameContent);

        // Yield to event loop to flush socket buffer before waiting
        await new Promise(resolve => setImmediate(resolve));

        // Delay before next frame (minimum 50ms for visibility)
        if (!isLastFrame) {
          const delayMs = Math.max(50, frame.delay);
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

console.log(`[WIPE] Animation complete: ${wipeFrames.length} frames`);
      screenDebug(`[displayScreen] Wipe animation complete: ${wipeFrames.length} frames`);
    } else if (!inlineEmitted) {
      // Normal display: Double-buffered display
      // Build complete frame buffer before sending
      // This prevents tearing and visible redraws by sending everything atomically
      // express.e:6845 - Always reset colors after displaying a file with aePuts('[0m')

      // Skip display entirely if content is empty (e.g., empty BBSTITLE.TXT)
      // This prevents cursor-to-HOME from disrupting prior display (like FRONTEND)
      // express.e behavior: empty screen files display nothing, cursor stays where it was
      const trimmedContent = parsed.replace(/[\x1b\x9b]\[[0-9;]*[A-Za-z]/g, '').trim();
      if (trimmedContent.length === 0 && !shouldClear) {
        screenDebug(`[displayScreen] Empty content for ${screenName}, skipping display`);
        // Just reset colors to prevent bleed, don't move cursor
        socket.emit(eventName, '\x1b[0m');
      } else {
        const frameBuffer =
          (shouldClear ? '\x1b[2J\x1b[H' : '') + // Clear screen + home cursor when required
          HIDE_CURSOR +      // Hide cursor
          '\x1b[H' +         // Move cursor to home (1,1)
          parsed +           // Screen content
          '\x1b[0m' +        // Reset colors (express.e:6845) - prevents color bleed to prompts
          SHOW_CURSOR;       // Show cursor

        // Send entire frame in one atomic operation
        // Use 'petscii-output' event for PETSCII content (triggers PetMe64 font)
        screenDebug(`[displayScreen] Emitting ${eventName} event`);
        await emitWithModem(frameBuffer);
      }
    } else {
      // Content was already emitted inline by parseMciCodes (express.e inline mode)
      // Just emit color reset to prevent bleed, don't overwrite with frame buffer
      screenDebug(`[displayScreen] Content already emitted inline, skipping frame buffer`);
      socket.emit(eventName, '\x1b[0m');
    }

    // If screen requested a pause (e.g., ~SP), set a minimal pagination state
    // so a keypress is required before continuing, without printing the raw MCI
    if (session.lastScreenHadPause) {
      session.paginatedScreen = {
        lines: [''], // no additional content, just hold for a key
        nextIndex: 1,
        pageSize: 1,
        eventName,
        commands,
        kind: 'bbs',
      };
      // Queue commands for execution after pause is dismissed
      if (commands.length > 0) {
        session.queuedScreenCommands = commands;
        screenFlowLog(screenName, `Queued ${commands.length} command(s) to run after pause`);
      }
      emitPrompt(socket, '\r\n(Pause)...Space To Resume: ');
      await emitWithModem(''); // ensure promise chain consistent
      return true;
    }

    executeScreenCommands();
    session.slowmo = 0;
    session.slowmoCount = 0;

    return true;
  } else {
    // Screen not found - return false silently (matches express.e behavior)
    // Caller decides whether to show error or skip
    if (!silent) {
console.error(`[displayScreen] ========================================`);
console.error(`[displayScreen]  SCREEN FILE NOT FOUND: ${screenName}`);
console.error(`[displayScreen] Conference ID: ${session.currentConf || 'none'}`);
console.error(`[displayScreen] (Detailed path attempts logged by loadScreenFile above)`);
console.error(`[displayScreen] ========================================`);
      SysopDebugUtil.debug(
        socket,
        session,
        'SCREEN',
        `Screen file not found: ${screenName}`,
        { conferenceId: session.currentConf || 'none' },
        DebugSeverity.CRITICAL
      );
      notifySysop(session, `Screen not found: ${screenName}`);
    }
    session.lastScreenFilePath = undefined;
    return false;
  }
}

/**
 * Execute any queued screen commands (used when displayScreen was called with runCommands=false)
 */
export async function runQueuedScreenCommands(socket: any, session: BBSSession): Promise<void> {
  const commands = session.queuedScreenCommands || [];
  if (commands.length === 0) {
    return;
  }

  const commandsHash = commands.join('|');
  if (commandsHash && session.lastScreenCommandsHash === commandsHash) {
    session.queuedScreenCommands = [];
    return;
  }
  session.lastScreenCommandsHash = commandsHash;

  const { handleCommand } = require('./command-handler/core');
  session.pendingScreenCommand = new Promise<void>(resolve => {
    session.screenCommandResolver = resolve;
  });
  session.executingScreenCommand = true;

  try {
    for (let i = 0; i < commands.length; i++) {
      const commandStr = commands[i];
      screenDebug(`[displayScreen] ------------------------------------------`);
      screenDebug(`[displayScreen] EXECUTING QUEUED COMMAND ${i + 1}/${commands.length}:`, commandStr);
      try {
        await handleCommand(socket, session, commandStr);
      } catch (error) {
console.error(`[displayScreen]  ERROR executing queued command ${commandStr}:`, error);
        SysopDebugUtil.debug(
          socket,
          session,
          'SCREEN',
          `Error executing queued command: ${commandStr}`,
          { error: (error as Error).message },
          DebugSeverity.CRITICAL
        );
      }
    }
  } finally {
    session.queuedScreenCommands = [];
    session.executingScreenCommand = false;
    if (session.screenCommandResolver) {
      session.screenCommandResolver();
      session.screenCommandResolver = null;
      session.pendingScreenCommand = undefined;
    }
  }
}

/**
 * Start pagination for arbitrary lines (non-screen MCI output).
 */
/**
 * Restore modem state after animation playback
 * Called when screen display completes, pagination ends, or segment processing finishes
 * CRITICAL: Waits for modem queue to drain before disabling, preserving animation timing
 */
function restoreModemState(socket: any, session: BBSSession): void {
  if (session.savedModemState) {
    const { getModemEmulator } = require('../utils/modem-emulator.util');
    const modemEmulator = getModemEmulator(socket);
    const savedState = session.savedModemState;

    // Clear saved state immediately to prevent double-restore
    session.savedModemState = undefined;

    // If modem has pending data, wait for it to drain before restoring state
    // This preserves animation timing - don't immediately flush the queue
    if (modemEmulator.hasPendingData()) {
      console.log(`[ANSI-ANIM] Waiting for modem queue to drain before restoring state...`);
      modemEmulator.drain().then(() => {
        doRestore(modemEmulator, savedState);
      });
    } else {
      doRestore(modemEmulator, savedState);
    }

    function doRestore(emulator: any, state: any) {
      if (state.enabled && state.bps > 0) {
        emulator.enable(state.bps);
        session.modemEmulationEnabled = true;
        session.modemBps = state.bps;
        console.log(`[ANSI-ANIM] Restored modem emulation to ${state.bps} bps`);
      } else {
        emulator.disable();
        session.modemEmulationEnabled = false;
        session.modemBps = 0;
        console.log(`[ANSI-ANIM] Restored modem emulation to disabled (full speed)`);
      }

      // Restore AnsiBuffer flush delay
      const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
      const ansiBuffer = getAnsiBuffer(socket);
      ansiBuffer.setFlushDelay(state.enabled ? 0 : 16);
    }
  }
}

export function startPagination(
  socket: any,
  session: BBSSession,
  lines: string[],
  eventName: 'ansi-output' | 'petscii-output' = 'ansi-output',
  commands?: string[],
  onComplete?: () => void
): void {
  const pageHeight = session?.screenHeight || 25;
  const pageSize = Math.max(1, pageHeight - 1);
  session.paginatedScreen = {
    lines,
    nextIndex: pageSize,
    pageSize,
    eventName,
    commands,
    onComplete,
    kind: 'bbs',
  };
  const chunk = lines.slice(0, pageSize).join('\r\n');
  socket.emit(eventName, chunk + '\r\n(Pause)...More(y/n/ns)?');
  session.lastScreenHadPause = true;
}

/**
 * Handle paginated screen input (More(y/n/ns)?)
 * Returns true if handled, false otherwise.
 */
export async function handlePaginatedScreenInput(socket: any, session: BBSSession, data: string): Promise<boolean> {
  const paged = session.paginatedScreen;
  if (!paged) {
console.log(`[handlePaginatedScreenInput] No paginatedScreen set, returning false`);
    return false;
  }

console.log(`[handlePaginatedScreenInput] ENTRY: data="${data}" lines=${paged.lines.length} nextIndex=${paged.nextIndex} pageSize=${paged.pageSize}`);
  const key = (data || '').trim().toUpperCase();
  const yes = key === '' || key === 'Y' || key === '\r' || key === '\n';
  const no = key === 'N';
  const noStop = key === 'NS';

  const lines = paged.lines;
  const emitPage = (startIdx: number, endIdx: number, prompt: boolean) => {
    const chunk = lines.slice(startIdx, endIdx).join('\r\n');
    const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)? ' : '';
    socket.emit(paged.eventName, chunk + promptLine);
  };

  // NS: dump the rest without further prompts
  if (noStop) {
    emitPage(paged.nextIndex, lines.length, false);
    session.paginatedScreen = undefined;
    session.menuPause = false;
    if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {
      await runQueuedScreenCommands(socket, session);
    }
    if (paged.onComplete) paged.onComplete();
    // Process all remaining screen segments without pausing
    if (session.screenSegments && session.screenSegments.segments.length > 0) {
      const eventName = session.screenSegments.eventName;
      while (session.screenSegments.segments.length > 0) {
        const segment = session.screenSegments.segments.shift()!;
        const result = await parseMciCodes(segment, session, 'AmiExpress-Web', 'Sysop', 'The Internet', socket);
        // Only emit if inline mode didn't already emit everything
        if (!result.inlineEmitted) {
          let parsed = addAnsiEscapes(result.parsed);
          parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
          socket.emit(eventName, parsed);
        }
      }
      session.screenSegments = undefined;
    }
    return true;
  }

  // N: abort remaining pages, do not run queued commands
  if (no) {
    session.paginatedScreen = undefined;
    session.menuPause = false;
    session.queuedScreenCommands = [];
    session.pendingScreenCommand = undefined;
    session.screenCommandResolver = null;
    // Also clear screen segments on abort
    session.screenSegments = undefined;
    return true;
  }

  // Default: YES / ENTER
  const start = paged.nextIndex;
  const end = Math.min(start + paged.pageSize, lines.length);
  const hasMore = end < lines.length;

  emitPage(start, end, hasMore);
  paged.nextIndex = end;

  if (!hasMore) {
    session.paginatedScreen = undefined;
    session.menuPause = false;
    if (session.queuedScreenCommands && session.queuedScreenCommands.length > 0) {
      await runQueuedScreenCommands(socket, session);
    }
    if (paged.onComplete) paged.onComplete();

    // Check for remaining screen segments (~SP processing)
    // express.e:5455-5461 - ~SP pauses IMMEDIATELY at each occurrence
    if (session.screenSegments && session.screenSegments.segments.length > 0) {
      await processNextScreenSegment(socket, session);
      restoreModemState(socket, session);
      return true;
    }

    // Restore modem state before final return
    restoreModemState(socket, session);
  }

  return true;
}

/**
 * Process the next screen segment after a ~SP pause is dismissed
 * express.e:5455-5461 - ~SP pauses IMMEDIATELY, then continues processing
 */
export async function processNextScreenSegment(socket: any, session: BBSSession): Promise<boolean> {
  const segState = session.screenSegments;
  if (!segState || segState.segments.length === 0) {
    return false;
  }

  const segment = segState.segments.shift()!;  // Get and remove first segment
  const segmentNum = segState.currentIndex + 1;
  segState.currentIndex = segmentNum;

console.log(`[SEGMENT] Processing segment ${segmentNum}/${segState.segments.length + segmentNum}: "${segment.substring(0, 100)}..."`);
  screenDebug(`[processNextScreenSegment] Processing segment ${segmentNum}: ${segment.substring(0, 50)}...`);

  // Parse and execute this segment's MCI codes
  const result = await parseMciCodes(segment, session, 'AmiExpress-Web', 'Sysop', 'The Internet', socket);

  let parsed = result.parsed;
  if (result.slowmo !== undefined) session.slowmo = result.slowmo;
  if (result.slowmoCount !== undefined) session.slowmoCount = result.slowmoCount;

  // Only emit if inline mode didn't already emit everything
  if (!result.inlineEmitted) {
    // Add ANSI escapes if needed
    parsed = addAnsiEscapes(parsed);

    // Normalize line endings
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // Emit this segment's content
    socket.emit(segState.eventName, parsed);
  } else {
    // Just emit color reset to prevent bleed
    socket.emit(segState.eventName, '\x1b[0m');
    screenDebug(`[processNextScreenSegment] Content already emitted inline`);
  }

  // If there are more segments, set up another pause
  if (segState.segments.length > 0) {
    session.paginatedScreen = {
      lines: [''],  // No additional content, just hold for a key
      nextIndex: 1,
      pageSize: 1,
      eventName: segState.eventName,
      commands: [],
      kind: 'bbs',
    };
    session.lastScreenHadPause = true;
    emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
    return true;
  }

  // All segments processed, clean up
  session.screenSegments = undefined;
  session.lastScreenHadPause = false;

  screenDebug(`[processNextScreenSegment] All segments processed for ${segState.screenName}`);
  return true;
}

/**
 * Check if a .keys file exists for the given screen
 * Like express.e:6567-6573 - checks for screenfile + '.keys'
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns true if .keys file exists, false otherwise
 */
export function hasKeysFile(screenName: string, conferenceId?: number, nodeId: number = 0): boolean {
  const { config } = require('../config');
  const baseDir = config.getConfig().dataDir;
  const paths = [];

  // Try conference-specific .keys file first (if provided)
  if (conferenceId) {
    const confIndex = conferences.findIndex(c => c.id === conferenceId);
    if (confIndex !== -1) {
      const relConfNum = confIndex + 1; // Convert to 1-based
      const candidateDirs = getConferenceScreensCandidates(baseDir, relConfNum);
      for (const candidate of candidateDirs) {
        const confPath = path.join(candidate.dir, `${screenName}.keys`);
        paths.push(confPath);
      }
    }
  }

  // Then try node-specific .keys file
  const nodePath = path.join(baseDir, `Node${nodeId}`, 'Screens', `${screenName}.keys`);
  paths.push(nodePath);

  // Then try default BBS .keys file
  const bbsPath = path.join(baseDir, 'Screens', `${screenName}.keys`);
  paths.push(bbsPath);

  // Check each path in order (use amigafs for case-insensitive matching)
  for (const filePath of paths) {
    if (amigafs.existsSync(filePath)) {
      screenDebug(` Found .keys file: ${filePath}`);
      return true;
    }
  }

  screenDebug(`No .keys file found for screen: ${screenName}`);
  return false;
}

/**
 * Check for .keys alongside the resolved screen file path (security-aware)
 * Mirrors express.e: after findSecurityScreen/displayFile, append ".keys" to that path.
 */
export function hasKeysFileForResolvedPath(resolvedPath: string): boolean {
  if (!resolvedPath) return false;
  const dir = path.dirname(resolvedPath);
  const base = path.basename(resolvedPath);
  const candidate = `${base}.keys`;
  const found = findCaseInsensitive(dir, candidate);
  if (found) {
    screenDebug(` Found .keys file for resolved path: ${found}`);
    return true;
  }
  screenDebug(`No .keys file found for resolved path: ${resolvedPath}`);
  return false;
}

/**
 * Display "Press any key..." pause prompt
 * Like express.e doPause() - express.e:28566, 28571
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session (for future enhancements)
 */
export function doPause(socket: any, session: BBSSession, onComplete?: () => void): void {
console.log(`[doPause] CALLED - setting up paginatedScreen (subState=${session.subState})`);
  fs.appendFileSync('/tmp/bbs-debug.log', `[${new Date().toISOString()}] doPause: CALLED, subState=${session.subState}\n`);
  // Express.e:5143-5144 - "\b\n(Pause)...Space To Resume:"
  // CRITICAL: Must flush immediately before waiting for keypress (express.e behavior)
  // NOTE: Use \r\n for web terminal (xterm.js) compatibility.
  // express.e uses \b\n but on xterm.js \n alone doesn't return to column 0.
  // After ANSI art that positions cursor anywhere, \r ensures we start at column 0.
  emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');

  // Install a minimal pagination gate so the next keypress is required before
  // the display flow continues (matches express.e pause semantics).
  // '\r\x1b[K' = CR + erase-to-EOL: visually clears the pause prompt when Space is pressed.
  session.paginatedScreen = {
    lines: ['\r\x1b[K'],
    nextIndex: 0,
    pageSize: 1,
    eventName: 'ansi-output',
    commands: [],
    onComplete,
    kind: 'bbs',
  };
  session.lastScreenHadPause = true;
}
// Web extension: negative ~SMO speeds (-1..-3) run slower than AmiExpress SMO1 while preserving positive speeds 1-5 semantics.
