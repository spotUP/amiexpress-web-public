/**
 * Screen Handler - Display BBS screen files with MCI code parsing
 *
 * Handles loading and displaying screen files (.TXT) from the BBS directory structure.
 * Based on express.e await displayScreen() functions.
 */

import * as fs from 'fs';
import * as path from 'path';

import type { BBSSession } from '../index';
import { db } from '../database';
import { flaggedFilesManager } from '../services/FlaggedFilesManager';
import { sequentialFileManager, formatNumberedFilename } from '../services/SequentialFileManager';
import { HIDE_CURSOR, SHOW_CURSOR } from '../utils/ansi-output.util';
import { findCaseInsensitive } from '../utils/fs-amiga.util';
import { isPetsciiSeqFile, convertPetsciiToPetMe64 } from '../utils/petscii.util';
import { findSecurityScreen } from '../utils/screen-security.util';
import { notifySysop } from '../utils/sysop-alert.util';

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
const SCREENS_REQUIRE_CLEAR = new Set([
  'AWAITSCREEN',
  'BBSTITLE',
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
  location: string = 'The Internet'
): Promise<{ parsed: string; commands: string[]; hasPause: boolean }> {
  let parsed = content;
  const commandsToExecute: string[] = [];
  let hasPause = false;

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
  const now = new Date();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[now.getDay()];
  const day = String(now.getDate()).padStart(2, '0');
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const fullDateTime = `${dayName} ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
  const timeStr = `${hours}:${minutes}:${seconds}`;

  // Process multi-character MCI codes FIRST to avoid collisions

  // ~XC - Execute Command (CRITICAL for NI/NO tools)
  // Format: ~XC_<command> <params>||
  // Example: ~XC_DOORS:who/NI ~N||
screenDebug('[MCI] ========== PROCESSING MCI CODES ==========');
screenDebug('[MCI] Content length:', content.length);
screenDebug('[MCI] Looking for ~XC_ and ~XI codes...');
  const xcRegex = /~XC_([^\|]+)\|\|/g;
  let xcMatch;
  while ((xcMatch = xcRegex.exec(parsed)) !== null) {
    const commandStr = xcMatch[1];
    screenDebug('[MCI] *** FOUND ~XC_ COMMAND:', commandStr);
    // Store command for async execution after screen display
    commandsToExecute.push(commandStr.trim());
    // Remove the ~XC code from output (silent execution)
    parsed = parsed.replace(xcMatch[0], '');
    screenDebug('[MCI] Added command to execution queue');
  }

  // ~XI - Execute XIM door (express.e format: ~XI<doorpath>)
  // Format: ~XIDOORS:who/NI or ~XIDOORS:who/No
  // This executes XIM doors silently from screen files
  const xiRegex = /~XI([^\s\r\n]+)/g;
  let xiMatch;
  while ((xiMatch = xiRegex.exec(parsed)) !== null) {
    const doorPath = xiMatch[1];
    screenDebug('[MCI] *** FOUND ~XI DOOR:', doorPath);
    // Store door command for async execution after screen display
    commandsToExecute.push(doorPath.trim());
    // Remove the ~XI code from output (silent execution)
    parsed = parsed.replace(xiMatch[0], '');
    screenDebug('[MCI] Added XIM door to execution queue');
  }

screenDebug('[MCI] Total commands to execute:', commandsToExecute.length);
  if (commandsToExecute.length > 0) {
    screenDebug('[MCI] Commands:', commandsToExecute);
  }

  // Conference/Message Board Lists (express.e:5588-5620)
  if (parsed.includes('~CL.')) {
    let confList = '';
    let num = 0;
    for (let i = 0; i < conferences.length; i++) {
      num++;
      const confName = conferences[i].name.padEnd(30, ' ');
      confList += `                     \x1b[32m${num}\x1b[33m) \x1b[35m${confName}\x1b[36m\x1b[0m\r\n`;
    }
    parsed = parsed.replace(/~CL\./g, confList);
  }

  if (parsed.includes('~CD.')) {
    // ~CD. - Conference Description (express.e:5606-5620)
    const confDesc = conferences[session.currentConf || 0]?.name || 'Unknown';
    parsed = parsed.replace(/~CD\./g, confDesc);
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
      msgBaseDesc = '   \x1b[34m[\x1b[0m1\x1b[34m] \x1b[0mDefault                       \r\n';
    }
    parsed = parsed.replace(/~MD\./g, msgBaseDesc);
  }

  // Process %NODELIST before %N to avoid collision
  if (parsed.includes('%NODELIST')) {
    let nodeList = '';
    const totalNodes = 8;
    const currentNode = 1;
    for (let i = 0; i < totalNodes; i++) {
      let status = 'Waiting';
      if (i === currentNode) status = 'You';
      else if (i === 0) status = 'Sysop';
      else if (i === 7) status = 'Shutdown';
      nodeList += `Node ${i}:  ${status}\r\n`;
    }
    parsed = parsed.replace(/%NODELIST/g, nodeList);
  }

  // User Information Codes (express.e:5291-5400)
  parsed = parsed.replace(/~N\|/g, username);           // N - Username
  parsed = parsed.replace(/~N(?=\s|$)/g, username);
  parsed = parsed.replace(/~P\|/g, '');  // P - Password (security - intentionally blank)
  parsed = parsed.replace(/~UL\|/g, user.location || '');  // UL - User Location
  parsed = parsed.replace(/~#\|/g, user.phoneNumber || '');  // # - Phone Number
  parsed = parsed.replace(/~TC\|/g, timesCalled.toString());  // TC - Times Called
  parsed = parsed.replace(/~TT\|/g, (user.callsToday || 0).toString());  // TT - Today's Calls
  parsed = parsed.replace(/~LC\|/g, user.lastLoginDate || 'Never');  // LC - Last Call
  parsed = parsed.replace(/~M\|/g, messagesPosted.toString());  // M - Messages Posted
  parsed = parsed.replace(/~A\|/g, secLevel.toString());  // A - Access/Security Level
  parsed = parsed.replace(/~S\|/g, user.id?.toString() || '0');  // S - Slot Number (user ID)
  parsed = parsed.replace(/~CA\|/g, user.confAccess || 'XXX');  // CA - Conference Access String
  parsed = parsed.replace(/~BR\|/g, '57600');  // BR - Baud Rate
  parsed = parsed.replace(/~HW\|/g, 'Web Browser');  // HW - Hardware/Computer Type
  parsed = parsed.replace(/~TL\|/g, Math.floor((user.dailyTimeLimit || 120) / 60).toString());  // TL - Time Limit
  parsed = parsed.replace(/~TR\|/g, Math.floor(session.timeRemaining / 60).toString());  // TR - Time Remaining
  parsed = parsed.replace(/~UB\|/g, uploadBytes.toString());  // UB - Upload Bytes
  parsed = parsed.replace(/~DB\|/g, downloadBytes.toString());  // DB - Download Bytes
  parsed = parsed.replace(/~SU\|/g, (uploadBytes / 1024).toFixed(0) + 'K');  // SU - Upload Size
  parsed = parsed.replace(/~SD\|/g, (downloadBytes / 1024).toFixed(0) + 'K');  // SD - Download Size
  parsed = parsed.replace(/~FU\|/g, uploads.toString());  // FU - Files Uploaded
  parsed = parsed.replace(/~FD\|/g, downloads.toString());  // FD - Files Downloaded
  parsed = parsed.replace(/~BD\|/g, (user.byteLimit || 0).toString());  // BD - Today's Byte Limit
  parsed = parsed.replace(/~ON\|/g, '1');  // ON/LG - Node Number
  parsed = parsed.replace(/~LG\|/g, '1');
  parsed = parsed.replace(/~IN\|/g, user.email || '');  // IN - Internet Name (email)
  parsed = parsed.replace(/~RN\|/g, user.realName || username);  // RN - Real Name

  // Conference Information (express.e:5440-5490)
  parsed = parsed.replace(/~CF\|/g, session.currentConfName || 'Main');  // CF - Current Conference
  parsed = parsed.replace(/~CN\|/g, (session.currentConf + 1).toString());  // CN - Conference Number

  // ~MB - Current Message Base Number (express.e:5442)
  const currentMsgBase = session.currentMsgBase || 1;
  parsed = parsed.replace(/~MB\|/g, currentMsgBase.toString());

  // ~MN - Message Base Name (express.e:5443)
  let msgBaseName = 'Default';
  try {
    const messageBases = await db.getMessageBases(session.currentConf);
    if (messageBases.length > 0 && currentMsgBase <= messageBases.length) {
      msgBaseName = messageBases[currentMsgBase - 1]?.name || 'Default';
    }
  } catch (error) {
    console.error('[parseMciCodes] Error getting message base name:', error);
  }
  parsed = parsed.replace(/~MN\|/g, msgBaseName);

  parsed = parsed.replace(/~CT\|/g, conferences.length.toString());  // CT - Total Conferences
  parsed = parsed.replace(/~VD\|/g, '2.00');  // VD - Version Number (display)
  parsed = parsed.replace(/~VE\|/g, 'AmiExpress-Web 2.0');  // VE - Version (full)

  // System Information
  parsed = parsed.replace(/~ND\|/g, fullDateTime);  // ND - Node Date/Time
  parsed = parsed.replace(/~DT\|/g, fullDateTime);  // DT - Date/Time
  parsed = parsed.replace(/~OT\|/g, timeStr);  // OT - Time Only
  parsed = parsed.replace(/~OD\|/g, `${day}-${month}-${year}`);  // OD - Date Only

  // ~SC - System Calls Today (express.e:5407)
  // Use SystemStatsService to get real call count
  const { systemStats } = await import('../services/SystemStatsService');
  const todayCalls = systemStats.getTodayCalls();
  parsed = parsed.replace(/~SC\|/g, todayCalls.toString());

  // File Area Codes (express.e:5408-5410)
  // ~FC - Files Count (flagged/marked files count)
  // ~FL - Files List (flagged files list display)
  // ~FF - Free Files (show flagged files)
  // Note: Original AmiExpress uses "flagged files" (user's download queue)
  // For now, we'll show total files in current conference
  let totalFiles = 0;
  try {
    const fileAreas = await db.getFileAreas(session.currentConf);
    for (const area of fileAreas) {
      const files = await db.getFilesByArea(area.id);
      totalFiles += files.length;
    }
  } catch (error) {
    console.error('[parseMciCodes] Error getting file count:', error);
  }
  parsed = parsed.replace(/~FC\|/g, totalFiles.toString());

  // ~FL - Flagged Files List (express.e:5445-5454)
  // Displays user's download queue (flagged files) one per line
  // Format: "                     filename\b\n"
  const userId = session.user?.id || 0;
  const flaggedFiles = flaggedFilesManager.getFiles(userId);
  let flaggedFilesList = '';
  for (const file of flaggedFiles) {
    // Format matches express.e: 21 spaces + filename + backspace + newline
    flaggedFilesList += `                     ${file.fileName}\b\r\n`;
  }
  parsed = parsed.replace(/~FL\|/g, flaggedFilesList);

  parsed = parsed.replace(/~FF\|/g, flaggedFilesManager.getCount(userId).toString());  // FF - Flagged files count

  parsed = parsed.replace(/~AK\|/g, user.alias || username);  // AK - Alias/Handle
  parsed = parsed.replace(/~SP\|/g, ' ');  // SP - Space
  parsed = parsed.replace(/~CR\|/g, '\r\n');  // CR - Carriage Return
  parsed = parsed.replace(/~NS\|/g, '');  // NS - No Space (nothing)
  // Some screens use bare ~SP (no delimiter) to pause; strip and mark pause
  parsed = parsed.replace(/~SP(\s|$)/g, () => {
    hasPause = true;
    return '';
  });

  // Color codes (c0-c7, b0-b7/z0-z7, n1-n9) (express.e:5651-5735)
  // Foreground colors (c0-c7)
  parsed = parsed.replace(/~c0\|/g, '\x1b[30m');  // Black
  parsed = parsed.replace(/~c1\|/g, '\x1b[34m');  // Blue
  parsed = parsed.replace(/~c2\|/g, '\x1b[32m');  // Green
  parsed = parsed.replace(/~c3\|/g, '\x1b[36m');  // Cyan
  parsed = parsed.replace(/~c4\|/g, '\x1b[31m');  // Red
  parsed = parsed.replace(/~c5\|/g, '\x1b[35m');  // Magenta
  parsed = parsed.replace(/~c6\|/g, '\x1b[33m');  // Yellow/Brown
  parsed = parsed.replace(/~c7\|/g, '\x1b[37m');  // White

  // Background colors (b0-b7, z0-z7)
  parsed = parsed.replace(/~b0\|/g, '\x1b[40m');  // Black bg
  parsed = parsed.replace(/~b1\|/g, '\x1b[44m');  // Blue bg
  parsed = parsed.replace(/~b2\|/g, '\x1b[42m');  // Green bg
  parsed = parsed.replace(/~b3\|/g, '\x1b[46m');  // Cyan bg
  parsed = parsed.replace(/~b4\|/g, '\x1b[41m');  // Red bg
  parsed = parsed.replace(/~b5\|/g, '\x1b[45m');  // Magenta bg
  parsed = parsed.replace(/~b6\|/g, '\x1b[43m');  // Yellow bg
  parsed = parsed.replace(/~b7\|/g, '\x1b[47m');  // White bg
  parsed = parsed.replace(/~z0\|/g, '\x1b[40m');  // z0-z7 same as b0-b7
  parsed = parsed.replace(/~z1\|/g, '\x1b[44m');
  parsed = parsed.replace(/~z2\|/g, '\x1b[42m');
  parsed = parsed.replace(/~z3\|/g, '\x1b[46m');
  parsed = parsed.replace(/~z4\|/g, '\x1b[41m');
  parsed = parsed.replace(/~z5\|/g, '\x1b[45m');
  parsed = parsed.replace(/~z6\|/g, '\x1b[43m');
  parsed = parsed.replace(/~z7\|/g, '\x1b[47m');

  // Text styles (n1-n9)
  parsed = parsed.replace(/~n1\|/g, '\x1b[1m');   // Bold
  parsed = parsed.replace(/~n2\|/g, '\x1b[2m');   // Dim
  parsed = parsed.replace(/~n3\|/g, '\x1b[3m');   // Italic
  parsed = parsed.replace(/~n4\|/g, '\x1b[4m');   // Underline
  parsed = parsed.replace(/~n5\|/g, '\x1b[5m');   // Blink
  parsed = parsed.replace(/~n6\|/g, '\x1b[7m');   // Reverse
  parsed = parsed.replace(/~n7\|/g, '\x1b[8m');   // Hidden
  parsed = parsed.replace(/~n8\|/g, '\x1b[0m');   // Reset
  parsed = parsed.replace(/~n9\|/g, '\x1b[0m');   // Normal (reset)

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
  parsed = parsed.replace(/~w\d*\|/g, '');

  // ~x - X position (cursor column) (express.e:5491-5500)
  // Format: ~x<number>| - moves cursor to column <number>
  // ANSI: ESC[<col>G (move to column)
  const xRegex = /~x(\d+)\|/g;
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
  const yRegex = /~y(\d+)\|/g;
  parsed = parsed.replace(yRegex, (match, row) => {
    const rowNum = parseInt(row, 10);
    if (rowNum >= 0) {
      return `\x1b[${rowNum};H`;  // ANSI: Move to row
    }
    return '';
  });

  // ~q - Query/Prompt reset (express.e:5571-5573)
  // Sends ANSI reset code [0m
  parsed = parsed.replace(/~q\|/g, '\x1b[0m');

  // ~h - Hotkey/Backspace (express.e:5574-5576)
  // Sends backspace character
  parsed = parsed.replace(/~h\|/g, '\x08');

  // Advanced File Display Codes (express.e:5490-5560)
  // ~SS_ - Show String / Display File (express.e:5490-5500)
  // Format: ~SS_<filename>|| or ~2S<filename> (short form) - displays another screen file
  // Note: || terminator is optional in some screen files
  // Store for async file loading - we'll process these after parsing
  screenDebug('[MCI DEBUG] Looking for ~SS_ codes in:', parsed.substring(0, 200));
  // Support both ~SS_ and ~2S (short form)
  const ssRegex = /~(?:SS_|2S)([^~|\r\n]+)(\|\|)?/g;
  const filesToDisplay: string[] = [];

  // Keep provided extensions; only trim whitespace/terminators.
  const normalizeScreenReference = (screenRef: string): string => screenRef.trim();

  parsed = parsed.replace(ssRegex, (_match, ref) => {
    const filename = normalizeScreenReference(ref.trim());
    screenDebug('[MCI DEBUG] Found ~SS_ code referencing file:', filename);
    filesToDisplay.push(filename);
    return `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`;
  });
  screenDebug('[MCI DEBUG] Total ~SS_ MCI codes found in screen:', filesToDisplay.length);

  // ~SX_ - String Exact / Sequential File Display (express.e:5505-5530)
  // Format: ~SX_<path>/<basename>|| - displays files sequentially (file.1, file.2, file.3...)
  // Reads counter from persistent file, increments, displays next file in sequence
  const sxRegex = /~SX_([^|]+)\|\|/g;
  let sxMatch;
  while ((sxMatch = sxRegex.exec(parsed)) !== null) {
    const basePath = sxMatch[1].trim();
    screenDebug('[MCI] Found ~SX_ sequential file request:', basePath);

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
  const srRegex = /~(\d*)SR_([^|\r\n]+)(\|\|)?/g;
  let srMatch;
  while ((srMatch = srRegex.exec(parsed)) !== null) {
    const maxCountRaw = srMatch[1];
    const basePath = srMatch[2].trim();
    screenDebug('[MCI] Found ~SR_ random file request:', basePath);

    // Optional numeric prefix sets the upper bound (default 99 like express.e used)
    const maxCount = Math.max(1, maxCountRaw ? parseInt(maxCountRaw, 10) : 99);

    // Pick a random number (1-maxCount) and format with 3-digit prefix before filename
    const randomNum = Math.floor(Math.random() * maxCount) + 1;
    const randomFile = formatNumberedFilename(basePath, randomNum);

    screenDebug('[MCI] ~SR_ selected random file:', randomFile);
    filesToDisplay.push(randomFile);
    parsed = parsed.replace(srMatch[0], `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`);
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
  parsed = parsed.replace(/~[Ff]/g, '\x1b[2J\x1b[H');

  // ~CC_ - Custom Command Execution (express.e:5555-5563)
  // Format: ~CC_<command>| or ~CC_<command>|| - executes a BBS command from the screen,
  // and some classic files only include a single trailing pipe (e.g. the reference-board V-AWAIT trigger),
  // so we accept either delimiter length like express.e did.
  // reference-board screens sometimes omit the pipe and just terminate with whitespace/~SP.
  // Accept either a pipe delimiter or whitespace/end of line.
  const ccRegex = /~CC_([^\s|~\r\n]+)(\|{1,2})?/g;
  let ccMatch;
  while ((ccMatch = ccRegex.exec(parsed)) !== null) {
    const commandStr = ccMatch[1];
    commandsToExecute.push(commandStr.trim());
    parsed = parsed.replace(ccMatch[0], '');
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
  parsed = parsed.replace(/~SMO\d*\|/g, '');

  // ~SMC - Screen Mode Clear / Slow Mode Clear (express.e:5737-5739)
  // Disables slow mode
  parsed = parsed.replace(/~SMC\|/g, '');

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
      // Replace placeholder with embedded content
      parsed = parsed.replace(placeholder, embedded.parsed);
    } else {
      // File not found - remove placeholder
      screenDebug(`[MCI] ~SS_ file not found: ${filename}`);
      parsed = parsed.replace(placeholder, '');
    }
  }

  if (session) {
    session.lastScreenHadPause = hasPause;
  }

  return { parsed, commands: commandsToExecute, hasPause };
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
): { content: string; isPetscii: boolean; filePath: string } | null {
  // BBS directory structure matches original Amiga AmiExpress
  // Use dataDir from config which points to project root
  const { config } = require('../config');
  const baseDir = config.getConfig().dataDir;
  const paths = [];

  screenDebug(`[loadScreenFile] Loading screen: ${screenName}`);
  screenDebug(`[loadScreenFile] Base directory: ${baseDir}`);
  screenDebug(`[loadScreenFile] Conference ID: ${conferenceId}, Node ID: ${nodeId}`);
  screenDebug(`[loadScreenFile] Terminal type: ${session?.terminalType || 'unknown'} (${session?.screenWidth}x${session?.screenHeight})`);
  screenDebug(`[loadScreenFile] PETSCII mode: ${session?.petsciiMode ? 'YES' : 'NO'}`);
  const userSecLevel = session?.user?.secLevel ?? 0;
  const screenBaseNoExt = screenName.replace(/\.[^/.]+$/, ''); // strip extension for security search
  const isAssignPath = screenName.includes(':');
  const normalizedName = screenName.toLowerCase();

  // Handle Amiga-style paths (e.g., "bbs:screens/reference-board/007.reference-board.txt")
  // Amiga filesystems are case-insensitive, so we need case-insensitive lookups
  // This is important for files imported from real Amigas (like reference-boardBBS)
  if (screenName.includes(':')) {
    // Split assign and path parts
    const [assign, ...pathParts] = screenName.split(':');
    const relativePath = pathParts.join(':'); // Handle case where path contains ':'

    let basePath: string;
    const assignLower = assign.toLowerCase();

    if (assignLower === 'bbs' || assignLower === 'work') {
      // bbs: or work: map to the root dataDir (not dataDir/BBS)
      basePath = baseDir;
    } else if (assignLower.startsWith('node')) {
      const nodeNum = assign.match(/\d+/)?.[0] || '0';
      basePath = path.join(baseDir, `Node${nodeNum}`);
    } else if (assignLower === 'screens') {
      basePath = path.join(baseDir, 'Screens');
    } else {
      // Unknown assign, try as-is under dataDir root
      basePath = baseDir;
    }

    // Resolve case-insensitive path (Amiga compatibility)
    // Try to find actual filesystem path by checking each component
    const fs = require('fs');
    let currentPath = basePath;
    const pathComponents = relativePath.split('/').filter(c => c.length > 0);
    // If WORK:/BBS: points at the data root and the first component is "bbs",
    // drop that component so we resolve to dataDir/Screens/...
    if ((assignLower === 'work' || assignLower === 'bbs') && pathComponents.length > 0 && pathComponents[0].toLowerCase() === 'bbs') {
      console.log(`[SCREEN_DEBUG] Stripping leading 'bbs' from ${assignLower.toUpperCase()}: path ${relativePath}`);
      pathComponents.shift();
    }
    let resolved = true;

    for (const component of pathComponents) {
      try {
        const entries = fs.readdirSync(currentPath);
        // Find matching entry (case-insensitive)
        const match = entries.find((e: string) => e.toLowerCase() === component.toLowerCase());
        if (match) {
          currentPath = path.join(currentPath, match);
        } else {
          // Component not found, use as-is (will fail later)
          currentPath = path.join(currentPath, component);
          resolved = false;
          break;
        }
      } catch (error) {
        // Directory doesn't exist or can't be read
        currentPath = path.join(currentPath, component);
        resolved = false;
        break;
      }
    }

    const petsciiPath = resolvePetsciiPath(currentPath, !!session?.petsciiMode);
    // Strip a leading "bbs" path component universally to avoid creating BBS/ dirs
    const normalized = petsciiPath.replace(new RegExp(`^${baseDir}/bbs/`, 'i'), `${baseDir}/`);
    if (normalized !== petsciiPath) {
      console.log(`[SCREEN_DEBUG] Stripping leading 'bbs' component: ${petsciiPath} -> ${normalized}`);
    }
    paths.push(normalized);
    screenDebug(`[MCI] ~SS_ resolving Amiga path: ${screenName} -> ${currentPath} (${resolved ? 'found' : 'not found'})`);
  } else if (screenName.includes('/')) {
    // Relative path with slashes - treat as dataDir-relative (no extra "Screens" prefix)
    const fsPath = path.join(baseDir, ...screenName.split('/'));
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
  const hasSlash = screenName.includes('/');

  // Only populate default search locations when no explicit path/assign is given.
  if (!isAssignPath && !hasSlash) {
    // Try conference-specific screen first (if provided)
    // express.e uses confScreenDir which points to Conf directory
    if (conferenceId) {
      // Find the relative conference number (1-based position in conferences array)
      const confIndex = conferences.findIndex(c => c.id === conferenceId);
      if (confIndex !== -1) {
        const relConfNum = confIndex + 1; // Convert to 1-based
        const candidateDirs = getConferenceScreensCandidates(baseDir, relConfNum);
        candidateDirs.forEach(candidate => {
          searchLocations.push({ dir: candidate.dir, desc: candidate.desc });
        });
      }
    }

    // Try node-specific screens - express.e:6580 uses nodeScreenDir which is Node0/ itself
    // Screens can be directly in Node0/ OR in Node0/Screens/ subdirectory
    const nodeDir = path.join(baseDir, `Node${nodeId}`);
    searchLocations.push({ dir: nodeDir, desc: `Node${nodeId}` });
    searchLocations.push({ dir: path.join(nodeDir, 'Screens'), desc: `Node${nodeId}/Screens` });

    // Then try default BBS screens
    searchLocations.push({ dir: path.join(baseDir, 'Screens'), desc: 'Screens' });
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

  const filenameVariations = (() => {
    // Special-case BBSTITLE: try .TXT first to avoid noisy extensionless probes
    if (screenName.toUpperCase() === 'BBSTITLE') {
      return session?.petsciiMode
        ? [...addPetsciiVariants(screenName)]
        : ['BBSTITLE.TXT', 'BBSTITLE.txt', 'BBSTITLE'];
    }
    if (screenName.toUpperCase() === 'AWAITSCREEN') {
      return session?.petsciiMode
        ? [...addPetsciiVariants(screenName)]
        : ['AWAITSCREEN.TXT', 'AWAITSCREEN.txt'];
    }
    if (session?.petsciiMode) {
      return isC64Client ? addPetsciiVariants(`${screenName}_C64`) : addPetsciiVariants(screenName);
    }
    return addAnsiVariants(screenName);
  })();

  // Try each location with case-insensitive matching
  screenDebug(`[loadScreenFile] Trying ${searchLocations.length} location(s) with case-insensitive matching:`);
  let attemptNum = 0;

  for (const location of searchLocations) {
    // Skip security-numbered lookup when the screen already used an assign (bbs:, node:, etc.)
    if (!isAssignPath) {
      const securityBasePath = path.join(location.dir, screenBaseNoExt);
      const securityVariant = findSecurityScreen(securityBasePath, userSecLevel);
      if (securityVariant) {
        screenDebug(`[loadScreenFile]  Found security screen for ${screenName} at: ${securityVariant}`);
        try {
          return { content: fs.readFileSync(securityVariant, 'utf-8'), isPetscii: false, filePath: securityVariant };
        } catch (error) {
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
        try {
          const fileToUse = resolvePetsciiPath(foundPath, !!session?.petsciiMode);
          const isPetsciiFile = isPetsciiSeqFile(fileToUse);
          if (isPetsciiFile) {
            screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
            try {
              const petsciiBuffer = fs.readFileSync(fileToUse);
              const content = convertPetsciiToPetMe64(petsciiBuffer);
              return { content, isPetscii: true, filePath: fileToUse };
            } catch (error) {
              console.error(`[loadScreenFile]     (error converting PETSCII):`, error);
            }
          } else {
            return { content: fs.readFileSync(fileToUse, 'utf-8'), isPetscii: false, filePath: fileToUse };
          }
        } catch (error) {
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
      const secPath = findSecurityScreen(baseWithoutExt, userSecLevel);
      if (secPath) {
        screenDebug(`[loadScreenFile]  Found security screen for assign path: ${secPath}`);
        try {
          if (isPetsciiSeqFile(secPath)) {
            const petsciiBuffer = fs.readFileSync(secPath);
            const content = convertPetsciiToPetMe64(petsciiBuffer);
            return { content, isPetscii: true, filePath: secPath };
          }
          return { content: fs.readFileSync(secPath, 'utf-8'), isPetscii: false, filePath: secPath };
        } catch (error) {
          console.error(`[loadScreenFile]     (error reading security screen: ${(error as Error).message})`);
        }
      }
    }

    try {
      const candidatePath = resolvePetsciiPath(filePath, !!session?.petsciiMode);
      if (fs.existsSync(candidatePath)) {
        screenDebug(`[loadScreenFile]  Found screen ${screenName} at: ${candidatePath}`);
        if (isPetsciiSeqFile(candidatePath)) {
          screenDebug(`[loadScreenFile] PETSCII .seq file detected, converting for PetMe64 font`);
          try {
            const petsciiBuffer = fs.readFileSync(candidatePath);
            const content = convertPetsciiToPetMe64(petsciiBuffer);
            return { content, isPetscii: true, filePath: candidatePath };
          } catch (error) {
            console.error(`[loadScreenFile]     (error converting PETSCII):`, error);
          }
        } else {
          return { content: fs.readFileSync(candidatePath, 'utf-8'), isPetscii: false, filePath: candidatePath };
        }
      } else {
        screenDebug(`[loadScreenFile]     (not found)`);
      }
    } catch (error) {
      console.error(`[loadScreenFile]     (error: ${(error as Error).message})`);
    }
  }

  // AmiExpress commonly reuses LOGONxx files or BULLxx files for bulletins.
  // If the explicit screen name was not found, try known fallbacks.
  const upper = screenName.toUpperCase();
  if (upper === 'BULL' || upper === 'NODE_BULL' || upper === 'CONF_BULL') {
    const fallbackCandidates = [
      path.join(baseDir, 'Screens', 'BULL20!.TXT'),
      path.join(baseDir, `Node${nodeId}`, 'logon20.txt'),
      path.join(baseDir, `Node${nodeId}`, 'logon10.txt'),
    ];
    for (const fallback of fallbackCandidates) {
      const candidate = findCaseInsensitive(path.dirname(fallback), path.basename(fallback));
      if (candidate && fs.existsSync(candidate)) {
        try {
          const content = fs.readFileSync(candidate, 'utf-8');
          screenDebug(`[loadScreenFile]  Using fallback screen for ${screenName}: ${candidate}`);
          return { content, isPetscii: false, filePath: candidate };
        } catch (error) {
          console.error(`[loadScreenFile]     (error reading fallback ${candidate}): ${(error as Error).message}`);
        }
      }
    }
  }

  console.warn(`[loadScreenFile]  Screen file not found: ${screenName}`);
  console.warn(`[loadScreenFile] Tried ${attemptNum} locations`);

  if (screenName.toUpperCase() === 'AWAITSCREEN') {
    const nodeFallbackDir = path.join(baseDir, 'Node1');

    // Prefer ANSI text fallback for the await screen
    const ansiFallback = findCaseInsensitive(nodeFallbackDir, 'bbstitle.txt') || findCaseInsensitive(nodeFallbackDir, 'bbstitle.TXT');
    if (ansiFallback) {
      try {
        const content = fs.readFileSync(ansiFallback, 'utf-8');
        screenDebug(`[loadScreenFile]  Using ANSI fallback screen ${ansiFallback}`);
        return { content, isPetscii: false, filePath: ansiFallback };
      } catch (error) {
        console.error(`[loadScreenFile]     (error reading ANSI fallback screen: ${(error as Error).message})`);
      }
    }

    const petsciiFallback = findCaseInsensitive(nodeFallbackDir, 'bbstitle.seq');
    if (petsciiFallback) {
      try {
        const buffer = fs.readFileSync(petsciiFallback);
        const content = convertPetsciiToPetMe64(buffer);
        screenDebug(`[loadScreenFile]  Using PETSCII fallback screen ${petsciiFallback}`);
        return { content, isPetscii: true, filePath: petsciiFallback };
      } catch (error) {
        console.error(`[loadScreenFile]     (error reading fallback screen: ${(error as Error).message})`);
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
export async function displayScreen(socket: any, session: BBSSession, screenName: string, runCommands: boolean = true): Promise<boolean> {
  screenDebug(`[displayScreen] ========================================`);
  screenDebug(`[displayScreen] REQUESTED SCREEN: ${screenName}`);
  screenDebug(`[displayScreen] Conference ID: ${session.currentConf || 'none'}`);
  screenDebug(`[displayScreen] User: ${session.user?.name || 'guest'}`);
  screenDebug(`[displayScreen] ========================================`);

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
    screenDebug(`[displayScreen]  Screen loaded successfully: ${screenName}`);
    screenDebug(`[displayScreen] Content length: ${content.length} bytes`);
    screenDebug(`[displayScreen] PETSCII: ${isPetscii ? 'YES' : 'NO'}`);
    screenDebug(`[displayScreen] Render event: ${screenName} (node ${session.nodeId || 0})`);
    screenFlowLog(screenName, `Loaded ${screenName} file=${filePath} petscii=${isPetscii ? 'Y' : 'N'} bytes=${content.length}`);

    let parsed: string;
    let commands: any[] = [];

    // Always parse MCI so ~SS_ and other codes work even in PETSCII screens
    const result = await parseMciCodes(content, session);
    parsed = result.parsed;
    commands = result.commands;
    session.lastScreenHadPause = result.hasPause;

    // Add ESC prefix to bare ANSI sequences only for ANSI paths
    if (!isPetscii) {
      parsed = addAnsiEscapes(parsed);
    }

    // Normalize line endings for terminal display
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // For flow screens (BULL/NODE_BULL/CONF_BULL/LOGON/etc.), ensure the frame ends
    // with a newline so the pause prompt does not collide with the final line of content.
    if (isFlowScreen && !parsed.endsWith('\r\n')) {
      parsed += '\r\n';
    }

    // Auto-paginate long screens (e.g., >25 lines like real AmiExpress More prompt)
    const pageHeight = session?.screenHeight || 25;
    const lines = parsed.split(/\r\n|\n/);
    const pageSize = Math.max(1, pageHeight - 1); // leave room for prompt line
    const eventName = isPetscii ? 'petscii-output' : 'ansi-output';

    const emitPage = (startIdx: number, endIdx: number, prompt: boolean) => {
      const chunk = lines.slice(startIdx, endIdx).join('\r\n');
      const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)?' : '';
      const prefix = shouldClear && startIdx === 0 ? '\x1b[2J\x1b[H' : '';
      socket.emit(eventName, prefix + chunk + promptLine);
    };

    screenFlowLog(
      screenName,
      `Parsed ${screenName}: event=${eventName} commands=${commands.length} pause=${session.lastScreenHadPause ? 'Y' : 'N'} pages=${lines.length}`
    );

    // Bulletin/logon flow screens should render as a single frame like express.e.
    // Skip auto-pagination for flow screens; rely on explicit ~SP/pauses instead.
    const allowPagination = !isFlowScreen;

    if (allowPagination && !session.lastScreenHadPause && lines.length > pageHeight) {
      session.paginatedScreen = {
        lines,
        nextIndex: pageSize,
        pageSize,
        eventName,
        commands,
      };
      if (commands.length > 0) {
        session.queuedScreenCommands = commands;
      }
      emitPage(0, pageSize, true);
      session.lastScreenHadPause = true;
      return true;
    }

    // Double-buffered display: Build complete frame buffer before sending
    // This prevents tearing and visible redraws by sending everything atomically
    const frameBuffer =
      (shouldClear ? '\x1b[2J\x1b[H' : '') + // Clear screen + home cursor when required
      HIDE_CURSOR +      // Hide cursor
      '\x1b[H' +         // Move cursor to home (1,1)
      parsed +           // Screen content
      SHOW_CURSOR;       // Show cursor

    // Send entire frame in one atomic operation
    // Use 'petscii-output' event for PETSCII content (triggers PetMe64 font)
    screenDebug(`[displayScreen] Emitting ${eventName} event`);
    socket.emit(eventName, frameBuffer);

    // If screen requested a pause (e.g., ~SP), set a minimal pagination state
    // so a keypress is required before continuing, without printing the raw MCI
    if (session.lastScreenHadPause) {
      session.paginatedScreen = {
        lines: [''], // no additional content, just hold for a key
        nextIndex: 1,
        pageSize: 1,
        eventName,
        commands,
      };
      socket.emit(eventName, '\r\n(Pause)...Space To Resume: ');
      return true;
    }

    // Execute any ~XC/~XI commands found in screen file (async, non-blocking)
    if (commands.length > 0 && !runCommands) {
      // Defer execution until caller triggers it (e.g., after a pause)
      session.queuedScreenCommands = commands;
      session.pendingScreenCommand = undefined;
      session.screenCommandResolver = null;
      screenFlowLog(screenName, `Queued ${commands.length} screen command(s) for deferred execution`);
      return true;
    } else if (commands.length > 0) {
      screenDebug(`[displayScreen] ==========================================`);
      screenDebug(`[displayScreen] EXECUTING ${commands.length} COMMANDS FROM SCREEN FILE: ${screenName}`);
      screenDebug(`[displayScreen] Commands:`, commands);
      screenDebug(`[displayScreen] ==========================================`);
      screenFlowLog(screenName, `Executing ${commands.length} command(s) from ${screenName}`);
      const { handleCommand } = require('./command.handler');

      session.pendingScreenCommand = new Promise<void>(resolve => {
        session.screenCommandResolver = resolve;
      });

      // Execute commands asynchronously after screen display (non-blocking)
      // This matches original AmiExpress behavior - screen shows THEN commands run
      setImmediate(async () => {
        session.executingScreenCommand = true;
        try {
          for (let i = 0; i < commands.length; i++) {
            const commandStr = commands[i];
            screenDebug(`[displayScreen] ------------------------------------------`);
            screenDebug(`[displayScreen] EXECUTING COMMAND ${i + 1}/${commands.length}:`, commandStr);
            screenDebug(`[displayScreen] Command type:`, commandStr.includes(':') ? 'DOOR PATH' : 'BBSCMD');
            // Parse command string (e.g., "DOORS:who/NI ~N" with params)
            try {
              screenDebug(`[displayScreen] Calling handleCommand with:`, commandStr);
              const result = await handleCommand(socket, session, commandStr);
              screenDebug(`[displayScreen]  Command completed:`, commandStr, 'Result:', result);
            } catch (error) {
              console.error(`[displayScreen]  ERROR executing command ${commandStr}:`, error);
              console.error(`[displayScreen] Error stack:`, (error as Error).stack);
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
    } else {
      screenDebug(`[displayScreen] No commands to execute from screen file: ${screenName}`);
      session.pendingScreenCommand = undefined;
      session.screenCommandResolver = null;
    }

    return true;
  } else {
    // Screen not found - return false silently (matches express.e behavior)
    // Caller decides whether to show error or skip
    console.error(`[displayScreen] ========================================`);
    console.error(`[displayScreen]  SCREEN FILE NOT FOUND: ${screenName}`);
    console.error(`[displayScreen] Conference ID: ${session.currentConf || 'none'}`);
    console.error(`[displayScreen] (Detailed path attempts logged by loadScreenFile above)`);
    console.error(`[displayScreen] ========================================`);
    notifySysop(session, `Screen not found: ${screenName}`);
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

  const { handleCommand } = require('./command.handler');
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
    return false;
  }

  const key = (data || '').trim().toUpperCase();
  const yes = key === '' || key === 'Y' || key === '\r' || key === '\n';
  const no = key === 'N';
  const noStop = key === 'NS';

  const lines = paged.lines;
  const emitPage = (startIdx: number, endIdx: number, prompt: boolean) => {
    const chunk = lines.slice(startIdx, endIdx).join('\r\n');
    const promptLine = prompt ? '\r\n(Pause)...More(y/n/ns)?' : '';
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
    return true;
  }

  // N: abort remaining pages, do not run queued commands
  if (no) {
    session.paginatedScreen = undefined;
    session.menuPause = false;
    session.queuedScreenCommands = [];
    session.pendingScreenCommand = undefined;
    session.screenCommandResolver = null;
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
  }

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

  // Check each path in order
  for (const filePath of paths) {
    if (fs.existsSync(filePath)) {
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
  // Express.e:5143 - "(Pause)...Space To Resume:"
  socket.emit('ansi-output', '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');

  // Install a minimal pagination gate so the next keypress is required before
  // the display flow continues (matches express.e pause semantics).
  session.paginatedScreen = {
    lines: [''],
    nextIndex: 1,
    pageSize: 1,
    eventName: 'ansi-output',
    commands: [],
    onComplete,
  };
  session.lastScreenHadPause = true;
}
