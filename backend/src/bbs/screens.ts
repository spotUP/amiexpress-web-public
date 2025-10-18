/**
 * Screen loading and display functions
 * Extracted from index.ts for better modularity
 *
 * Implements classic AmiExpress MCI (Master Control Interface) codes
 * Port of processMci() and processMciCmd() from express.e lines 5258-5802
 */

import * as path from 'path';
import * as fs from 'fs';
import { Socket } from 'socket.io';
import { BBSSession } from './session';

/**
 * Add ESC character prefix to bare ANSI sequences
 * Screen files contain [XXm without ESC (0x1B) prefix
 * This matches original Amiga behavior where ESC was stored as actual byte
 */
function addAnsiEscapes(content: string): string {
  // Match ANSI sequences: [digits;digitsm or [digitm or [H or [2J etc
  // But NOT [%X] which are variable placeholders
  // Commands that REQUIRE a number: A,B,C,D,E,F,G,m,n,etc
  // Commands that work WITHOUT a number: H,J,K,f,s,u
  return content.replace(/\[([0-9]+[;0-9]*[A-Za-z]|[HJKfsu])/g, '\x1b[$1');
}

/**
 * Process classic AmiExpress MCI codes
 * Format: ~CODE where CODE is 1-3 character identifier
 * Port from express.e processMciCmd() lines 5258-5762
 */
function processMciCodes(content: string, session: BBSSession): string {
  let result = '';
  let pos = 0;

  while (pos < content.length) {
    const tilde = content.indexOf('~', pos);

    if (tilde === -1) {
      // No more MCI codes
      result += content.substring(pos);
      break;
    }

    // Add content before tilde
    result += content.substring(pos, tilde);

    // Parse MCI code
    let codeEnd = tilde + 1;
    let maxLen = -1;

    // Check for numeric length specifier: ~123CODE
    let numStr = '';
    while (codeEnd < content.length && content[codeEnd] >= '0' && content[codeEnd] <= '9' && numStr.length < 3) {
      numStr += content[codeEnd];
      codeEnd++;
    }
    if (numStr) maxLen = parseInt(numStr);

    // Get code (up to space or | terminator)
    const codeStart = codeEnd;
    while (codeEnd < content.length && content[codeEnd] !== ' ' && content[codeEnd] !== '|' && content[codeEnd] !== '~') {
      codeEnd++;
    }

    const code = content.substring(codeStart, codeEnd).toUpperCase();
    let value = '';

    // Process MCI codes (from express.e lines 5290-5762)
    switch (code) {
      case 'N':   // User name
        value = session.user?.username || 'Guest';
        break;
      case 'UL':  // User location
        value = session.user?.location || 'Unknown';
        break;
      case 'TC':  // Times called
        value = String(session.user?.calls || 0);
        break;
      case 'M':   // Messages posted
        value = String(session.user?.posts || 0);
        break;
      case 'A':   // Security level (access)
        value = String(session.user?.secLevel || 0);
        break;
      case 'S':   // Slot number (user ID)
        value = String(session.user?.id || 0);
        break;
      case 'BR':  // Baud rate
        value = '115200'; // WebSocket connection
        break;
      case 'TL':  // Time limit (minutes)
        value = String(Math.floor((session.user?.timeLimit || 60) / 60));
        break;
      case 'TR':  // Time remaining (minutes)
        value = String(Math.floor(session.timeRemaining / 60));
        break;
      case 'FU':  // Files uploaded
        value = String(session.user?.uploads || 0);
        break;
      case 'FD':  // Files downloaded
        value = String(session.user?.downloads || 0);
        break;
      case 'UB':  // Upload bytes
        value = String(session.user?.bytesUpload || 0);
        break;
      case 'DB':  // Download bytes
        value = String(session.user?.bytesDownload || 0);
        break;
      case 'ON':  // Node number (also LG)
      case 'LG':
        value = String(session.nodeNumber || 0);
        break;
      case 'RN':  // Real name
        value = session.user?.realname || session.user?.username || 'Guest';
        break;
      case 'OD':  // Online date
        value = new Date().toLocaleDateString();
        break;
      case 'OT':  // Online time
        value = new Date().toLocaleTimeString();
        break;
      case 'VE':  // Version
        value = 'AmiExpress Web 1.0';
        break;
      case 'VD':  // Version date
        value = '2025-01-17';
        break;
      case 'BN':  // BBS Name (custom extension)
        value = 'AmiExpress Web BBS';
        break;
      case '':    // Empty ~~ = literal tilde
        value = '~';
        break;
      default:
        // Unknown code - output as-is
        value = '~' + numStr + code;
    }

    // Apply max length if specified
    if (maxLen > 0 && value.length > maxLen) {
      value = value.substring(0, maxLen);
    }

    result += value;

    // Skip terminator if present
    if (codeEnd < content.length && content[codeEnd] === '|') {
      codeEnd++;
    }

    pos = codeEnd;
  }

  return result;
}

/**
 * Load and display screen file with MCI code processing
 * Matches AmiExpress screen loading: Node-specific -> Conference -> Global
 * Port from express.e displayScreen() lines 6539-6625
 */
export function loadScreen(screenName: string, session: BBSSession): string | null {
  const basePath = path.join(__dirname, '../../data/bbs/BBS');
  const nodeScreenPath = path.join(basePath, `Node${session.nodeNumber || 0}`, 'Screens', `${screenName}.TXT`);
  const confScreenPath = path.join(basePath, `Conf${String(session.currentConf || 1).padStart(2, '0')}`, 'Screens', `${screenName}.TXT`);
  const globalScreenPath = path.join(basePath, 'Screens', `${screenName}.TXT`);

  // Try node-specific, then conference-specific, then global
  let screenPath: string | null = null;
  if (fs.existsSync(nodeScreenPath)) {
    screenPath = nodeScreenPath;
  } else if (fs.existsSync(confScreenPath)) {
    screenPath = confScreenPath;
  } else if (fs.existsSync(globalScreenPath)) {
    screenPath = globalScreenPath;
  }

  if (!screenPath) {
    console.log(`Screen ${screenName} not found in any location`);
    return null;
  }

  try {
    let content = fs.readFileSync(screenPath, 'utf-8');

    // Step 1: Process MCI codes (classic AmiExpress ~CODE format)
    content = processMciCodes(content, session);

    // Step 2: Handle percent-style variables (menu format)
    // %B = BBS name
    content = content.replace(/%B/g, 'AmiExpress Web BBS');
    content = content.replace(/\[%B\]/g, 'AmiExpress Web BBS');

    // %CF = Conference name
    content = content.replace(/%CF/g, session.currentConfName || 'Main');

    // %R = Time remaining (minutes)
    content = content.replace(/%R/g, String(Math.floor(session.timeRemaining / 60)));

    // Step 3: Add ESC prefix to bare ANSI sequences
    content = addAnsiEscapes(content);

    return content;
  } catch (error) {
    console.error(`Error loading screen ${screenName}:`, error);
    return null;
  }
}

/**
 * Display a screen file (like displayScreen in AmiExpress)
 */
export function displayScreen(socket: Socket, session: BBSSession, screenName: string): boolean {
  const content = loadScreen(screenName, session);
  if (content) {
    socket.emit('ansi-output', content);
    return true;
  }
  return false;
}

/**
 * Pause with classic AmiExpress prompt
 * Port from express.e lines 5141-5151
 * Sets session state to wait for keypress before continuing
 */
export function doPause(socket: Socket, session: BBSSession): void {
  // Classic AmiExpress pause message: "(Pause)...Space To Resume: "
  // \x1b[32m = green, \x1b[33m = yellow, \x1b[34m = blue, \x1b[0m = reset
  socket.emit('ansi-output', '\r\n\x1b[32m(\x1b[33mPause\x1b[32m)\x1b[34m...\x1b[32mSpace To Resume\x1b[33m: \x1b[0m');
  // Session will wait for any key before continuing
}
