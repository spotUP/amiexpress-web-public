/**
 * Screen Handler - Display BBS screen files with MCI code parsing
 *
 * Handles loading and displaying screen files (.TXT) from the BBS directory structure.
 * Based on express.e displayScreen() functions.
 */

import * as fs from 'fs';
import * as path from 'path';

// Import types (will be provided by index.ts)
interface BBSSession {
  currentConf?: number;
  currentConfName?: string;
  timeRemaining: number;
  user?: { username: string };
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

/**
 * Parse MCI codes in screen content
 * Replaces AmiExpress MCI variables like %B, %CF, %U, etc.
 *
 * @param content - Screen file content with MCI codes
 * @param session - Current BBS session
 * @param bbsName - BBS name for %B variable
 * @returns Parsed content with MCI codes replaced
 */
export function parseMciCodes(content: string, session: BBSSession, bbsName: string = 'AmiExpress-Web'): string {
  let parsed = content;

  // %B - BBS Name
  parsed = parsed.replace(/%B/g, bbsName);

  // %CF - Current Conference Name
  parsed = parsed.replace(/%CF/g, session.currentConfName || 'Unknown');

  // %R - Time Remaining (in minutes)
  parsed = parsed.replace(/%R/g, Math.floor(session.timeRemaining / 60).toString());

  // %D - Current Date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' });
  parsed = parsed.replace(/%D/g, dateStr);

  // %U - Username
  parsed = parsed.replace(/%U/g, session.user?.username || 'Guest');

  // %N - Node Number (always 1 in web version)
  parsed = parsed.replace(/%N/g, '1');

  return parsed;
}

/**
 * Load screen file from disk
 * Searches in priority order: Conference → Node → Global BBS screens
 * Like express.e displayScreen() - loads from BBS:Node{X}/Screens/ or BBS:Conf{X}/Screens/
 *
 * @param screenName - Name of screen file (without .TXT extension)
 * @param conferenceId - Optional conference ID for conference-specific screens
 * @param nodeId - Node ID (default 0)
 * @returns Screen file content or null if not found
 */
export function loadScreenFile(screenName: string, conferenceId?: number, nodeId: number = 0): string | null {
  // BBS directory structure matches original Amiga AmiExpress
  // From backend/backend/src, go up two levels to backend/, then into BBS/
  const baseDir = path.join(__dirname, '../../../BBS');
  const paths = [];

  // Try conference-specific screen first (if provided)
  if (conferenceId) {
    // Find the relative conference number (1-based position in conferences array)
    const confIndex = conferences.findIndex(c => c.id === conferenceId);
    if (confIndex !== -1) {
      const relConfNum = confIndex + 1; // Convert to 1-based
      const confPath = path.join(baseDir, `Conf${String(relConfNum).padStart(2, '0')}`, 'Screens', `${screenName}.TXT`);
      paths.push(confPath);
    }
  }

  // Then try node-specific screen
  const nodePath = path.join(baseDir, `Node${nodeId}`, 'Screens', `${screenName}.TXT`);
  paths.push(nodePath);

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
  return content.replace(/\[(?!%)([0-9;]*[A-Za-z])/g, '\x1b[$1');
}

/**
 * Display a screen file to the user
 * Like express.e displayScreen(screenName) - express.e:28566, 28571, 28586
 *
 * @param socket - Socket.io socket for sending output
 * @param session - Current BBS session
 * @param screenName - Name of screen to display
 */
export function displayScreen(socket: any, session: BBSSession, screenName: string): void {
  const content = loadScreenFile(screenName, session.currentConf);

  if (content) {
    // Parse MCI codes
    let parsed = parseMciCodes(content, session);

    // Add ESC prefix to bare ANSI sequences (Amiga screen files don't have ESC prefix)
    parsed = addAnsiEscapes(parsed);

    // Convert Unix line endings (\n) to BBS line endings (\r\n) for proper terminal display
    // First normalize any existing \r\n to \n, then convert all \n to \r\n
    parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

    // Send to client
    socket.emit('ansi-output', parsed);
  } else {
    // Fallback if screen not found
    console.warn(`Using fallback for screen: ${screenName}`);
    socket.emit('ansi-output', `\x1b[36m-= ${screenName} =-\x1b[0m\r\n`);
  }
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
