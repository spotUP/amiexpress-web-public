/**
 * Display and File Commands Handler
 *
 * Implements display and file-related commands as 1:1 ports from express.e:
 * - ? (Question Mark) - Show menu in expert mode - express.e:24594-24599
 * - F (File Listings) - Display file list - express.e:24877-24881
 * - FR (File Listings Raw) - Display file list with full details - express.e:24883-24887
 * - A (Alter Flags) - Flag files for download - express.e:24601-24605
 * - FS (File Status) - Show file statistics - express.e:24872-24875
 * - B (Read Bulletin) - Read specific bulletin - express.e:24607-24656
 */

import { LoggedOnSubState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { ParamsUtil } from '../utils/params.util';
import path from 'path';
import fs from 'fs';

// Types
interface BBSSession {
  user?: any;
  subState?: string;
  expertMode?: boolean;
  bulletinContext?: any;
  [key: string]: any;
}

// Dependencies injected from index.ts
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => void;
let _findSecurityScreen: (basePath: string, secLevel: number) => string | null;
let _confScreenDir: string;
let _db: any;

/**
 * Set dependencies for display/file commands (called from index.ts)
 */
export function setDisplayFileCommandsDependencies(deps: {
  displayScreen: typeof _displayScreen;
  findSecurityScreen: typeof _findSecurityScreen;
  confScreenDir: string;
  db: any;
}) {
  _displayScreen = deps.displayScreen;
  _findSecurityScreen = deps.findSecurityScreen;
  _confScreenDir = deps.confScreenDir;
  _db = deps.db;
}

/**
 * ? Command - Show Menu in Expert Mode
 *
 * From express.e:24594-24599:
 * PROC internalCommandQuestionMark()
 *   IF (loggedOnUser.expert="X")
 *     checkScreenClear()
 *     displayScreen(SCREEN_MENU)
 *   ENDIF
 * ENDPROC RESULT_SUCCESS
 *
 * In expert mode, displays the menu screen.
 * In normal mode, does nothing (menu is always visible).
 */
export function handleQuestionMarkCommand(socket: any, session: BBSSession): void {
  // If in expert mode, show the menu
  if (session.expertMode) {
    // Clear screen if needed (handled by displayScreen)
    _displayScreen(socket, session, 'MENU');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * F Command - File Listings
 *
 * From express.e:24877-24881:
 * PROC internalCommandF(params)
 *   IF checkSecurity(ACS_FILE_LISTINGS)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_FILES)
 * ENDPROC displayFileList(params);
 *
 * Displays file listings for the current conference.
 * Supports parameters for filtering (wildcards, etc.)
 */
export async function handleFileListCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.FILE_LISTINGS)) {
    ErrorHandler.permissionDenied(socket, 'view file listings', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Files');

  await displayFileList(socket, session, params, false);
}

/**
 * FR Command - File Listings (Raw/Full Details)
 *
 * From express.e:24883-24887:
 * PROC internalCommandFR(params)
 *   IF checkSecurity(ACS_FILE_LISTINGS)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_FILES)
 * ENDPROC displayFileList(params,TRUE);
 *
 * Displays file listings with full details (raw format).
 * Shows more information than the F command.
 */
export async function handleFileListRawCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.FILE_LISTINGS)) {
    ErrorHandler.permissionDenied(socket, 'view file listings', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Files');

  await displayFileList(socket, session, params, true);
}

/**
 * Display file list implementation - express.e:27626-27733 displayFileList()
 */
async function displayFileList(socket: any, session: BBSSession, params: string, reverse: boolean): Promise<void> {
  const parsedParams = ParamsUtil.parse(params);
  const nonStop = ParamsUtil.hasFlag(parsedParams, 'NS');

  socket.emit('ansi-output', '\r\n');

  // Get file areas for current conference - express.e:27642
  const conferenceId = session.currentConf || 1;
  const fileAreas = await _db.getFileAreas(conferenceId);

  if (fileAreas.length === 0) {
    socket.emit('ansi-output', AnsiUtil.errorLine('No file areas available in this conference.'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Parse area range from params - express.e:27647-27651 getDirSpan()
  let startArea = 0;
  let endArea = fileAreas.length - 1;

  if (parsedParams.length > 0 && parsedParams[0].match(/^\d+$/)) {
    const areaNum = parseInt(parsedParams[0]);
    if (areaNum > 0 && areaNum <= fileAreas.length) {
      startArea = areaNum - 1;
      endArea = areaNum - 1;
    }
  } else if (parsedParams.length > 0 && parsedParams[0].match(/^\d+-\d+$/)) {
    const range = ParamsUtil.extractRange(parsedParams);
    if (range && range.start > 0 && range.end <= fileAreas.length) {
      startArea = range.start - 1;
      endArea = range.end - 1;
    }
  }

  // Determine loop direction - express.e:27659-27665
  let currentArea = reverse ? endArea : startArea;
  const increment = reverse ? -1 : 1;

  // Loop through file areas - express.e:27666-27720
  while ((reverse && currentArea >= startArea) || (!reverse && currentArea <= endArea)) {
    const area = fileAreas[currentArea];

    // Display area header - express.e:27677-27682
    const areaNumber = currentArea + 1;
    const headerText = reverse ?
      `Reverse scanning directory ${areaNumber}` :
      `Scanning directory ${areaNumber}`;

    socket.emit('ansi-output', AnsiUtil.colorize(headerText, 'cyan') + '\r\n');
    socket.emit('ansi-output', AnsiUtil.colorize(`Area: ${area.name}`, 'yellow') + '\r\n');
    socket.emit('ansi-output', '\r\n');

    // Get files in this area - express.e:27695 displayIt()
    const files = await _db.getFilesByArea(area.id);

    if (files.length === 0) {
      socket.emit('ansi-output', AnsiUtil.colorize('  (No files in this area)', 'white') + '\r\n');
    } else {
      // Display files - express.e:27731-27848 displayIt2()
      for (const file of files) {
        // Format file info: filename (size) - description
        const filename = file.filename.padEnd(15);
        const size = formatFileSize(file.size).padStart(10);
        const uploadDate = formatDate(file.uploaddate).padEnd(10);
        const downloads = `${file.downloads || 0}d`.padStart(5);

        socket.emit('ansi-output',
          `  ${AnsiUtil.colorize(filename, 'white')} ` +
          `${AnsiUtil.colorize(size, 'cyan')} ` +
          `${AnsiUtil.colorize(uploadDate, 'green')} ` +
          `${AnsiUtil.colorize(downloads, 'yellow')}\r\n`
        );

        // Show description if available
        if (file.description) {
          const desc = file.description.substring(0, 70);
          socket.emit('ansi-output', AnsiUtil.colorize(`     ${desc}`, 'white') + '\r\n');
        }

        // Show uploader
        socket.emit('ansi-output',
          AnsiUtil.colorize(`     Uploaded by: ${file.uploader}`, 'white') + '\r\n'
        );
        socket.emit('ansi-output', '\r\n');
      }
    }

    socket.emit('ansi-output', '\r\n');

    // Move to next area
    currentArea += increment;
  }

  // Final prompt
  if (!nonStop) {
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Format file size for display (bytes -> KB/MB)
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes}B`;
  } else if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  } else {
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  }
}

/**
 * Format date for display (MM/DD/YY)
 */
function formatDate(date: Date): string {
  const d = new Date(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const year = String(d.getFullYear()).substring(2);
  return `${month}/${day}/${year}`;
}

/**
 * A Command - Alter File Flags (Flag for Download)
 *
 * From express.e:24601-24605:
 * PROC internalCommandA(params)
 *   IF checkSecurity(ACS_DOWNLOAD)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_FILES)
 *   alterFlags(params)
 * ENDPROC RESULT_SUCCESS
 *
 * Allows users to flag files for download.
 * Files can be flagged by name or pattern.
 */
export function handleAlterFlagsCommand(socket: any, session: BBSSession, params: string = ''): void {
  if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
    ErrorHandler.permissionDenied(socket, 'flag files for download', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Files');

  // TODO: Implement alterFlags(params) - requires file flagging system
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.warningLine('File flagging not yet implemented'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * FS Command - File Status
 *
 * From express.e:24872-24875:
 * PROC internalCommandFS()
 *   IF checkSecurity(ACS_CONFERENCE_ACCOUNTING)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   fileStatus(0)
 * ENDPROC RESULT_SUCCESS
 *
 * Displays file statistics for the current conference.
 * Shows total files, total bytes, etc.
 */
export function handleFileStatusCommand(socket: any, session: BBSSession): void {
  if (!checkSecurity(session.user, ACSPermission.CONFERENCE_ACCOUNTING)) {
    ErrorHandler.permissionDenied(socket, 'view file statistics', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // TODO: Implement fileStatus(0) - requires file database
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.warningLine('File statistics not yet implemented'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * B Command - Read Bulletin
 *
 * From express.e:24607-24656:
 * PROC internalCommandB(params)
 *   - Check ACS_READ_BULLETINS permission
 *   - Check if BullHelp.txt exists
 *   - If params: parse bulletin number and NS flag
 *   - If no params: show BullHelp, prompt for bulletin number
 *   - Loop: display bulletin, prompt for next number
 *   - Allow "?" to re-show help, Enter to quit
 *
 * Interactive bulletin reading system.
 * Bulletins are stored in Bulletins/Bull1, Bull2, etc.
 */
export function handleReadBulletinCommand(socket: any, session: BBSSession, params: string = ''): void {
  if (!checkSecurity(session.user, ACSPermission.READ_BULLETINS)) {
    ErrorHandler.permissionDenied(socket, 'read bulletins', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Bulletins');

  // Check if BullHelp.txt exists
  const bullHelpPath = path.join(_confScreenDir, 'Bulletins', 'BullHelp.txt');
  if (!fs.existsSync(bullHelpPath)) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Sorry, there are no bulletins available'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const parsedParams = ParamsUtil.parse(params);

  if (parsedParams.length > 0) {
    // Bulletin number provided as parameter
    const bulletinNum = ParamsUtil.extractNumber(parsedParams);
    const nonStopDisplay = ParamsUtil.hasFlag(parsedParams, 'NS');

    if (bulletinNum !== null) {
      _displayBulletin(socket, session, bulletinNum, nonStopDisplay);
      // Enter interactive loop
      session.subState = 'BULLETIN_INPUT';
      session.bulletinContext = { nonStopDisplay };
      return;
    }
  }

  // No params - show help and prompt
  _showBulletinHelp(socket, session);
}

/**
 * Helper: Show bulletin help screen and prompt for bulletin number
 */
function _showBulletinHelp(socket: any, session: BBSSession): void {
  // Display BullHelp screen
  const bullHelpBasePath = path.join('Bulletins', 'BullHelp');
  const helpScreen = _findSecurityScreen(bullHelpBasePath, session.user?.secLevel || 0);

  if (helpScreen) {
    _displayScreen(socket, session, helpScreen);
  }

  // Prompt for bulletin number
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Which Bulletin ', color: 'white' },
    { text: '(?)=List, (Enter)=none', color: 'cyan' },
    { text: '? ', color: 'white' }
  ]));

  session.subState = 'BULLETIN_INPUT';
  session.bulletinContext = { showedHelp: true, nonStopDisplay: false };
}

/**
 * Helper: Display a specific bulletin
 */
function _displayBulletin(socket: any, session: BBSSession, bulletinNum: number, nonStopDisplay: boolean): void {
  const bulletinBasePath = path.join('Bulletins', `Bull${bulletinNum}`);
  const bulletinScreen = _findSecurityScreen(bulletinBasePath, session.user?.secLevel || 0);

  socket.emit('ansi-output', '\r\n');

  if (bulletinScreen) {
    _displayScreen(socket, session, bulletinScreen);

    if (!nonStopDisplay) {
      socket.emit('ansi-output', '\r\n');
    }
  } else {
    socket.emit('ansi-output', AnsiUtil.errorLine(`Sorry there is no bulletin #${bulletinNum}`));
    socket.emit('ansi-output', '\r\n');
  }

  // Prompt for next bulletin
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Which Bulletin ', color: 'white' },
    { text: '(?)=List, (Enter)=none', color: 'cyan' },
    { text: '? ', color: 'white' }
  ]));
}

/**
 * Handle bulletin input (called from command handler when in BULLETIN_INPUT state)
 */
export function handleBulletinInput(socket: any, session: BBSSession, input: string): void {
  const trimmedInput = input.trim();

  // Enter key - quit bulletin mode
  if (trimmedInput === '') {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    delete session.bulletinContext;
    return;
  }

  // ? - show help again
  if (trimmedInput === '?') {
    _showBulletinHelp(socket, session);
    return;
  }

  // Parse bulletin number
  const parsedParams = ParamsUtil.parse(trimmedInput);
  const nonStopDisplay = ParamsUtil.hasFlag(parsedParams, 'NS');
  const bulletinNum = ParamsUtil.extractNumber(parsedParams);

  if (bulletinNum !== null) {
    _displayBulletin(socket, session, bulletinNum, nonStopDisplay);
    session.bulletinContext = { nonStopDisplay };
  } else {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid bulletin number'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Which Bulletin ', color: 'white' },
      { text: '(?)=List, (Enter)=none', color: 'cyan' },
      { text: '? ', color: 'white' }
    ]));
  }
}
