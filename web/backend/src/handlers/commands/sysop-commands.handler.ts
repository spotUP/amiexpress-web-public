/**
 * Sysop Commands Handler
 * Handles sysop-only numbered commands (0-5)
 * 1:1 port from AmiExpress express.e commands
 */

import { BBSSession, LoggedOnSubState } from '../../index';
import { Database } from '../../database';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { EnvStat } from '../../constants/env-codes';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { startEditAccounts } from '../user/user-editor.handler';

// Dependencies (injected)
let _getRecentCallerActivity: any;
let _setEnvStat: any;
let _db: Database;

/**
 * Dependency injection setter
 */
export function setSysopCommandsDependencies(deps: {
  getRecentCallerActivity: any;
  setEnvStat: any;
  db: Database;
}) {
  _getRecentCallerActivity = deps.getRecentCallerActivity;
  _setEnvStat = deps.setEnvStat;
  _db = deps.db;
}

/**
 * Command 0: Remote Shell (internalCommand0)
 * Original: express.e:24424-24451
 *
 * Provides remote shell access for sysop operations.
 * In the original AmiExpress, this gave sysops AmigaDOS shell access.
 * Web version: Not applicable, stubbed with explanation.
 */
// WEB_: express.e:24424-24451 — AmigaShell (remoteShell) not available in web environment; stubbed with informational message
export function handleRemoteShellCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:24428
  if (!checkSecurity(session.user, ACSPermission.REMOTE_SHELL)) {
    ErrorHandler.permissionDenied(socket, 'access remote shell', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:24431
  _setEnvStat(session, EnvStat.SHELL);

console.log('[ENV] Shell');

  // express.e:24424-24451 internalCommand0 - no header, prompts for password then runs shell
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
export async function handleAccountEditingCommand(socket: any, session: BBSSession): Promise<void> {
  // Check security - express.e:24454
  if (!checkSecurity(session.user, ACSPermission.ACCOUNT_EDITING)) {
    ErrorHandler.permissionDenied(socket, 'edit accounts', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

console.log('[ENV] Sysop');

  // Log activity - express.e:24457
  const { callersLogManager } = require('../../services/CallersLogManager');
  callersLogManager.logActivity(session.nodeId || 1, '\tAccount editing.\n');

  // express.e:24458 editAccounts(FALSE) - it reads its own keys until the sysop leaves.
  startEditAccounts(socket, session);
}

/**
 * Command 2: View Callers Log (internalCommand2)
 * Original: express.e:24461-24509
 *
 * Displays caller activity logs for sysop review.
 * In multi-node systems, allows selecting which node's log to view.
 */
export async function handleCallersLogCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // Check security - express.e:24464
  if (!checkSecurity(session.user, ACSPermission.LIST_NODES)) {
    ErrorHandler.permissionDenied(socket, 'view callers log', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Set environment status - express.e:24468
  _setEnvStat(session, EnvStat.SYSOP);

console.log('[ENV] Sysop');

  // express.e:24469 - aePuts('\b\n')
  socket.emit('ansi-output', '\r\n');

  /**
   * express.e:24473-24507 - which node's log?
   *
   * The note that used to sit here said this deployment is "single-node and
   * logs go to the database, not per-node flat files", so the node-selection
   * loop was replaced by a flat query. Both halves of that are wrong: the
   * board writes Node{N}/CallersLog through CallersLogManager on every login,
   * logoff, upload and download, and those files are what a real AmiExpress
   * and every door read. The sysop could see a database summary and never the
   * log the board actually keeps.
   *
   * `CL <n>` goes straight to that node, as express does with a parameter.
   */
  const { callersLogManager } = require('../../services/CallersLogManager');
  const available = callersLogManager.availableLogs();

  const requested = params.trim().split(/\s+/)[0];
  if (requested && /^\d+$/.test(requested)) {
    await displayNodeCallersLog(socket, session, Number.parseInt(requested, 10));
    return;
  }

  // express.e:24479-24487 lists the nodes that have a Callerslog (none, when none
  // exist), then 24489 always asks - there is no database fallback in express.
  for (const entry of available) {
    socket.emit('ansi-output', `${entry.nodeId} - Callerslog for Node ${entry.nodeId}\r\n`);
  }
  socket.emit('ansi-output', '\r\nWhich node to view? ');
  session.subState = LoggedOnSubState.CALLERSLOG_NODE_INPUT;
}

/**
 * Command 3: Edit Directory Files (internalCommand3)
 * Original: express.e:24511-24515
 *
 * Allows sysops to edit file directory listings using MicroEmacs.
 * In AmiExpress, this edited the file directory database files.
 * Web version: Not applicable, stubbed with explanation.
 */
// WEB_: express.e:24511-24515 — editDirFile (MicroEmacs) not applicable; web uses database-backed file management
export function handleEditDirectoryFilesCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Set environment status - express.e:24512
  _setEnvStat(session, EnvStat.EMACS);

  // Check security - express.e:24513
  if (!checkSecurity(session.user, ACSPermission.EDIT_DIRS)) {
    ErrorHandler.permissionDenied(socket, 'edit directory files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

console.log('[ENV] Emacs');

  // express.e:24511-24515 - no header, calls editDirFile directly
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
// WEB_: express.e:24517-24521 — editAnyFile (MicroEmacs) not applicable; blocked for security in web environment
export function handleEditAnyFileCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Set environment status - express.e:24518
  _setEnvStat(session, EnvStat.EMACS);

  // Check security - express.e:24519
  if (!checkSecurity(session.user, ACSPermission.EDIT_FILES)) {
    ErrorHandler.permissionDenied(socket, 'edit files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

console.log('[ENV] Emacs');

  // express.e:24517-24521 - no header, calls editAnyFile directly
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
// WEB_: express.e:24523-24527 — myDirAnyWhere (AmigaDOS navigation) not applicable; blocked for security in web environment
export function handleChangeDirectoryCommand(socket: any, session: BBSSession, params: string = ''): void {
  // Set environment status - express.e:24524
  _setEnvStat(session, EnvStat.SYSOP);

  // Check security - express.e:24525
  if (!checkSecurity(session.user, ACSPermission.SYSOP_COMMANDS)) {
    ErrorHandler.permissionDenied(socket, 'navigate filesystem', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

console.log('[ENV] Sysop');

  // express.e:24523-24527 - no header, calls myDirAnyWhere directly
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

/**
 * Show one node's CallersLog, or express's refusal.
 *
 * express.e:24498-24506: it re-opens the file, echoes the same
 * `<n> - Callerslog for Node <n>` header it listed, then displays it; a node
 * with no log gets "Not a valid node!".
 *
 * The file holds Amiga text, so it is read as latin1: reading it as UTF-8
 * turns every high-bit byte into U+FFFD.
 */
export async function displayNodeCallersLog(
  socket: any,
  session: BBSSession,
  nodeId: number,
): Promise<void> {
  const fs = require('fs');
  const { callersLogManager } = require('../../services/CallersLogManager');
  const logPath = callersLogManager.logPathFor(nodeId);

  if (!fs.existsSync(logPath)) {
    socket.emit('ansi-output', '\r\nNot a valid node!\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = true;
    return;
  }

  socket.emit('ansi-output', `${nodeId} - Callerslog for Node ${nodeId}\r\n`);
  try {
    const text = fs.readFileSync(logPath, 'latin1');
    socket.emit('ansi-output', text.replace(/\r?\n/g, '\r\n'));
  } catch (err) {
    // express.e:9067 displayCallersLog prints nothing when the file will not open.
    console.error('[CL] could not read the callers log:', err);
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.menuPause = true;
}

/** The answer to "Which node to view?" (express.e:24490-24495). */
export async function handleCallersLogNodeInput(
  socket: any,
  session: BBSSession,
  input: string,
): Promise<void> {
  const answer = input.trim();
  socket.emit('ansi-output', '\r\n');

  // express.e:24491 - an empty answer prints a line break and returns.
  if (answer.length === 0) {
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.menuPause = true;
    return;
  }

  await displayNodeCallersLog(socket, session, Number.parseInt(answer, 10));
}
