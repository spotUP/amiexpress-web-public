/**
 * System Commands Handler - System operations and messaging stubs
 *
 * Implements system commands from express.e:
 * - G: Goodbye/Logoff (internalCommandG - express.e:25047-25075)
 * - Q: Quiet Mode toggle (internalCommandQ - express.e:25504-25516)
 * - H: Help system (internalCommandH - express.e:25075-25087)
 * - R: Read messages (internalCommandR - express.e:25518-25532) [STUB]
 * - E: Enter message (internalCommandE - express.e:24860-24868) [STUB]
 */

import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { ParamsUtil } from '../utils/params.util';
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';

// Types
interface BBSSession {
  user?: any;
  state: string;
  subState: string;
  quietMode?: boolean;
  flaggedFiles?: any[];
  commandHistory?: string[];
  socket?: any;
}

// Injected dependencies
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => boolean;
let _findSecurityScreen: (screenBasePath: string, userSecLevel: number) => string | null;

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
export function handleGoodbyeCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25050-25055 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  let auto = false;

  if (parsedParams.length > 0) {
    // Check for 'Y' parameter (auto-logout without prompts)
    auto = ParamsUtil.hasFlag(parsedParams, 'Y');
  }

  if (!auto) {
    // express.e:25057-25064 - Check for partial uploads and flagged files
    // partUploadOK() - For web version, we don't have partial uploads
    // checkFlagged() - Check if user has flagged files for download

    if (session.flaggedFiles && session.flaggedFiles.length > 0) {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.warningLine(`You have ${session.flaggedFiles.length} flagged file(s) for download.`));
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.complexPrompt([
        { text: 'Download them now? ', color: 'white' },
        { text: '(Y/N)', color: 'cyan' },
        { text: ': ', color: 'white' }
      ]));

      // Set state to wait for flagged download confirmation
      session.subState = 'FLAGGED_DOWNLOAD_CONFIRM';
      return;
    }
  }

  // express.e:25066 - saveFlagged()
  // Save flagged files list (for web version, this is handled in session)

  // express.e:25067 - saveHistory()
  // Save command history (for web version, this is handled in session)

  // express.e:25068 - reqState:=REQ_STATE_LOGOFF
  // express.e:25069 - setEnvStat(ENV_LOGOFF)
  console.log('[ENV] Logoff');

  // Display goodbye screen
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Goodbye!'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.successLine('Thank you for calling ' + (session.user?.bbsName || 'AmiExpress BBS')));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Disconnecting...', 'yellow') + '\r\n');

  // Set session state to logoff
  session.state = BBSState.AWAIT;
  session.subState = 'LOGOFF';

  // Emit disconnect event to close connection
  setTimeout(() => {
    socket.emit('force-disconnect', { reason: 'User logged off' });
    socket.disconnect(true);
  }, 1000);
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

  if (session.quietMode) {
    socket.emit('ansi-output', '\r\n' + AnsiUtil.successLine('Quiet Mode On') + '\r\n');
  } else {
    socket.emit('ansi-output', '\r\n' + AnsiUtil.successLine('Quiet Mode Off') + '\r\n');
  }

  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle H command - Help System
 * 1:1 port from express.e:25075-25087 internalCommandH()
 */
export function handleHelpCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25079-25081 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  const nonStopDisplay = ParamsUtil.hasFlag(parsedParams, 'NS');

  // express.e:25083 - Find help file
  // StringF(tempstr,'\sBBSHelp',cmds.bbsLoc)
  const helpBasePath = 'BBSHelp';

  // express.e:25084 - findSecurityScreen()
  const helpScreenPath = _findSecurityScreen(helpBasePath, session.user?.secLevel || 0);

  if (helpScreenPath) {
    // express.e:25085 - displayFile(screen)
    _displayScreen(socket, session, helpScreenPath);

    if (!nonStopDisplay) {
      socket.emit('ansi-output', '\r\n');
      socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    }
  } else {
    // express.e:25087 - Help unavailable message
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Sorry Help is unavailable at this time.'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle R command - Read Messages [STUB]
 * 1:1 port from express.e:25518-25532 internalCommandR()
 */
export function handleReadMessagesCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:25519 - Check ACS_READ_MESSAGE permission
  if (!checkSecurity(session.user, ACSPermission.READ_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'read messages', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25520 - setEnvStat(ENV_MAIL)
  console.log('[ENV] Mail - Read');

  // express.e:25521 - parseParams(params)
  const parsedParams = ParamsUtil.parse(params);

  // express.e:25523 - getMailStatFile(currentConf, currentMsgBase)
  // This loads message base statistics

  // express.e:25525-25530 - Call message reader
  // callMsgFuncs(MAIL_READ, currentConf, currentMsgBase)

  // TODO: Implement message reading system
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Read Messages'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.warningLine('Message reading system not yet implemented'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('This will display messages in the current conference/message base.', 'white') + '\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.subState = LoggedOnSubState.DISPLAY_MENU;
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
      currentLine: 0
    }
  };

  // Start message entry flow - express.e:10768-10788 (recipient prompt)
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Enter Message'));
  socket.emit('ansi-output', '\r\n');

  // If recipient was provided in params, skip to subject
  if (session.tempData.messageEntry.toUser && session.tempData.messageEntry.toUser.length > 0) {
    socket.emit('ansi-output', `${AnsiUtil.colorize('To:', 'cyan')} ${session.tempData.messageEntry.toUser}\r\n`);
    promptForSubject(socket, session);
  } else {
    // Prompt for recipient - express.e:10771
    socket.emit('ansi-output', `${AnsiUtil.colorize('To:', 'cyan')} ${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Blank', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('ALL', 'yellow')}${AnsiUtil.colorize('?', 'green')} `);
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
