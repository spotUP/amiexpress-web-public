/**
 * User Commands Handler - User statistics and conference switching
 *
 * Implements common user commands from express.e:
 * - S: Display user statistics (internalCommandS - express.e:25540-25568)
 * - J: Join conference (internalCommandJ - express.e:25113-25183)
 * - U: Upload files (internalCommandU - express.e:25646-25658)
 * - D: Download files (internalCommandD - express.e:24853-24857)
 */

import * as fs from 'fs';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { ParamsUtil } from '../../utils/params.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { normalizeForComparison } from '../../utils/input-normalizer.util';
import { finalizeCommand } from '../../utils/command-response.util';
import type { BBSSession } from '../../index';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { ZmodemTransferManager, TransferTransport } from '../../services/zmodem-transfer.service';
import { flaggedFilesManager } from '../../services/FlaggedFilesManager';
import * as path from 'path';

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
let _displayScreen: (socket: any, session: BBSSession, screenName: string) => Promise<boolean>;
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

function getTransferTransport(session: BBSSession): TransferTransport {
  const transportType: TransferTransport['type'] =
    (session as any).connectionType === 'ssh'
      ? 'ssh'
      : (session as any).connectionType === 'telnet'
        ? 'telnet'
        : 'web';

  const send =
    (session as any).transferRawSend ||
    ((buf: Buffer) => {
      /* socket layer will be provided */
    });

  return { type: transportType, send };
}

function startZmodemUpload(socket: any, session: BBSSession): void {
  const bbsRoot =
    (session as any).bbsPath ||
    process.env.BBS_DATA_DIR ||
    path.resolve(process.cwd());
  const paths = new BBSPaths(bbsRoot);
  const playpen = paths.node(session.nodeId || 0).playpen();

  try {
    const fs = require('fs');
    fs.mkdirSync(playpen, { recursive: true });
  } catch (err) {
console.error('[ZMODEM] Failed to ensure playpen:', err);
  }

  const transport = getTransferTransport(session);
  if (!transport.send) {
    transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }

  const manager = new ZmodemTransferManager({
    session,
    transport,
    direction: 'upload',
    paths: [playpen],
    onComplete: (ok, detail) => {
      const list = (detail?.received || []).map((p) => path.basename(p)).join(', ');
      socket.emit(
        'ansi-output',
        `\r\n${ok ? 'Upload complete' : 'Upload aborted'}${list ? `: ${list}` : ''}\r\n`
      );
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.menuPause = true;
    },
  });

  (session as any).transferRawActive = true;
  (session as any).transferRawSink = (buf: Buffer) => manager.handleInput(buf);
  (session as any).transferRawSend = transport.send;
  (session as any).transferManager = manager;

  if (transport.type === 'web') {
    socket.emit('transfer-raw:init', {
      direction: 'upload',
      paths: [playpen],
    });
  } else {
    socket.emit('ansi-output', `\r\nReady to receive via ZMODEM. Send with rz now.\r\n`);
  }

  manager.start();
}

function startZmodemDownload(socket: any, session: BBSSession, files: string[]): void {
  if (!files || files.length === 0) {
    socket.emit('ansi-output', '\r\nNo files available for download.\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const transport = getTransferTransport(session);
  if (!transport.send) {
    transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }

  const manager = new ZmodemTransferManager({
    session,
    transport,
    direction: 'download',
    paths: files,
    onComplete: (ok, detail) => {
      const list = (detail?.sent || files).map((p) => path.basename(p)).join(', ');
      socket.emit(
        'ansi-output',
        `\r\n${ok ? 'Download complete' : 'Download aborted'}${list ? `: ${list}` : ''}\r\n`
      );
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.menuPause = true;
    },
  });

  (session as any).transferRawActive = true;
  (session as any).transferRawSink = (buf: Buffer) => manager.handleInput(buf);
  (session as any).transferRawSend = transport.send;
  (session as any).transferManager = manager;

  if (transport.type === 'web') {
    socket.emit('transfer-raw:init', {
      direction: 'download',
      paths: files,
    });
  } else {
    socket.emit('ansi-output', `\r\nStarting ZMODEM send... (sz)\r\n`);
  }

  manager.start();
}

function shouldShowJoinConferenceList(screenPath?: string): boolean {
  if (!screenPath) {
    return true;
  }

  try {
    const stats = fs.statSync(screenPath);
    return stats.size < 200;
  } catch {
    return true;
  }
}

function displayConferenceList(socket: any, session: BBSSession): void {
  if (_conferences.length === 0) {
    socket.emit('ansi-output', '\r\nNo conferences configured.\r\n');
    return;
  }

  // express.e:25143 - displayScreen(SCREEN_CONF_JOIN) then prompts
  // NO header like "-= AVAILABLE CONFERENCES =-"
  socket.emit('ansi-output', '\r\n');
  const currentConfId = session.currentConf;

  _conferences.forEach((conf, index) => {
    const indicator = conf.id === currentConfId ? ' <- Current' : '';
    socket.emit('ansi-output', ` ${String(index + 1).padStart(2)}. ${conf.name}${indicator}\r\n`);
  });
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
  // express.e:25546 - aePuts('\b\n') - just a newline, NO header
  socket.emit('ansi-output', '\r\n');

  // Display user statistics (express.e:25548-25598)
  // Format: [32mFieldName[33m:[0m value\b\n
  const user = session.user;

  // User Number (express.e:25550-25552) - only if USERNUMBER_LOGIN tooltype
  if (user.slotNumber !== undefined) {
    socket.emit('ansi-output', `\x1b[0;32mUser Number\x1b[0;33m:\x1b[0m ${user.slotNumber}\r\n`);
  }

  // Area Name (express.e:25554-25556) - only if CONFRELATIVE=FALSE
  if (user.conferenceAccess) {
    socket.emit('ansi-output', `\x1b[0;32mArea Name  \x1b[0;33m:\x1b[0m ${user.conferenceAccess}\r\n`);
  }

  // Caller Number (express.e:25558)
  const callerNum = session.callerNum || 0;
  socket.emit('ansi-output', `\x1b[0;32mCaller Num.\x1b[0;33m:\x1b[0m ${callerNum}\r\n`);

  // Last Date On (express.e:25560-25562)
  if (user.timeLastOn) {
    const lastDate = new Date(user.timeLastOn).toLocaleString();
    socket.emit('ansi-output', `\x1b[0;32mLst Date On\x1b[0;33m:\x1b[0m ${lastDate}\r\n`);
  }

  // Security Level (express.e:25563)
  const secLevel = user.secLevel || 0;
  socket.emit('ansi-output', `\x1b[0;32mSecurity Lv\x1b[0;33m:\x1b[0m ${secLevel}\r\n`);

  // Times Called (express.e:25565)
  const timesCalled = user.timesCalled || 0;
  socket.emit('ansi-output', `\x1b[0;32m# Times On \x1b[0;33m:\x1b[0m ${timesCalled}\r\n`);

  // Times Today (express.e:25567)
  const timesToday = user.timesToday || 0;
  socket.emit('ansi-output', `\x1b[0;32mTimes Today\x1b[0;33m:\x1b[0m ${timesToday}\r\n`);

  // Messages Posted (express.e:25569)
  const msgsPosted = user.messagesPosted || 0;
  socket.emit('ansi-output', `\x1b[0;32mMsgs Posted\x1b[0;33m:\x1b[0m ${msgsPosted}\r\n`);

  // Online Baud (express.e:25571) - web connections use high speed
  const onlineBaud = (session as any).connectionSpeed || 115200;
  socket.emit('ansi-output', `\x1b[0;32mOnline Baud\x1b[0;33m:\x1b[0m ${onlineBaud}\r\n`);

  // Rate CPS UP (express.e:25573-25574)
  const upCPS = user.upCPS || 0;
  socket.emit('ansi-output', `\x1b[0;32mRate CPS UP\x1b[0;33m:\x1b[0m ${upCPS}\r\n`);

  // Rate CPS DN (express.e:25576-25577)
  const dnCPS = user.dnCPS || 0;
  socket.emit('ansi-output', `\x1b[0;32mRate CPS DN\x1b[0;33m:\x1b[0m ${dnCPS}\r\n`);

  // Screen Clear (express.e:25580)
  const screenClr = user.screenClr ? 'YES' : 'NO';
  socket.emit('ansi-output', `\x1b[0;32mScreen  Clr\x1b[0;33m:\x1b[0m ${screenClr}\r\n`);

  // Protocol (express.e:25583)
  const protocol = user.xferProtocol || 'Zmodem';
  socket.emit('ansi-output', `\x1b[0;32mProtocol   \x1b[0;33m:\x1b[0m ${protocol}\r\n`);

  // Credit Account (express.e:25586-25594)
  // IF (checkSecurity(ACS_SHOW_PAYMENTS)) AND (loggedOnUser.creditDays>0)
  const creditDays = user.creditDays || 0;
  if (checkSecurity(session.user, ACSPermission.SHOW_PAYMENTS) && creditDays > 0) {
    const creditStartDate = user.creditStartDate || 0;
    const expirationTimestamp = creditStartDate + (creditDays * 86400 * 1000); // Convert days to ms
    const now = Date.now();
    if (expirationTimestamp > now) {
      // express.e:25588-25590 - Credit account still active
      const expirationDate = new Date(expirationTimestamp);
      const month = String(expirationDate.getMonth() + 1).padStart(2, '0');
      const day = String(expirationDate.getDate()).padStart(2, '0');
      const year = String(expirationDate.getFullYear()).slice(-2);
      socket.emit('ansi-output', `\x1b[0;32mCredit Account Expires\x1b[0;33m:\x1b[0m ${month}-${day}-${year}\r\n`);
    } else {
      // express.e:25592 - Credit account has expired
      socket.emit('ansi-output', '\x1b[0;31mCredit Account has EXPIRED\x1b[0m\r\n');
    }
  }

  // Sysop Here (express.e:25596)
  const sysopHere = (session as any).sysopAvail ? 'YES' : 'NO';
  socket.emit('ansi-output', `\x1b[0;32mSysop  Here\x1b[0;33m:\x1b[0m ${sysopHere}\r\n`);

  // Sysop Pages Remaining (express.e:25599-25601)
  // IF(pagesAllowed<>-1) THEN show pages remaining
  const pagesAllowed = session.pagesAllowed;
  if (pagesAllowed !== undefined && pagesAllowed !== -1) {
    socket.emit('ansi-output', `\x1b[0;32mSysop Pages Remaining\x1b[0;33m:\x1b[0m ${pagesAllowed}\r\n`);
  }

  // express.e:25604 - fileStatus(1) - Display file statistics for current conference
  // express.e:24141-24190
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[0;32m              Uploads                 Downloads\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[0;32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\r\n');

  // Display current conference stats - express.e:24164-24186
  const confNum = session.currentConf || 1;
  const fileUploads = user.uploads || 0;
  const fileDownloads = user.downloads || 0;
  const bytesUploaded = user.bytesUploaded || 0;
  const bytesDownloaded = user.bytesDownloaded || 0;
  const bytesLimit = user.byteLimit || 0;
  const bytesAvail = bytesLimit > 0 ? Math.max(0, bytesLimit - (user.dailyBytesDownloaded || 0)) : -1;
  const ratio = user.ratio || 0;

  // Format bytes for display
  const formatBytes = (bytes: number): string => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)}G`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)}M`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
    return bytes.toString();
  };

  const bytesAvailStr = bytesAvail >= 0 ? formatBytes(bytesAvail) : 'Infinite';
  const ratioStr = ratio > 0 ? `1:${ratio}` : 'DSBL';

  socket.emit('ansi-output', `\x1b[0;33m    ${confNum.toString().padStart(4)}\x1b[0m> \x1b[0;36m${fileUploads.toString().padStart(7)}  ${formatBytes(bytesUploaded).padStart(14)} ${fileDownloads.toString().padStart(7)}  ${formatBytes(bytesDownloaded).padStart(14)}   ${bytesAvailStr.padStart(9)}  ${ratioStr}\x1b[0m\r\n`);
  socket.emit('ansi-output', '\x1b[0m\r\n');

  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
  session.menuPause = true;
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
  const normalizedNameParam = normalizeForComparison(params);
  if ((newConf < 1 || newConf > _conferences.length) && normalizedNameParam) {
    const matchedConference = _conferences.find(conf => normalizeForComparison(conf.name) === normalizedNameParam);
    if (matchedConference) {
      newConf = matchedConference.id;
    }
  }

  if (newConf < 1 || newConf > _conferences.length) {
    // AmiExpress shows JOINCONF screen, or if not found, show conference list
    let screenDisplayed = false;
    if (typeof _displayScreen === 'function') {
      screenDisplayed = await _displayScreen(socket, session, 'JOINCONF');
    } else {
      console.error('[user-commands] _displayScreen not initialized - dependencies may not be set');
    }
    if (!screenDisplayed) {
      // No JOINCONF screen file - show the built-in conference list
      displayConferenceList(socket, session);
    }

    // Clear any pagination state from displayScreen so the next input goes to
    // the conference number prompt, not a pause handler (express.e:25143-25145)
    session.paginatedScreen = undefined;
    session.lastScreenHadPause = false;

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Conference Number ', color: 'white' },
      { text: `(1-${_conferences.length})`, color: 'cyan' },
      { text: ': ', color: 'white' }
    ]));

    // Set state to wait for conference number input
    // Disable MENU.keys single-key mode so numeric entry is not treated as shortcuts.
    session.cmdShortcuts = false;
    if (session.shortcuts) {
      session.shortcuts.clear();
    }
    session.subState = LoggedOnSubState.JOIN_CONF_INPUT;
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
    if (typeof _displayScreen === 'function') {
      await _displayScreen(socket, session, 'CONF_JOINMSGBASE');
    }

    // Clear any pagination state from displayScreen so the next input goes to
    // the message base prompt, not a pause handler (express.e:25169-25179)
    session.paginatedScreen = undefined;
    session.lastScreenHadPause = false;

    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.complexPrompt([
      { text: 'Message Base Number ', color: 'white' },
      { text: `(1-${msgBaseCount})`, color: 'cyan' },
      { text: ': ', color: 'white' }
    ]));

    // Set state to wait for input (express.e:25169-25179)
    session.subState = LoggedOnSubState.READ_COMMAND;
    session.tempData = {
      waitingForJoinMsgBase: true,
      newConf: newConf,
      msgBaseCount: msgBaseCount
    };
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

  // express.e:25656 - uploadaFile(0, cmdcode, FALSE)
  // The first parameter 0 means show upload interface first, not immediate ZMODEM
  // This lets user select file area before starting ZMODEM transfer
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

  // If user has flagged files, send them via ZMODEM; otherwise fall back to download interface.
  const userId = session.user?.id;
  const flagged = userId ? flaggedFilesManager.getFiles(userId) : [];
  if (flagged && flagged.length > 0) {
    startZmodemDownload(socket, session, flagged.map((f) => f.filePath));
    return;
  }

  // express.e:24856 - beginDLF(cmdcode,params)
  _displayDownloadInterface(socket, session, params);
}

/**
 * Handle user stats menu input (F=Font, Q=Quit)
 * Web-specific extension to S command
 */
export function handleUserStatsMenuInput(socket: any, session: BBSSession, input: string): void {
  const choice = input.trim().toUpperCase();

  if (choice === 'F') {
    // Show font selection menu
    displayFontSelectionMenu(socket, session);
  } else if (choice === 'Q' || choice === '') {
    // Return to main menu
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  } else {
    // Invalid choice
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid choice. Press F for fonts or Q to quit.'));
    socket.emit('ansi-output', AnsiUtil.colorize('Selection: ', 'yellow'));
  }
}

/**
 * Display font selection menu
 * Web-specific feature
 */
export function displayFontSelectionMenu(socket: any, session: BBSSession): void {
  const fonts = [
    { id: 'mosoul', name: "mO'sOul" },
    { id: 'MicroKnight', name: 'MicroKnight' },
    { id: 'MicroKnightPlus', name: 'MicroKnight Plus' },
    { id: 'P0T-NOoDLE', name: 'P0T-NOoDLE' },
    { id: 'Topaz_a500', name: 'Topaz (A500)' },
    { id: 'Topaz_a1200', name: 'Topaz (A1200)' },
    { id: 'TopazPlus_a500', name: 'Topaz Plus (A500)' },
    { id: 'TopazPlus_a1200', name: 'Topaz Plus (A1200)' }
  ];

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Select Font'));
  socket.emit('ansi-output', '\r\n');

  fonts.forEach((font, index) => {
    const number = (index + 1).toString().padStart(2, ' ');
    socket.emit('ansi-output', AnsiUtil.colorize(`[${number}]`, 'cyan') + ` ${font.name}\r\n`);
  });

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('Selection (1-8 or Q to cancel): ', 'yellow'));
  session.subState = LoggedOnSubState.FONT_SELECTION;
}

/**
 * Handle conference join message base number input
 * Called when user is prompted for message base number during conference join
 */
export async function handleJoinMsgBaseInput(socket: any, session: BBSSession, input: string): Promise<void> {
  if (!session.tempData?.waitingForJoinMsgBase) {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const msgBaseNum = parseInt(input, 10);
  const { newConf, msgBaseCount } = session.tempData;

  // Clear waiting flag
  session.tempData.waitingForJoinMsgBase = false;

  // Validate message base number
  if (isNaN(msgBaseNum) || msgBaseNum < 1 || msgBaseNum > msgBaseCount) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid message base number'));
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Get conference message bases (use injected dependencies)
  const targetConf = _conferences.find((c: Conference) => c.id === newConf);
  if (!targetConf) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Conference not found'));
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const confMessageBases = _messageBases.filter((mb: MessageBase) => mb.conferenceId === newConf);
  if (msgBaseNum > confMessageBases.length) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Message base not found'));
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Join conference with selected message base (express.e:25181)
  const msgBaseId = confMessageBases[msgBaseNum - 1].id;
  await _joinConference(socket, session, newConf, msgBaseId);

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

export async function handleFontSelectionInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const { db } = require('../database');

  const fonts = [
    'mosoul',
    'MicroKnight',
    'MicroKnightPlus',
    'P0T-NOoDLE',
    'Topaz_a500',
    'Topaz_a1200',
    'TopazPlus_a500',
    'TopazPlus_a1200'
  ];

  const choice = input.trim().toUpperCase();

  if (choice === 'Q' || choice === '') {
    // Cancel, return to user stats menu
    handleUserStatsCommand(socket, session);
    return;
  }

  const selection = parseInt(choice, 10);
  if (isNaN(selection) || selection < 1 || selection > fonts.length) {
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid choice. Enter 1-8 or Q to cancel.'));
    socket.emit('ansi-output', AnsiUtil.colorize('Selection: ', 'yellow'));
    return;
  }

  const selectedFont = fonts[selection - 1];

  // Update user's font preference in database
  try {
    await db.updateUser(session.user.id, { fontPreference: selectedFont });
    session.user.fontPreference = selectedFont;

    // Notify frontend to change font
    socket.emit('font-changed', { font: selectedFont });

    socket.emit('ansi-output', AnsiUtil.successLine(`Font changed to ${selectedFont}!`));
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  } catch (error) {
console.error('Error updating font preference:', error);
    socket.emit('ansi-output', AnsiUtil.errorLine('Error saving font preference.'));
    socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());
    session.subState = LoggedOnSubState.DISPLAY_MENU;
  }
}
