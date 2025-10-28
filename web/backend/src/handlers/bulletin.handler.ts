/**
 * Bulletin Handler - Read and display BBS bulletins
 *
 * 1:1 port from express.e:24607-24652 internalCommandB()
 */

import * as fs from 'fs';
import * as path from 'path';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { ParamsUtil } from '../utils/params.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { findBulletinFile, findBullHelpFile } from '../utils/screen-security.util';
import { LoggedOnSubState } from '../constants/bbs-states';

// Dependencies injected from index.ts
let _db: any = null;
let _parseMciCodes: any = null;
let _addAnsiEscapes: any = null;

export function setBulletinDependencies(
  db: any,
  parseMciCodes: any,
  addAnsiEscapes: any
) {
  _db = db;
  _parseMciCodes = parseMciCodes;
  _addAnsiEscapes = addAnsiEscapes;
}

/**
 * Display bulletin help screen
 * Shows list of available bulletins
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param baseDir - BBS base directory
 */
function displayBullHelpScreen(socket: any, session: any, baseDir: string): void {
  // express.e:24618-24620 - Find and display BullHelp screen
  const conferenceDir = `Conf${String(session.currentConf || 1).padStart(2, '0')}`;
  const userSecLevel = session.user?.secLevel || 0;

  const bullHelpPath = findBullHelpFile(baseDir, conferenceDir, userSecLevel);

  if (bullHelpPath) {
    // Load and display the file
    try {
      let content = fs.readFileSync(bullHelpPath, 'utf-8');

      // Parse MCI codes
      if (_parseMciCodes) {
        content = _parseMciCodes(content, session);
      }

      // Add ESC prefix to ANSI codes
      if (_addAnsiEscapes) {
        content = _addAnsiEscapes(content);
      }

      // Normalize line endings
      content = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

      socket.emit('ansi-output', content);
    } catch (error) {
      console.error(`Error reading BullHelp file: ${bullHelpPath}`, error);
      socket.emit('ansi-output', AnsiUtil.errorLine('Error reading bulletin help.'));
    }
  } else {
    // No BullHelp file found - just show a simple list
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.header('Available Bulletins'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '  1. Bulletin #1\r\n');
    socket.emit('ansi-output', '  2. Bulletin #2\r\n');
    socket.emit('ansi-output', '  3. Bulletin #3\r\n');
    socket.emit('ansi-output', '\r\n');
  }
}

/**
 * Display a specific bulletin file
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param baseDir - BBS base directory
 * @param bulletinNumber - Bulletin number to display
 * @param nonStop - If true, disable pause prompts
 * @returns True if bulletin was displayed, false otherwise
 */
function displayBulletin(
  socket: any,
  session: any,
  baseDir: string,
  bulletinNumber: number,
  nonStop: boolean = false
): boolean {
  // express.e:24636-24640 - Find and display bulletin file
  const conferenceDir = `Conf${String(session.currentConf || 1).padStart(2, '0')}`;
  const userSecLevel = session.user?.secLevel || 0;

  const bulletinPath = findBulletinFile(baseDir, conferenceDir, bulletinNumber, userSecLevel);

  if (bulletinPath) {
    // Load and display the file
    try {
      let content = fs.readFileSync(bulletinPath, 'utf-8');

      // Parse MCI codes
      if (_parseMciCodes) {
        content = _parseMciCodes(content, session);
      }

      // Add ESC prefix to ANSI codes
      if (_addAnsiEscapes) {
        content = _addAnsiEscapes(content);
      }

      // Normalize line endings
      content = content.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

      socket.emit('ansi-output', content);

      // express.e uses nonStopDisplayFlag to control pausing
      if (!nonStop) {
        socket.emit('ansi-output', '\r\n' + AnsiUtil.pressKeyPrompt());
      }

      return true;
    } catch (error) {
      console.error(`Error reading bulletin file: ${bulletinPath}`, error);
      socket.emit('ansi-output', AnsiUtil.errorLine('Error reading bulletin.'));
      return false;
    }
  } else {
    // express.e:24641-24642 - Bulletin not found
    socket.emit('ansi-output', `\r\n${AnsiUtil.error(`Sorry there is no bulletin #${bulletinNumber}`)}\r\n\r\n`);
    return false;
  }
}

/**
 * Handle bulletin command (B)
 * 1:1 port from express.e:24607-24652 internalCommandB()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param params - Command parameters (bulletin number, flags like NS)
 */
export function handleBulletinCommand(socket: any, session: any, params: string = ''): void {
  // express.e:24613 - Check ACS_READ_BULLETINS permission
  if (!checkSecurity(session.user, ACSPermission.READ_BULLETINS)) {
    ErrorHandler.permissionDenied(socket, 'read bulletins', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24614 - setEnvStat(ENV_BULLETINS)
  // For web version, we'll just log this
  console.log('[ENV] Bulletins');

  // BBS directory structure
  const baseDir = path.join(__dirname, '../../BBS');

  // express.e:24616-24622 - Check if Bulletins/BullHelp.txt exists
  const conferenceDir = `Conf${String(session.currentConf || 1).padStart(2, '0')}`;
  const bullHelpCheckPath = path.join(baseDir, conferenceDir, 'Screens', 'Bulletins', 'BullHelp.txt');

  if (!fs.existsSync(bullHelpCheckPath)) {
    // express.e:24619-24620 - myError(ERR_NO_BULLS)
    ErrorHandler.sendError(socket, 'No bulletins are available.', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24624-24634 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  const nonStopDisplayFlag = ParamsUtil.hasFlag(parsedParams, 'NS');
  let bulletinNumber = ParamsUtil.extractNumber(parsedParams);

  // If bulletin number provided, display it directly
  if (bulletinNumber !== null) {
    // express.e:24636-24640 - Display bulletin
    displayBulletin(socket, session, baseDir, bulletinNumber, nonStopDisplayFlag);

    // express.e:24643-24646 - Jump back to inputAgain (prompt for another bulletin)
    // For now, just return to menu - we'll implement the loop in future iteration
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:24629-24633 - No params provided, show help and prompt
  displayBullHelpScreen(socket, session, baseDir);

  // express.e:24635-24636 - Prompt for bulletin number
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Which Bulletin ', color: 'white' },
    { text: '(?)=List, (Enter)=none?', color: 'cyan' },
    { text: ' ', color: 'reset' }
  ]));

  // Set up state for bulletin input
  // In future iterations, we'll implement a proper input loop like express.e:24635-24646
  session.subState = LoggedOnSubState.READ_COMMAND;
  session.pendingBulletinInput = true;
}

/**
 * Handle bulletin input (when user enters bulletin number)
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param input - User's input (bulletin number or ?)
 */
export function handleBulletinInput(socket: any, session: any, input: string): void {
  const trimmedInput = input.trim();

  // express.e:24638-24641 - Handle empty input (return to menu)
  if (trimmedInput.length === 0) {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.pendingBulletinInput = false;
    return;
  }

  // express.e:24642 - Handle ? (show help again)
  if (trimmedInput === '?') {
    const baseDir = path.join(__dirname, '../../BBS');
    displayBullHelpScreen(socket, session, baseDir);

    // Prompt again
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Which Bulletin ', color: 'white' },
      { text: '(?)=List, (Enter)=none?', color: 'cyan' },
      { text: ' ', color: 'reset' }
    ]));
    return;
  }

  // Parse bulletin number and flags
  const parsedParams = ParamsUtil.parse(trimmedInput);
  const nonStopDisplayFlag = ParamsUtil.hasFlag(parsedParams, 'NS');
  const bulletinNumber = ParamsUtil.extractNumber(parsedParams);

  if (bulletinNumber !== null) {
    const baseDir = path.join(__dirname, '../../BBS');
    displayBulletin(socket, session, baseDir, bulletinNumber, nonStopDisplayFlag);

    // Prompt for another bulletin (express.e:24643 - JUMP inputAgain)
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Which Bulletin ', color: 'white' },
      { text: '(?)=List, (Enter)=none?', color: 'cyan' },
      { text: ' ', color: 'reset' }
    ]));
  } else {
    // Invalid input
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid bulletin number.'));

    // Prompt again
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Which Bulletin ', color: 'white' },
      { text: '(?)=List, (Enter)=none?', color: 'cyan' },
      { text: ' ', color: 'reset' }
    ]));
  }
}
