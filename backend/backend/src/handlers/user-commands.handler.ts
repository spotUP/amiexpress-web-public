/**
 * User Commands Handler - User statistics and conference switching
 *
 * Implements common user commands from express.e:
 * - S: Display user statistics (internalCommandS - express.e:25540-25568)
 * - J: Join conference (internalCommandJ - express.e:25113-25183)
 * - U: Upload files (internalCommandU - express.e:25646-25658)
 * - D: Download files (internalCommandD - express.e:24853-24857)
 */

import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { ParamsUtil } from '../utils/params.util';
import { LoggedOnSubState } from '../constants/bbs-states';

// Types
interface BBSSession {
  user?: any;
  currentConf?: number;
  currentMsgBase?: number;
  confRJoin?: number;
  msgBaseRJoin?: number;
  subState: string;
  callerNum?: number;
}

interface Conference {
  id: number;
  name: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

interface Database {
  query: (sql: string, params: any[]) => Promise<{ rows: any[] }>;
}

// Injected dependencies
let _conferences: Conference[] = [];
let _messageBases: MessageBase[] = [];
let _db: Database;
let _joinConference: (socket: any, session: BBSSession, confId: number, msgBaseId: number) => Promise<boolean>;
let _checkConfAccess: (user: any, confNum: number) => boolean;
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => boolean;
let _displayUploadInterface: (socket: any, session: BBSSession, params: string) => void;
let _displayDownloadInterface: (socket: any, session: BBSSession, params: string) => void;

// Injection functions
export function setUserCommandsDependencies(deps: {
  conferences: Conference[];
  messageBases: MessageBase[];
  db: Database;
  joinConference: typeof _joinConference;
  checkConfAccess: typeof _checkConfAccess;
  displayScreen: typeof _displayScreen;
  displayUploadInterface: typeof _displayUploadInterface;
  displayDownloadInterface: typeof _displayDownloadInterface;
}) {
  _conferences = deps.conferences;
  _messageBases = deps.messageBases;
  _db = deps.db;
  _joinConference = deps.joinConference;
  _checkConfAccess = deps.checkConfAccess;
  _displayScreen = deps.displayScreen;
  _displayUploadInterface = deps.displayUploadInterface;
  _displayDownloadInterface = deps.displayDownloadInterface;
}

/**
 * Handle S command - Display user statistics
 * 1:1 port from express.e:25540-25568 internalCommandS()
 */
export function handleUserStatsCommand(socket: any, session: BBSSession): void {
  // express.e:25542 - Check ACS_DISPLAY_USER_STATS permission
  if (!checkSecurity(session.user, ACSPermission.DISPLAY_USER_STATS)) {
    ErrorHandler.permissionDenied(socket, 'view user statistics', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25544 - setEnvStat(ENV_STATS)
  console.log('[ENV] User Statistics');

  // express.e:25546 - aePuts('\b\n')
  socket.emit('ansi-output', '\r\n');

  // Display user statistics (express.e:25548-25568)
  const user = session.user;

  // User Number (express.e:25548-25550)
  if (user.slotNumber !== undefined) {
    socket.emit('ansi-output', AnsiUtil.colorize('User Number', 'green') +
      AnsiUtil.colorize(':', 'yellow') + ' ' + user.slotNumber + '\r\n');
  }

  // Area Name (express.e:25552-25554)
  if (user.conferenceAccess) {
    socket.emit('ansi-output', AnsiUtil.colorize('Area Name  ', 'green') +
      AnsiUtil.colorize(':', 'yellow') + ' ' + user.conferenceAccess + '\r\n');
  }

  // Caller Number (express.e:25556)
  const callerNum = session.callerNum || 0;
  socket.emit('ansi-output', AnsiUtil.colorize('Caller Num.', 'green') +
    AnsiUtil.colorize(':', 'yellow') + ' ' + callerNum + '\r\n');

  // Last Date On (express.e:25557-25559)
  if (user.timeLastOn) {
    const lastDate = new Date(user.timeLastOn).toLocaleString();
    socket.emit('ansi-output', AnsiUtil.colorize('Lst Date On', 'green') +
      AnsiUtil.colorize(':', 'yellow') + ' ' + lastDate + '\r\n');
  }

  // Security Level (express.e:25560-25561)
  const secLevel = user.secLevel || 0;
  socket.emit('ansi-output', AnsiUtil.colorize('Security Lv', 'green') +
    AnsiUtil.colorize(':', 'yellow') + ' ' + secLevel + '\r\n');

  // Times Called (express.e:25562-25563)
  const timesCalled = user.timesCalled || 0;
  socket.emit('ansi-output', AnsiUtil.colorize('# Times On ', 'green') +
    AnsiUtil.colorize(':', 'yellow') + ' ' + timesCalled + '\r\n');

  // Times Today (express.e:25564-25565)
  const timesToday = user.timesToday || 0;
  socket.emit('ansi-output', AnsiUtil.colorize('Times Today', 'green') +
    AnsiUtil.colorize(':', 'yellow') + ' ' + timesToday + '\r\n');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle J command - Join conference
 * 1:1 port from express.e:25113-25183 internalCommandJ()
 */
export async function handleJoinConferenceCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): Promise<void> {
  // express.e:25119 - Check ACS_JOIN_CONFERENCE permission
  if (!checkSecurity(session.user, ACSPermission.JOIN_CONFERENCE)) {
    ErrorHandler.permissionDenied(socket, 'join conference', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25120 - saveMsgPointers(currentConf, currentMsgBase)
  // This is handled by joinConference function

  // express.e:25122 - setEnvStat(ENV_JOIN)
  console.log('[ENV] Join Conference');

  // express.e:25124-25136 - Parse parameters
  const parsedParams = ParamsUtil.parse(params);
  let newConf = -1;
  let newMsgBase = 1;

  if (parsedParams.length > 0) {
    const param = parsedParams[0];

    // express.e:25129 - Check for "." separator (e.g., "3.2")
    if (param.includes('.')) {
      const parts = param.split('.');
      newConf = parseInt(parts[0], 10);
      newMsgBase = parseInt(parts[1], 10);
    } else {
      newConf = parseInt(param, 10);

      // express.e:25132-25133 - Second parameter is message base
      if (parsedParams.length > 1) {
        newMsgBase = parseInt(parsedParams[1], 10);
      }
    }
  }

  // express.e:25138 - getInverse (for inverse conference numbering)
  // For now, we use absolute numbering (not inverse)

  // express.e:25140-25150 - Prompt for conference number if invalid
  if (newConf < 1 || newConf > _conferences.length) {
    _displayScreen(socket, session, 'JOINCONF');

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Conference Number ', color: 'white' },
      { text: `(1-${_conferences.length})`, color: 'cyan' },
      { text: ': ', color: 'white' }
    ]));

    // Set state to wait for conference number input
    session.subState = 'JOIN_CONF_INPUT' as any;
    session.inputBuffer = '';
    return;
  }

  // express.e:25154-25160 - Check conference access
  if (!_checkConfAccess(session.user, newConf)) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('You do not have access to the requested conference'));
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // express.e:25162-25167 - Get conference message base count
  const confMessageBases = _messageBases.filter(mb => mb.conferenceId === newConf);
  const msgBaseCount = confMessageBases.length;

  // express.e:25169-25179 - Prompt for message base if invalid
  if (newMsgBase < 1 || newMsgBase > msgBaseCount) {
    _displayScreen(socket, session, 'CONF_JOINMSGBASE');

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Message Base Number ', color: 'white' },
      { text: `(1-${msgBaseCount})`, color: 'cyan' },
      { text: ': ', color: 'white' }
    ]));

    // Set state to wait for input
    session.subState = LoggedOnSubState.READ_COMMAND;
    // TODO: Add pendingJoinMsgBaseInput flag to session
    return;
  }

  // express.e:25181 - joinConf(newConf, newMsgBase, FALSE, FALSE)
  const msgBaseId = confMessageBases[newMsgBase - 1].id;
  await _joinConference(socket, session, newConf, msgBaseId);

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Handle U command - Upload files
 * 1:1 port from express.e:25646-25658 internalCommandU()
 */
export function handleUploadCommand(socket: any, session: BBSSession): void {
  // express.e:25648 - Check ACS_UPLOAD permission
  if (!checkSecurity(session.user, ACSPermission.UPLOAD)) {
    ErrorHandler.permissionDenied(socket, 'upload files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:25649 - setEnvStat(ENV_UPLOADING)
  console.log('[ENV] Uploading');

  // express.e:25651-25655 - Background file check (web version doesn't need this)
  // express.e:25656 - stat:=uploadaFile(0,cmdcode,FALSE)

  // Display upload interface (calls displayUploadInterface from file.handler.ts)
  _displayUploadInterface(socket, session, '');
}

/**
 * Handle D command - Download files
 * 1:1 port from express.e:24853-24857 internalCommandD()
 */
export function handleDownloadCommand(socket: any, session: BBSSession, params: string = ''): void {
  // express.e:24854 - Check ACS_DOWNLOAD permission
  if (!checkSecurity(session.user, ACSPermission.DOWNLOAD)) {
    ErrorHandler.permissionDenied(socket, 'download files', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // express.e:24855 - setEnvStat(ENV_DOWNLOADING)
  console.log('[ENV] Downloading');

  // express.e:24856 - beginDLF(cmdcode,params)
  // Display download interface (calls displayDownloadInterface from file.handler.ts)
  _displayDownloadInterface(socket, session, params);
}
