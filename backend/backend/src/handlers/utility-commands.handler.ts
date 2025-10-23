/**
 * Utility Commands Handler
 *
 * Implements miscellaneous utility commands as 1:1 ports from express.e:
 * - RL (Relogon) - Disconnect and return to login - express.e:25534-25539
 * - V (View File) - View a text file - express.e:25675-25687
 * - VS (View Statistics) - Alias for V command - express.e:28376
 * - Z (Zippy Search) - Search file descriptions - express.e:26123-26213
 * - ZOOM (Zoo Mail) - Download offline mail package - express.e:26215-26240
 * - ^ (Help Files) - View help files - express.e:25089-25111
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
  subState: string;
  menuPause?: boolean;
  tempData?: any;
  relogon?: boolean;
  [key: string]: any;
}

// Dependencies injected from index.ts
let _handleGoodbyeCommand: (socket: any, session: BBSSession, params?: string) => void;
let _messages: any[] = [];
let _confScreenDir: string;
let _findSecurityScreen: (basePath: string, secLevel: number) => string | null;
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => boolean;
let _searchFileDescriptions: (searchPattern: string, conferenceId: number) => Promise<any[]>;

/**
 * Set dependencies for utility commands (called from index.ts)
 */
export function setUtilityCommandsDependencies(deps: {
  handleGoodbyeCommand: typeof _handleGoodbyeCommand;
  messages: any[];
  confScreenDir: string;
  findSecurityScreen: typeof _findSecurityScreen;
  displayScreen: typeof _displayScreen;
  searchFileDescriptions: typeof _searchFileDescriptions;
}) {
  _handleGoodbyeCommand = deps.handleGoodbyeCommand;
  _messages = deps.messages;
  _confScreenDir = deps.confScreenDir;
  _findSecurityScreen = deps.findSecurityScreen;
  _displayScreen = deps.displayScreen;
  _searchFileDescriptions = deps.searchFileDescriptions;
}

/**
 * RL Command - Relogon
 *
 * From express.e:25534-25539 (internalCommandRL)
 *
 * Original: Sets relogon=TRUE and calls goodbye command (internalCommandG)
 * Effect: Disconnects user and returns them to login prompt
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Optional parameters to pass to goodbye command
 */
export function handleRelogonCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Check security - express.e:25535
  if (!checkSecurity(session.user, ACSPermission.RELOGON)) {
    ErrorHandler.permissionDenied(socket, 'relogon', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Relogon'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'This will disconnect you and return you to the login prompt.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Are you sure you want to relogon? ', color: 'white' },
    { text: '(Y/N)', color: 'cyan' },
    { text: ': ', color: 'white' }
  ]));

  // Wait for confirmation
  session.subState = 'RL_CONFIRM';
  session.tempData = { relogonCommand: true, params };
}

/**
 * Handle RL confirmation input
 */
export function handleRelogonConfirm(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();

  if (answer === 'Y' || answer === 'YES') {
    // Set relogon flag and call goodbye - express.e:25536-25537
    session.relogon = true;
    _handleGoodbyeCommand(socket, session, session.tempData?.params || '');
  } else {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Relogon cancelled.\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
  }

  delete session.tempData;
}

/**
 * V Command - View a Text File
 *
 * From express.e:25675-25687 (internalCommandV)
 *
 * Original: Prompts for filename and displays it
 * Uses viewAFile() function to handle file viewing
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Optional filename parameter
 */
export function handleViewFileCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Check security - express.e:25676
  if (!checkSecurity(session.user, ACSPermission.VIEW_A_FILE)) {
    ErrorHandler.permissionDenied(socket, 'view files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Viewing');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('View Text File'));
  socket.emit('ansi-output', '\r\n');

  // If params provided, try to view file immediately
  if (params.trim()) {
    _viewFile(socket, session, params.trim());
    return;
  }

  // Prompt for filename - express.e uses viewAFile() which prompts
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Enter filename to view ', color: 'white' },
    { text: '(or press Enter to cancel)', color: 'cyan' },
    { text: ': ', color: 'white' }
  ]));

  session.subState = 'VIEW_FILE_INPUT';
  session.tempData = { viewFileCommand: true };
}

/**
 * Handle V command input
 */
export function handleViewFileInput(socket: any, session: BBSSession, input: string): void {
  const filename = input.trim();

  socket.emit('ansi-output', '\r\n');

  if (!filename) {
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    delete session.tempData;
    return;
  }

  _viewFile(socket, session, filename);
  delete session.tempData;
}

/**
 * Internal: View a file
 */
function _viewFile(socket: any, session: BBSSession, filename: string): void {
  // Try to find file in various locations
  // Original AmiExpress searches BBS:TEXT/ directory
  const textDir = path.join(_confScreenDir, '..', 'TEXT');
  const filePath = path.join(textDir, filename);

  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', content);
      socket.emit('ansi-output', '\r\n');
    } catch (error) {
      socket.emit('ansi-output', AnsiUtil.errorLine(`Error reading file: ${filename}`));
    }
  } else {
    socket.emit('ansi-output', AnsiUtil.errorLine(`File not found: ${filename}`));
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Z Command - Zippy Text Search
 *
 * From express.e:26123-26213 (internalCommandZ)
 *
 * Original: Searches file descriptions for text pattern
 * Can search specific directories or all directories
 * Supports NS (non-stop display) flag
 *
 * Web implementation: Stubbed (requires file database)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Search pattern and optional directory range
 */
export async function handleZippySearchCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // Check security - express.e:26126
  if (!checkSecurity(session.user, ACSPermission.ZIPPY_TEXT_SEARCH)) {
    ErrorHandler.permissionDenied(socket, 'search file descriptions', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Files');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Zippy Text Search'));
  socket.emit('ansi-output', '\r\n');

  // Parse params - express.e:26134-26137
  const parsedParams = ParamsUtil.parse(params);

  if (parsedParams.length > 0) {
    const searchPattern = parsedParams[0].toUpperCase();
    const dirRange = parsedParams.length > 1 ? parsedParams[1] : 'A';
    const nonStop = ParamsUtil.hasFlag(parsedParams, 'NS');

    socket.emit('ansi-output', AnsiUtil.colorize(`Searching for: `, 'cyan'));
    socket.emit('ansi-output', `${searchPattern}\r\n`);
    socket.emit('ansi-output', '\r\n');

    // Perform database search - express.e:26151-26165 (zippy function call)
    try {
      const results = await _searchFileDescriptions(searchPattern, session.currentConf || 0);

      if (results.length === 0) {
        socket.emit('ansi-output', AnsiUtil.warningLine('No files found matching your search'));
        socket.emit('ansi-output', '\r\n');
      } else {
        socket.emit('ansi-output', AnsiUtil.successLine(`Found ${results.length} file(s)`));
        socket.emit('ansi-output', '\r\n');

        // Display results - express.e:26165-26200 (zippy display logic)
        results.forEach((file: any, index: number) => {
          socket.emit('ansi-output', AnsiUtil.colorize(`[${index + 1}] `, 'yellow'));
          socket.emit('ansi-output', AnsiUtil.colorize(file.filename, 'green'));
          socket.emit('ansi-output', AnsiUtil.colorize(` (${formatFileSize(file.size)})`, 'cyan'));
          socket.emit('ansi-output', '\r\n');

          if (file.description) {
            socket.emit('ansi-output', `    ${file.description}\r\n`);
          }

          socket.emit('ansi-output', AnsiUtil.colorize(`    Area: `, 'white'));
          socket.emit('ansi-output', `${file.areaname || 'Unknown'}\r\n`);
          socket.emit('ansi-output', AnsiUtil.colorize(`    Uploaded by: `, 'white'));
          socket.emit('ansi-output', `${file.uploader} on ${formatDate(file.uploaddate)}\r\n`);
          socket.emit('ansi-output', AnsiUtil.colorize(`    Downloads: `, 'white'));
          socket.emit('ansi-output', `${file.downloads}\r\n`);
          socket.emit('ansi-output', '\r\n');

          // Pause after each page if not in non-stop mode - express.e:26192-26197
          if (!nonStop && (index + 1) % 5 === 0 && (index + 1) < results.length) {
            socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
            // Note: In a real implementation, would need to pause here
          }
        });
      }
    } catch (error) {
      console.error('[Z Command] Database error:', error);
      socket.emit('ansi-output', AnsiUtil.errorLine('An error occurred during search'));
      socket.emit('ansi-output', '\r\n');
    }

    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // No params - prompt for search pattern - express.e:26142
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Enter string to search for ', color: 'white' },
    { text: '(or press Enter to cancel)', color: 'cyan' },
    { text: ': ', color: 'white' }
  ]));

  session.subState = 'ZIPPY_SEARCH_INPUT';
  session.tempData = { zippySearchCommand: true };
}

/**
 * Format file size for display
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: '2-digit'
  });
}

/**
 * Handle Z command input
 */
export function handleZippySearchInput(socket: any, session: BBSSession, input: string): void {
  const searchPattern = input.trim();

  socket.emit('ansi-output', '\r\n');

  if (!searchPattern) {
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    delete session.tempData;
    return;
  }

  // Recursively call with params
  handleZippySearchCommand(socket, session, searchPattern);
  delete session.tempData;
}

/**
 * ZOOM Command - Zoo Mail (Offline Mail)
 *
 * From express.e:26215-26240 (internalCommandZOOM)
 *
 * Original: Downloads messages in QWK or ASCII format for offline reading
 * Uses qwkZoom() or asciiZoom() based on user preference
 *
 * Web implementation: Partially stubbed (QWK generation requires implementation)
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleZoomCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:26221
  if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
    ErrorHandler.permissionDenied(socket, 'download offline mail', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Zoom');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Zoo Mail (QWK/FTN Download)'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Download your messages in offline format.\r\n');
  socket.emit('ansi-output', '\r\n');

  // Check if user has any unread messages
  const unreadMessages = _messages.filter(msg =>
    msg.timestamp > (session.user?.lastLogin || new Date(0)) &&
    (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
  );

  if (unreadMessages.length === 0) {
    socket.emit('ansi-output', 'No unread messages to download.\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  socket.emit('ansi-output', AnsiUtil.colorize(`You have ${unreadMessages.length} unread message(s).`, 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');

  // Show format options based on user's zoom type - express.e:26227-26233
  socket.emit('ansi-output', AnsiUtil.colorize('Available formats:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '1. QWK format (standard)\r\n');
  socket.emit('ansi-output', '2. ASCII text format\r\n');
  socket.emit('ansi-output', '\r\n');

  // TODO: Implement qwkZoom() and asciiZoom() functions
  socket.emit('ansi-output', AnsiUtil.warningLine('Offline mail download not yet implemented'));
  socket.emit('ansi-output', 'This requires QWK/FTN mail packet generation.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * ^ Command - Help Files
 *
 * From express.e:25089-25111 (internalCommandUpHat)
 *
 * Original: Progressive search for help files
 * Searches BBS:Help/ directory for files matching pattern
 * If not found, removes last character and searches again
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 * @param params - Help topic to search for
 */
export function handleHelpFilesCommand(socket: any, session: BBSSession, params: string = ''): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Help File Viewer'));
  socket.emit('ansi-output', '\r\n');

  if (!params.trim()) {
    socket.emit('ansi-output', 'Usage: ^ <topic>\r\n');
    socket.emit('ansi-output', 'Example: ^upload (shows help on uploading files)\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.menuPause = false;
    session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
    return;
  }

  // Progressive search - express.e:25091-25109
  let searchTerm = params.trim();
  let foundFile: string | null = null;

  // Try to find help file - keeps removing last character until found
  while (searchTerm.length > 0) {
    const helpBasePath = path.join('help', searchTerm);
    foundFile = _findSecurityScreen(helpBasePath, session.user?.secLevel || 0);

    if (foundFile) {
      break;
    }

    // Remove last character and try again - express.e:25106
    searchTerm = searchTerm.slice(0, -1);
  }

  if (foundFile) {
    // Display the help file - express.e:25098-25100
    socket.emit('ansi-output', AnsiUtil.colorize(`Help topic: `, 'cyan'));
    socket.emit('ansi-output', `${searchTerm}\r\n\r\n`);

    _displayScreen(socket, session, foundFile);

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  } else {
    socket.emit('ansi-output', AnsiUtil.errorLine(`No help available for: ${params}`));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Try a different topic or use H for general help.\r\n');
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  }

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}
