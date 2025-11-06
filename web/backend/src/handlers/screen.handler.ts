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

interface Conference {
  id: number;
  name: string;
}

// This will be injected from index.ts
let conferences: Conference[] = [];

export function setConferences(confs: Conference[]) {
  conferences = confs;
}

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
): Promise<{ parsed: string; commands: string[] }> {
  let parsed = content;
  const commandsToExecute: string[] = [];

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
  const xcRegex = /~XC_([^\|]+)\|\|/g;
  let xcMatch;
  while ((xcMatch = xcRegex.exec(parsed)) !== null) {
    const commandStr = xcMatch[1];
    // Store command for async execution after screen display
    commandsToExecute.push(commandStr.trim());
    // Remove the ~XC code from output (silent execution)
    parsed = parsed.replace(xcMatch[0], '');
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
  parsed = parsed.replace(/~BR\|/g, '38400');  // BR - Baud Rate
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
  // Note: This should track daily call statistics - for now return 0
  parsed = parsed.replace(/~SC\|/g, '0');

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
  parsed = parsed.replace(/~FL\|/g, '');  // FL - File list display (complex, skip for now)
  parsed = parsed.replace(/~FF\|/g, totalFiles.toString());  // FF - Same as FC for now

  parsed = parsed.replace(/~AK\|/g, user.alias || username);  // AK - Alias/Handle
  parsed = parsed.replace(/~SP\|/g, ' ');  // SP - Space
  parsed = parsed.replace(/~CR\|/g, '\r\n');  // CR - Carriage Return
  parsed = parsed.replace(/~NS\|/g, '');  // NS - No Space (nothing)

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
  parsed = parsed.replace(/~f\|/g, '\x1b[2J\x1b[H');  // Clear screen + home cursor

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
  // Format: ~SS_<filename>|| - displays another screen file
  // Store for async file loading - we'll process these after parsing
  const ssRegex = /~SS_([^|]+)\|\|/g;
  let ssMatch;
  const filesToDisplay: string[] = [];
  while ((ssMatch = ssRegex.exec(parsed)) !== null) {
    const filename = ssMatch[1].trim();
    filesToDisplay.push(filename);
    parsed = parsed.replace(ssMatch[0], `{{DISPLAY_FILE:${filesToDisplay.length - 1}}}`);
  }

  // ~SX_ - String Exact / Sequential File Display (express.e:5501-5530)
  // Format: ~SX_<filename>|| - displays files sequentially with counter
  // Note: Complex feature requiring state tracking, skip for now
  parsed = parsed.replace(/~SX_[^|]+\|\|/g, '');

  // ~SR_ - String Replace / Random File Display (express.e:5531-5560)
  // Format: ~SR_<count>_<filename>|| - displays random file from numbered set
  // Note: Complex feature, skip for now
  parsed = parsed.replace(/~SR_[^|]+\|\|/g, '');

  // ~CC_ - Custom Command Execution (express.e:5561-5570)
  // Format: ~CC_<command>|| - executes a system command
  // Note: Similar to ~XC but for system commands, we already have ~XC
  // Store for async execution like ~XC
  const ccRegex = /~CC_([^|]+)\|\|/g;
  let ccMatch;
  while ((ccMatch = ccRegex.exec(parsed)) !== null) {
    const commandStr = ccMatch[1];
    commandsToExecute.push(commandStr.trim());
    parsed = parsed.replace(ccMatch[0], '');
  }

  // ~CR_ - Custom Reset / Prompted Keypress (express.e:5571-5580)
  // Format: ~CR_<prompt>|| - displays prompt and waits for keypress
  // Note: This is interactive and doesn't work in static screen files
  // Just display the prompt text and remove the wait
  const crRegex = /~CR_([^|]+)\|\|/g;
  parsed = parsed.replace(crRegex, (match, promptText) => {
    return promptText; // Just show the prompt, no wait
  });

  // ~SM_ - Set Mode / Menu Name (express.e:5581-5590)
  // Format: ~SM_<menuname>|| - sets current menu name
  // Note: Menu name tracking would need session state, skip for now
  parsed = parsed.replace(/~SM_[^|]+\|\|/g, '');

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
  parsed = parsed.replace(/%R/g, session.user ? Math.floor(session.timeRemaining / 60).toString() : '38400');
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

    // Load the file content
    let fileContent = loadScreenFile(filename, session.currentConf, 0);

    if (fileContent) {
      // Recursively process MCI codes in the embedded file
      const embedded = await parseMciCodes(fileContent, session, bbsName, sysopName, location);
      // Add any commands from embedded file to our command list
      commandsToExecute.push(...embedded.commands);
      // Replace placeholder with embedded content
      parsed = parsed.replace(placeholder, embedded.parsed);
    } else {
      // File not found - remove placeholder
      console.log(`[MCI] ~SS_ file not found: ${filename}`);
      parsed = parsed.replace(placeholder, '');
    }
  }

  return { parsed, commands: commandsToExecute };
}

/**
 * Load screen file from disk
 * Searches in priority order: Conference → Node → Global BBS screens
 * Like express.e await displayScreen() - loads from BBS:Node{X}/Screens/ or BBS:Conf{X}/Screens/
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns Screen file content or null if not found
 */
export function loadScreenFile(screenName: string, conferenceId?: number, nodeId: number = 0): string | null {
  // BBS directory structure matches original Amiga AmiExpress
  // Use dataDir from config which points to project root
  const { config } = require('../config');
  const baseDir = config.getConfig().dataDir;
  const paths = [];

  // Try conference-specific screen first (if provided)
  // express.e uses confScreenDir which points to Conf directory
  if (conferenceId) {
    // Find the relative conference number (1-based position in conferences array)
    const confIndex = conferences.findIndex(c => c.id === conferenceId);
    if (confIndex !== -1) {
      const relConfNum = confIndex + 1; // Convert to 1-based
      const confPath = path.join(baseDir, `Conf${String(relConfNum).padStart(2, '0')}`, 'Screens', `${screenName}.TXT`);
      paths.push(confPath);
    }
  }

  // Try node-specific screens - express.e:6580 uses nodeScreenDir which is Node0/ itself
  // Screens can be directly in Node0/ OR in Node0/Screens/ subdirectory
  const nodeDir = path.join(baseDir, `Node${nodeId}`);
  paths.push(path.join(nodeDir, `${screenName}.TXT`));        // Node0/BBSTITLE.TXT
  paths.push(path.join(nodeDir, `${screenName}.txt`));        // Node0/bbstitle.txt
  paths.push(path.join(nodeDir, 'Screens', `${screenName}.TXT`));  // Node0/Screens/BBSTITLE.TXT
  paths.push(path.join(nodeDir, 'Screens', `${screenName}.txt`));  // Node0/Screens/bbstitle.txt

  // Then try default BBS screens
  const bbsPath = path.join(baseDir, 'Screens', `${screenName}.TXT`);
  paths.push(bbsPath);

  // Try each path in order
  for (const filePath of paths) {
    try {
      if (fs.existsSync(filePath)) {
        console.log(`✓ Loaded screen ${screenName} from: ${filePath}`);
        return fs.readFileSync(filePath, 'utf-8');
      }
    } catch (error) {
      console.error(`Error loading screen ${screenName} from ${filePath}:`, error);
    }
  }

  console.warn(`Screen file not found: ${screenName} (tried: ${paths.join(', ')})`);
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
  // Match ANSI sequences: [digits;digitsm or [digitm or [H or [2J etc
  // But NOT [%X] which are variable placeholders
  // And NOT isolated brackets like [AmiExpress-Web] - only valid ANSI sequences
  // Valid: [0m, [1;32m, [2J, [H, etc. - must start with digit or be special (H,J,K)
  return content.replace(/\[([0-9;]+[A-Za-z]|[HJK]|2J)/g, '\x1b[$1');
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
export async function displayScreen(socket: any, session: BBSSession, screenName: string): Promise<boolean> {
  const content = loadScreenFile(screenName, session.currentConf);

  if (content) {
    // Parse MCI codes (now returns parsed content + commands to execute)
    const { parsed: mciParsed, commands } = await parseMciCodes(content, session);
    let parsed = mciParsed;

    // Add ESC prefix to bare ANSI sequences (Amiga screen files don't have ESC prefix)
    parsed = addAnsiEscapes(parsed);

    // Convert Unix line endings (\n) to BBS line endings (\r\n) for proper terminal display
    // First normalize any existing \r\n to \n, then convert all \n to \r\n
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // Send to client
    socket.emit('ansi-output', parsed);

    // Execute any ~XC commands found in screen file (async, non-blocking)
    if (commands.length > 0) {
      console.log(`[displayScreen] Scheduling ${commands.length} commands from screen file ${screenName}`);
      const { handleCommand } = require('./command.handler');

      // Execute commands asynchronously after screen display (non-blocking)
      // This matches original AmiExpress behavior - screen shows THEN commands run
      setImmediate(async () => {
        for (const commandStr of commands) {
          console.log(`[displayScreen] Executing: ${commandStr}`);
          // Parse command string (e.g., "DOORS:who/NI ~N" with params)
          try {
            await handleCommand(socket, session, commandStr);
          } catch (error) {
            console.error(`[displayScreen] Error executing command ${commandStr}:`, error);
          }
        }
      });
    }

    // If displaying MENU and user is sysop, append sysop commands
    if (screenName.toUpperCase() === 'MENU' && session.user && session.user.secLevel >= 255) {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', '\x1b[33mSYSOP COMMANDS\x1b[0m\r\n');
      socket.emit('ansi-output', '[\x1b[36mWEBHOOK\x1b[0m] Manage Hooks  [\x1b[36mNM\x1b[0m] Node Mgmt  [\x1b[36mCM\x1b[0m] Conf Maint\r\n');
      socket.emit('ansi-output', '\x1b[36m------------------------------------------------------------------------------\x1b[0m\r\n');
    }

    return true;
  } else {
    // Fallback if screen not found
    console.warn(`Using fallback for screen: ${screenName}`);
    socket.emit('ansi-output', `\x1b[36m-= ${screenName} =-\x1b[0m\r\n`);
    return false;
  }
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
      const confPath = path.join(baseDir, `Conf${String(relConfNum).padStart(2, '0')}`, 'Screens', `${screenName}.keys`);
      paths.push(confPath);
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
      console.log(`✓ Found .keys file: ${filePath}`);
      return true;
    }
  }

  console.log(`No .keys file found for screen: ${screenName}`);
  return false;
}

/**
 * Display "Press any key..." pause prompt
 * Like express.e doPause() - express.e:28566, 28571
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session (for future enhancements)
 */
export function doPause(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n\x1b[32mPress any key to continue...\x1b[0m');
  // Note: Actual key wait is handled by client sending keypress event
  // This just displays the prompt
}
