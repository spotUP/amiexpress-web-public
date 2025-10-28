/**
 * Sysop Commands Handler
 * Handles sysop-only numbered commands (0-5)
 * 1:1 port from AmiExpress express.e commands
 */

import { BBSSession, LoggedOnSubState } from '../index';
import { checkSecurity } from '../utils/acs.util';
import { ACSCode } from '../constants/acs-codes';
import { EnvStat } from '../constants/env-codes';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Dependencies (injected)
let _getRecentCallerActivity: any;
let _setEnvStat: any;
let _displayAccountEditingMenu: any;

/**
 * Dependency injection setter
 */
export function setSysopCommandsDependencies(deps: {
  getRecentCallerActivity: any;
  setEnvStat: any;
  displayAccountEditingMenu: any;
}) {
  _getRecentCallerActivity = deps.getRecentCallerActivity;
  _setEnvStat = deps.setEnvStat;
  _displayAccountEditingMenu = deps.displayAccountEditingMenu;
}

/**
 * Command 0: Remote Shell (internalCommand0)
 * Original: express.e:24424-24451
 *
 * Provides remote shell access for sysop operations.
 * In the original AmiExpress, this gave sysops AmigaDOS shell access.
 * Web version: Not applicable, stubbed with explanation.
 */
export function handleRemoteShellCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:24428
  if (!checkSecurity(session, ACSCode.REMOTE_SHELL)) {
    ErrorHandler.permissionDenied(socket, 'access remote shell', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:24431
  _setEnvStat(session, EnvStat.SHELL);

  console.log('[ENV] Shell');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Remote Shell'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:24424-24451):
  // - Prompts for remote shell password if configured
  // - Validates password (express.e:24434-24443)
  // - Calls remoteShell() for AmigaDOS access
  // Web version: Not applicable

  socket.emit('ansi-output', AnsiUtil.colorize('Remote Shell - Original AmiExpress Feature', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This command provided AmigaDOS shell access in the original AmiExpress.\r\n');
  socket.emit('ansi-output', 'The web version does not support remote shell access.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Features in original:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Password-protected shell access\r\n');
  socket.emit('ansi-output', '  - Full AmigaDOS command execution\r\n');
  socket.emit('ansi-output', '  - Sysop system administration\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Command 1: Account Editing (internalCommand1)
 * Original: express.e:24453-24459
 *
 * Provides user account management for sysops.
 * Allows editing user accounts, security levels, flags, etc.
 */
export function handleAccountEditingCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:24454
  if (!checkSecurity(session, ACSCode.ACCOUNT_EDITING)) {
    ErrorHandler.permissionDenied(socket, 'edit accounts', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Sysop');

  // Log activity - express.e:24457
  // TODO: Add callersLog('\tAccount editing.\n')

  // Call account editing menu - express.e:24458
  _displayAccountEditingMenu(socket, session);
}

/**
 * Command 2: View Callers Log (internalCommand2)
 * Original: express.e:24461-24509
 *
 * Displays caller activity logs for sysop review.
 * In multi-node systems, allows selecting which node's log to view.
 * Web version: Single-node, shows recent caller activity from database.
 */
export async function handleCallersLogCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // Check security - express.e:24464
  if (!checkSecurity(session, ACSCode.LIST_NODES)) {
    ErrorHandler.permissionDenied(socket, 'view callers log', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:24468
  _setEnvStat(session, EnvStat.SYSOP);

  console.log('[ENV] Sysop');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Callers Log'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:24470-24509):
  // - Parses params to get node number
  // - If params provided, displays that node's log
  // - If no params, shows all nodes and prompts for selection
  // - Calls displayCallersLog(filename, nonStop)
  //
  // Web version: Single-node, so we just show recent activity

  socket.emit('ansi-output', 'Recent caller activity:\r\n');
  socket.emit('ansi-output', '\r\n');

  // Get recent caller activity from database (last 20 entries)
  const recentActivity = await _getRecentCallerActivity(20);

  if (recentActivity.length === 0) {
    socket.emit('ansi-output', 'No caller activity recorded yet.\r\n');
  } else {
    // Column headers
    socket.emit('ansi-output', AnsiUtil.colorize('Time'.padEnd(10), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('User'.padEnd(16), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Action', 'cyan'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '='.repeat(70) + '\r\n');

    // Activity list
    recentActivity.forEach((entry: any) => {
      const timestamp = new Date(entry.timestamp);
      const timeStr = timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const details = entry.details ? ` - ${entry.details}` : '';

      socket.emit('ansi-output',
        timeStr.padEnd(10) +
        entry.username.padEnd(16) +
        entry.action + details + '\r\n'
      );
    });
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * Command 3: Edit Directory Files (internalCommand3)
 * Original: express.e:24511-24515
 *
 * Allows sysops to edit file directory listings using MicroEmacs.
 * In AmiExpress, this edited the file directory database files.
 * Web version: Not applicable, stubbed with explanation.
 */
export function handleEditDirectoryFilesCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Set environment status - express.e:24512
  _setEnvStat(session, EnvStat.EMACS);

  // Check security - express.e:24513
  if (!checkSecurity(session, ACSCode.EDIT_DIRS)) {
    ErrorHandler.permissionDenied(socket, 'edit directory files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Emacs');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Edit Directory Files'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:24514):
  // - Calls editDirFile(params)
  // - Opens MicroEmacs to edit file directory database
  // - Allows editing file descriptions, dates, sizes, etc.
  // Web version: Not applicable

  socket.emit('ansi-output', AnsiUtil.colorize('Edit Directory Files - Original AmiExpress Feature', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This command edited file directory database files in the original AmiExpress.\r\n');
  socket.emit('ansi-output', 'The web version uses a database for file management.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Features in original:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - MicroEmacs-based directory file editor\r\n');
  socket.emit('ansi-output', '  - Edit file descriptions and metadata\r\n');
  socket.emit('ansi-output', '  - Bulk file database management\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Web version alternative:', 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Use FM (File Maintenance) command for file management\r\n');
  socket.emit('ansi-output', '  - Database-driven file administration\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Command 4: Edit Any File (internalCommand4)
 * Original: express.e:24517-24521
 *
 * Allows sysops to edit any text file on the system using MicroEmacs.
 * In AmiExpress, this provided full filesystem editing access.
 * Web version: Not applicable, stubbed with explanation.
 */
export function handleEditAnyFileCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Set environment status - express.e:24518
  _setEnvStat(session, EnvStat.EMACS);

  // Check security - express.e:24519
  if (!checkSecurity(session, ACSCode.EDIT_FILES)) {
    ErrorHandler.permissionDenied(socket, 'edit files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Emacs');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Edit Any File'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:24520):
  // - Calls editAnyFile(params)
  // - Opens MicroEmacs to edit any file
  // - Full filesystem access for sysops
  // Web version: Not applicable (security concern)

  socket.emit('ansi-output', AnsiUtil.colorize('Edit Any File - Original AmiExpress Feature', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This command provided MicroEmacs access to edit any file in the original AmiExpress.\r\n');
  socket.emit('ansi-output', 'The web version does not support filesystem editing for security reasons.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Features in original:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - MicroEmacs text editor\r\n');
  socket.emit('ansi-output', '  - Full filesystem access\r\n');
  socket.emit('ansi-output', '  - Edit any text file on the system\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Web version alternative:', 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Use administrative web interface for file management\r\n');
  socket.emit('ansi-output', '  - Database-driven content management\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Command 5: Change Directory / Navigate Filesystem (internalCommand5)
 * Original: express.e:24523-24527
 *
 * Allows sysops to navigate anywhere in the filesystem and execute programs.
 * In AmiExpress, this was "myDirAnyWhere" - full AmigaDOS navigation.
 * Web version: Not applicable, stubbed with explanation.
 */
export function handleChangeDirectoryCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Set environment status - express.e:24524
  _setEnvStat(session, EnvStat.SYSOP);

  // Check security - express.e:24525
  if (!checkSecurity(session, ACSCode.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'navigate filesystem', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Sysop');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Navigate Filesystem'));
  socket.emit('ansi-output', '\r\n');

  // Original AmiExpress (express.e:24526):
  // - Calls myDirAnyWhere(params)
  // - Allows changing to any directory
  // - Lists files and allows executing programs
  // - Full filesystem navigation for sysops
  // Web version: Not applicable (security concern)

  socket.emit('ansi-output', AnsiUtil.colorize('Navigate Filesystem - Original AmiExpress Feature', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', 'This command provided full filesystem navigation in the original AmiExpress.\r\n');
  socket.emit('ansi-output', 'The web version does not support filesystem navigation for security reasons.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Features in original:', 'cyan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Change to any directory on the system\r\n');
  socket.emit('ansi-output', '  - List directory contents (AmigaDOS LIST command)\r\n');
  socket.emit('ansi-output', '  - Execute programs from any location\r\n');
  socket.emit('ansi-output', '  - Full sysop filesystem access\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Web version alternative:', 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Use administrative web interface for system management\r\n');
  socket.emit('ansi-output', '  - Database-driven BBS administration\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}
