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
import { db } from '../database';
import bcrypt from 'bcryptjs';

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
/**
 * Helper: Display W command menu (express.e:25727-25773)
 */
function _displayWCommandMenu(socket: any, session: BBSSession): void {
  const currentUser = session.user!;

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('USER CONFIGURATION'));
  socket.emit('ansi-output', '\r\n');

  // Option 0: Login Name - express.e:25724-25728
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_NAME)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  0] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  0');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('LOGIN NAME.............. ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.username, 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 1: Email - express.e:25729-25733
  if (!checkSecurity(session.user, ACSPermission.EDIT_EMAIL)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  1] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  1');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('EMAIL ADDRESS........... ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.email || 'Not set', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 2: Real Name - express.e:25734-25738
  if (!checkSecurity(session.user, ACSPermission.EDIT_REAL_NAME)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  2] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  2');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('REAL NAME............... ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.realname || 'Not set', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 3: Internet Name - express.e:25739-25743
  if (!checkSecurity(session.user, ACSPermission.EDIT_INTERNET_NAME)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  3] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  3');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('INTERNET NAME........... ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.username.toLowerCase(), 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 4: Location - express.e:25744-25748
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_LOCATION)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  4] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  4');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('LOCATION................ ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.location || 'Not set', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 5: Phone - express.e:25749-25753
  if (!checkSecurity(session.user, ACSPermission.EDIT_PHONE_NUMBER)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  5] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  5');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('PHONE NUMBER............ ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.phone || 'Not set', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 6: Password - express.e:25754-25758
  if (!checkSecurity(session.user, ACSPermission.EDIT_PASSWORD)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[  6] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', '  6');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('PASSWORD................ ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize('ENCRYPTED', 'cyan'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 7: Lines Per Screen - express.e:25759-25760
  const linesPerScreen = currentUser.linesPerScreen || 'Auto';
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  7');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('LINES PER SCREEN........ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(linesPerScreen.toString(), 'yellow'));
  socket.emit('ansi-output', '\r\n');

  // Option 8: Computer - express.e:25761-25767
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  8');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('COMPUTER................ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.computer || 'Unknown', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  // Option 9: Screen Type - express.e:25768-25774
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', '  9');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('SCREEN TYPE............. ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.screenType || 'Web Terminal', 'yellow'));
  socket.emit('ansi-output', '\r\n');

  // Option 10: Screen Clear - express.e:25775-25779
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 10');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('SCREEN CLEAR............ ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize(currentUser.ansi ? 'YES' : 'NO', currentUser.ansi ? 'green' : 'white'));
  socket.emit('ansi-output', '\r\n');

  // Option 11: Transfer Protocol - express.e:25780-25790
  if (!checkSecurity(session.user, ACSPermission.XPR_SEND) && !checkSecurity(session.user, ACSPermission.XPR_RECEIVE)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[ 11] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', ' 11');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('TRANSFER PROTOCOL....... ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize('WebSocket', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 12: Editor Type - express.e:25791-25800
  if (!checkSecurity(session.user, ACSPermission.FULL_EDIT)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[ 12] [DISABLED]\r\n', 'red'));
  } else {
    const editorType = currentUser.editorType || 0;
    let editorName = 'PROMPT';
    if (editorType === 1) editorName = 'LINE EDITOR';
    else if (editorType === 2) editorName = 'FULLSCREEN EDITOR';

    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', ' 12');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('EDITOR TYPE............. ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(editorName, 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 13: Zoom Type - express.e:25801-25808
  if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[ 13] [DISABLED]\r\n', 'red'));
  } else {
    const zoomType = currentUser.zoomType || 0;
    const zoomName = zoomType === 1 ? 'ASCII' : 'QWK';

    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', ' 13');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('ZOOM TYPE............... ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(zoomName, 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 14: Available for Chat/OLM - express.e:25809-25816
  if (!checkSecurity(session.user, ACSPermission.OLM)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[ 14] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', ' 14');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('AVAILABLE FOR CHAT/OLM.. ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize(currentUser.availableForChat ? 'YES' : 'NO', currentUser.availableForChat ? 'green' : 'white'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 15: Translator - express.e:25817-25820
  if (!checkSecurity(session.user, ACSPermission.TRANSLATION)) {
    socket.emit('ansi-output', AnsiUtil.colorize('[ 15] [DISABLED]\r\n', 'red'));
  } else {
    socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
    socket.emit('ansi-output', ' 15');
    socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
    socket.emit('ansi-output', AnsiUtil.colorize('TRANSLATOR.............. ', 'magenta'));
    socket.emit('ansi-output', AnsiUtil.colorize('English', 'yellow'));
    socket.emit('ansi-output', '\r\n');
  }

  // Option 16: Background File Check - express.e:25821-25829
  // Simplified for web version - always show as available
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', ' 16');
  socket.emit('ansi-output', AnsiUtil.colorize('] ', 'blue'));
  socket.emit('ansi-output', AnsiUtil.colorize('BACKGROUND FILE CHECK... ', 'magenta'));
  socket.emit('ansi-output', AnsiUtil.colorize('NO', 'white'));
  socket.emit('ansi-output', '\r\n');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Which to change <CR>=QUIT ? ');
}

/**
 * W Command - Write User Parameters (edit user configuration)
 * express.e:25712-26092
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

  // Display menu and wait for option selection
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * W Command Input Handlers - express.e:25712-26092
 */

/**
 * Handle W option selection input (express.e:25832)
 */
export async function handleWOptionSelectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // CR/empty = quit and save (express.e:25836-25840)
  if (trimmed === '') {
    socket.emit('ansi-output', '\r\n');
    // Save user account (express.e:25838)
    await db.updateUser(session.user.id, session.user);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const option = parseInt(trimmed, 10);

  // Invalid option number
  if (isNaN(option) || option < 0 || option > 16) {
    _displayWCommandMenu(socket, session);
    return;
  }

  socket.emit('ansi-output', '\r\n');

  // Handle each option (express.e:25846-26028)
  switch (option) {
    case 0: // Edit Username - express.e:25847-25873
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Name: ');
      session.subState = LoggedOnSubState.W_EDIT_NAME;
      session.tempData = { originalUsername: session.user.username };
      break;

    case 1: // Edit Email - express.e:25874-25882
      if (!checkSecurity(session.user, ACSPermission.EDIT_EMAIL)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Email Address: ');
      session.subState = LoggedOnSubState.W_EDIT_EMAIL;
      break;

    case 2: // Edit Real Name - express.e:25883-25904
      if (!checkSecurity(session.user, ACSPermission.EDIT_REAL_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Real Name: (Alpha Numeric) ');
      session.subState = LoggedOnSubState.W_EDIT_REALNAME;
      break;

    case 3: // Edit Internet Name - express.e:25905-25926
      if (!checkSecurity(session.user, ACSPermission.EDIT_INTERNET_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Internet Name: (Alpha Numeric No Spaces) ');
      session.subState = LoggedOnSubState.W_EDIT_INTERNETNAME;
      break;

    case 4: // Edit Location - express.e:25927-25935
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_LOCATION)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'From: ');
      session.subState = LoggedOnSubState.W_EDIT_LOCATION;
      break;

    case 5: // Edit Phone - express.e:25936-25944
      if (!checkSecurity(session.user, ACSPermission.EDIT_PHONE_NUMBER)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Phone: ');
      session.subState = LoggedOnSubState.W_EDIT_PHONE;
      break;

    case 6: // Edit Password - express.e:25945-25975
      if (!checkSecurity(session.user, ACSPermission.EDIT_PASSWORD)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Enter New Password: ');
      session.subState = LoggedOnSubState.W_EDIT_PASSWORD;
      break;

    case 7: // Edit Lines Per Screen - express.e:25976-25980
      socket.emit('ansi-output', 'Lines Per Screen (0=Auto): ');
      session.subState = LoggedOnSubState.W_EDIT_LINES;
      break;

    case 8: // Edit Computer - express.e:25981-25986
      socket.emit('ansi-output', 'Computer Type: ');
      session.subState = LoggedOnSubState.W_EDIT_COMPUTER;
      break;

    case 9: // Edit Screen Type - express.e:25987-25992
      socket.emit('ansi-output', 'Screen Type: ');
      session.subState = LoggedOnSubState.W_EDIT_SCREENTYPE;
      break;

    case 10: // Toggle Screen Clear - express.e:25993-25994
      session.user.ansi = !session.user.ansi;
      await db.updateUser(session.user.id, { ansi: session.user.ansi });
      _displayWCommandMenu(socket, session);
      break;

    case 11: // Edit Transfer Protocol - express.e:25995-26002
      if (!checkSecurity(session.user, ACSPermission.XPR_SEND) && !checkSecurity(session.user, ACSPermission.XPR_RECEIVE)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Transfer Protocol: ');
      session.subState = LoggedOnSubState.W_EDIT_PROTOCOL;
      break;

    case 12: // Toggle Editor Type - express.e:26003-26006
      if (!checkSecurity(session.user, ACSPermission.FULL_EDIT)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      const currentEditor = session.user.editorType || 0;
      session.user.editorType = (currentEditor + 1) % 3;
      await db.updateUser(session.user.id, { editorType: session.user.editorType });
      _displayWCommandMenu(socket, session);
      break;

    case 13: // Toggle Zoom Type - express.e:26007-26010
      if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      const currentZoom = session.user.zoomType || 0;
      session.user.zoomType = (currentZoom + 1) & 1; // Toggle between 0 and 1
      await db.updateUser(session.user.id, { zoomType: session.user.zoomType });
      _displayWCommandMenu(socket, session);
      break;

    case 14: // Toggle Available for Chat/OLM - express.e:26011-26014
      if (!checkSecurity(session.user, ACSPermission.OLM)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      session.user.availableForChat = !session.user.availableForChat;
      await db.updateUser(session.user.id, { availableForChat: session.user.availableForChat });
      _displayWCommandMenu(socket, session);
      break;

    case 15: // Edit Translator - express.e:26015-26019
      if (!checkSecurity(session.user, ACSPermission.TRANSLATION)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      socket.emit('ansi-output', 'Translator: ');
      session.subState = LoggedOnSubState.W_EDIT_TRANSLATOR;
      break;

    case 16: // Toggle Background File Check - express.e:26020-26028
      // Simplified for web version - just toggle a flag
      _displayWCommandMenu(socket, session);
      break;

    default:
      _displayWCommandMenu(socket, session);
  }
}

/**
 * Handle edit username input - express.e:25847-25873
 */
export async function handleWEditNameInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Check if same as current (express.e:25855)
  if (trimmed.toUpperCase() === session.tempData.originalUsername.toUpperCase()) {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Check for wildcards (express.e:25859-25862)
  if (trimmed.includes('*') || trimmed.includes('?')) {
    socket.emit('ansi-output', 'No wildcards allowed in a name.\r\n\r\n');
    socket.emit('ansi-output', 'Name: ');
    return;
  }

  // Check for duplicate (express.e:25863-25868)
  socket.emit('ansi-output', '\r\nChecking for duplicate name...');
  const existing = await db.getUserByUsername(trimmed);
  if (existing && existing.id !== session.user.id) {
    socket.emit('ansi-output', 'Already in use!, try another.\r\n\r\n');
    socket.emit('ansi-output', 'Name: ');
    return;
  }

  socket.emit('ansi-output', 'Ok!\r\n');
  session.user.username = trimmed;
  await db.updateUser(session.user.id, { username: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit email input - express.e:25874-25882
 */
export async function handleWEditEmailInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.email = trimmed;
  await db.updateUser(session.user.id, { email: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit real name input - express.e:25883-25904
 */
export async function handleWEditRealnameInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Check if same as current
  if (trimmed === (session.user.realname || '')) {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Check for wildcards
  if (trimmed.includes('*') || trimmed.includes('?')) {
    socket.emit('ansi-output', 'No wildcards allowed in a name.\r\n\r\n');
    socket.emit('ansi-output', 'Real Name: (Alpha Numeric) ');
    return;
  }

  socket.emit('ansi-output', '\r\nOk!\r\n');
  session.user.realname = trimmed;
  await db.updateUser(session.user.id, { realname: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit internet name input - express.e:25905-25926
 */
export async function handleWEditInternetnameInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Check for spaces
  if (trimmed.includes(' ')) {
    socket.emit('ansi-output', '\r\nNo spaces allowed.\r\n\r\n');
    socket.emit('ansi-output', 'Internet Name: (Alpha Numeric No Spaces) ');
    return;
  }

  // Check for wildcards
  if (trimmed.includes('*') || trimmed.includes('?')) {
    socket.emit('ansi-output', 'No wildcards allowed in a name.\r\n\r\n');
    socket.emit('ansi-output', 'Internet Name: (Alpha Numeric No Spaces) ');
    return;
  }

  socket.emit('ansi-output', '\r\nOk!\r\n');
  // For web version, just store in a custom field or ignore
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit location input - express.e:25927-25935
 */
export async function handleWEditLocationInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.location = trimmed;
  await db.updateUser(session.user.id, { location: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit phone input - express.e:25936-25944
 */
export async function handleWEditPhoneInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.phone = trimmed;
  await db.updateUser(session.user.id, { phone: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit password input - express.e:25945-25975
 */
export function handleWEditPasswordInput(socket: any, session: BBSSession, input: string): void {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Store password temporarily and ask for confirmation
  session.tempData = { newPassword: trimmed };
  socket.emit('ansi-output', '\r\nReenter New Password: ');
  session.subState = LoggedOnSubState.W_EDIT_PASSWORD_CONFIRM;
}

/**
 * Handle password confirmation input - express.e:25953-25974
 */
export async function handleWEditPasswordConfirmInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  const originalPassword = session.tempData?.newPassword || '';

  // Empty = cancel
  if (trimmed === '') {
    socket.emit('ansi-output', '\r\nPasswords do not match, changes not saved\r\n');
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }

  // Check if passwords match (express.e:25957)
  if (trimmed !== originalPassword) {
    socket.emit('ansi-output', '\r\nPasswords do not match, changes not saved\r\n');
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }

  // Passwords match - hash and save (express.e:25958-25970)
  const hashedPassword = await bcrypt.hash(trimmed, 10);
  session.user.password = hashedPassword;
  await db.updateUser(session.user.id, { password: hashedPassword });

  socket.emit('ansi-output', '\r\nPassword updated successfully.\r\n');
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
  session.tempData = {};
}

/**
 * Handle edit lines per screen input - express.e:25976-25980
 */
export async function handleWEditLinesInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const lines = parseInt(trimmed, 10);
  if (isNaN(lines) || lines < 0 || lines > 100) {
    socket.emit('ansi-output', '\r\nInvalid number. Please enter 0-100.\r\n');
    socket.emit('ansi-output', 'Lines Per Screen (0=Auto): ');
    return;
  }

  session.user.linesPerScreen = lines === 0 ? null : lines;
  await db.updateUser(session.user.id, { linesPerScreen: session.user.linesPerScreen });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit computer input - express.e:25981-25986
 */
export async function handleWEditComputerInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.computer = trimmed;
  await db.updateUser(session.user.id, { computer: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit screen type input - express.e:25987-25992
 */
export async function handleWEditScreentypeInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  session.user.screenType = trimmed;
  await db.updateUser(session.user.id, { screenType: trimmed });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit transfer protocol input - express.e:25995-26002
 */
export async function handleWEditProtocolInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // For web version, protocol is always WebSocket, just acknowledge
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit translator input - express.e:26015-26019
 */
export async function handleWEditTranslatorInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();

  // Empty = cancel
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // For web version, translator is always English, just acknowledge
  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
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
