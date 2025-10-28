/**
 * Preference & Chat Commands Handler
 *
 * Implements user preference toggles and chat/communication commands as 1:1 ports from express.e:
 * - M (ANSI Mode Toggle) - Toggle ANSI color on/off - express.e:25239-25248
 * - X (Expert Mode Toggle) - Toggle expert mode on/off - express.e:26113-26122
 * - C (Comment to Sysop) - Leave comment for sysop - express.e:24658-24670
 * - O (Page Sysop) - Request chat with sysop - express.e:25372-25404
 * - OLM (Online Message) - Send node-to-node message - express.e:25406-25470
 */

import { LoggedOnSubState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { ParamsUtil } from '../utils/params.util';

// Types
interface BBSSession {
  user?: any;
  subState?: string;
  expertMode?: boolean;
  ansiMode?: boolean;
  [key: string]: any;
}

// Dependencies injected from index.ts
let _startSysopPage: (socket: any, session: BBSSession) => void;
let _db: any;

/**
 * Set dependencies for preference/chat commands (called from index.ts)
 */
export function setPreferenceChatCommandsDependencies(deps: {
  startSysopPage: typeof _startSysopPage;
  db?: any;
}) {
  _startSysopPage = deps.startSysopPage;
  if (deps.db) _db = deps.db;
}

/**
 * M Command - ANSI Mode Toggle
 *
 * From express.e:25239-25248:
 * PROC internalCommandM()
 *   IF(ansiColour)
 *     ansiColour:=FALSE
 *     aePuts('\b\nAnsi Color Off\b\n')
 *   ELSE
 *     ansiColour:=TRUE
 *     aePuts('\b\nAnsi Color On\b\n')
 *   ENDIF
 * ENDPROC RESULT_SUCCESS
 *
 * Toggles ANSI color output for the current session.
 */
export function handleAnsiModeCommand(socket: any, session: BBSSession): void {
  if (session.ansiMode) {
    session.ansiMode = false;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Ansi Color Off\r\n');
    socket.emit('ansi-output', '\r\n');
  } else {
    session.ansiMode = true;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.successLine('Ansi Color On'));
    socket.emit('ansi-output', '\r\n');
  }

  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * X Command - Expert Mode Toggle
 *
 * From express.e:26113-26122:
 * PROC internalCommandX()
 *   IF loggedOnUser.expert="X"
 *     aePuts('\b\nExpert mode disabled\b\n')
 *     loggedOnUser.expert:="N"
 *   ELSE
 *     aePuts('\b\nExpert mode enabled\b\n')
 *     loggedOnUser.expert:="X"
 *   ENDIF
 * ENDPROC RESULT_SUCCESS
 *
 * Toggles expert mode (hides menu, single-key commands).
 */
export async function handleExpertModeCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:26113-26122 - Toggle expert mode flag
  console.log('🔧 [X Command] Before toggle - session.user.expert:', session.user.expert);

  if (session.user.expert) {
    session.user.expert = false;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Expert mode disabled\r\n');
    socket.emit('ansi-output', '\r\n');
  } else {
    session.user.expert = true;
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Expert mode enabled\r\n');
    socket.emit('ansi-output', '\r\n');
  }

  console.log('🔧 [X Command] After toggle - session.user.expert:', session.user.expert);

  // Save expert mode preference to database
  if (_db) {
    console.log('🔧 [X Command] Saving to database - user.id:', session.user.id, 'expert:', session.user.expert);
    await _db.updateUser(session.user.id, { expert: session.user.expert });
    console.log('🔧 [X Command] Database update complete');
  } else {
    console.log('⚠️  [X Command] _db not available, cannot save to database!');
  }

  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  console.log('🔧 [X Command] Setting subState to DISPLAY_MENU');
}

/**
 * C Command - Comment to Sysop
 *
 * From express.e:24658-24670:
 * PROC internalCommandC(params)
 *   DEF res
 *   IF checkSecurity(ACS_COMMENT_TO_SYSOP)=FALSE THEN RETURN RESULT_NOT_ALLOWED
 *   setEnvStat(ENV_MAIL)
 *   parseParams(params)
 *   mciViewSafe:=FALSE
 *   IF checkToolTypeExists(TOOLTYPE_CONF,currentConf,'CUSTOM')=FALSE
 *     res:=commentToSYSOP()
 *   ELSE
 *     customMsgbaseCmd(MAIL_SYSOP_COMMENT,currentConf,1)
 *   ENDIF
 *   mciViewSafe:=TRUE
 * ENDPROC res
 *
 * Allows user to leave a private comment/message for the sysop.
 */
export function handleCommentToSysopCommand(socket: any, session: BBSSession, params: string = ''): void {
  if (!checkSecurity(session.user, ACSPermission.COMMENT_TO_SYSOP)) {
    ErrorHandler.permissionDenied(socket, 'leave comments for sysop', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Mail');

  // express.e:24662-24664 - Start private message to sysop
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Comment to Sysop'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `Conference: ${session.currentConfName}\r\n`);
  socket.emit('ansi-output', 'To: sysop\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Enter subject for your comment (or press Enter to abort):\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Subject: ', 'green'));

  // Set up message entry with recipient pre-set to sysop
  session.inputBuffer = '';
  session.tempData = {
    isPrivate: true,
    messageEntry: {
      toUser: 'sysop'  // Pre-set recipient to sysop
    }
  };
  // Go directly to subject input since recipient is already set
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}

/**
 * O Command - Page Sysop (Request Chat)
 *
 * From express.e:25372-25404:
 * PROC internalCommandO()
 *   - If pagesAllowed=0, fall back to commentToSYSOP()
 *   - Decrement pagesAllowed (if not -1 = unlimited)
 *   - Check ACS_PAGE_SYSOP permission
 *   - Set ENV_REQ_CHAT environment status
 *   - Call sysopPaged() to notify sysop
 *   - If sysop not available and no override: show message
 *   - If sysop available: call ccom() for chat session
 * ENDPROC result
 *
 * Allows user to page the sysop for a chat session.
 */
export function handlePageSysopCommand(socket: any, session: BBSSession): void {
  // Check if pages are exhausted (pagesAllowed = 0)
  if (session.pagesAllowed === 0) {
    // Fall back to comment system
    console.log('[ENV] Mail');

    if (!checkSecurity(session.user, ACSPermission.COMMENT_TO_SYSOP)) {
      ErrorHandler.permissionDenied(socket, 'leave comments for sysop', {
        nextState: LoggedOnSubState.DISPLAY_MENU
      });
      return;
    }

    // Redirect to comment system
    handleCommentToSysopCommand(socket, session);
    return;
  }

  // Decrement pages allowed (if not unlimited = -1)
  if (session.pagesAllowed && session.pagesAllowed !== -1) {
    session.pagesAllowed--;
  }

  // Check page permission
  if (!checkSecurity(session.user, ACSPermission.PAGE_SYSOP)) {
    ErrorHandler.permissionDenied(socket, 'page the sysop', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Request Chat');

  // Call sysop page system (from chat.handler.ts)
  _startSysopPage(socket, session);
}

/**
 * OLM Command - Online Message (Node-to-Node Message)
 *
 * From express.e:25406-25470:
 * PROC internalCommandOLM(params)
 *   - Check ACS_OLM permission and multicom toggle
 *   - Set ENV_ONLINEMSG environment status
 *   - Show "OLM MESSAGE SYSTEM" header
 *   - Prompt for node number or R to reply
 *   - Accept Q to quit
 *   - Use message editor (edit() function)
 *   - Validate node number and status
 *   - Check if node has messages suppressed (olmBlocked)
 *   - Send message to destination node
 * ENDPROC result
 *
 * Allows users to send real-time messages to other logged-in nodes.
 */
export function handleOnlineMessageCommand(socket: any, session: BBSSession, params: string = ''): void {
  if (!checkSecurity(session.user, ACSPermission.OLM)) {
    ErrorHandler.permissionDenied(socket, 'send online messages', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  console.log('[ENV] Online Message');

  // TODO: Implement OLM system - requires:
  // 1. Multi-node session tracking
  // 2. Node status monitoring
  // 3. Real-time message delivery
  // 4. Message editor integration
  // 5. Reply tracking (lastOlmNode)

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'blue'));
  socket.emit('ansi-output', 'OLM MESSAGE SYSTEM');
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', AnsiUtil.warningLine('Online message system not yet implemented'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'This would allow you to send messages to other nodes in real-time.\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}
