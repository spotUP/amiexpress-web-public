/**
 * System Commands Handler - System operations and messaging
 *
 * Implements system commands from express.e:
 * - G: Goodbye/Logoff (internalCommandG - express.e:25047-25075)
 * - Q: Quiet Mode toggle (internalCommandQ - express.e:25504-25516)
 * - H: Help system (internalCommandH - express.e:25075-25087)
 * - R: Read messages (internalCommandR - express.e:25518-25532) - See messaging.handler.ts
 * - E: Enter message (internalCommandE - express.e:24860-24868) - See messaging.handler.ts
 */

import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { BBSState, LoggedOnSubState } from '../../constants/bbs-states';
import type { BBSSession } from '../../index';
import { FileFlagManager } from '../../utils/file-flag.util';
import { config } from '../../config';
import { finalizeCommand } from '../../utils/command-response.util';

// Injected dependencies
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => Promise<boolean>;
let _findSecurityScreen: (screenBasePath: string, userSecLevel: number, petsciiMode?: boolean, ripMode?: boolean) => string | null;

// Injection function
export function setSystemCommandsDependencies(deps: {
  displayScreen: typeof _displayScreen;
  findSecurityScreen: typeof _findSecurityScreen;
}) {
  _displayScreen = deps.displayScreen;
  _findSecurityScreen = deps.findSecurityScreen;
}

/**
 * Handle G command - Goodbye/Logoff
 * 1:1 port from express.e:25047-25075 internalCommandG()
 */
export async function handleGoodbyeCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // express.e:25050-25055 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  let auto = false;

  if (parsedParams.length > 0) {
    // Check for 'Y' parameter (auto-logout without prompts)
    auto = ParamsUtil.hasFlag(parsedParams, 'Y');
  }

  // Ensure flag manager exists (Partdownload/flagged slot files)
  if (!session.flagManager) {
    const dataDir = config.get('dataDir');
    const slot = session.user?.slotNumber || 0;
    session.flagManager = new FileFlagManager(dataDir, slot, session.nodeId || 0);
  }

  if (!auto) {
    // express.e:25057-25064 - Check for partial uploads and flagged files
    // partUploadOK() - For web version, we don't have partial uploads
    // checkFlagged() - Check if user has flagged files for download

    const flaggedCount = session.flagManager?.getCount
      ? session.flagManager.getCount()
      : (session.flaggedFiles ? session.flaggedFiles.length : 0);

    if (flaggedCount > 0) {
      // express.e:12670-12672: '\r\nYou have flagged files still not downloaded.\r\nDo you leave without them? '
      // then yesNo(2) — Y=yes leave (proceed logoff), N/CR=no cancel logoff
      session.tempData = session.tempData || {};
      session.tempData.pendingGoodbye = true;
      socket.emit('ansi-output', '\r\nYou have flagged files still not downloaded.\r\nDo you leave without them? \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
      session.subState = LoggedOnSubState.BATCH_DOWNLOAD_CONFIRM;
      return;
    }
  }

  // express.e:25064 - saveFlagged()
  // Save flagged files list (for web version, this is handled in session)

  // express.e:25065 - saveHistory()
  // CRITICAL: Save command history NOW, before disconnect, per express.e
  // Previously this was only in disconnect cleanup, causing a race condition
  // where history was lost if user logged in again within 15 seconds
  if (session.user?.id) {
    try {
      const { saveHistory } = require('../../utils/command-history.util');
      await saveHistory(session, session.user.id);
console.log(`[LOGOFF] Saved command history for user ${session.user.username}`);
    } catch (err) {
console.error('[LOGOFF] Failed to save command history:', err);
    }
  }

  // express.e:25066 - reqState:=REQ_STATE_LOGOFF
  // express.e:25069 - setEnvStat(ENV_LOGOFF)
console.log('[ENV] Logoff');

  // Set session state to logoff
  session.subState = LoggedOnSubState.LOGOFF;

  // express.e:8187 - displayScreen(SCREEN_LOGOFF)
  // Display Logoff.txt screen file which contains ~XIDOORS:who/No
console.log('[LOGOFF] Displaying Logoff screen with NO door execution');
  // Reset shortcuts on exit (express.e:8124)
  session.cmdShortcuts = false;
  if (session.shortcuts) session.shortcuts.clear();
  session.doorExpertMode = false;
  session.menuPause = true; // ensure next displayMainMenu shows if invoked during logoff edge cases
  const logoffDisplayed = await _displayScreen(socket, session, 'Logoff');

  if (!logoffDisplayed) {
    // Fallback if Logoff.txt doesn't exist
    // express.e:25047 internalCommandG - no header, just processes logoff
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Thank you for calling ' + (session.user?.bbsName || 'AmiExpress BBS') + '\r\n');
    socket.emit('ansi-output', '\r\n');
  }

  // Persist flagged list (express.e saveFlagged) before dropping carrier
  try {
    session.flagManager?.save();
  } catch (err) {
console.error('[LOGOFF] Failed to save flagged files:', err);
  }

  // express.e:8234-8293 - Check relogon flag to determine next state
  // IF (relogon)
  //   processSysCommand('RELOGON')
  //   StringF(tempstr,'RELOGON\d',node)
  //   processSysCommand(tempstr)
  // ...
  // IF (relogon=FALSE)
  //   state:=STATE_AWAIT
  //   modemOffHook()
  // ELSE
  //   state:=STATE_LOGON
  //   relogon:=FALSE
  // ENDIF
  if (session.relogon) {
    // Relogon requested - run RELOGON commands and return to login
    console.log('[LOGOFF] Relogon requested - processing RELOGON commands');

    // express.e:8235-8237 - Run RELOGON and RELOGONn system commands
    try {
      const { processSysCommand } = require('../../utils/syscommand.util');
      await processSysCommand(socket, session, 'RELOGON');
      await processSysCommand(socket, session, `RELOGON${session.nodeId || 0}`);
    } catch (err) {
      console.error('[LOGOFF] Error processing RELOGON commands:', err);
    }

    // express.e:8291-8292 - Set state to LOGON and clear relogon flag
    session.state = BBSState.LOGON;
    session.relogon = false;

    console.log('[LOGOFF] Relogon complete - returning to login state');
    socket.emit('ansi-output', '\r\n');

    // Return to login flow (don't disconnect)
    const { handleLoginPrompt } = require('../login.handler');
    await handleLoginPrompt(socket, session);
    return;
  }

  // Normal logout - express.e:8284-8289
  session.state = BBSState.AWAIT;

  // express.e:8191 aePuts('\b\nClick...') — express.e relies on the modem to print
  // "NO CARRIER" when the line drops. WEB_: there's no modem in our path, so we
  // append the conventional "NO CARRIER" string ourselves so users get the same
  // retro disconnect feel.
  socket.emit('ansi-output', '\r\nClick...\r\nNO CARRIER\r\n');

  // Emit disconnect event to close connection (give time for screen to display and door to run)
  setTimeout(() => {
    socket.emit('force-disconnect', { reason: 'User logged off' });
    // socket may be a socket.io client or a raw telnet/ssh socket
    if (typeof (socket as any).disconnect === 'function') {
      (socket as any).disconnect(true);
    } else if (typeof (socket as any).end === 'function') {
      (socket as any).end();
    } else if (typeof (socket as any).destroy === 'function') {
      (socket as any).destroy();
    }
  }, 2000);
}

/**
 * Handle Q command - Quiet Mode Toggle
 * 1:1 port from express.e:25504-25516 internalCommandQ()
 */
export function handleQuietModeCommand(socket: any, session: BBSSession): void {
  // express.e:25505 - Check ACS_QUIET_NODE permission
  if (!checkSecurity(session.user, ACSPermission.QUIET_NODE)) {
    ErrorHandler.permissionDenied(socket, 'toggle quiet mode', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25506-25512 - Toggle quiet mode flag
  session.quietMode = !session.quietMode;

  // Send quiet flag to other systems (for web version, this is just local)
  // sendQuietFlag(quietFlag) - express.e:25507

  // express.e:25508-25511 — plain text, no decoration, no press-key
  if (session.quietMode) {
    socket.emit('ansi-output', '\r\nQuiet Mode On\r\n');
  } else {
    socket.emit('ansi-output', '\r\nQuiet Mode Off\r\n');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle H command - Help System
 * 1:1 port from express.e:25075-25087 internalCommandH()
 */
export function handleHelpCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25079-25081 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  // express.e:25076 - nonStopDisplayFlag:=paramsContains('NS')
  ParamsUtil.hasFlag(parsedParams, 'NS'); // consumed; no CLS emitted (express.e:25071-25087 has none)

  // express.e:25083 - Find help file
  // StringF(tempstr,'\sBBSHelp',cmds.bbsLoc)
  const helpBasePath = 'BBSHelp';

  // express.e:25084 - findSecurityScreen()
  const helpScreenPath = _findSecurityScreen(helpBasePath, session.user?.secLevel || 0, session.petsciiMode, session.ripMode);

  if (helpScreenPath) {
    // express.e:25085 - displayFile(screen)
    _displayScreen(socket, session, helpScreenPath);

  } else {
    // express.e:25083: '\b\n\b\nSorry Help is unavailable at this time.\b\n\b\n'
    socket.emit('ansi-output', '\r\n\r\nSorry Help is unavailable at this time.\r\n\r\n');
  }

  finalizeCommand(socket, session, 'Help information displayed');
}

/**
 * Handle R command - Read Messages
 * 1:1 port from express.e:25518-25532 internalCommandR()
 * Implementation in messaging.handler.ts
 */
export async function handleReadMessagesCommand(socket: any, session: BBSSession, params: string = ''): Promise<void> {
  // CJS require, not ESM import(): tsx keeps ESM and CJS caches separate,
  // so a dynamic import() would resolve messaging.handler to a different
  // module instance than initialization.ts's static-import-compiled-to-
  // require, leaving _db undefined on the wrong instance (2026-04-24 bug).
  const { handleReadMessagesFullCommand } = require('../message/messaging.handler');
  await handleReadMessagesFullCommand(socket, session, params);
}

/**
 * Handle E command - Enter Message
 * 1:1 port from express.e:24860-24868 internalCommandE() -> express.e:10749+ enterMSG()
 */
export function handleEnterMessageCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:24861 - Check ACS_ENTER_MESSAGE permission
  if (!checkSecurity(session.user, ACSPermission.ENTER_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'enter message', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24862 - setEnvStat(ENV_MAIL)
console.log('[ENV] Mail - Enter');

  // express.e:24863 - parseParams(params)
  const parsedParams = ParamsUtil.parse(params);

  // Initialize message entry state - express.e:10749+ enterMSG()
  session.tempData = {
    messageEntry: {
      toUser: parsedParams.length > 0 ? parsedParams[0] : '',
      subject: '',
      isPrivate: false,
      body: [],
      currentLine: 0,
      parentId: null  // Set by Reply command (not yet implemented)
    }
  };

  // Start message entry flow - express.e:10749+ enterMSG()
  // express.e:9998-10000 msgToHeader(): separator box + To: (Enter)='ALL'? prompt
  const msgToHeader = '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n'
                    + '     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ';

  // If recipient was provided in params (express.e:10765-10772)
  if (session.tempData.messageEntry.toUser && session.tempData.messageEntry.toUser.length > 0) {
    socket.emit('ansi-output', msgToHeader + session.tempData.messageEntry.toUser + '\r\n');
    promptForSubject(socket, session);
  } else {
    // Prompt for recipient - express.e:10778-10783
    socket.emit('ansi-output', msgToHeader);
    session.subState = LoggedOnSubState.POST_MESSAGE_TO;
  }
}

/**
 * Prompt for message subject - express.e:10839-10849
 */
function promptForSubject(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', `${AnsiUtil.colorize('Subject:', 'cyan')} ${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Blank', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('abort', 'yellow')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}
