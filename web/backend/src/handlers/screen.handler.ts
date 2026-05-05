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
import {
  readAmigaTextFile,
  readAmigaTextFileWithTransforms,
  stripSauceMetadata,
  type AmigaTextResult,
} from '../utils/amiga-text-decode.util';
import { db } from '../database';
import { flaggedFilesManager } from '../services/FlaggedFilesManager';
import { sequentialFileManager, formatNumberedFilename } from '../services/SequentialFileManager';
import { ANSI } from '../utils/terminal-utils';
const HIDE_CURSOR = ANSI.HIDE_CURSOR;
const SHOW_CURSOR = ANSI.SHOW_CURSOR;
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
import { processMci as processMciTokenizer, type MciDispatchMap, type MciPrefixDispatchMap, applyMciWidth } from '../utils/mci-tokenizer.util';

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
  // express.e:6639-6641 — SCREEN_LOGON24 looks up 'Logon24hrs', not 'LOGON24'.
  // Sysops with original reference-board files use that name.
  if (upper === 'LOGON24') return 'Logon24hrs';
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
 * SAUCE metadata + encoding-aware decode + iCE colors transform live in
 * `utils/amiga-text-decode.util.ts` so bulletins/screens/help files share one
 * pipeline. The wrappers below preserve the original screen.handler call
 * sites; do not duplicate the decode logic here.
 */

function readScreenBuffer(filePath: string): Buffer {
  // Raw bytes (SAUCE stripped) — used by the PETSCII path. The cache hit
  // remains hot for subsequent decoded reads via readAmigaTextFile().
  return stripSauceMetadata(fileCache.readBuffer(filePath));
}

function readScreenTextWithMetadata(filePath: string): AmigaTextResult {
  return readAmigaTextFile(filePath);
}

function readScreenText(filePath: string): string {
  return readAmigaTextFile(filePath).text;
}

function readScreenWithTransforms(filePath: string): AmigaTextResult {
  return readAmigaTextFileWithTransforms(filePath);
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
  'BBSTITLE',
  'LOGON',
  'BULL',
  'NODE_BULL',
  'CONF_BULL',
  'MENU',
  'LOGOFF',
  'JOIN',
  'JOINED',
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

// ============================================================
// Inline-mode sentinels — NUL-delimited markers emitted by the MCI
// tokenizer dispatch when running for a live socket. The post-
// tokenizer walker splits on them, emits the surrounding text, and
// applies side effects (CLS, pause, command exec, file display) in
// document order. NUL bytes never appear in real BBS content
// (textual ASCII / ANSI sequences, no null terminators), so they're
// a safe in-band marker that survives across pendingInlineContent
// resume boundaries (the resumed content is run through the
// tokenizer again — sentinels look like plain text since they
// contain no `~`).
//
// Format: `\x00<TYPE>[:<args>]\x00`. Args grammar per type:
//   F        — clear screen, no args
//   SP       — pause, no args
//   CC:cmd   — run command (cmd may contain spaces)
//   SS:file  — displayScreen(file)
//   SR:max|path — random numbered file from path, max=count or -1
// ============================================================
const SENTINEL_F = '\x00F\x00';
const SENTINEL_SP = '\x00SP\x00';
const SENTINEL_CC = '\x00CC:';
const SENTINEL_SS = '\x00SS:';
const SENTINEL_SR = '\x00SR:';
const SENTINEL_END = '\x00';
// Sentinel scanning uses indexOf (NOT a /g regex) because the walker
// awaits async side effects that can recursively re-enter
// parseMciCodes (e.g. SS sentinel → displayScreen → inner
// parseMciCodes). A module-level /g regex would have its lastIndex
// clobbered by the inner call, causing the outer walker to restart
// from the top and re-process the same sentinel forever.

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
  // Files to display (~SS_, ~SX_, ~SR_) collected during the pre-
  // tokenizer pass and substituted later. Inline mode handles these
  // via sentinel dispatch + walker; non-inline emits
  // `{{DISPLAY_FILE:N}}` placeholders that get replaced after MCI
  // parsing completes.
  const filesToDisplay: string[] = [];

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

  // Format a number with commas (express.e formatBCD / formatUnsignedLong style)
  const formatWithCommas = (n: number): string =>
    n.toLocaleString('en-US');

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
      // express.e:5615: \r\z\d[3] = right-justified zero-padded 3-digit number
      confDir += `   \x1b[34m[\x1b[0m${String(num).padStart(3, '0')}\x1b[34m] \x1b[0m${confName}`;
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

  // User Information + System Info Codes (express.e:5290-5410)
  // Routed through the 1:1 processMci tokenizer port. The previous
  // regex pipeline required an explicit `|` terminator (`~N|`); real
  // express.e accepts space OR `|` OR end-of-line as the terminator,
  // so screens like Logon24hrs.txt's `~N.` produced wrong output.
  // The tokenizer also handles fall-through behaviour: unknown codes
  // leave the suffix as plain text instead of preserving the `~`.

  const lcRaw = user.lastLogin || user.timeLastOn;
  const lcDate: Date | null = lcRaw instanceof Date ? lcRaw : (lcRaw ? new Date(lcRaw) : null);

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

  let msgBaseName = 'Default';
  const currentMsgBase = session.currentMsgBase || 1;
  try {
    const messageBases = await db.getMessageBases(session.currentConf);
    if (messageBases.length > 0 && currentMsgBase <= messageBases.length) {
      msgBaseName = messageBases[currentMsgBase - 1]?.name || 'Default';
    }
  } catch (error) {
console.error('[parseMciCodes] Error getting message base name:', error);
    SysopDebugUtil.debug(null, session, 'MCI', 'Error parsing ~MN| (message base name)',
      { error: (error as Error).message }, DebugSeverity.WARNING);
  }

  const { systemStats } = await import('../services/SystemStatsService');
  const todayCalls = systemStats.getTodayCalls();
  const nodeNumStr = (session.nodeId || 1).toString();

  // Flagged files (express.e:5439-5454) — pre-compute so the dispatch
  // map closes over the rendered values rather than calling the manager
  // on every code lookup.
  const userId = session.user?.id || 0;
  const sessionFlaggedFiles = flaggedFilesManager.getFiles(userId);
  const flaggedFilesSpaceSep = sessionFlaggedFiles.map(f => f.fileName).join(' ');
  let flaggedFilesList = '';
  for (const file of sessionFlaggedFiles) {
    flaggedFilesList += `                     ${file.fileName}\b\r\n`;
  }

  // AK - Access Keys display (express.e:5428-5430 + 29863-29871)
  const accessKeysDisplay = [
    '         \x1b[44;33m F1 \x1b[40;35m  }- \x1b[33mSysop Login             \x1b[44;33m F2 \x1b[40;35m  }- \x1b[33mLocal Login',
    '         \x1b[44;33m F3 \x1b[40;35m  }- \x1b[33mInstant Remote Logon    \x1b[44;33m F4 \x1b[40;35m  }- \x1b[33mReserve for a user',
    '         \x1b[44;33m F5 \x1b[40;35m  }- \x1b[33mConference Maintenance  \x1b[44;33m F6 \x1b[40;35m  }- \x1b[33mAccount Editing',
    '       \x1b[44;33m SH+F5 \x1b[40;35m }- \x1b[33mOpen Shell            \x1b[44;33m SH+F6 \x1b[40;35m }- \x1b[33mView Callerslog',
    '         \x1b[44;33m F7 \x1b[40;35m  }- \x1b[33mChat Toggle             \x1b[44;33m F8 \x1b[40;35m  }- \x1b[33mReprogram modem',
    '         \x1b[44;33m F9 \x1b[40;35m  }- \x1b[33mExit BBS               \x1b[44;33m F10 \x1b[40;35m  }- \x1b[33mExit BBS \x1b[33m(\x1b[37moff hook\x1b[33m)\x1b[0m',
    '                                       \x1b[44;33m SH+F10 \x1b[40;35m }- \x1b[33mClear tooltype cache\x1b[0m'
  ].join('\r\n');

  const userInfoDispatch: MciDispatchMap = {
    // User core (express.e:5292-5306)
    N:  (w) => applyMciWidth(username, w),
    P:  ()  => '',                                     // password — never substitute
    UL: (w) => applyMciWidth(user.location || '', w),
    '#':(w) => applyMciWidth(user.phoneNumber || '', w),
    // Counts + history (express.e:5307-5330)
    TC: (w) => applyMciWidth(timesCalled.toString(), w),
    TT: (w) => applyMciWidth((user.callsToday || 0).toString(), w),
    LC: (w) => applyMciWidth(lcDate ? formatLongDateTime(lcDate) : 'Never', w),
    M:  (w) => applyMciWidth(messagesPosted.toString(), w),
    A:  (w) => applyMciWidth(secLevel.toString(), w),
    S:  (w) => applyMciWidth(user.id?.toString() || '0', w),
    CA: (w) => applyMciWidth(user.confAccess || 'XXX', w),
    BR: (w) => applyMciWidth('57600', w),
    HW: (w) => applyMciWidth('Web Browser', w),
    // Time (express.e:5343-5350)
    TL: (w) => applyMciWidth(Math.floor((user.dailyTimeLimit || 120) / 60).toString(), w),
    TR: (w) => applyMciWidth(Math.floor(session.timeRemaining / 60).toString(), w),
    // Bytes / files (express.e:5351-5378)
    UB: (w) => applyMciWidth(formatWithCommas(uploadBytes), w),
    DB: (w) => applyMciWidth(formatWithCommas(downloadBytes), w),
    SU: (w) => applyMciWidth(calcSizeText(uploadBytes), w),
    SD: (w) => applyMciWidth(calcSizeText(downloadBytes), w),
    FU: (w) => applyMciWidth(uploads.toString(), w),
    FD: (w) => applyMciWidth(downloads.toString(), w),
    BD: (w) => applyMciWidth((user.byteLimit || 0).toString(), w),
    // Node + identity (express.e:5379-5390)
    ON: (w) => applyMciWidth(nodeNumStr, w),
    LG: (w) => applyMciWidth(nodeNumStr, w),
    IN: (w) => applyMciWidth(user.email || '', w),
    RN: (w) => applyMciWidth(user.realName || username, w),
    // Conference info (express.e:5413-5427)
    CF: (w) => applyMciWidth(((session.currentConf || 0) + 1).toString(), w),
    CN: (w) => applyMciWidth(session.currentConfName || 'Main', w),
    MB: (w) => applyMciWidth(currentMsgBase.toString(), w),
    MN: (w) => applyMciWidth(msgBaseName, w),
    // Logon / system clocks (express.e:5391-5402)
    CT: (w) => applyMciWidth(formatLongTime(logonDate), w),
    VD: (w) => applyMciWidth('2.00', w),
    VE: (w) => applyMciWidth('AmiExpress-Web 2.0', w),
    ND: (w) => applyMciWidth((session.nodeId || 1).toString(), w),
    DT: (w) => applyMciWidth(formatLongDate(now), w),
    OT: (w) => applyMciWidth(formatLongTime(logonDate), w),
    OD: (w) => applyMciWidth(formatLongDate(logonDate), w),
    SC: (w) => applyMciWidth(todayCalls.toString(), w),
    // Flagged files (express.e:5439-5454)
    FC: (w) => applyMciWidth(sessionFlaggedFiles.length.toString(), w),
    FF: (w) => applyMciWidth(flaggedFilesSpaceSep, w),
    FL: (w) => applyMciWidth(flaggedFilesList, w),
    // AK - Access Keys (express.e:5428-5430)
    AK: () => accessKeysDisplay,
    // ~CR - Keypress wait (express.e:5462-5468). Express.e does
    // readChar(INPUT_TIMEOUT); we can't perform an async read mid-
    // substitution, so we emit \r\n. WEB_ deviation; inline-mode with
    // a socket is the right place to implement a real keypress wait.
    CR: () => '\r\n',
    // ~NS - Non-Stop display flag. Side-effect: suppresses subsequent
    // pause prompts for this file render.
    NS: () => {
      if (session) {
        (session as any).nonStopText = true;
      }
      return '';
    },
    // ~SP - Pause (express.e:5455-5461). Express.e: `(maxLen=-1) AND
    // (StrCmp(cmd,'SP'))` — only matches when no width prefix; calls
    // doPause(). Both modes route through this dispatch entry now:
    //   - Non-inline: set hasPause flag, emit empty.
    //   - Inline: emit a SP sentinel; the post-tokenizer walker
    //     splits on it, emits text-before to the socket, then
    //     early-returns with pendingInlineContent so the pause
    //     state machine can resume the rest of the screen.
    SP: (w) => {
      if (w !== -1) return undefined; // express.e width-gate
      if (inlineMode) return SENTINEL_SP;
      hasPause = true;
      return '';
    },
    // ~f - Clear screen (express.e:5469-5471 sendCLS, lowercase).
    //   - Non-inline: emit ANSI CLS into the parsed buffer directly.
    //   - Inline: emit a CLS sentinel; the walker emits text-before
    //     first, then sends CLS to the socket so document order
    //     matches express.e.
    f: () => (inlineMode ? SENTINEL_F : '\x1b[2J\x1b[H'),
    // ~w - Delay (express.e:5472-5477, lowercase). On Amiga:
    // Delay(maxLen) ticks. No equivalent on the Node / WebSocket
    // path — emit empty. Both `~5w|` (width=5, cmd='w') and the
    // WEB-divergent `~w5|` form (cmd='w5', via prefix dispatch
    // below) collapse to no-op.
    w: () => '',
    // Foreground colors (express.e:5651-5674) — express.e StrCmp keys
    // are lowercase. With caseSensitive: true the tokenizer matches
    // the cmd byte-exact, so `~C0` (uppercase) no longer substitutes —
    // a sysop typo'd it on Amiga and got "C0" plain text.
    c0: () => '\x1b[30m', c1: () => '\x1b[31m', c2: () => '\x1b[32m',
    c3: () => '\x1b[33m', c4: () => '\x1b[34m', c5: () => '\x1b[35m',
    c6: () => '\x1b[36m', c7: () => '\x1b[37m',
    // Background colors (express.e:5675-5698, lowercase).
    b0: () => '\x1b[40m', b1: () => '\x1b[41m', b2: () => '\x1b[42m',
    b3: () => '\x1b[43m', b4: () => '\x1b[44m', b5: () => '\x1b[45m',
    b6: () => '\x1b[46m', b7: () => '\x1b[47m',
    // z0-z7 = b0-b7 alias (express.e:5675 same dispatch line —
    // `StrCmp(cmd,'b0') OR StrCmp(cmd,'z0')`).
    z0: () => '\x1b[40m', z1: () => '\x1b[41m', z2: () => '\x1b[42m',
    z3: () => '\x1b[43m', z4: () => '\x1b[44m', z5: () => '\x1b[45m',
    z6: () => '\x1b[46m', z7: () => '\x1b[47m',
    // Blank lines (express.e:5699-5725, lowercase) — ~n1..~n9 emit 1-9 \r\n
    n1: () => '\r\n',
    n2: () => '\r\n\r\n',
    n3: () => '\r\n\r\n\r\n',
    n4: () => '\r\n\r\n\r\n\r\n',
    n5: () => '\r\n\r\n\r\n\r\n\r\n',
    n6: () => '\r\n\r\n\r\n\r\n\r\n\r\n',
    n7: () => '\r\n\r\n\r\n\r\n\r\n\r\n\r\n',
    n8: () => '\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n',
    n9: () => '\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n',
    // Misc (express.e:5571-5576, lowercase)
    q: () => '\x1b[0m', // ~q - reset attributes
    h: () => '\x08',    // ~h - backspace
  };

  // Prefix dispatch — parameterised codes whose argument is part of
  // the cmd suffix rather than a width prefix. Mirrors express.e's
  // `StrCmp(cmd,'x',1)` family (express.e:5478-5495). Keys are
  // lowercase to match express.e StrCmp byte-exact.
  const prefixDispatch: MciPrefixDispatchMap = {
    // ~x<n>| - cursor to row 1, col n. Express.e:5478-5486 emits
    // `[;<n>H` (default row, explicit col). Note: previous Web build
    // emitted `[<n>G` (column-only move) — that was a divergence;
    // express.e moves to row 1 col n.
    x: (suffix) => {
      const n = parseInt(suffix, 10);
      return Number.isFinite(n) && n >= 0 ? `\x1b[;${n}H` : '';
    },
    // ~y<n>| - cursor to row n, col 1. Express.e:5487-5495 emits
    // `[<n>;H` (explicit row, default col).
    y: (suffix) => {
      const n = parseInt(suffix, 10);
      return Number.isFinite(n) && n >= 0 ? `\x1b[${n};H` : '';
    },
    // ~w<n>| - WEB-divergent form preserved (express.e only knows
    // `~<n>w|` width-prefix form; that one matches the exact 'w'
    // entry above with width=n). Both collapse to no-op since Amiga
    // tick delay has no Node equivalent.
    w: () => '',
  };

  // Inline-mode-only sentinel emitters. These convert the inline
  // side-effecting codes (~CC_, ~SS_, ~SR_) into NUL-delimited
  // sentinels in the output string. The post-tokenizer walker
  // splits on them and runs the side effect (process command,
  // displayScreen, random file) in document order — preserving
  // express.e's sequential semantics (express.e:5768-5802) without
  // a separate post-tokenizer regex pass.
  if (inlineMode) {
    // ~CC_<cmd> - run a BBS command synchronously (express.e:5555-5563).
    // Suffix is the trimmed command string (any trailing `|` already
    // consumed by the tokenizer's terminator handling).
    prefixDispatch['CC_'] = (suffix) => SENTINEL_CC + suffix.replace(/\|+$/, '') + SENTINEL_END;
    // ~SS_<filename> - displayScreen sub-file (express.e:5496-5504).
    prefixDispatch['SS_'] = (suffix) => SENTINEL_SS + suffix.replace(/\|+$/, '') + SENTINEL_END;
    // ~<n>SR_<basePath> - random numbered file (express.e:5533-5554).
    // Width prefix is the max-count; <basePath> is the suffix.
    prefixDispatch['SR_'] = (suffix, width) =>
      SENTINEL_SR + (Number.isFinite(width) && width > 0 ? width : -1) + '|' + suffix.replace(/\|+$/, '') + SENTINEL_END;
  }

  // ============================================================
  // Pre-tokenizer side-effecting MCI passes
  // ============================================================
  //
  // These codes either need their `~` intact (so strict fall-through
  // doesn't eat them), or have multi-word arguments that the
  // tokenizer's space-or-terminator boundary doesn't capture. They
  // run BEFORE the tokenizer so the strict-fall-through tokenizer
  // (non-inline mode) can safely consume any `~` it doesn't dispatch
  // — at this point every side-effecting form has already been
  // resolved.
  //
  // Inline mode runs the tokenizer in soft fall-through; the
  // sequential regex below picks up `~CC_`, `~SS_`, `~SR_`, `~SX_`,
  // `~f`, and `~SP` in document order with full pause-and-resume
  // semantics, so those forms must NOT be pre-substituted in inline
  // mode.

  if (!inlineMode) {
    // ~CR_<prompt>|| - prompted keypress (express.e:5571-5580).
    // Multi-word prompt; the tokenizer's space boundary would split
    // it, so handle here before the tokenizer.
    parsed = parsed.replace(/~CR_([^|]+)\|\|/g, (_match, promptText) => {
      hasPause = true;
      return promptText;
    });

    // ~SM_<menuname>|| - set current menu name (express.e:5575-5585).
    parsed = parsed.replace(/~SM_([^|]+)\|\|/g, (_match, menuName) => {
      session.currentMenuName = menuName.trim();
      screenDebug(`[MCI] ~SM_ set menu name to: ${session.currentMenuName}`);
      return '';
    });

    // ~CC_<cmd>| / ~CC_<cmd>|| — non-inline command queue
    // (express.e:5555-5563). Inline mode runs ~CC_ synchronously in
    // the sequential pass below.
    parsed = parsed.replace(/~CC_([^\s|~\r\n]+)(\|{1,2})?/g, (_full, commandStr) => {
      commandsToExecute.push(commandStr.trim());
      return '';
    });

    // ~SS_<file> / ~2S<file> — non-inline file-display queue
    // (express.e:5496-5504). Replaces with `{{DISPLAY_FILE:N}}`
    // placeholders that pass through the tokenizer untouched and
    // get substituted with the loaded file content later. Pre-
    // tokenizer because strict fall-through would otherwise consume
    // the leading `~`. (Inline mode handles ~SS_ via sentinel
    // dispatch instead.)
    parsed = parsed.replace(/~(?:SS_|2S)([^\s|~\r\n]+)(?:\|{1,2})?/g, (_match, ref) => {
      const filename = String(ref).trim();
      filesToDisplay.push(filename);
      return `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
    });

    // ~<n>SR_<basePath> — non-inline random numbered file
    // (express.e:5533-5554). Same pre-tokenizer placeholder pattern
    // as ~SS_. (Inline mode handles ~SR_ via sentinel dispatch.)
    parsed = parsed.replace(/~(\d*)SR_([^\s|~\r\n]+)(?:\|{1,2})?/g, (_full, maxCountRaw, refRaw) => {
      let basePath = String(refRaw).trim();
      if (basePath.includes(':')) {
        const { config: cfgMod } = require('../config');
        const baseDir = cfgMod.getConfig().dataDir;
        const bbsPaths = new BBSPaths(baseDir);
        basePath = bbsPaths.resolveAmigaPath(basePath, session?.nodeId || 0);
      }
      const maxCount = Math.max(1, maxCountRaw ? parseInt(maxCountRaw, 10) : 99);
      const randomNum = Math.floor(Math.random() * maxCount) + 1;
      const randomFile = formatNumberedFilename(basePath, randomNum);
      filesToDisplay.push(randomFile);
      return `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
    });
  }

  // ~SX_<basePath>|| — sequential numbered file (express.e:5505-
  // 5530). Runs in BOTH modes (inline mode lets it through to the
  // walker, since the post-tokenizer pass is gone but the walker
  // doesn't know about SX_; we treat SX_ as a non-inline-style
  // placeholder substitution that runs in document order via the
  // loaded file content). Pre-tokenizer for the same reason as
  // ~SS_/~SR_ above.
  {
    const sxRegex = /~SX_([^|]+)\|\|/g;
    let sxMatch;
    while ((sxMatch = sxRegex.exec(parsed)) !== null) {
      let basePath = String(sxMatch[1]).trim();
      if (basePath.includes(':')) {
        const { config: cfgMod } = require('../config');
        const baseDir = cfgMod.getConfig().dataDir;
        const bbsPaths = new BBSPaths(baseDir);
        basePath = bbsPaths.resolveAmigaPath(basePath, session?.nodeId || 0);
      }
      const nextFile = sequentialFileManager.getNextFile(basePath);
      let foundFile = false;
      if (loadScreenFile(nextFile.filename, session.currentConf, 0, session)) {
        filesToDisplay.push(nextFile.filename);
        foundFile = true;
      } else {
        sequentialFileManager.resetCounter(basePath);
        const firstFile = sequentialFileManager.getNextFile(basePath);
        if (loadScreenFile(firstFile.filename, session.currentConf, 0, session)) {
          filesToDisplay.push(firstFile.filename);
          foundFile = true;
        }
      }
      const replacement = foundFile ? `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}` : '';
      parsed = parsed.replace(sxMatch[0], replacement);
      // Reset regex lastIndex since we mutated parsed
      sxRegex.lastIndex = 0;
    }
  }

  // ~SMO<n>| - slow mode on (express.e:5726-5736). Width prefix
  // semantics differ from the tokenizer's <digits>before-cmd model
  // (negative numbers, optional width), so handle as a regex.
  parsed = parsed.replace(/~SMO(-?\d*)\|/gi, (_m, digits) => {
    slowmoCount += 60;
    let speed = parseInt(digits, 10);
    if (!speed || Number.isNaN(speed)) speed = 1;
    if (speed > 5) speed = 1;
    if (speed === 0) speed = 1;
    if (speed < -3) speed = -3;
    slowmo = speed;
    slowmoApplied = slowmo;
    slowmoAppliedCount = slowmoCount;
    return '';
  });

  // ~SMC| - slow mode clear (express.e:5737-5739).
  parsed = parsed.replace(/~SMC\|/gi, () => {
    slowmo = 0;
    slowmoCount = 0;
    slowmoApplied = 0;
    slowmoAppliedCount = 0;
    return '';
  });

  // ~SP. - period-suffix pause variant. Tokenizer would parse cmd
  // as "SP." (period not a boundary); easier to handle as a regex.
  // Inline mode emits a SP sentinel so the walker triggers the same
  // pause-and-resume semantics as `~SP|` / `~SP\n`; non-inline sets
  // hasPause directly.
  parsed = parsed.replace(/~SP\./g, () => {
    if (inlineMode) return SENTINEL_SP;
    hasPause = true;
    return '';
  });

  // Note: `~SP\n` / `~SP\r` (bare-newline pause variant) used to be
  // pre-processed here, but the tokenizer's whitespace boundary now
  // treats \r and \n as cmd terminators (matches the leniency of
  // the previous inline-regex pipeline), so `~SP` followed by a
  // newline parses as cmd="SP" and is handled by the SP entry in
  // userInfoDispatch — sentinel for inline mode, hasPause flag for
  // non-inline.

  // ~CR. - silent character read (express.e:5462-5468). Web has no
  // mid-render keypress wait; the period suffix dodges the tokenizer
  // boundary so a regex is the simplest match.
  parsed = parsed.replace(/~CR\./g, () => '');

  // ~NSF - non-stop flag (sets nonStopText to suppress further pauses).
  parsed = parsed.replace(/~NSF/g, () => {
    if (session) {
      (session as any).nonStopText = true;
    }
    return '';
  });

  // Standalone ~ on a line — WEB extension for clear screen
  // (express.e has no equivalent). Pre-tokenizer so the strict
  // fall-through doesn't eat the lone `~`.
  parsed = parsed.replace(/^~\s*$/gm, '\x1b[2J\x1b[H');
  parsed = parsed.replace(/^~$/gm, '\x1b[2J\x1b[H');

  // Strict fall-through, byte-exact case (both modes). express.e:
  // 5290-5402 ELSEIF chain has no final ELSE — unmatched cmds have
  // their `~` consumed and the cmd content emits as plain text.
  // Inline-mode side-effecting codes (~CC_/~SS_/~SR_/~SP/~f) ride
  // through the dispatch as NUL-delimited sentinels (see
  // SENTINEL_* constants above) rather than staying intact for a
  // separate regex pass.
  parsed = processMciTokenizer(
    parsed,
    {
      dispatch: userInfoDispatch,
      prefixDispatch,
      softFallThrough: false,
      caseSensitive: true,
    },
    mciTerminator,
  );

  // ~q (reset, express.e:5571-5573) and ~h (backspace, express.e:5574-5576)
  // are dispatched via the tokenizer above (Q / H entries in
  // userInfoDispatch).

  // === INLINE MODE: SENTINEL WALKER ===
  // express.e:5768-5802 processMci() iterates through content
  // sequentially, emitting text-before each MCI code, then running
  // the side effect, then continuing. We achieve the same flow
  // post-tokenizer: the inline-only dispatch entries above replaced
  // each side-effecting code with a NUL-delimited sentinel, so we
  // walk `parsed` splitting on those, emitting the surrounding text
  // chunks via emitText (in document order), and applying side
  // effects (CLS/pause/cmd/displayFile/random file) as they appear.
  //
  // ~SP triggers an early-return with `pendingInlineContent`
  // populated: the rest of the post-tokenizer string (sentinels and
  // all). When the pagination state machine resumes, displayScreen
  // calls back into parseMciCodes with that content. The tokenizer
  // pass is idempotent for already-substituted text — no `~` left
  // for it to consume — and the sentinels look like plain bytes to
  // the tokenizer (no `~`), so they ride through to the next walk
  // intact.
  if (inlineMode) {
    const { processCommand } = require('./command.handler');

    const emitChunk = (chunk: string): boolean => {
      if (chunk.length === 0) return false;
      let toEmit = addAnsiEscapes(chunk);
      toEmit = toEmit.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
      emitText(socket, toEmit);
      return true;
    };

    // indexOf-based scanner (see SENTINEL_REGEX_SOURCE comment above —
    // a stateful /g regex would be clobbered by recursive
    // parseMciCodes calls from inside the SS_/SR_ handlers).
    let lastIndex = 0;
    while (true) {
      const startNul = parsed.indexOf('\x00', lastIndex);
      if (startNul < 0) break;
      const endNul = parsed.indexOf('\x00', startNul + 1);
      if (endNul < 0) break;
      const sentinel = parsed.substring(startNul + 1, endNul);

      // express.e:5793-5794 — emit text BEFORE the side effect.
      if (emitChunk(parsed.substring(lastIndex, startNul))) {
        inlineEmitted = true;
      }
      lastIndex = endNul + 1;

      if (sentinel === 'F') {
        // express.e:5469-5471 — sendCLS()
        emitText(socket, '\x1b[2J\x1b[H');
        inlineEmitted = true;
        screenDebug('[MCI] Sentinel: ~f sendCLS()');
        continue;
      }

      if (sentinel === 'SP') {
        // express.e:5455-5461 — doPause(). Stop here, return the
        // unprocessed remainder so the pause state machine can
        // resume the rest of the screen after keypress.
        hasPause = true;
        inlineEmitted = true;
        const remainingParsed = parsed.substring(lastIndex);
        screenDebug('[MCI] Sentinel: ~SP — pausing, ' + remainingParsed.length + ' bytes pending');
        return {
          parsed: '',
          commands: commandsToExecute,
          hasPause: true,
          slowmo: slowmoApplied,
          slowmoCount: slowmoAppliedCount,
          inlineEmitted: true,
          pendingInlineContent: remainingParsed,
        };
      }

      if (sentinel.startsWith('CC:')) {
        // express.e:5555-5563 — processSysCommand()
        const commandStr = sentinel.substring(3).trim();
        const spacePos = commandStr.indexOf(' ');
        const cmdCode = spacePos >= 0 ? commandStr.substring(0, spacePos) : commandStr;
        const cmdParams = spacePos >= 0 ? commandStr.substring(spacePos + 1) : '';
        const subStateBeforeInlineCmd = session.subState;
        // Save subState so any door launched here (68K or TS) can't
        // clobber it. Door executors set DOOR_RUNNING and may not
        // restore it on early exit.
        const result = await processCommand(socket, session, cmdCode, cmdParams, true);
        if (session.subState !== subStateBeforeInlineCmd) {
          session.subState = subStateBeforeInlineCmd;
        }
        screenDebug('[MCI] Sentinel: ~CC_ ' + commandStr + ' → ' + result);
        inlineEmitted = true;
        continue;
      }

      if (sentinel.startsWith('SS:')) {
        // express.e:5496-5504 — displayFile()
        const filename = sentinel.substring(3).trim();
        screenDebug('[MCI] Sentinel: ~SS_ displayFile: ' + filename);
        await displayScreen(socket, session, filename, false);
        inlineEmitted = true;
        continue;
      }

      if (sentinel.startsWith('SR:')) {
        // express.e:5533-5554 — display random numbered file.
        // Sentinel format: SR:<width>|<basePath>. width=-1 means
        // "no width prefix" (caller's default of 99 applies).
        const body = sentinel.substring(3);
        const pipePos = body.indexOf('|');
        const widthRaw = pipePos >= 0 ? body.substring(0, pipePos) : '';
        let basePath = (pipePos >= 0 ? body.substring(pipePos + 1) : body).trim();
        const widthVal = parseInt(widthRaw, 10);

        if (basePath.includes(':')) {
          const { config: cfgMod } = require('../config');
          const baseDir = cfgMod.getConfig().dataDir;
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

        const maxCount = Math.max(1, Number.isFinite(widthVal) && widthVal > 0 ? widthVal : 99);
        const randomNum = Math.floor(Math.random() * maxCount) + 1;
        const randomFile = formatNumberedFilename(basePath, randomNum);
        screenDebug('[MCI] Sentinel: ~SR_ selected: ' + randomFile);
        // ~SR_ always shows a full-screen art file — clear before
        // drawing so previous door output doesn't bleed through.
        socket.emit('ansi-output', '\x1b[2J\x1b[H');
        await displayScreen(socket, session, randomFile, false);
        inlineEmitted = true;
        continue;
      }

      // Unknown sentinel type — emit nothing, log for visibility.
      screenDebug('[MCI] Sentinel: unknown type ' + JSON.stringify(sentinel));
    }

    // Emit any tail text after the last sentinel (or all of it if
    // no sentinels were found).
    if (emitChunk(parsed.substring(lastIndex))) {
      inlineEmitted = true;
    }

    // Clear parsed since everything has been emitted to the socket.
    parsed = '';
  }

  // ~SS_/~SR_/~SX_/~SP./~NSF/~CR./~F/~CC_/~CR_/~SM_/~SMO/~SMC all
  // handled in the pre-tokenizer block above so the strict-fall-
  // through tokenizer doesn't eat their `~`. Inline-mode CC_/SS_/SR_
  // ride through the dispatch as sentinels (executed by the walker).

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
 * **WEB_**: express.e:6814-6830 wraps non-MCI screen-file lines at
 * 79 columns and calls checkForPause() at each wrap. We don't, because
 * (a) modern terminals reflow on resize, (b) ANSI screens that the BBS
 * uses commonly contain wide invisible escape sequences which a naive
 * char-count wrap would split mid-attribute, and (c) the per-screen
 * fix-up risk (existing ANSI art breaks on wrap) outweighs the gain.
 * Sysops who really want hard-wrap behavior should generate their
 * screen files pre-wrapped. (Audit G-wrap, P3.)
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

    // Clear screen BEFORE any processing (including inline MCI that sets inlineEmitted=true).
    // Must be early — the frame-buffer path also prepends the clear, but inlineEmitted screens
    // (CONF_BULL with ~CC_ dRE!WAll etc.) bypass that path entirely, leaving old door content visible.
    if (shouldClear) {
      socket.emit('ansi-output', '\x1b[2J\x1b[H');
    }

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
    // If the file starts with a form feed (0x0C = Amiga "clear screen"), emit ESC[2J and strip it.
    // xterm.js treats 0x0C as a newline; on Amiga console.device it clears the screen.
    let contentForMci = (content.charCodeAt(0) === 0x0C)
      ? (socket.emit('ansi-output', '\x1b[2J\x1b[H'), content.slice(1))
      : content;
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
      // EXCEPT we still strip bare `~SP` directives — they're control codes, not
      // displayable text, and frequently appear at the end of art/ANSI files
      // (e.g. Conf*/Screens/uprough.txt) intended to pause after the art renders.
      // Without this strip, raw display emits "~SP" literally to the user.
      screenDebug(`[displayScreen] allowMCI=FALSE for ${screenName} (first line does not start with '~'), skipping MCI`);
      let rawHasPause = false;
      const stripped = contentForMci.replace(/~SP(\s|$)/g, () => {
        rawHasPause = true;
        return '';
      });
      parsed = stripped;
      commands = [];
      session.lastScreenHadPause = rawHasPause;
      if (rawHasPause) {
        screenDebug(`[displayScreen] Raw-display: stripped trailing ~SP, marking pause`);
      }
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
      const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)? ' : '';
      const prefix = ''; // shouldClear already sent early before MCI processing
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
        // shouldClear already sent early — no double-clear here
        HIDE_CURSOR + '\x1b[H' + streamText + '\x1b[0m' + SHOW_CURSOR,
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
          kind: 'doPause',
        };
        if (commands.length > 0) {
          session.queuedScreenCommands = commands;
          screenFlowLog(screenName, `Queued ${commands.length} command(s) to run after pause`);
        }
        emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
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
          // shouldClear already sent early (before MCI) so no double-clear needed here
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
        kind: 'doPause',
      };
      // Queue commands for execution after pause is dismissed
      if (commands.length > 0) {
        session.queuedScreenCommands = commands;
        screenFlowLog(screenName, `Queued ${commands.length} command(s) to run after pause`);
      }
      emitPrompt(socket, '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
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
  socket.emit(eventName, chunk + '\r\n(Pause)...More(y/n/ns)? ');
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

  // express.e:5199 aePuts('[1A[K') — only for checkForPause (More prompt)
  // express.e:5149 doPause(): aePuts('\b\n') — just newline, no cursor-up erase
  if (paged.kind !== 'doPause') {
    // More prompt (checkForPause): cursor up + erase to clear the '(Pause)...More(y/n/ns)?' line
    socket.emit(paged.eventName, '\x1b[1A\x1b[K');
  }
  // doPause: the lines[0] = '\r\n' will be emitted by emitPage below, matching express.e:5149

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
      kind: 'doPause',
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

  // Install a minimal pagination gate so the next keypress is required.
  // express.e:5149 doPause() response: lineCount:=0; aePuts('\b\n') — just a newline.
  session.paginatedScreen = {
    lines: ['\r\n'],
    nextIndex: 0,
    pageSize: 1,
    eventName: 'ansi-output',
    commands: [],
    onComplete,
    kind: 'doPause',
  };
  session.lastScreenHadPause = true;
}
// Web extension: negative ~SMO speeds (-1..-3) run slower than AmiExpress SMO1 while preserving positive speeds 1-5 semantics.
