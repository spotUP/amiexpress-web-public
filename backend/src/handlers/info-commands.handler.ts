/**
 * User Information Commands Handler
 *
 * Implements user and system information commands as 1:1 ports from express.e:
 * - VER (Version Info) - Display BBS version information - express.e:25688-25699
 * - WHO (Who's Online) - List online users - express.e:26094-26103
 * - WHD (Who's Online Detailed) - Detailed online user listing - express.e:26104-26112
 * - W (Write User Parameters) - Edit user configuration - express.e:25712-25785+
 */

import { LoggedOnSubState, BBSState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Types
interface BBSSession {
  user?: any;
  state: string;
  subState: string;
  currentConfName?: string;
  lastActivity: number;
  quietNode?: boolean;
  menuPause?: boolean;
  tempData?: any;
  [key: string]: any;
}

// Dependencies injected from index.ts
let _sessions: Map<string, BBSSession>;

/**
 * Set dependencies for info commands (called from index.ts)
 */
export function setInfoCommandsDependencies(deps: {
  sessions: Map<string, BBSSession>;
}) {
  _sessions = deps.sessions;
}

/**
 * VER Command - Display Version Information
 *
 * From express.e:25688-25699 (internalCommandVER)
 *
 * Original AmiExpress: Displays version string, copyright, and registration key
 * Web version: Shows web implementation details and compatibility info
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleVersionCommand(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('AmiExpress Web Version Information'));
  socket.emit('ansi-output', '\r\n');

  // Version string (like express.e:25691)
  socket.emit('ansi-output', AnsiUtil.colorize('AmiExpress Web v5.6.0', 'cyan'));
  socket.emit('ansi-output', ' (2025-10-23)\r\n');
  socket.emit('ansi-output', 'Modern web implementation of the classic AmiExpress BBS\r\n');
  socket.emit('ansi-output', '\r\n');

  // Original version attribution (like express.e:25693-25694)
  socket.emit('ansi-output', AnsiUtil.colorize('Original Version:', 'yellow'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  (C)1989-91 Mike Thomas, Synthetic Technologies\r\n');
  socket.emit('ansi-output', '  (C)1992-95 Joe Hodge, LightSpeed Technologies Inc.\r\n');
  socket.emit('ansi-output', '\r\n');

  // Web implementation details
  socket.emit('ansi-output', AnsiUtil.colorize('Built with:', 'yellow'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Node.js/TypeScript backend\r\n');
  socket.emit('ansi-output', '  - React frontend\r\n');
  socket.emit('ansi-output', '  - PostgreSQL database\r\n');
  socket.emit('ansi-output', '  - Socket.io real-time communication\r\n');
  socket.emit('ansi-output', '  - xterm.js terminal emulation\r\n');
  socket.emit('ansi-output', '\r\n');

  // Features
  socket.emit('ansi-output', AnsiUtil.colorize('Features:', 'yellow'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '  - Compatible with AmiExpress v5.6.0 commands\r\n');
  socket.emit('ansi-output', '  - WebSocket-based file transfers\r\n');
  socket.emit('ansi-output', '  - Real-time chat and messaging\r\n');
  socket.emit('ansi-output', '  - QWK/FTN mail support\r\n');
  socket.emit('ansi-output', '\r\n');

  // Registration (like express.e:25697)
  socket.emit('ansi-output', AnsiUtil.colorize('Registered to: Open Source Community', 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * WHO Command - Who's Online
 *
 * From express.e:26094-26103 (internalCommandWHO)
 *
 * Original: Calls who(0) to show online users
 * Requires ACS_WHO_IS_ONLINE permission
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleWhoCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:26095
  if (!checkSecurity(session.user, ACSPermission.WHO_IS_ONLINE)) {
    ErrorHandler.permissionDenied(socket, 'view who is online', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Doors');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Online Users (WHO)'));
  socket.emit('ansi-output', '\r\n');

  // Get all online users - express.e:26097 calls who(0)
  const allOnlineUsers = Array.from(_sessions.values())
    .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
    .map(sess => ({
      username: sess.user!.username,
      realname: sess.user!.realname || 'Unknown',
      conference: sess.currentConfName || 'General',
      idle: Math.floor((Date.now() - sess.lastActivity) / 60000),
      node: sess.nodeId ? `Node ${sess.nodeId}` : 'Web1', // Virtual node number
      quiet: sess.user!.quietNode || false
    }));

  if (allOnlineUsers.length === 0) {
    socket.emit('ansi-output', 'No users currently online.\r\n');
  } else {
    // Column headers
    socket.emit('ansi-output', AnsiUtil.colorize('User Name'.padEnd(16), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Real Name'.padEnd(20), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Conference'.padEnd(15), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Idle  Node', 'cyan'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '='.repeat(75) + '\r\n');

    // User list
    allOnlineUsers.forEach(userInfo => {
      // Respect quiet mode - sysops can see all users (express.e who() function logic)
      if (!userInfo.quiet || session.user?.secLevel === 255) {
        const idleStr = userInfo.idle > 0 ? userInfo.idle.toString().padStart(4) : '    ';
        const quietIndicator = userInfo.quiet ? AnsiUtil.colorize(' (Q)', 'yellow') : '';

        socket.emit('ansi-output',
          userInfo.username.padEnd(16) +
          userInfo.realname.padEnd(20) +
          userInfo.conference.padEnd(15) +
          idleStr + '  ' +
          userInfo.node + quietIndicator + '\r\n'
        );
      }
    });
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * WHD Command - Who's Online (Detailed)
 *
 * From express.e:26104-26112 (internalCommandWHD)
 *
 * Original: Calls who(1) to show detailed online user information
 * Requires ACS_WHO_IS_ONLINE permission
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleWhoDetailedCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:26105
  if (!checkSecurity(session.user, ACSPermission.WHO_IS_ONLINE)) {
    ErrorHandler.permissionDenied(socket, 'view who is online', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Doors');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Online Users (Detailed)'));
  socket.emit('ansi-output', '\r\n');

  // Get all online users with detailed status - express.e:26107 calls who(1)
  const detailedOnlineUsers = Array.from(_sessions.values())
    .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
    .map(sess => ({
      username: sess.user!.username,
      realname: sess.user!.realname || 'Unknown',
      conference: sess.currentConfName || 'General',
      idle: Math.floor((Date.now() - sess.lastActivity) / 60000),
      node: sess.nodeId ? `Node ${sess.nodeId}` : 'Web1', // Virtual node number
      quiet: sess.user!.quietNode || false,
      subState: sess.subState || 'UNKNOWN',
      // Determine activity based on substate
      activity: _getActivityFromSubState(sess.subState)
    }));

  if (detailedOnlineUsers.length === 0) {
    socket.emit('ansi-output', 'No users currently online.\r\n');
  } else {
    // Column headers (detailed view includes activity)
    socket.emit('ansi-output', AnsiUtil.colorize('User Name'.padEnd(16), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Real Name'.padEnd(20), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Activity'.padEnd(20), 'cyan'));
    socket.emit('ansi-output', AnsiUtil.colorize('Node', 'cyan'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', '='.repeat(75) + '\r\n');

    // Detailed user list
    detailedOnlineUsers.forEach(userInfo => {
      // Respect quiet mode
      if (!userInfo.quiet || session.user?.secLevel === 255) {
        const quietIndicator = userInfo.quiet ? AnsiUtil.colorize(' (Q)', 'yellow') : '';

        socket.emit('ansi-output',
          userInfo.username.padEnd(16) +
          userInfo.realname.padEnd(20) +
          userInfo.activity.padEnd(20) +
          userInfo.node + quietIndicator + '\r\n'
        );
      }
    });
  }

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}

/**
 * W Command - Write User Parameters
 *
 * From express.e:25712-25785+ (internalCommandW)
 *
 * Original: Full-screen interactive menu for editing user configuration
 * Allows editing: name, email, location, password, screen settings, etc.
 * Requires ACS_EDIT_USER_INFO permission
 *
 * @param socket - Socket.IO socket
 * @param session - Current BBS session
 */
export function handleWriteUserParamsCommand(socket: any, session: BBSSession): void {
  // Check security - express.e:25717
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_INFO)) {
    ErrorHandler.permissionDenied(socket, 'edit user information', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Stats');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('USER CONFIGURATION'));
  socket.emit('ansi-output', '\r\n');

  const currentUser = session.user!;

  // Display user parameters menu (express.e:25727-25773)
  // Note: express.e checks individual ACS permissions for each field
  // For simplicity, web version shows all fields (permission already checked above)

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  0');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('LOGIN NAME.............. ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.username, 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  1');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('EMAIL ADDRESS........... ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.email || 'Not set', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  2');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('REAL NAME............... ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.realname || 'Not set', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  3');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('INTERNET NAME........... ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.username.toLowerCase(), 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  4');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('LOCATION................ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.location || 'Not set', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  5');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('PHONE NUMBER............ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.phone || 'Not set', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  6');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('PASSWORD................ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize('ENCRYPTED', 'cyan'));
  socket.emit('ansi-output', '\r\n');

  const linesPerScreen = currentUser.linesPerScreen || 'Auto';
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  7');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('LINES PER SCREEN........ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(linesPerScreen.toString(), 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  8');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('COMPUTER................ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.computer || 'Unknown', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  9');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('SCREEN TYPE............. ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.screenType || 'Web Terminal', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 10');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('SCREEN CLEAR............ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.ansi ? 'Yes' : 'No', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 11');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('TRANSFER PROTOCOL....... ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize('WebSocket', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 12');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('EDITOR TYPE............. ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize('Prompt', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 13');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('ZOOM TYPE............... ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize('QWK', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 14');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('AVAILABLE FOR CHAT/OLM.. ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.availableForChat ? 'Yes' : 'No', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.complexPrompt([
    { text: 'Which to change ', color: 'white' },
    { text: '<CR>=QUIT', color: 'cyan' },
    { text: ' ? ', color: 'white' }
  ]));

  // Wait for input (express.e has interactive loop at 25720)
  session.subState = LoggedOnSubState.FILE_DIR_SELECT;
  session.tempData = { userParameters: true };
}

/**
 * Helper: Determine user activity from substate
 */
function _getActivityFromSubState(subState: string): string {
  // Map substates to human-readable activities
  const activityMap: { [key: string]: string } = {
    'DISPLAY_MENU': 'Main Menu',
    'DISPLAY_CONF_BULL': 'Reading Bulletin',
    'READ_COMMAND': 'Command Input',
    'READ_SHORTCUTS': 'Command Input',
    'POST_MESSAGE_SUBJECT': 'Posting Message',
    'CONFERENCE_SELECT': 'Joining Conference',
    'FILE_LIST': 'Browsing Files',
    'FILE_AREA_SELECT': 'File Area Select',
    'DOOR_RUNNING': 'Running Door',
    'CHAT_MODE': 'Chatting',
    'UNKNOWN': 'Idle'
  };

  return activityMap[subState] || 'Active';
}
