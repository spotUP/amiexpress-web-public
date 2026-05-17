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
import { formatLongDateTime, formatLongDate } from '../../utils/date-time.util';
import { loadMsgPointers, saveMsgPointers } from '../../utils/message-pointers.util';

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

export function startZmodemUpload(socket: any, session: BBSSession): void {
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

  const ulStartTime = Date.now();
  const manager = new ZmodemTransferManager({
    session,
    transport,
    direction: 'upload',
    paths: [playpen],
    onComplete: (ok, detail) => {
      if (!ok) {
        socket.emit('ansi-output', '\r\nUpload aborted\r\n\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.menuPause = true;
        return;
      }
      socket.emit('ansi-output', '\r\n\r\nFile Uploading Complete...\r\n');
      const received = detail?.received || [];
      const ulFileCount = received.length;
      let totalBytes = 0;
      try {
        const fsSync = require('fs');
        for (const fp of received) { try { totalBytes += fsSync.statSync(fp).size; } catch (_) {} }
      } catch (_) {}
      const bytesKB = Math.floor(totalBytes / 1024);
      const ulTTTM  = Math.max(1, Math.round((Date.now() - ulStartTime) / 1000));
      const cps     = totalBytes > 0 ? Math.round(totalBytes / ulTTTM) : 0;
      const baud    = Math.max(1, Math.floor(((session as any).baudRate || 115200) / 10));
      const eff     = Math.floor((cps * 100) / baud);
      socket.emit('ansi-output', ` ${ulFileCount} file(s), ${bytesKB}k bytes, ${Math.floor(ulTTTM/60)} minute(s). ${ulTTTM%60} second(s), ${cps} cps, ${eff}% efficiency.\r\n\r\n`);
      let peff = (ulFileCount > 0 && ulTTTM > 0) ? Math.floor((ulTTTM * 3) / 2) + 60 : 0;
      socket.emit('ansi-output', `Time increased by ${Math.floor(peff/60)} mins.\r\n\r\n`);
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
  const ctxId = `zd-${session.nodeId || 0}-${Date.now()}`;
  console.log(`[ZMODEM-DL ${ctxId}] startZmodemDownload entry files=${JSON.stringify(files)}`);

  if (!files || files.length === 0) {
    console.log(`[ZMODEM-DL ${ctxId}] no files, aborting`);
    socket.emit('ansi-output', '\r\nNo files available for download.\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Verify each file exists before starting the ZMODEM session — otherwise
  // the client opens the dialog, the manager tries to read the missing
  // file, and the session aborts silently.
  const fsSync = require('fs');
  const missing = files.filter((f) => { try { return !fsSync.existsSync(f); } catch { return true; } });
  if (missing.length > 0) {
    console.warn(`[ZMODEM-DL ${ctxId}] missing files: ${JSON.stringify(missing)}`);
    socket.emit('ansi-output', `\r\nDownload error — files not found: ${missing.map((p) => path.basename(p)).join(', ')}\r\n`);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const transport = getTransferTransport(session);
  console.log(`[ZMODEM-DL ${ctxId}] transport.type=${transport.type} hasSend=${!!transport.send} transferRawSend=${typeof (session as any).transferRawSend}`);
  if (!transport.send) {
    transport.send = (buf: Uint8Array | Buffer) => socket.emit('transfer-raw:data', Buffer.isBuffer(buf) ? buf : Buffer.from(buf));
  }

  const manager = new ZmodemTransferManager({
    session,
    transport,
    direction: 'download',
    paths: files,
    onComplete: (ok, detail) => {
      console.log(`[ZMODEM-DL ${ctxId}] onComplete ok=${ok} sent=${JSON.stringify(detail?.sent || [])}`);
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
    console.log(`[ZMODEM-DL ${ctxId}] emitting transfer-raw:init for web`);
    socket.emit('transfer-raw:init', {
      direction: 'download',
      paths: files,
    });
  } else {
    console.log(`[ZMODEM-DL ${ctxId}] telnet/SSH: emitting Starting ZMODEM banner`);
    socket.emit('ansi-output', `\r\nStarting ZMODEM send... (sz)\r\n`);
  }

  console.log(`[ZMODEM-DL ${ctxId}] manager.start() — sending ZRQINIT next`);
  manager.start();
  console.log(`[ZMODEM-DL ${ctxId}] manager.start() returned, transferRawActive=${(session as any).transferRawActive}`);
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
    socket.emit('ansi-output', `\x1b[32mUser Number\x1b[33m:\x1b[0m ${user.slotNumber}\r\n`);
  }

  // Area Name (express.e:25554-25556) - only if CONFRELATIVE=FALSE
  if (user.conferenceAccess) {
    socket.emit('ansi-output', `\x1b[32mArea Name  \x1b[33m:\x1b[0m ${user.conferenceAccess}\r\n`);
  }

  // Caller Number (express.e:25558)
  const callerNum = session.callerNum || 0;
  socket.emit('ansi-output', `\x1b[32mCaller Num.\x1b[33m:\x1b[0m ${callerNum}\r\n`);

  // Last Date On (express.e:25560-25562) — formatLongDateTime like Amiga
  if (user.timeLastOn) {
    const lastDate = formatLongDateTime(new Date(user.timeLastOn));
    socket.emit('ansi-output', `\x1b[32mLst Date On\x1b[33m:\x1b[0m ${lastDate}\r\n`);
  }

  // Security Level (express.e:25563)
  const secLevel = user.secLevel || 0;
  socket.emit('ansi-output', `\x1b[32mSecurity Lv\x1b[33m:\x1b[0m ${secLevel}\r\n`);

  // Times Called (express.e:25565) — timesCalled AND $FFFF
  const timesCalled = (user.timesCalled || 0) & 0xFFFF;
  socket.emit('ansi-output', `\x1b[32m# Times On \x1b[33m:\x1b[0m ${timesCalled}\r\n`);

  // Times Today (express.e:25567)
  const timesToday = user.timesToday || 0;
  socket.emit('ansi-output', `\x1b[32mTimes Today\x1b[33m:\x1b[0m ${timesToday}\r\n`);

  // Messages Posted (express.e:25569) — messagesPosted AND $FFFF
  const msgsPosted = (user.messagesPosted || 0) & 0xFFFF;
  socket.emit('ansi-output', `\x1b[32mMsgs Posted\x1b[33m:\x1b[0m ${msgsPosted}\r\n`);

  // Online Baud (express.e:25571) - web connections use high speed
  const onlineBaud = (session as any).connectionSpeed || 115200;
  socket.emit('ansi-output', `\x1b[32mOnline Baud\x1b[33m:\x1b[0m ${onlineBaud}\r\n`);

  // Rate CPS UP (express.e:25573-25574)
  const upCPS = user.upCPS || 0;
  socket.emit('ansi-output', `\x1b[32mRate CPS UP\x1b[33m:\x1b[0m ${upCPS}\r\n`);

  // Rate CPS DN (express.e:25576-25577)
  const dnCPS = user.dnCPS || 0;
  socket.emit('ansi-output', `\x1b[32mRate CPS DN\x1b[33m:\x1b[0m ${dnCPS}\r\n`);

  // Screen Clear (express.e:25580) — IF loggedOnUserKeys.userFlags AND USER_SCRNCLR (bit 8)
  const screenClr = ((user.userFlags || 0) & 8) ? 'YES' : 'NO';
  socket.emit('ansi-output', `\x1b[32mScreen  Clr\x1b[33m:\x1b[0m ${screenClr}\r\n`);

  // Protocol (express.e:25583)
  const protocol = user.xferProtocol || 'Zmodem';
  socket.emit('ansi-output', `\x1b[32mProtocol   \x1b[33m:\x1b[0m ${protocol}\r\n`);

  // Credit Account (express.e:25586-25594)
  // IF (checkSecurity(ACS_SHOW_PAYMENTS)) AND (loggedOnUser.creditDays>0)
  const creditDays = user.creditDays || 0;
  if (checkSecurity(session.user, ACSPermission.SHOW_PAYMENTS) && creditDays > 0) {
    const creditStartDate = user.creditStartDate || 0;
    const expirationTimestamp = creditStartDate + (creditDays * 86400 * 1000); // Convert days to ms
    const now = Date.now();
    if (expirationTimestamp > now) {
      // express.e:25588-25590: formatLongDate(creditStartDate + creditDays*86400)
      const expiresStr = formatLongDate(new Date(expirationTimestamp));
      socket.emit('ansi-output', `\x1b[32mCredit Account Expires\x1b[33m:\x1b[0m ${expiresStr}\r\n`);
    } else {
      // express.e:25592 - Credit account has expired
      socket.emit('ansi-output', '\x1b[31mCredit Account has EXPIRED\x1b[0m\r\n');
    }
  }

  // Sysop Here (express.e:25596)
  const sysopHere = (session as any).sysopAvail ? 'YES' : 'NO';
  socket.emit('ansi-output', `\x1b[32mSysop  Here\x1b[33m:\x1b[0m ${sysopHere}\r\n`);

  // Sysop Pages Remaining (express.e:25599-25601)
  // IF(pagesAllowed<>-1) THEN show pages remaining
  const pagesAllowed = session.pagesAllowed;
  if (pagesAllowed !== undefined && pagesAllowed !== -1) {
    socket.emit('ansi-output', `\x1b[32mSysop Pages Remaining\x1b[33m:\x1b[0m ${pagesAllowed}\r\n`);
  }

  // express.e:25604 - fileStatus(1) - Display file statistics for current conference
  // express.e:24141-24190
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[32m              Uploads                 Downloads\x1b[0m\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', '\x1b[32m    Conf  Files    Bytes          Files    Bytes          Bytes Avail  Ratio\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[0m    ----  -------  -------------- -------  -------------- -----------  -----\r\n');

  // express.e:24164-24186 fileStatus(opt=1) — current conference only
  // Row format: [33m{conf4}[0m> [33m{ul7}  {bytesup14} {dl7}  {bytesdown14}   {avail9}   {ratio}[0m:[33m1
  const confNum = session.currentConf || 1;
  const fileUploads = (user.uploads || 0) & 0xFFFF;       // AND $FFFF like express.e
  const fileDownloads = (user.downloads || 0) & 0xFFFF;
  const bytesUploaded = user.bytesUpload || user.bytesUploaded || 0;
  const bytesDownloaded = user.bytesDownload || user.bytesDownloaded || 0;
  const bytesLimit = user.byteLimit || user.dailyBytesLimit || 0;
  const bytesAvail = bytesLimit > 0 ? Math.max(0, bytesLimit - (user.dailyBytesDld || 0)) : -1;
  // express.e uses formatBCD() = comma-separated decimal (1,234,567)
  const fmtBCD = (n: number): string => n.toLocaleString('en-US');
  const bytesUpStr = fmtBCD(bytesUploaded);
  const bytesDnStr = fmtBCD(bytesDownloaded);
  const bytesAvailStr = bytesAvail >= 0 ? fmtBCD(bytesAvail) : 'Infinite';
  const secLibrary = user.ratio || 0; // secLibrary = ratio divisor

  if (secLibrary > 0) {
    // express.e:24179: {ratio}[0m:[33m1 = "N:1" format
    socket.emit('ansi-output',
      `\x1b[33m    ${confNum.toString().padStart(4)}\x1b[0m> \x1b[33m${fileUploads.toString().padStart(7)}  ${bytesUpStr.padStart(14)} ${fileDownloads.toString().padStart(7)}  ${bytesDnStr.padStart(14)}   ${bytesAvailStr.padStart(9)}   ${secLibrary}\x1b[0m:\x1b[33m1\x1b[0m\r\n`);
  } else {
    // express.e:24181: [31mDSBLD — disabled ratio
    socket.emit('ansi-output',
      `\x1b[33m    ${confNum.toString().padStart(4)}\x1b[0m> \x1b[33m${fileUploads.toString().padStart(7)}  ${bytesUpStr.padStart(14)} ${fileDownloads.toString().padStart(7)}  ${bytesDnStr.padStart(14)}   ${bytesAvailStr.padStart(9)}  \x1b[31mDSBLD\x1b[0m\r\n`);
  }
  // express.e:24188 aePuts('[0m\b\n'); then ENDPROC RESULT_SUCCESS — main loop sets menuPause:=TRUE
  socket.emit('ansi-output', '\x1b[0m\r\n');
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * Convert a user-relative conference number to an absolute (internal) conference number.
 * 1:1 port from express.e:8568-8581 getInverse()
 *
 * When sopt.toggles[TOGGLES_CONFRELATIVE]=TRUE, conference numbers shown to the user
 * are sequential across only the conferences they have access to. So user types "1"
 * meaning "first accessible conference", not conference ID 1.
 *
 * When CONFRELATIVE=FALSE (default), cn is returned unchanged (absolute numbering).
 *
 * express.e:8568  PROC getInverse(cn,force=FALSE)
 *   IF(cn<1) THEN RETURN 0
 *   IF (force=FALSE) AND (sopt.toggles[TOGGLES_CONFRELATIVE]=FALSE) THEN RETURN cn
 *   WHILE(i<cn)
 *     IF(j<cmds.numConf)
 *       IF(checkConfAccess(j+1)) THEN i++
 *     ELSE
 *       RETURN 0
 *     ENDIF
 *     j++
 *   ENDWHILE
 *   RETURN j
 *
 * @param cn            - User-visible (relative) conference number (1-based)
 * @param user          - User object (for checkConfAccess)
 * @param confRelative  - Value of sopt.toggles[TOGGLES_CONFRELATIVE]
 * @returns Absolute conference number, or 0 if out of range
 */
function getInverse(cn: number, user: any, confRelative: boolean): number {
  // express.e:8571 - IF(cn<1) THEN RETURN 0
  if (cn < 1) return 0;
  // express.e:8572 - IF (force=FALSE) AND (sopt.toggles[TOGGLES_CONFRELATIVE]=FALSE) THEN RETURN cn
  if (!confRelative) return cn;

  // Relative mode: walk accessible conferences until we've counted cn of them
  let i = 0; // count of accessible conferences visited so far
  let j = 0; // absolute conference index (0-based; j+1 = 1-based conf number)
  while (i < cn) {
    if (j < _conferences.length) {
      // express.e:8575 - IF(checkConfAccess(j+1)) THEN i++
      if (_checkConfAccess(user, j + 1)) {
        i++;
      }
    } else {
      // express.e:8577 - RETURN 0 (ran out of conferences)
      return 0;
    }
    j++;
  }
  // express.e:8581 - ENDPROC j (return absolute 1-based conf number)
  return j;
}

/**
 * Read the CONFRELATIVE toggle from bbsConfig.info.
 * In express.e this is sopt.toggles[TOGGLES_CONFRELATIVE] set by ACP.
 * We store it as the CONFRELATIVE tooltype in bbsConfig.info.
 * Returns false if not found (default = absolute numbering).
 */
function getConfRelativeToggle(session: BBSSession): boolean {
  try {
    const { config } = require('../../config');
    const { parseInfoFile } = require('../../utils/amiga-command-parser.util');
    const bbsRoot = (session as any).bbsPath || config.get('dataDir') || process.cwd();
    const bbsConfigPath = require('path').join(bbsRoot, 'bbsConfig.info');
    const tooltypes = parseInfoFile(bbsConfigPath);
    return tooltypes.has('CONFRELATIVE');
  } catch {
    return false;
  }
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

  // express.e:25121 - saveMsgPointers(currentConf, currentMsgBase)
  // Save current conference read pointers BEFORE switching conferences.
  // Must happen here (not inside joinConference) — joinConference only
  // saves pointers for the NEW conference after a mail scan.
  if (session.user && session.currentConf && session.currentMsgBase) {
    try {
      const confBase = await loadMsgPointers(session.user.id, session.currentConf, session.currentMsgBase);
      confBase.lastMsgReadConf = session.lastMsgReadConf || confBase.lastMsgReadConf;
      confBase.lastNewReadConf = session.lastNewReadConf || confBase.lastNewReadConf;
      await saveMsgPointers(confBase);
    } catch (err) {
      console.warn('[handleJoinConferenceCommand] saveMsgPointers error:', err);
    }
  }

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

  // express.e:25140 - newConf:=getInverse(newConf)
  // Converts user-relative conf number to absolute when CONFRELATIVE toggle is set.
  const confRelative = getConfRelativeToggle(session);
  newConf = getInverse(newConf, session.user, confRelative);

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

    // express.e:25144: 'Conference Number (1-N): ' — plain text
    socket.emit('ansi-output', `Conference Number (1-${_conferences.length}): `);

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
    // express.e:25157-25158: '\b\nYou do not have access to the requested conference\b\n\b\n' + RETURN FAILURE
    socket.emit('ansi-output', '\r\nYou do not have access to the requested conference\r\n\r\n');
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

    // express.e:25173: 'Message Base Number (1-N): ' — plain text
    socket.emit('ansi-output', `Message Base Number (1-${msgBaseCount}): `);

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

  // express.e:25121 - saveMsgPointers before switching (same guard as internalCommandJ)
  if (session.user && session.currentConf && session.currentMsgBase) {
    try {
      const confBase = await loadMsgPointers(session.user.id, session.currentConf, session.currentMsgBase);
      confBase.lastMsgReadConf = session.lastMsgReadConf || confBase.lastMsgReadConf;
      confBase.lastNewReadConf = session.lastNewReadConf || confBase.lastNewReadConf;
      await saveMsgPointers(confBase);
    } catch (err) {
      console.warn('[handleJoinMsgBaseInput] saveMsgPointers error:', err);
    }
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
