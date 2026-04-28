/**
 * User Information Commands Handler
 *
 * Implements user and system information commands as 1:1 ports from express.e:
 * - VER (Version Info) - Display BBS version information - express.e:25688-25699
 * - WHO (Who's Online) - List online users - express.e:26094-26103
 * - WHD (Who's Online Detailed) - Detailed online user listing - express.e:26104-26112
 * - W (Write User Parameters) - Edit user configuration - express.e:25712-25785+
 */

import { LoggedOnSubState, BBSState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { db } from '../../database';
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import bcrypt from 'bcryptjs';
import { finalizeCommand } from '../../utils/command-response.util';

import type { BBSSession } from '../../index';

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
  // express.e:25688-25698 internalCommandVER()
  // StringF(tempStr,'\b\nAmiExpress \s (\s) Copyright \xa22018-2023 Darren Coles\b\n\b\n',expressVer,expressDate)
  emitText(socket, '\r\nAmiExpress-Web 5.6.0 (2025-10-23) Copyright \xa92018-2023 Darren Coles\r\n\r\n');
  // express.e:25692-25694
  emitText(socket, 'Original Version:\r\n');
  emitText(socket, '  (C)1989-91 Mike Thomas, Synthetic Technologies\r\n');
  emitText(socket, '  (C)1992-95 Joe Hodge, LightSpeed Technologies Inc.\r\n\r\n');
  // express.e:25696-25697 'Registered to \s.\b\n'
  emitText(socket, 'Registered to Open Source Community.\r\n');
  // express.e:25698 ENDPROC RESULT_SUCCESS — no press-key, just return
  session.subState = LoggedOnSubState.DISPLAY_MENU;
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

  // express.e:24217-24218: aePuts('\b\n\b\n') before table (no screen clear)
  emitText(socket, '\r\n');
  emitText(socket, '\r\n');
  emitText(socket, '\x1b[34m.---+---------------------+---------------------+---------------------+----.\x1b[0m\r\n');
  emitText(socket, '\x1b[34m|\x1b[33mNd#\x1b[34m|\x1b[36m Name/Handle         \x1b[34m|\x1b[36m Location            \x1b[34m|\x1b[36m Action              \x1b[34m|\x1b[36mChat\x1b[0m\x1b[34m|\x1b[0m\r\n');
  emitText(socket, '\x1b[34m)---+---------------------+---------------------+---------------------+----(\x1b[0m\r\n');

  // Get all online users - express.e:24231-24377
  // WEB_: express.e reads from a shared AmigaOS node list in global memory; on the web
  // platform multi-node session state lives in the Node.js sessions Map, so we enumerate
  // that instead. Displayed columns and row format are 1:1 with express.e:24370-24375.
  const allOnlineUsers = Array.from(_sessions.values())
    .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
    .map(sess => ({
      username: sess.user!.username,
      location: sess.user!.location || '',
      nodeId: sess.nodeId || 0,
      chatEnabled: !(sess.user!.quietNode || false),
      action: _getActivityFromSubState(sess.subState as any)
    }));

  // Output each user row - express.e:24257-24377 format
  allOnlineUsers.forEach(userInfo => {
    const nodeStr = String(userInfo.nodeId).padStart(2, '0');
    const nameStr = userInfo.username.substring(0, 19).padEnd(19);
    const locStr = userInfo.location.substring(0, 19).padEnd(19);
    const actionStr = userInfo.action.substring(0, 19).padEnd(19);
    const chatStr = userInfo.chatEnabled ? '\x1b[32mYES' : '\x1b[31mNO ';

    // express.e:24370-24375 - Row format
    emitText(socket, `\x1b[34m| \x1b[0m${nodeStr}\x1b[34m| \x1b[33m${nameStr} \x1b[34m|\x1b[35m ${locStr} \x1b[34m|\x1b[0m ${actionStr} \x1b[34m|${chatStr}\x1b[34m|\x1b[0m\r\n`);
  });

  // express.e:24381-24382 - Table footer
  emitText(socket, '\x1b[34m|---+---------------------+---------------------+---------------------+----|\x1b[0m\r\n');
  emitText(socket, '\x1b[34m`--------------------------------------------------------------------------\'\x1b[0m\r\n');
  emitText(socket, '\r\n');

  // express.e: who() returns RESULT_SUCCESS — no press-key, main loop sets menuPause:=TRUE
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
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

  // express.e:24239-24250 - who(1) is debug mode that prints raw memory pointers
  // WEB_: express.e WHD passes flag=1 to who(), which dumps struct addresses — meaningless
  // on the web platform where there is no shared Amiga memory space. We show a richer
  // per-session detail table instead, preserving the intent (operator visibility) without
  // exposing meaningless pointer values. Multi-node session state lives in the Node.js
  // sessions Map, not in a shared Amiga memory region.
  emitText(socket, '\r\n');
  emitText(socket, '\r\n');
  emitText(socket, '\x1b[34m.---+---------------------+---------------------+---------------------+----.\x1b[0m\r\n');
  emitText(socket, '\x1b[34m|\x1b[33mNd#\x1b[34m|\x1b[36m Name/Handle         \x1b[34m|\x1b[36m Location            \x1b[34m|\x1b[36m Action              \x1b[34m|\x1b[36mChat\x1b[0m\x1b[34m|\x1b[0m\r\n');
  emitText(socket, '\x1b[34m)---+---------------------+---------------------+---------------------+----(\x1b[0m\r\n');

  // Get all online users with detailed status
  const detailedOnlineUsers = Array.from(_sessions.values())
    .filter(sess => sess.state === BBSState.LOGGEDON && sess.user)
    .map(sess => ({
      username: sess.user!.username,
      location: sess.user!.location || '',
      nodeId: sess.nodeId || 0,
      chatEnabled: !(sess.user!.quietNode || false),
      activity: _getActivityFromSubState(sess.subState as any)
    }));

  // Output each user row using same format as WHO
  detailedOnlineUsers.forEach(userInfo => {
    const nodeStr = String(userInfo.nodeId).padStart(2, '0');
    const nameStr = userInfo.username.substring(0, 19).padEnd(19);
    const locStr = userInfo.location.substring(0, 19).padEnd(19);
    const actionStr = userInfo.activity.substring(0, 19).padEnd(19);
    const chatStr = userInfo.chatEnabled ? '\x1b[32mYES' : '\x1b[31mNO ';

    emitText(socket, `\x1b[34m| \x1b[0m${nodeStr}\x1b[34m| \x1b[33m${nameStr} \x1b[34m|\x1b[35m ${locStr} \x1b[34m|\x1b[0m ${actionStr} \x1b[34m|${chatStr}\x1b[34m|\x1b[0m\r\n`);
  });

  // Table footer
  emitText(socket, '\x1b[34m|---+---------------------+---------------------+---------------------+----|\x1b[0m\r\n');
  emitText(socket, '\x1b[34m`--------------------------------------------------------------------------\'\x1b[0m\r\n');
  emitText(socket, '\r\n');

  // express.e: who(1) returns RESULT_SUCCESS — no press-key
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
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
const MODEM_OPTIONS = [
  { bps: 0, label: 'MAX (No Throttle)' },
  { bps: 1200, label: '1200 bps' },
  { bps: 2400, label: '2400 bps' },
  { bps: 4800, label: '4800 bps' },
  { bps: 7200, label: '7200 bps' },
  { bps: 9600, label: '9600 bps' },
  { bps: 12000, label: '12.0 kbps' },
  { bps: 14400, label: '14.4 kbps' },
  { bps: 14400, label: 'HST 14.4 kbps' },
  { bps: 16800, label: '16.8 kbps' },
  { bps: 16800, label: 'HST 16.8 kbps' },
  { bps: 19200, label: '19.2 kbps' },
  { bps: 21600, label: '21.6 kbps' },
  { bps: 21600, label: 'HST 21.6 kbps' },
  { bps: 24000, label: '24.0 kbps' },
  { bps: 28800, label: '28.8 kbps' },
  { bps: 33600, label: '33.6 kbps' },
  { bps: 56000, label: '56 kbps' },
];

function _displayWCommandMenu(socket: any, session: BBSSession): void {
  const currentUser = session.user!;
  const modemLabel = (() => {
    const bps = session.modemBps || currentUser.baud || 0;
    if (!bps || bps <= 0) return 'MAX (No Throttle)';
    const found = MODEM_OPTIONS.find(opt => opt.bps === bps);
    if (found) return found.label;
    return `${bps} bps`;
  })();

  // express.e:25730-25732 - exact format with colored asterisks
  emitText(socket, '\r\n');
  emitText(socket, '                       \x1b[34m*\x1b[0m--\x1b[33mUSER CONFIGURATION\x1b[0m--\x1b[34m*\x1b[0m\r\n');
  emitText(socket, '\r\n');

  // Option 0: Login Name - express.e:25724-25728
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_NAME)) {
    emitText(socket, '\x1b[34m[\x1b[0m  0\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  0');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('LOGIN NAME.............. ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.username, 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 1: Email - express.e:25729-25733
  if (!checkSecurity(session.user, ACSPermission.EDIT_EMAIL)) {
    emitText(socket, '\x1b[34m[\x1b[0m  1\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  1');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('EMAIL ADDRESS........... ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.email || 'Not set', 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 2: Real Name - express.e:25734-25738
  if (!checkSecurity(session.user, ACSPermission.EDIT_REAL_NAME)) {
    emitText(socket, '\x1b[34m[\x1b[0m  2\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  2');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('REAL NAME............... ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.realname || 'Not set', 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 3: Internet Name - express.e:25739-25743
  if (!checkSecurity(session.user, ACSPermission.EDIT_INTERNET_NAME)) {
    emitText(socket, '\x1b[34m[\x1b[0m  3\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  3');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('INTERNET NAME........... ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.username.toLowerCase(), 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 4: Location - express.e:25744-25748
  if (!checkSecurity(session.user, ACSPermission.EDIT_USER_LOCATION)) {
    emitText(socket, '\x1b[34m[\x1b[0m  4\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  4');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('LOCATION................ ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.location || 'Not set', 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 5: Phone - express.e:25749-25753
  if (!checkSecurity(session.user, ACSPermission.EDIT_PHONE_NUMBER)) {
    emitText(socket, '\x1b[34m[\x1b[0m  5\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  5');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('PHONE NUMBER............ ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.phone || 'Not set', 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 6: Password - express.e:25754-25758
  if (!checkSecurity(session.user, ACSPermission.EDIT_PASSWORD)) {
    emitText(socket, '\x1b[34m[\x1b[0m  6\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, '  6');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('PASSWORD................ ', 'magenta'));
    emitText(socket, AnsiUtil.colorize('ENCRYPTED', 'cyan'));
    emitText(socket, '\r\n');
  }

  // Option 7: Lines Per Screen - express.e:25759-25760
  const linesPerScreen = currentUser.linesPerScreen || 'Auto';
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, '  7');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('LINES PER SCREEN........ ', 'magenta'));
  emitText(socket, AnsiUtil.colorize(linesPerScreen.toString(), 'yellow'));
  emitText(socket, '\r\n');

  // Option 8: Computer - express.e:25761-25767
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, '  8');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('COMPUTER................ ', 'magenta'));
  emitText(socket, AnsiUtil.colorize(currentUser.computer || 'Unknown', 'yellow'));
  emitText(socket, '\r\n');

  // Option 9: Screen Type - express.e:25768-25774
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, '  9');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('SCREEN TYPE............. ', 'magenta'));
  emitText(socket, AnsiUtil.colorize(currentUser.screenType || 'Web Terminal', 'yellow'));
  emitText(socket, '\r\n');

  // Option 10: Screen Clear - express.e:25775-25779
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, ' 10');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('SCREEN CLEAR............ ', 'magenta'));
  // express.e:25808-25812 — checks userFlags AND USER_SCRNCLR (bit 8), [32m=YES, [37m=NO
  { const scrnClr = (currentUser.userFlags || 0) & 8;
    emitText(socket, scrnClr ? '\x1b[32mYES\x1b[0m' : '\x1b[37mNO\x1b[0m'); }
  emitText(socket, '\r\n');

  // Option 11: Transfer Protocol - express.e:25780-25790
  if (!checkSecurity(session.user, ACSPermission.XPR_SEND) && !checkSecurity(session.user, ACSPermission.XPR_RECEIVE)) {
    emitText(socket, '\x1b[34m[\x1b[0m 11\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    const { PROTOCOL_DISPLAY_NAMES } = require('../../types');
    const userProtocol = currentUser.protocol || 'zmodem';
    const protocolName = PROTOCOL_DISPLAY_NAMES[userProtocol] || userProtocol.toUpperCase();
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, ' 11');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('TRANSFER PROTOCOL....... ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(protocolName, 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 12: Editor Type - express.e:25791-25800
  if (!checkSecurity(session.user, ACSPermission.FULL_EDIT)) {
    emitText(socket, '\x1b[34m[\x1b[0m 12\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    const editorType = currentUser.editorType || 0;
    let editorName = 'PROMPT';
    if (editorType === 1) editorName = 'LINE EDITOR';
    else if (editorType === 2) editorName = 'FULLSCREEN EDITOR';

    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, ' 12');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('EDITOR TYPE............. ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(editorName, 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 13: Zoom Type - express.e:25801-25808
  if (!checkSecurity(session.user, ACSPermission.ZOOM_MAIL)) {
    emitText(socket, '\x1b[34m[\x1b[0m 13\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    const zoomType = currentUser.zoomType || 0;
    const zoomName = zoomType === 1 ? 'ASCII' : 'QWK';

    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, ' 13');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('ZOOM TYPE............... ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(zoomName, 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 14: Available for Chat/OLM - express.e:25809-25816
  if (!checkSecurity(session.user, ACSPermission.OLM)) {
    emitText(socket, '\x1b[34m[\x1b[0m 14\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, ' 14');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('AVAILABLE FOR CHAT/OLM.. ', 'magenta'));
    emitText(socket, AnsiUtil.colorize(currentUser.availableForChat ? 'YES' : 'NO', currentUser.availableForChat ? 'green' : 'white'));
    emitText(socket, '\r\n');
  }

  // Option 15: Translator - express.e:25817-25820
  if (!checkSecurity(session.user, ACSPermission.TRANSLATION)) {
    emitText(socket, '\x1b[34m[\x1b[0m 15\x1b[34m]\x1b[31m [DISABLED]\x1b[0m\r\n');
  } else {
    emitText(socket, AnsiUtil.colorize('[', 'blue'));
    emitText(socket, ' 15');
    emitText(socket, AnsiUtil.colorize('] ', 'blue'));
    emitText(socket, AnsiUtil.colorize('TRANSLATOR.............. ', 'magenta'));
    emitText(socket, AnsiUtil.colorize('English', 'yellow'));
    emitText(socket, '\r\n');
  }

  // Option 16: Background File Check - express.e:25821-25829
  // Simplified for web version - always show as available
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, ' 16');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('BACKGROUND FILE CHECK... ', 'magenta'));
  emitText(socket, AnsiUtil.colorize('NO', 'white'));
  emitText(socket, '\r\n');

  // WEB_: MODERN_* — option 17: modem emulation speed throttle, no express.e counterpart; web terminal setting
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, ' 17');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('MODEM EMULATION SPEED.. ', 'magenta'));
  emitText(socket, AnsiUtil.colorize(modemLabel, 'yellow'));
  emitText(socket, '\r\n');

  // WEB_: MODERN_* — option 18: terminal font selection, no express.e counterpart; web terminal setting
  const userFont = currentUser.fontPreference || 'TopazPlus_a1200';
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, ' 18');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('TERMINAL FONT.......... ', 'magenta'));
  emitText(socket, AnsiUtil.colorize(userFont, 'yellow'));
  emitText(socket, '\r\n');

  // WEB_: Phase 3 GDPR self-service — see thoughts/shared/plans/
  // 2026-04-24-gdpr-hobby-baseline.md. No express.e counterpart.
  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, ' 19');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('VIEW MY DATA (GDPR).... ', 'magenta'));
  emitText(socket, AnsiUtil.colorize('print a copy of your record', 'yellow'));
  emitText(socket, '\r\n');

  emitText(socket, AnsiUtil.colorize('[', 'blue'));
  emitText(socket, ' 20');
  emitText(socket, AnsiUtil.colorize('] ', 'blue'));
  emitText(socket, AnsiUtil.colorize('DELETE MY ACCOUNT...... ', 'magenta'));
  emitText(socket, AnsiUtil.colorize('erase your data (GDPR)', 'red'));
  emitText(socket, '\r\n');

  emitText(socket, '\r\n');
  emitText(socket, 'Which to change <CR>=QUIT ? ');
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
  session.cmdShortcuts = false;
  if ((session as any).shortcuts && typeof (session as any).shortcuts.clear === 'function') {
    (session as any).shortcuts.clear();
  }
  session.inputBuffer = '';
  // Abort any lingering pagination/pause so W behaves like express.e lineInput
  session.paginatedScreen = undefined;
  session.menuPause = false;
  session.lastScreenHadPause = false;
  session.queuedScreenCommands = [];
  session.pendingScreenCommand = undefined;
  session.screenCommandResolver = null;
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

  // CR/empty = quit (express.e:25836-25840)
  if (trimmed === '') {
    emitText(socket, '\r\n');
    // Each option already saves immediately, no need to save again here
    session.inputBuffer = '';
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    const { displayMainMenu } = require('../command-handler/menu');
    await displayMainMenu(socket, session, false);
    return;
  }

  const option = parseInt(trimmed, 10);

  // Invalid option number (18 = last express.e/web-extension option, 19/20 = GDPR)
  if (isNaN(option) || option < 0 || option > 20) {
    _displayWCommandMenu(socket, session);
    return;
  }

  emitText(socket, '\r\n');

  // Handle each option (express.e:25846-26028)
  switch (option) {
    case 0: // Edit Username - express.e:25847-25873
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Name: ');
      session.subState = LoggedOnSubState.W_EDIT_NAME;
      session.tempData = { originalUsername: session.user.username };
      break;

    case 1: // Edit Email - express.e:25874-25882
      if (!checkSecurity(session.user, ACSPermission.EDIT_EMAIL)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Email Address: ');
      session.subState = LoggedOnSubState.W_EDIT_EMAIL;
      break;

    case 2: // Edit Real Name - express.e:25883-25904
      if (!checkSecurity(session.user, ACSPermission.EDIT_REAL_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Real Name: (Alpha Numeric) ');
      session.subState = LoggedOnSubState.W_EDIT_REALNAME;
      break;

    case 3: // Edit Internet Name - express.e:25905-25926
      if (!checkSecurity(session.user, ACSPermission.EDIT_INTERNET_NAME)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Internet Name: (Alpha Numeric No Spaces) ');
      session.subState = LoggedOnSubState.W_EDIT_INTERNETNAME;
      break;

    case 4: // Edit Location - express.e:25927-25935
      if (!checkSecurity(session.user, ACSPermission.EDIT_USER_LOCATION)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'From: ');
      session.subState = LoggedOnSubState.W_EDIT_LOCATION;
      break;

    case 5: // Edit Phone - express.e:25936-25944
      if (!checkSecurity(session.user, ACSPermission.EDIT_PHONE_NUMBER)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Phone: ');
      session.subState = LoggedOnSubState.W_EDIT_PHONE;
      break;

    case 6: // Edit Password - express.e:25945-25975
      if (!checkSecurity(session.user, ACSPermission.EDIT_PASSWORD)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      emitText(socket, 'Enter New Password: ');
      session.subState = LoggedOnSubState.W_EDIT_PASSWORD;
      break;

    case 7: // Edit Lines Per Screen - express.e:25976-25980
      emitText(socket, 'Lines Per Screen (0=Auto): ');
      session.subState = LoggedOnSubState.W_EDIT_LINES;
      break;

    case 8: // Edit Computer - express.e:26038-26044, chooseComputer() express.e:11319-11346
      await _displayComputerList(socket, session);
      break;

    case 9: // Edit Screen Type - express.e:26045-26051, chooseScreenType() express.e:11348-11368
      await _displayScreenTypeList(socket, session);
      break;

    case 10: // Toggle Screen Clear — express.e:25993: userFlags EOR USER_SCRNCLR (bit 8)
      { const SCRNCLR = 8;
        session.user.userFlags = (session.user.userFlags || 0) ^ SCRNCLR;
        await db.updateUser(session.user.id, { userFlags: session.user.userFlags });
        _displayWCommandMenu(socket, session); }
      break;

    case 11: // Edit Transfer Protocol - express.e:25995-26002
      if (!checkSecurity(session.user, ACSPermission.XPR_SEND) && !checkSecurity(session.user, ACSPermission.XPR_RECEIVE)) {
        _displayWCommandMenu(socket, session);
        return;
      }
      // Display protocol selection menu
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('Select Transfer Protocol:\r\n', 'cyan'));
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('[1] ', 'blue') + 'ZMODEM          - Fast, reliable, batch transfers (recommended)\r\n');
      emitText(socket, AnsiUtil.colorize('[2] ', 'blue') + 'YMODEM (Batch)  - Batch transfers with file info\r\n');
      emitText(socket, AnsiUtil.colorize('[3] ', 'blue') + 'XMODEM-1K       - 1024-byte blocks with CRC\r\n');
      emitText(socket, AnsiUtil.colorize('[4] ', 'blue') + 'XMODEM-CRC      - 128-byte blocks with CRC-16\r\n');
      emitText(socket, AnsiUtil.colorize('[5] ', 'blue') + 'XMODEM          - 128-byte blocks with checksum (legacy)\r\n');
      emitText(socket, AnsiUtil.colorize('[6] ', 'blue') + 'Punter (C64)    - Commodore 64/128 protocol\r\n');
      emitText(socket, AnsiUtil.colorize('[7] ', 'blue') + 'WebSocket       - Browser-based transfers\r\n');
      emitText(socket, '\r\n');
      emitText(socket, 'Select (1-7) or <CR>=Cancel: ');
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
      emitText(socket, 'Translator: ');
      session.subState = LoggedOnSubState.W_EDIT_TRANSLATOR;
      break;

    case 16: // Toggle Background File Check - express.e:26020-26028
      // Simplified for web version - just toggle a flag
      _displayWCommandMenu(socket, session);
      break;

    case 17: // WEB_: MODERN_* — modem emulation speed; no express.e:25712-26092 counterpart
      emitText(socket, '\r\nSelect Modem Speed:\r\n');
      MODEM_OPTIONS.forEach((opt, idx) => {
        emitText(socket, `[${idx}] ${opt.label}\r\n`);
      });
      emitText(socket, `Select (0-${MODEM_OPTIONS.length - 1}) or <CR>=Cancel: `);
      session.subState = LoggedOnSubState.W_EDIT_MODEM_SPEED;
      break;

    case 18: // WEB_: MODERN_* — terminal font selection; no express.e:25712-26092 counterpart
      emitText(socket, '\r\nSelect Terminal Font:\r\n');
      emitText(socket, '\r\n');
      emitText(socket, AnsiUtil.colorize('[1] ', 'blue') + 'TopazPlus_a1200  - Classic Amiga Topaz (1200)\r\n');
      emitText(socket, AnsiUtil.colorize('[2] ', 'blue') + 'TopazPlus_a500   - Classic Amiga Topaz (500)\r\n');
      emitText(socket, AnsiUtil.colorize('[3] ', 'blue') + 'Topaz_a1200      - Original Topaz (1200)\r\n');
      emitText(socket, AnsiUtil.colorize('[4] ', 'blue') + 'Topaz_a500       - Original Topaz (500)\r\n');
      emitText(socket, AnsiUtil.colorize('[5] ', 'blue') + 'mosoul           - MO\'Soul (alternate)\r\n');
      emitText(socket, '\r\n');
      emitText(socket, 'Select (1-5) or <CR>=Cancel: ');
      session.subState = LoggedOnSubState.W_EDIT_FONT;
      break;

    case 19: { // WEB_ GDPR view-my-data (Phase 3 plan)
      const { handleViewMyDataOption } = require('../user/gdpr.handler');
      await handleViewMyDataOption(socket, session);
      break;
    }

    case 20: { // WEB_ GDPR delete-my-account (Phase 3 plan)
      const { startForgetMe } = require('../user/gdpr.handler');
      startForgetMe(socket, session);
      break;
    }

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
    emitText(socket, 'No wildcards allowed in a name.\r\n\r\n');
    emitText(socket, 'Name: ');
    return;
  }

  // Check for duplicate (express.e:25863-25868)
  emitText(socket, '\r\nChecking for duplicate name...');
  const existing = await db.getUserByUsername(trimmed);
  if (existing && existing.id !== session.user.id) {
    emitText(socket, 'Already in use!, try another.\r\n\r\n');
    emitText(socket, 'Name: ');
    return;
  }

  emitText(socket, 'Ok!\r\n');
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
    emitText(socket, 'No wildcards allowed in a name.\r\n\r\n');
    emitText(socket, 'Real Name: (Alpha Numeric) ');
    return;
  }

  emitText(socket, '\r\nOk!\r\n');
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
    emitText(socket, '\r\nNo spaces allowed.\r\n\r\n');
    emitText(socket, 'Internet Name: (Alpha Numeric No Spaces) ');
    return;
  }

  // Check for wildcards
  if (trimmed.includes('*') || trimmed.includes('?')) {
    emitText(socket, 'No wildcards allowed in a name.\r\n\r\n');
    emitText(socket, 'Internet Name: (Alpha Numeric No Spaces) ');
    return;
  }

  session.user.internetName = trimmed;
  await db.updateUser(session.user.id, { internetName: trimmed });
  emitText(socket, '\r\nOk!\r\n');
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
  emitText(socket, '\r\nReenter New Password: ');
  session.subState = LoggedOnSubState.W_EDIT_PASSWORD_CONFIRM;
}

/**
 * Handle password confirmation input - express.e:25953-25974
 */
export async function handleWEditPasswordConfirmInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  const originalPassword = session.tempData?.newPassword || '';

  // express.e:26009-26010: IF(StrLen(str2)=0) THEN JUMP cant — silent cancel, no message
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }

  // express.e:26012-26029: IF StrCmp(str,str2) ... ELSE '\b\nPasswords do not match, changes not saved' Delay(60)
  if (trimmed !== originalPassword) {
    emitText(socket, '\r\nPasswords do not match, changes not saved');
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }

  // express.e:26013-26024: checkPasswordStrength before saving
  let minLen = 0, minStrength = 0;
  try {
    const sysConf = db.getConfigRepository?.()?.getSystemConfig?.() || {};
    minLen = (sysConf as any).min_password_length ?? 0;
    minStrength = (sysConf as any).min_password_strength ?? 0;
  } catch (_) { /* use defaults */ }

  if (minLen > 0 && trimmed.length < minLen) {
    // express.e:26016: '\b\nPassword length must be at least \d chars, changes not saved' (no trailing \n)
    emitText(socket, `\r\nPassword length must be at least ${minLen} chars, changes not saved`);
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    session.tempData = {};
    return;
  }
  if (minStrength > 0) {
    let lower = 0, upper = 0, num = 0, sym = 0;
    for (const c of trimmed) {
      const code = c.charCodeAt(0);
      if (code >= 48 && code <= 57) num = 1;
      else if (code >= 65 && code <= 90) upper = 1;
      else if (code >= 97 && code <= 122) lower = 1;
      else sym = 1;
    }
    if (lower + upper + num + sym < Math.min(minStrength, 4)) {
      // express.e:26021: '\b\nPassword must have at least \d of these:\b\n  upper case,lower case, numeric and symbols - changes not saved' (no trailing \n)
      emitText(socket, `\r\nPassword must have at least ${minStrength} of these:\r\n  upper case,lower case, numeric and symbols - changes not saved`);
      _displayWCommandMenu(socket, session);
      session.subState = LoggedOnSubState.W_OPTION_SELECT;
      session.tempData = {};
      return;
    }
  }

  // express.e:26025-26026: setNewPassword() + pwdLastUpdated:=getSystemTime() — no "success" message
  const hashedPassword = await bcrypt.hash(trimmed, 10);
  session.user.password = hashedPassword;
  await db.updateUser(session.user.id, { passwordHash: hashedPassword });

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
    emitText(socket, '\r\nInvalid number. Please enter 0-100.\r\n');
    emitText(socket, 'Lines Per Screen (0=Auto): ');
    return;
  }

  session.user.linesPerScreen = lines === 0 ? null : lines;
  await db.updateUser(session.user.id, { linesPerScreen: session.user.linesPerScreen });

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Display numbered computer list and prompt (chooseComputer - express.e:11319-11346)
 * Two-column layout: \d[2]> \l\s[34]
 */
async function _displayComputerList(socket: any, session: BBSSession): Promise<void> {
  let choices: string[] = [];

  try {
    const repo = db.getConfigRepository();
    if (repo && typeof repo.getAllComputerTypes === 'function') {
      const records = repo.getAllComputerTypes();
      if (Array.isArray(records) && records.length > 0) {
        choices = records
          .filter((c: any) => c.enabled !== false)
          .sort((a: any, b: any) => a.computer_number - b.computer_number)
          .map((c: any) => c.computer_name);
      }
    }
  } catch (_e) { /* fall through to defaults */ }

  if (choices.length === 0) {
    choices = [
      'AMiGA 500', 'AMiGA 2000', 'AMiGA 3000', 'AMiGA 4000', 'AMiGA 1200',
      'IBM PC/Compatible', 'Macintosh', 'C64/128', 'Atari ST', 'Other'
    ];
  }

  // express.e:11323-11333 - FOR stat:=0 TO computerTypes.count()-1 STEP 2, two-column display
  for (let i = 0; i < choices.length; i += 2) {
    const left = `${String(i + 1).padStart(2, ' ')}> ${choices[i].padEnd(34, ' ')}`;
    if (i + 1 < choices.length) {
      emitText(socket, `${left}${String(i + 2).padStart(2, ' ')}> ${choices[i + 1]}\r\n`);
    } else {
      emitText(socket, `${left}\r\n`);
    }
  }
  emitText(socket, '\r\n');

  // express.e:11337 - aePuts('Choose computer type: ')
  emitText(socket, 'Choose computer type: ');

  session.tempData = session.tempData || {};
  session.tempData.computerChoices = choices;
  session.subState = LoggedOnSubState.W_EDIT_COMPUTER;
}

/**
 * Display numbered screen type list and prompt (chooseScreenType - express.e:11348-11368)
 * Single-column layout: \d> \l\s
 */
async function _displayScreenTypeList(socket: any, session: BBSSession): Promise<void> {
  let choices: string[] = [];

  try {
    const repo = db.getConfigRepository();
    if (repo && typeof repo.getAllScreenTypes === 'function') {
      const records = repo.getAllScreenTypes();
      if (Array.isArray(records) && records.length > 0) {
        choices = records
          .filter((c: any) => c.enabled !== false)
          .sort((a: any, b: any) => a.screen_number - b.screen_number)
          .map((c: any) => c.screen_title || c.screen_type);
      }
    }
  } catch (_e) { /* fall through to defaults */ }

  if (choices.length === 0) {
    choices = ['ANSI', 'ASCII', 'Amiga ANSI', 'VT100', 'RIP'];
  }

  // express.e:11353-11356 - FOR stat:=1 TO screenTypeTitle.count() single-column
  for (let i = 0; i < choices.length; i++) {
    emitText(socket, `${i + 1}> ${choices[i]}\r\n`);
  }

  // express.e:11359 - aePuts('\b\nChoose screen type: ')
  emitText(socket, '\r\nChoose screen type: ');

  session.tempData = session.tempData || {};
  session.tempData.screenTypeChoices = choices;
  session.subState = LoggedOnSubState.W_EDIT_SCREENTYPE;
}

/**
 * Handle edit computer input - express.e:25981-25986
 */
export async function handleWEditComputerInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:11336-11345 (chooseComputer jLoop6)
  // Accepts a 1-based number from the list, or empty to cancel
  const trimmed = input.trim();

  if (trimmed === '') {
    // Empty = cancel - express.e:11340 IF(StrLen(tempStr)=0) THEN RETURN RESULT_SUCCESS
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choices: string[] = session.tempData?.computerChoices || [];
  const num = parseInt(trimmed, 10);

  if (isNaN(num) || num < 1 || num > choices.length) {
    // Invalid - re-prompt loop (express.e:11342 IF((stat <= 0) OR (stat > computerTypes.count())) THEN JUMP jLoop6)
    await _displayComputerList(socket, session);
    return;
  }

  // express.e:11344 loggedOnUser.secBulletin:=stat-1
  const selectedName = choices[num - 1];
  session.user.computer = selectedName;
  await db.updateUser(session.user.id, { computer: selectedName });

  if (session.tempData) delete session.tempData.computerChoices;

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

/**
 * Handle edit screen type input - express.e:25987-25992
 */
export async function handleWEditScreentypeInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:11358-11367 (chooseScreenType stLoop5)
  // Accepts a 1-based number from the list, or empty to cancel
  const trimmed = input.trim();

  if (trimmed === '') {
    // Empty = cancel - express.e:11362 IF(StrLen(tempStr)=0) THEN RETURN RESULT_SUCCESS
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choices: string[] = session.tempData?.screenTypeChoices || [];
  const num = parseInt(trimmed, 10);

  if (isNaN(num) || num < 1 || num > choices.length) {
    // Invalid - re-prompt loop (express.e:11364 IF((stat <= 0) OR (stat > screenTypeTitle.count())) THEN JUMP stLoop5)
    await _displayScreenTypeList(socket, session);
    return;
  }

  // express.e:11366 loggedOnUser.screenType:=stat-1
  const selectedName = choices[num - 1];
  session.user.screenType = selectedName;
  await db.updateUser(session.user.id, { screenType: selectedName });

  if (session.tempData) delete session.tempData.screenTypeChoices;

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

  // Protocol selection mapping
  const protocolMap: { [key: string]: string } = {
    '1': 'zmodem',
    '2': 'ymodem',
    '3': 'xmodem-1k',
    '4': 'xmodem-crc',
    '5': 'xmodem',
    '6': 'punter',
    '7': 'websocket'
  };

  const selectedProtocol = protocolMap[trimmed];

  if (!selectedProtocol) {
    emitText(socket, '\r\nInvalid selection. Please enter 1-7.\r\n');
    emitText(socket, 'Select (1-7) or <CR>=Cancel: ');
    return;
  }

  // Update user protocol
  session.user.protocol = selectedProtocol;
  await db.updateUser(session.user.id, { protocol: selectedProtocol });

  const { PROTOCOL_DISPLAY_NAMES } = require('../../types');
  const protocolName = PROTOCOL_DISPLAY_NAMES[selectedProtocol] || selectedProtocol.toUpperCase();
  emitText(socket, `\r\nProtocol set to: ${protocolName}\r\n`);

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

// WEB_: MODERN_* — modem emulation speed input handler; no express.e counterpart
export async function handleWEditModemSpeedInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choice = parseInt(trimmed, 10);
  if (isNaN(choice) || choice < 0 || choice >= MODEM_OPTIONS.length) {
    emitText(socket, `\r\nInvalid selection. Use 0-${MODEM_OPTIONS.length - 1}.\r\n`);
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const bps = MODEM_OPTIONS[choice].bps;
  session.modemBps = bps;
  session.modemEmulationEnabled = bps > 0;
  await db.updateUser(session.user.id, { baud: bps });
  session.user.baud = bps;

  // Update modem emulator with new baud rate
  const { getModemEmulator } = require('../../utils/modem-emulator.util');
  const modemEmulator = getModemEmulator(socket);
  // Ensure modem emulator is installed (might not be if user started with baud=0)
  modemEmulator.install();
  if (bps > 0) {
    modemEmulator.enable(bps);
console.log(`[W Command] Modem emulation set to ${bps} bps`);
  } else {
    modemEmulator.disable();
console.log(`[W Command] Modem emulation disabled (full speed)`);
  }

  // Send updated modem speed to frontend for client-side emulation
  // Also track in session so doors can query it via bbs.getModemSpeed()
console.log(`[W Command] Emitting modem-speed event with bps=${bps}`);
  (session as any).modemSpeed = bps;
  socket.emit('modem-speed', bps);
console.log(`[W Command] modem-speed event emitted`);

  // Disable AnsiBuffer batching when modem emulation is enabled
  const { getAnsiBuffer } = require('../../utils/ansi-buffer.util');
  const ansiBuffer = getAnsiBuffer(socket);
  ansiBuffer.setFlushDelay(bps > 0 ? 0 : 16);

  _displayWCommandMenu(socket, session);
  session.subState = LoggedOnSubState.W_OPTION_SELECT;
}

// WEB_: MODERN_* — terminal font selection input handler; no express.e counterpart
export async function handleWEditFontInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = input.trim();
  if (trimmed === '') {
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  const choice = parseInt(trimmed, 10);
  const fontMap: { [key: string]: string } = {
    '1': 'TopazPlus_a1200',
    '2': 'TopazPlus_a500',
    '3': 'Topaz_a1200',
    '4': 'Topaz_a500',
    '5': 'mosoul'
  };

  const selectedFont = fontMap[trimmed];
  if (!selectedFont) {
    emitText(socket, '\r\nInvalid selection. Use 1-5.\r\n');
    _displayWCommandMenu(socket, session);
    session.subState = LoggedOnSubState.W_OPTION_SELECT;
    return;
  }

  // Update user font preference
  await db.updateUser(session.user.id, { fontPreference: selectedFont });
  session.user.fontPreference = selectedFont;

  // Send font change event to frontend
  socket.emit('set-font', selectedFont);
  emitText(socket, `\r\nFont set to: ${selectedFont}\r\n`);

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
