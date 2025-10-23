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

  // Import and use the new FileListingHandler
  const { FileListingHandler } = require('./file-listing.handler');
  await FileListingHandler.handleFileList(socket, session, params, false);
}

/**
 * FR Command - File Listings (Raw/Full Details)
 *
 * From express.e:24883-24887:
 * PROC internalCommandFR(params)
 *   IF checkSecurity(ACS_FILE_LISTINGS)=FALSE THEN RETURN RESULT_ALLOWED
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

  // Import and use the new FileListingHandler
  const { FileListingHandler } = require('./file-listing.handler');
  await FileListingHandler.handleFileList(socket, session, params, true);
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
export async function handleAlterFlagsCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
    ErrorHandler.permissionDenied(socket, 'flag files for download', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Files');

  // Initialize flagged files array if not exists
  if (!session.flaggedFiles) {
    session.flaggedFiles = [];
  }

  await alterFlags(socket, session, params);
}

/**
 * Alter flags implementation - express.e:12648-12664 alterFlags()
 */
async function alterFlags(socket: any, session: BBSSession, params: string): Promise<void> {
  socket.emit('ansi-output', '\r\n');

  if (params.length > 0) {
    // Parameters provided - process directly
    await flagFiles(socket, session, params);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  } else {
    // No parameters - enter interactive mode
    showFlaggedFiles(socket, session);
    promptForFlagInput(socket, session);
  }
}

/**
 * Show currently flagged files - express.e:12594 showFlags()
 */
function showFlaggedFiles(socket: any, session: BBSSession): void {
  const flagged = session.flaggedFiles || [];

  if (flagged.length === 0) {
    socket.emit('ansi-output', AnsiUtil.colorize('No files currently flagged', 'yellow') + '\r\n');
  } else {
    socket.emit('ansi-output', AnsiUtil.headerBox('Flagged Files'));
    socket.emit('ansi-output', '\r\n');

    let totalSize = 0;
    flagged.forEach((file, index) => {
      totalSize += file.size || 0;
      const size = formatFileSize(file.size || 0).padStart(10);
      socket.emit('ansi-output',
        `${String(index + 1).padStart(3)}. ${AnsiUtil.colorize(file.filename.padEnd(20), 'white')} ` +
        `${AnsiUtil.colorize(size, 'cyan')} ` +
        `${AnsiUtil.colorize(file.areaname, 'green')}\r\n`
      );
    });

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', `Total: ${flagged.length} file(s), ${formatFileSize(totalSize)}\r\n`);
  }

  socket.emit('ansi-output', '\r\n');
}

/**
 * Prompt for flag input - express.e:12597-12600
 */
function promptForFlagInput(socket: any, session: BBSSession): void {
  socket.emit('ansi-output',
    AnsiUtil.colorize('Filename(s) to flag: ', 'cyan') +
    AnsiUtil.colorize('(', 'green') +
    AnsiUtil.colorize('C', 'yellow') +
    AnsiUtil.colorize(')', 'green') +
    AnsiUtil.colorize('lear, ', 'cyan') +
    AnsiUtil.colorize('(', 'green') +
    AnsiUtil.colorize('Enter', 'yellow') +
    AnsiUtil.colorize(')', 'green') +
    AnsiUtil.colorize('=none? ', 'cyan')
  );

  session.subState = 'FLAG_INPUT';
  session.tempData = { flagOperation: 'prompt' };
}

/**
 * Process flag input - express.e:12605-12661
 */
export async function handleFlagInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    // Enter = done
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine(`${session.flaggedFiles?.length || 0} file(s) flagged`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }

  // Check for Clear command - express.e:12605-12621
  if (trimmed.toUpperCase().startsWith('C ') || trimmed.toUpperCase() === 'C') {
    const pattern = trimmed.length > 2 ? trimmed.substring(2).trim() : '*';

    if (pattern === '*') {
      // Clear all
      session.flaggedFiles = [];
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.successLine('All flagged files cleared'));
    } else {
      // Clear specific pattern
      const before = session.flaggedFiles?.length || 0;
      const upperPattern = pattern.toUpperCase();
      session.flaggedFiles = (session.flaggedFiles || []).filter(f =>
        !f.filename.toUpperCase().includes(upperPattern)
      );
      const removed = before - (session.flaggedFiles?.length || 0);
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.successLine(`Cleared ${removed} file(s)`));
    }

    socket.emit('ansi-output', '\r\n');
    showFlaggedFiles(socket, session);
    promptForFlagInput(socket, session);
    return;
  }

  // Add files matching pattern - express.e:12638-12661
  await flagFiles(socket, session, trimmed);

  // Show updated list and prompt again
  socket.emit('ansi-output', '\r\n');
  showFlaggedFiles(socket, session);
  promptForFlagInput(socket, session);
}

/**
 * Flag files matching pattern - express.e:12594+ flagFiles()
 */
async function flagFiles(socket: any, session: BBSSession, pattern: string): Promise<void> {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize(`Searching for: ${pattern}`, 'cyan') + '\r\n');

  // Convert wildcards: * -> SQL %, ? -> SQL _
  const sqlPattern = pattern.toUpperCase().replace(/\*/g, '%').replace(/\?/g, '_');

  // Search for files in current conference
  const conferenceId = session.currentConf || 1;

  try {
    const query = `
      SELECT
        fe.id,
        fe.filename,
        fe.description,
        fe.size,
        fe.uploader,
        fe.uploaddate,
        fe.downloads,
        fa.name AS areaname,
        fa.id AS areaid
      FROM file_entries fe
      JOIN file_areas fa ON fe.areaid = fa.id
      WHERE fa.conferenceid = $1
        AND UPPER(fe.filename) LIKE $2
      ORDER BY fe.filename
    `;

    const result = await _db.query(query, [conferenceId, sqlPattern]);
    const files = result.rows;

    if (files.length === 0) {
      socket.emit('ansi-output', AnsiUtil.warningLine('No files found matching pattern'));
      return;
    }

    // Filter out files already flagged
    const alreadyFlagged = new Set((session.flaggedFiles || []).map(f => f.id));
    const newFiles = files.filter(f => !alreadyFlagged.has(f.id));

    if (newFiles.length === 0) {
      socket.emit('ansi-output', AnsiUtil.warningLine('All matching files already flagged'));
      return;
    }

    // Add to flagged list
    session.flaggedFiles = (session.flaggedFiles || []).concat(newFiles);

    socket.emit('ansi-output', AnsiUtil.successLine(`Flagged ${newFiles.length} file(s)`));

    // Show flagged files
    newFiles.forEach(file => {
      socket.emit('ansi-output',
        `  ${AnsiUtil.colorize(file.filename.padEnd(20), 'white')} ` +
        `${AnsiUtil.colorize(formatFileSize(file.size).padStart(10), 'cyan')}\r\n`
      );
    });
  } catch (error) {
    console.error('[flagFiles] Error:', error);
    socket.emit('ansi-output', AnsiUtil.errorLine('Error searching for files'));
  }
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
export async function handleFileStatusCommand(socket: any, session: BBSSession): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.CONFERENCE_ACCOUNTING)) {
    ErrorHandler.permissionDenied(socket, 'view file statistics', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  await displayFileStatus(socket, session);
}

/**
 * Display file status - express.e:24141-24187 fileStatus()
 */
async function displayFileStatus(socket: any, session: BBSSession): Promise<void> {
  const conferenceId = session.currentConf || 1;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('File Statistics'));
  socket.emit('ansi-output', '\r\n');

  // Get conference file statistics
  const stats = await _db.getFileStatisticsByConference(conferenceId);

  // Get user statistics
  const user = session.user;
  const userUploads = user?.uploads || 0;
  const userDownloads = user?.downloads || 0;
  const userBytesUp = user?.bytesUpload || 0;
  const userBytesDown = user?.bytesDownload || 0;
  const userRatio = user?.ratio || 0;
  const userRatioType = user?.ratioType || 0;

  // Display header - express.e:24148-24153
  socket.emit('ansi-output', AnsiUtil.colorize('              Uploads                 Downloads', 'green') + '\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('    Section   Files    Bytes          Files    Bytes          Ratio', 'green') + '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('    -------   -------  -------------- -------  -------------- -----', 'white') + '\r\n');

  // Display user statistics - express.e:24157-24177
  const filesUp = String(userUploads).padStart(7);
  const bytesUp = formatBytes(userBytesUp).padStart(14);
  const filesDown = String(userDownloads).padStart(7);
  const bytesDown = formatBytes(userBytesDown).padStart(14);
  const ratio = userRatio > 0 ? `${userRatio}:1` : 'DSBLD';

  socket.emit('ansi-output',
    AnsiUtil.colorize('    User    ', 'yellow') +
    AnsiUtil.colorize(`  ${filesUp}  `, 'white') +
    AnsiUtil.colorize(`${bytesUp} `, 'white') +
    AnsiUtil.colorize(`${filesDown}  `, 'white') +
    AnsiUtil.colorize(`${bytesDown} `, 'white') +
    AnsiUtil.colorize(`${ratio.padStart(5)}`, userRatio > 0 ? 'white' : 'red') +
    '\r\n'
  );

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Conference File Area Statistics:', 'cyan') + '\r\n');
  socket.emit('ansi-output', '\r\n');

  // Display conference statistics
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('Total Files:', 'white')} ${AnsiUtil.colorize(String(stats.totalFiles), 'yellow')}\r\n`);
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('Total Bytes:', 'white')} ${AnsiUtil.colorize(formatBytes(stats.totalBytes), 'yellow')}\r\n`);
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('Total Downloads:', 'white')} ${AnsiUtil.colorize(String(stats.totalDownloads), 'yellow')}\r\n`);

  // Calculate average file size
  const avgFileSize = stats.totalFiles > 0 ? Math.round(stats.totalBytes / stats.totalFiles) : 0;
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('Average File Size:', 'white')} ${AnsiUtil.colorize(formatBytes(avgFileSize), 'yellow')}\r\n`);

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Format bytes for display
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
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
