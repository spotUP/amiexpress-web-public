/**
 * Bulletin Handler - Read and display BBS bulletins
 *
 * 1:1 port from express.e:24607-24652 internalCommandB()
 */

import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { ParamsUtil } from '../../utils/params.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { findBulletinFile, findBullHelpFile } from '../../utils/screen-security.util';
import { LoggedOnSubState } from '../../constants/bbs-states';

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

function buildBulletinBaseDirs(dataDir: string): string[] {
  // reference-board layout stores Bulletins directly under the dataDir/Conf#/Bulletins
  // Avoid creating or probing legacy dataDir/BBS to prevent empty BBS/ dirs
  return [dataDir];
}

function findBullHelpAcross(
  baseDirs: string[],
  conferenceDir: string,
  userSecLevel: number,
  userScreenType: string | null = null
): string | null {
  for (const baseDir of baseDirs) {
    const candidate = findBullHelpFile(baseDir, conferenceDir, userSecLevel, userScreenType);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

function findBulletinAcross(
  baseDirs: string[],
  conferenceDir: string,
  bulletinNumber: number,
  userSecLevel: number,
  userScreenType: string | null = null
): string | null {
  for (const baseDir of baseDirs) {
    const candidate = findBulletinFile(baseDir, conferenceDir, bulletinNumber, userSecLevel, userScreenType);
    if (candidate) {
      return candidate;
    }
  }
  return null;
}

/**
 * Display bulletin help screen
 * Shows list of available bulletins
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param baseDirs - Candidate base directories to search (root + legacy BBS)
 */
async function displayBullHelpScreen(socket: any, session: any, baseDirs: string[], conferenceDir: string): Promise<void> {
  // express.e:24618-24620 - Find and display BullHelp screen
  const userSecLevel = session.user?.secLevel || 0;
  const userScreenType = session.user?.screentype || null;

  const bullHelpPath = findBullHelpAcross(baseDirs, conferenceDir, userSecLevel, userScreenType);

  if (bullHelpPath) {
    // Load and display the file
    try {
      let content = amigafs.readFileSync(bullHelpPath, 'utf-8').toString();

      // Parse MCI codes
      if (_parseMciCodes) {
        const parseResult = await _parseMciCodes(content, session);
        content = parseResult.parsed || content;
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
 * @param baseDirs - Candidate base directories to search (root + legacy BBS)
 * @param bulletinNumber - Bulletin number to display
 * @param nonStop - If true, disable pause prompts
 * @returns True if bulletin was displayed, false otherwise
 */
async function displayBulletin(
  socket: any,
  session: any,
  baseDirs: string[],
  conferenceDir: string,
  bulletinNumber: number,
  nonStop: boolean = false
): Promise<boolean> {
  // express.e:24636-24640 - Find and display bulletin file
  const userSecLevel = session.user?.secLevel || 0;
  const userScreenType = session.user?.screentype || null;

  const bulletinPath = findBulletinAcross(baseDirs, conferenceDir, bulletinNumber, userSecLevel, userScreenType);

  if (bulletinPath) {
    // Load and display the file
    try {
      let content = amigafs.readFileSync(bulletinPath, 'utf-8').toString();

      // Parse MCI codes
      if (_parseMciCodes) {
        const parseResult = await _parseMciCodes(content, session);
        content = parseResult.parsed || content;
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
export async function handleBulletinCommand(socket: any, session: any, params: string = ''): Promise<void> {
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
  const { config } = require('../config');
  const dataDir = config.getConfig().dataDir;
  const baseDirs = buildBulletinBaseDirs(dataDir);
  const conferenceDir = `Conf${session.currentConf || 1}`;
  const userScreenType = session.user?.screentype || null;

  if (!findBullHelpAcross(baseDirs, conferenceDir, session.user?.secLevel || 0, userScreenType)) {
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
    await displayBulletin(socket, session, baseDirs, conferenceDir, bulletinNumber, nonStopDisplayFlag);

    // express.e:24643-24646 - Jump back to inputAgain (prompt for another bulletin)
    // For now, just return to menu - we'll implement the loop in future iteration
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:24629-24633 - No params provided, show help and prompt
  await displayBullHelpScreen(socket, session, baseDirs, conferenceDir);

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
export async function handleBulletinInput(socket: any, session: any, input: string): Promise<void> {
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
    const { config } = require('../config');
    const dataDir = config.getConfig().dataDir;
    const baseDirs = buildBulletinBaseDirs(dataDir);
    const conferenceDir = `Conf${session.currentConf || 1}`;
    await displayBullHelpScreen(socket, session, baseDirs, conferenceDir);

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
    const { config } = require('../config');
    const dataDir = config.getConfig().dataDir;
    const baseDirs = buildBulletinBaseDirs(dataDir);
    const conferenceDir = `Conf${session.currentConf || 1}`;
    await displayBulletin(socket, session, baseDirs, conferenceDir, bulletinNumber, nonStopDisplayFlag);

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
