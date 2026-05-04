/**
 * Messaging Handler
 * Handles full message reading and writing functionality
 * 1:1 port from AmiExpress express.e message commands
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { EnvStat } from '../../constants/env-codes';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { finalizeCommand } from '../../utils/command-response.util';
import { emitText, emitPrompt } from '../../utils/output.util';
import { getAllMessageIds, readMessageFile, markMessageReceived, unmarkMessageReceived, readAttachList } from '../../utils/message-file.util';
import { formatLongDateTime } from '../../utils/date-time.util';
import { config } from '../../config';
import { ACSPermission as ACSPerm } from '../../constants/acs-permissions';
import { handleEditUserAccount } from '../user/account.handler';
// handleTranslationCommand lives in messaging-translation.ts; import for internal use in handleMessageReaderNav
import { handleTranslationCommand } from './messaging-translation';

// Dependencies (injected)
let _db: any;
let _callersLog: any;
let _setEnvStat: any;
let _setMessagingDependenciesCallCount = 0;

function _requireDb(caller: string): any {
  if (!_db) {
    throw new Error(
      `[messaging.handler] _db is undefined in ${caller} — setMessagingDependencies ` +
      `was called ${_setMessagingDependenciesCallCount} time(s) but none provided deps.db. ` +
      `If the count is 0, initializeData() aborted pre-DI; check server logs. If >0, ` +
      `check if module duplication is happening (dynamic import vs static import).`
    );
  }
  return _db;
}

/**
 * Exported alias for _requireDb — used by extracted sysop/translation modules
 * that need DB access without duplicating the DI guard logic.
 */
export function _getDb(caller: string): any {
  return _requireDb(caller);
}

// Helper functions for database operations
async function _deleteMessage(messageId: number): Promise<void> {
  await _requireDb('_deleteMessage').deleteMessage(messageId);
}

async function _updateReadPointer(userId: number, confId: number, msgBaseId: number, lastRead: number): Promise<void> {
  await _requireDb('_updateReadPointer').updateReadPointer(userId, confId, msgBaseId, lastRead);
}

/**
 * Format recipient display for EALL handling
 * From express.e:8902-8910 — when the lower-cased toName StrCmp's 'eall'
 * (length 5, exact match), the displayed To: shows "{confMailName} (ALL)".
 * confMailName is the per-conference display name, NOT the raw login
 * username — REALNAME conferences show the user's real name in the
 * EALL banner.
 */
function formatRecipientDisplay(msg: any, session: BBSSession): string {
  if (!msg.isPrivate) {
    return 'ALL';
  }
  if (msg.toUser && msg.toUser.toLowerCase() === 'eall') {
    const { getConfMailName } = require('./message-entry.handler');
    const mailName = getConfMailName(session) ||
                     (session.user as any)?.username ||
                     'User';
    return `${mailName} (ALL)`;
  }
  return msg.toUser || 'ALL';
}

/**
 * Dependency injection setter
 */
export function setMessagingDependencies(deps: {
  db?: any;
  callersLog?: any;
  setEnvStat?: any;
  messages?: any;
  getMailStatFile?: any;
  loadMsgPointers?: any;
  validatePointers?: any;
  updateReadPointer?: any;
}) {
  _setMessagingDependenciesCallCount++;
  const hasDb = !!deps.db;
  const hasCallersLog = !!deps.callersLog;
  const hasSetEnvStat = !!deps.setEnvStat;
  if (deps.db) _db = deps.db;
  if (deps.callersLog) _callersLog = deps.callersLog;
  if (deps.setEnvStat) _setEnvStat = deps.setEnvStat;
  // Diagnostic for the 2026-04-24 read-mail crash: log what arrived in each
  // setter call so we can see if _db ever actually lands.
  const callerLine = (new Error().stack || '').split('\n')[2]?.trim() || '(stack unavailable)';
  console.log(`[setMessagingDependencies] call #${_setMessagingDependenciesCallCount} hasDb=${hasDb} hasCallersLog=${hasCallersLog} hasSetEnvStat=${hasSetEnvStat} _dbTypeAfter=${typeof _db} from ${callerLine}`);
}

/**
 * R Command: Read Messages (internalCommandR)
 * Original: express.e:25518-25531, 11000-11250
 *
 * Interactive message reader with one-at-a-time navigation.
 * Implements Phase 9 (ACS) and Phase 10 (Message Pointers) enhancements.
 */
export async function handleReadMessagesFullCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): Promise<void> {
  // Check security permission - express.e:25519
  if (!checkSecurity(session.user, ACSPermission.READ_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'read messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

console.log('[ENV] Mail - Read');

  // Get messages from DISK (AmiExpress format)
  // Database is only for web UI/search, not for BBS message reading
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  const bbsDataPath = config.get('dataDir');
  const username = session.user?.username.toLowerCase();

  // express.e:11989-12005 — parse params:
  //   NS               nonStopMail = TRUE — auto-advance through every msg
  //   S                skip-to-new — error out with "No new messages." if past end
  //   +                forward direction (default)
  //   -                backward direction
  //   <digit>          jump to that absolute message number
  //   <digit>+, <digit>-  jump + set direction
  // The token list is space- or comma-separated; we split on either.
  const paramTokens = (params || '').split(/[\s,]+/).filter(Boolean);
  const upperParams = paramTokens.map(t => t.toUpperCase());
  const nonStopMail = upperParams.includes('NS');
  const skipToNew = upperParams.includes('S');
  // First non-flag token controls jump/direction (express.e:12000-12005)
  const firstParam = paramTokens.find(t => /^[+\-]$|^\d+[+\-]?$/.test(t)) || '';
  let jumpMsgNum: number | null = null;
  let initialDir: 1 | -1 = 1;
  if (firstParam === '+') {
    initialDir = 1;
  } else if (firstParam === '-') {
    initialDir = -1;
  } else if (firstParam) {
    const m = /^(\d+)([+\-]?)$/.exec(firstParam);
    if (m) {
      jumpMsgNum = parseInt(m[1]!, 10);
      if (m[2] === '-') initialDir = -1;
      else if (m[2] === '+') initialDir = 1;
    }
  }

  // Get all message IDs from disk
  const messageIds = await getAllMessageIds(confId, bbsDataPath);
  const messages: any[] = [];

  // Read each message from disk
  for (const msgNum of messageIds) {
    const message = await readMessageFile(confId, msgNum, bbsDataPath);
    if (!message) {
      continue; // Skip corrupted/missing files
    }

    // express.e:12344-12349 privateFlag logic:
    //   IF (status="R" OR status="p") AND Not(SYSOP_READ)
    //     IF (toName != confMailName)
    //     AND (toName != 'eall' OR Not(READ_PRIV_EALL))
    //     AND (toName != 'all'  OR Not(READ_PRIV_ALL))
    //     AND (fromName != confMailName)
    //       privateFlag := 1   (suppress this msg)
    //
    // confMailName is the per-conference display name, NOT the raw login
    // username — REALNAME/INTERNETNAME conferences use the user's real or
    // internet name for the toName/fromName comparison.
    const toL   = (message.to || '').toLowerCase();
    const fromL = (message.from || '').toLowerCase();
    const { getConfMailName } = require('./message-entry.handler');
    const myConfMailName = getConfMailName(session).toLowerCase();
    const isSysop = checkSecurity(session.user, ACSPermission.SYSOP_READ);
    const hasReadPrivEall = checkSecurity(session.user, ACSPermission.READ_PRIV_EALL);
    const hasReadPrivAll  = checkSecurity(session.user, ACSPermission.READ_PRIV_ALL);
    const canRead = !message.isPrivate ||
                    isSysop ||
                    (myConfMailName && (toL === myConfMailName || fromL === myConfMailName)) ||
                    (toL === 'eall' && hasReadPrivEall) ||
                    (toL === 'all'  && hasReadPrivAll);
    if (canRead) {
      messages.push({
        id: msgNum,
        msgNumber: msgNum,
        subject: message.subject,
        body: message.body,
        author: message.from,
        toUser: message.to,
        timestamp: new Date(message.date),
        isPrivate: message.isPrivate
      });
    }
  }

  emitText(socket, '\r\n');

  if (messages.length === 0) {
    // express.e:11993 - "No new messages.\r\n\r\n" when no messages exist
    emitText(socket, 'No new messages.\r\n\r\n');
    finalizeCommand(socket, session, '');
    return;
  }

  // express.e:11984: msgNum:=lastMsgReadConf+1 — start from first unread
  const lastRead = session.lastMsgReadConf || 0;
  let startIndex = messages.findIndex((m: any) => ((m as any).msgNumber || m.id) > lastRead);
  if (startIndex < 0) {
    // All messages already read — start from beginning (express.e allows backwards nav)
    startIndex = 0;
  }

  // express.e:11991-11997 — 'S' param: error out if past end (no new messages)
  if (skipToNew) {
    const lastMsgNum = (messages[messages.length - 1].msgNumber || messages[messages.length - 1].id);
    if (lastRead >= lastMsgNum) {
      emitText(socket, 'No new messages.\r\n\r\n');
      finalizeCommand(socket, session, '');
      return;
    }
  }

  // express.e:12000-12005 — explicit jump target overrides default startIndex
  if (jumpMsgNum !== null) {
    const idx = messages.findIndex((m: any) => ((m as any).msgNumber || m.id) === jumpMsgNum);
    if (idx >= 0) {
      startIndex = idx;
    }
  }

  // Initialize message reader state
  session.tempData = session.tempData || {};
  session.tempData.msgReaderMessages = messages;
  session.tempData.msgReaderIndex = startIndex;
  session.tempData.msgReaderHighestRead = lastRead;
  session.tempData.msgReaderFwdDir = initialDir;
  session.tempData.nonStopMail = nonStopMail;

  // Display first message (or burst-display in nonstop mode)
  if (nonStopMail) {
    // express.e:12080-12085 — NS mode skips the prompt loop, runs through messages
    await displaySingleMessage(socket, session, startIndex);
  } else {
    await displaySingleMessage(socket, session, startIndex);
  }
}

/**
 * Display a single message with navigation options
 * From express.e:8880-8970 (displayMessage) and express.e:11000-11250 (message navigation)
 */
export async function displaySingleMessage(socket: any, session: BBSSession, messageIndex: number): Promise<void> {
  const messages = session.tempData.msgReaderMessages;
  const msg = messages[messageIndex];
  const msgNumber = (msg as any).msgNumber || msg.id;

  // Update current index
  session.tempData.msgReaderIndex = messageIndex;
  if (!session.tempData.msgReaderHighestRead || msgNumber > session.tempData.msgReaderHighestRead) {
    session.tempData.msgReaderHighestRead = msgNumber;
  }

  // express.e:8888-8892 — defensive status='D' check. The reader's
  // msgReaderMessages is built with the upstream filter excluding deleted
  // messages, but a concurrent D command (or a race against another node)
  // can delete the body file between list-build and display. Re-check the
  // canonical HeaderFile status before rendering anything; if it's been
  // tombstoned, show "That message has been deleted." like express.e and
  // jump to the next nav prompt instead of dumping stale content.
  try {
    const { messageIndexManager, MsgStatus } = require('../../services/MessageIndexManager');
    const confId = session.tempData.msgReaderConfId || session.currentConf || 1;
    const headers = messageIndexManager.readHeaderFile(confId);
    const liveHeader = headers.find((h: any) => h.msgNumb === msgNumber);
    if (liveHeader && liveHeader.status === MsgStatus.DELETED) {
      emitText(socket, '\r\nThat message has been deleted.\r\n\r\n');
      // Drop the deleted entry from the local list and advance.
      messages.splice(messageIndex, 1);
      session.tempData.msgReaderMessages = messages;
      if (messages.length === 0) {
        await saveMessagePointerAndExit(socket, session);
        return;
      }
      const nextIdx = messageIndex < messages.length ? messageIndex : messageIndex - 1;
      await displaySingleMessage(socket, session, nextIdx);
      return;
    }
  } catch { /* HeaderFile read failure → proceed with the in-memory msg */ }

  // express.e:8889 checkScreenClear() — only clears if USER_SCRNCLR flag set
  // If flag not set, just emit \r\n to separate from previous content
  const SCRNCLR_FLAG = 8; // UserFlags.SCRNCLR
  if ((session.user?.userFlags || 0) & SCRNCLR_FLAG) {
    socket.emit('ansi-output', '\x0c'); // sendCLS() = ASCII 12 (form feed)
  } else {
    emitText(socket, '\r\n');
  }

  // Display message header - express.e:8898-8936
  // express.e format: [32mField[33m: [0mvalue (green field, yellow colon, reset value)
  // Column widths: field padded to 30 chars (\l\s[30])
  const dateStr = formatLongDateTime(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp));
  const datePadded = dateStr.padEnd(30);

  // express.e:8900: Date   : <date padded 30>   Number: <msgNumb>
  emitText(socket, `\x1b[32mDate   \x1b[33m: \x1b[0m${datePadded}   \x1b[32mNumber\x1b[33m: \x1b[0m${msgNumber}\r\n`);

  // express.e:8902-8910: EALL → "confName (ALL)", else toName
  const toDisplay = formatRecipientDisplay(msg, session).padEnd(30);
  // express.e:8915-8926: if recv set → date; if toName='ALL' → N/A; else → No
  // Note: EALL check at 8922 is stringCompare(toName,'ALL') only — EALL shows 'No'
  let recvd: string;
  if (msg.receivedAt) {
    recvd = formatLongDateTime(msg.receivedAt instanceof Date ? msg.receivedAt : new Date(msg.receivedAt));
  } else if ((msg.toUser || '').toUpperCase() === 'ALL') {
    recvd = 'N/A';
  } else {
    recvd = 'No';
  }
  emitText(socket, `\x1b[32mTo     \x1b[33m: \x1b[0m${toDisplay}  \x1b[32mRecv\x27d\x1b[33m: \x1b[0m${recvd}\r\n`);

  // express.e:8929-8935: status P/p = Public, R = Private
  const statusStr = (msg.isPrivate) ? 'Private Message' : 'Public Message';
  const fromPadded = (msg.author || '').padEnd(30);
  emitText(socket, `\x1b[32mFrom   \x1b[33m: \x1b[0m${fromPadded}   \x1b[32mStatus\x1b[33m: \x1b[0m${statusStr}\r\n`);

  // express.e:8937: Subject: <subject>
  emitText(socket, `\x1b[32mSubject\x1b[33m: \x1b[0m${msg.subject}\r\n`);
  emitText(socket, '\r\n');

  // Display message body - express.e:8965-8969.
  // Body files are stored with raw `\n` line breaks (express.e:10700-10703
  // writes `\s\n` per line). xterm.js needs `\r\n` to return the cursor to
  // column 1; bare `\n` only advances a row, so subsequent lines render
  // indented under whatever column the previous line ended at.
  //
  // express.e:8961 displayFile(tempStr,TRUE,TRUE,FALSE) — second TRUE arg
  // enables checkForPause() per line. Match that here: emit line-by-line
  // and call checkForPause when lineCount hits userLineLen. nonStopMail
  // bypasses pause (express.e:8954-8958 sets nonStopDisplayFlag=TRUE).
  const bodyLines = (msg.body || '').replace(/\r\n/g, '\n').split('\n');
  const { checkForPause } = require('../../utils/flag-pause.util');
  // Header above already consumed ~5 lines (express.e:8939 lineCount+=5).
  // Honor user's existing lineCount if set, otherwise seed to 5.
  if (!session.tempData) session.tempData = {};
  if (typeof session.tempData.lineCount !== 'number') {
    session.tempData.lineCount = 5;
  } else {
    session.tempData.lineCount += 5;
  }
  // nonStopMail (R command's NS param) propagates to nonStopDisplayFlag
  // for the duration of body emission; restore afterwards.
  const wasNonStop = !!session.tempData.nonStopDisplayFlag;
  if (session.tempData.nonStopMail) {
    session.tempData.nonStopDisplayFlag = true;
  }
  for (let i = 0; i < bodyLines.length; i++) {
    emitText(socket, `${bodyLines[i]}\r\n`);
    const cont = await checkForPause(socket, session);
    if (cont === false) {
      // User chose "N" → stop display, jump straight to nav prompt.
      emitText(socket, '\r\n');
      session.tempData.nonStopDisplayFlag = wasNonStop;
      session.tempData.lineCount = 0;
      displayMessageNavigationPrompt(socket, session);
      return;
    }
  }
  emitText(socket, '\r\n');
  // Reset for next message (express.e: lineCount stays managed by reader)
  session.tempData.nonStopDisplayFlag = wasNonStop;
  session.tempData.lineCount = 0;

  // express.e:8964 checkAttachedFile(msgNumb, 1) — display the attachment list
  // for this message. Express.e additionally offers download/list actions; we
  // surface the filenames here as an informational notice. Attachment download
  // flows through the F file-attach handler at compose time and the standard
  // file commands at read time, so users can still grab the file by name.
  try {
    const attachConfId = session.currentConf || 1;
    const attachBbsPath = config.get('dataDir');
    const attachList = await readAttachList(attachConfId, msgNumber, attachBbsPath);
    if (attachList && attachList.filenames.length > 0) {
      emitText(socket, '\x1b[36mFiles attached\x1b[33m:\x1b[0m\r\n');
      for (const fname of attachList.filenames) {
        emitText(socket, `   ${fname}\r\n`);
      }
      emitText(socket, '\r\n');
    }
  } catch {
    // Read errors here are non-fatal — log via console but don't block the reader
    console.error('[messaging] readAttachList failed');
  }

  // express.e:8943-8949 - Mark message as received if addressed to current user
  //   IF(stringCompare(mailHeader.toName, confMailName) = RESULT_SUCCESS)
  //     IF(mailHeader.recv = 0)
  //       mailHeader.recv := getSystemTime()
  //       saveOverHeader(gfh)
  //     ENDIF
  //   ENDIF
  // confMailName = per-conference display name (REALNAME / INTERNETNAME /
  // USERNAME). The previous raw-username comparison meant REALNAME
  // conferences never auto-marked private mail as read — the toName was
  // the user's real name, not their login username.
  if (msg.toUser && !msg.receivedAt) {
    const { getConfMailName } = require('./message-entry.handler');
    const myConfMailName = getConfMailName(session).toLowerCase();
    const toUserLower = msg.toUser.toLowerCase();
    if (myConfMailName && toUserLower === myConfMailName) {
      const confId = session.currentConf || 1;
      const bbsDataPath = config.get('dataDir');
      markMessageReceived(confId, msg.id, bbsDataPath).catch(err => {
        console.error('[messaging] Failed to mark message as received:', err);
      });
      // Update the msg object so subsequent displays show the received date
      msg.receivedAt = new Date();
    }
  }

  // Update highest read pointer
  if (msg.id > session.tempData.msgReaderHighestRead) {
    session.tempData.msgReaderHighestRead = msg.id;
  }

  // Display navigation prompt - express.e:11009-11036
  displayMessageNavigationPrompt(socket, session);
}

/**
 * Display messages in non-stop mode
 * From express.e:8954-8958, 11055-11057
 * Displays messages continuously without waiting for input until end or interrupted
 */
async function displayMessagesNonStop(socket: any, session: BBSSession, startIndex: number): Promise<void> {
  const messages = session.tempData.msgReaderMessages;

  for (let i = startIndex; i < messages.length; i++) {
    const msg = messages[i];
    const msgNumber = (msg as any).msgNumber || msg.id;

    session.tempData.msgReaderIndex = i;
    if (!session.tempData.msgReaderHighestRead || msgNumber > session.tempData.msgReaderHighestRead) {
      session.tempData.msgReaderHighestRead = msgNumber;
    }

    // express.e:8897-8951: same header as normal displayMessage (nonStopMail only skips pause)
    const SCRNCLR_FLAG = 8;
    if ((session.user?.userFlags || 0) & SCRNCLR_FLAG) {
      socket.emit('ansi-output', '\x0c');
    } else {
      emitText(socket, '\r\n');
    }
    const dateStr = formatLongDateTime(msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp));
    emitText(socket, `\x1b[32mDate   \x1b[33m: \x1b[0m${dateStr.padEnd(30)}   \x1b[32mNumber\x1b[33m: \x1b[0m${msgNumber}\r\n`);
    const toDisplay = formatRecipientDisplay(msg, session).padEnd(30);
    const recvd = (msg.toUser || '').toUpperCase() === 'ALL' ? 'N/A' : 'No';
    emitText(socket, `\x1b[32mTo     \x1b[33m: \x1b[0m${toDisplay}  \x1b[32mRecv\x27d\x1b[33m: \x1b[0m${recvd}\r\n`);
    const statusStr = msg.isPrivate ? 'Private Message' : 'Public Message';
    emitText(socket, `\x1b[32mFrom   \x1b[33m: \x1b[0m${(msg.author || '').padEnd(30)}   \x1b[32mStatus\x1b[33m: \x1b[0m${statusStr}\r\n`);
    emitText(socket, `\x1b[32mSubject\x1b[33m: \x1b[0m${msg.subject}\r\n\r\n`);

    // Body — express.e:8954-8958: nonStopMail=TRUE → displayFile with checkForPause=FALSE
    // Convert raw \n line breaks to \r\n so xterm.js returns to col 1 between lines.
    const bodyForDisplay = (msg.body || '').replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
    emitText(socket, `${bodyForDisplay}\r\n\r\n`);
  }

  // End of messages - save pointer and exit
  session.tempData.nonStopMail = false;
  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('End of messages', 'yellow'));
  emitText(socket, '\r\n');
  await saveMessagePointerAndExit(socket, session);
}

/**
 * Display short help menu (helplist=1) — express.e:12020-12032
 * Note: short help does NOT include A>gain (that's in full help only).
 */
function displayShortHelp(socket: any, session: BBSSession): void {
  const navStr = getMsgNavStr(session.tempData.msgReaderMessages, session.tempData.msgReaderIndex);

  // express.e:12020-12030 — leading \b\n before each entry, reset [0m at end
  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    emitText(socket, '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Message\x1b[0m');
  }
  if (checkSecurity(session.user, ACSPermission.SYSOP_READ)) {
    emitText(socket, '\r\n\x1b[33mM\x1b[32m>\x1b[36move\x1b[0m');
  }
  emitText(socket, '\r\n\x1b[33mF\x1b[32m>\x1b[36morward\x1b[0m');
  emitText(socket, '\r\n\x1b[33mR\x1b[32m>\x1b[36meply\x1b[0m');
  emitText(socket, '\r\n\x1b[33mL\x1b[32m>\x1b[36mist\x1b[0m');
  emitText(socket, '\r\n\x1b[33mQ\x1b[32m>\x1b[36muit\x1b[0m');
  // express.e:12031
  emitText(socket, '\r\n\x1b[32m<\x1b[33mCR\x1b[32m>\x1b[0m=\x1b[33mNext \x1b[32m(\x1b[0m ' + navStr + '\x1b[32m )\x1b[0m? ');

  session.subState = LoggedOnSubState.MSG_READER_NAV;
}

/**
 * Display full help menu (helplist=2) — express.e:12035-12060
 * Note: A>gain has NO leading \b\n; all others do (express.e:12035).
 */
function displayFullHelp(socket: any, session: BBSSession): void {
  const navStr = getMsgNavStr(session.tempData.msgReaderMessages, session.tempData.msgReaderIndex);

  // express.e:12035 — no leading \b\n on A (continuation of nav prompt line)
  emitText(socket, '\x1b[33mA\x1b[32m>\x1b[36mgain\x1b[0m');
  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    emitText(socket, '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Message\x1b[0m');
  }
  if (checkSecurity(session.user, ACSPermission.SYSOP_READ)) {
    emitText(socket, '\r\n\x1b[33mM\x1b[32m>\x1b[36move Message\x1b[0m');
  }
  emitText(socket, '\r\n\x1b[33mF\x1b[32m>\x1b[36morward\x1b[0m');
  emitText(socket, '\r\n\x1b[33mR\x1b[32m>\x1b[36meply\x1b[0m');
  emitText(socket, '\r\n\x1b[33mL\x1b[32m>\x1b[36mist all messages\x1b[0m');
  emitText(socket, '\r\n\x1b[33mNS\x1b[32m>\x1b[36m Non-stop mode\x1b[0m');
  emitText(socket, '\r\n\x1b[33mK\x1b[32m>\x1b[36meep and quit\x1b[0m');
  if (checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
    emitText(socket, '\r\n\x1b[33mE\x1b[32m>\x1b[36m Edit Emacs Message\x1b[0m');
    emitText(socket, '\r\n\x1b[33mEH\x1b[32m>\x1b[36m Edit Message Header\x1b[0m');
    emitText(socket, '\r\n\x1b[33mEM\x1b[32m>\x1b[36m Edit Message Body\x1b[0m');
  }
  if (checkSecurity(session.user, ACSPermission.ACCOUNT_EDITING)) {
    emitText(socket, '\r\n\x1b[33mU\x1b[32m>\x1b[36mser Account Edit\x1b[0m');
  }
  emitText(socket, '\r\n\x1b[33mQ\x1b[32m>\x1b[36muit\x1b[0m');
  // express.e:12059
  emitText(socket, '\r\n\x1b[32m<\x1b[33mCR\x1b[32m>\x1b[0m=\x1b[33mNext \x1b[32m(\x1b[0m ' + navStr + '\x1b[32m )\x1b[0m? ');

  session.subState = LoggedOnSubState.MSG_READER_NAV;
}

/** express.e:12010 — nav hint string: "N+MAX" or "QUIT" */
function getMsgNavStr(messages: any[], currentIndex: number): string {
  const nextIndex = currentIndex + 1;
  if (nextIndex >= messages.length) return 'QUIT';
  const maxMsgNum = (messages[messages.length - 1] as any).msgNumber || messages[messages.length - 1].id;
  const nextMsgNum = (messages[nextIndex] as any).msgNumber || messages[nextIndex].id;
  return `${nextMsgNum}+${maxMsgNum}`;
}

/**
 * Display message navigation prompt
 * From express.e:12008-12022 (readMSG loop), 12023-12062 (help variants)
 * Default is compact format (helplist=0), use ? for short help, ?? for full help
 * Exported so extracted sysop/translation modules can call it via require().
 */
export function displayMessageNavigationPrompt(socket: any, session: BBSSession): void {
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;
  // express.e:12010: ( N+MAX ) — next msg + max msg, shown pre-message in express.e
  // We show post-message; navStr refers to the next message to display
  const navStr = getMsgNavStr(messages, currentIndex);

  // express.e:12016-12020: [32mMsg. Options: [33mA[36m[,D][,M][36m,[33mF...[32m([0m str[32m )>:
  emitText(socket, '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m');

  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    emitText(socket, ',\x1b[33mD\x1b[36m');
  }

  if (checkSecurity(session.user, ACSPermission.SYSOP_READ)) {
    emitText(socket, ',\x1b[33mM\x1b[36m');
  }

  emitText(socket, ',\x1b[33mF\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mQ\x1b[36m,\x1b[33m?\x1b[36m,\x1b[33m??\x1b[36m,\x1b[32m<\x1b[33mCR\x1b[32m> \x1b[32m(\x1b[0m ' + navStr + '\x1b[32m )\x1b[0m>: ');

  session.subState = LoggedOnSubState.MSG_READER_NAV;
}

/**
 * Handle message reader navigation input
 * From express.e:11040-11210
 */
export async function handleMessageReaderNav(socket: any, session: BBSSession, input: string): Promise<void> {
  const command = input.trim().toUpperCase();
  const messages = session.tempData.msgReaderMessages;
  const currentIndex = session.tempData.msgReaderIndex;

  // ? - Short help (helplist=1) - express.e:11054-11056
  if (command === '?') {
    displayShortHelp(socket, session);
    return;
  }

  // ?? - Full help (helplist=2) - express.e:11051-11053
  if (command === '??') {
    displayFullHelp(socket, session);
    return;
  }

  // NS - Non-stop mode - express.e:11055, 12080
  if (command === 'NS') {
    session.tempData.nonStopMail = true;
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('Non-stop mode enabled', 'yellow'));
    emitText(socket, '\r\n');
    // Start displaying messages non-stop
    await displayMessagesNonStop(socket, session, currentIndex + 1);
    return;
  }

  // CR/Enter - Next message in current direction - express.e:12082-12085, 12238-12261
  // After "N+" or "N-" or "+"/"-", the direction is sticky for subsequent CR navigation.
  if (command === '' || command === 'N') {
    const fwdDir = session.tempData.msgReaderFwdDir ?? 1;
    if (fwdDir < 0) {
      // backward
      if (currentIndex > 0) {
        await displaySingleMessage(socket, session, currentIndex - 1);
      } else {
        const lowestNum = (messages[0] as any).msgNumber || messages[0].id;
        emitText(socket, `\r\nThe first message in this conference is ${lowestNum}\r\n`);
        await saveMessagePointerAndExit(socket, session);
      }
    } else {
      // forward (default)
      if (currentIndex < messages.length - 1) {
        await displaySingleMessage(socket, session, currentIndex + 1);
      } else {
        const lastMsg = messages[messages.length - 1];
        const lastMsgNum = (lastMsg as any).msgNumber || lastMsg.id;
        emitText(socket, `\r\nThe last message in this conference is ${lastMsgNum}\r\n`);
        await saveMessagePointerAndExit(socket, session);
      }
    }
    return;
  }

  // A - Again (redisplay) - express.e:11064-11069
  if (command === 'A') {
    await displaySingleMessage(socket, session, currentIndex);
    return;
  }

  // R - Reply - express.e:9874-9907 replyToMSG()
  if (command === 'R') {
    const msg = messages[currentIndex];

    // express.e:11201-11211 reply auth gate (parallel to F):
    //   IF (privateFlag=0)
    //   OR stringCompare(toName, confMailName)=SUCCESS
    //   OR StrCmp(toName, 'EALL', 5)
    //   ...captureRealAndInternetNames + replyToMSG
    //   ELSE 'Not your message.'
    // confMailName = per-conf display name (REALNAME/INTERNETNAME/USERNAME).
    // EALL allowed because it's group-addressed.
    const { getConfMailName, captureRealAndInternetNames: captureNames } = require('./message-entry.handler');
    const myConfMailNameR = getConfMailName(session).toLowerCase();
    const toLowerR = (msg.toUser || '').toLowerCase();
    const canReply = !msg.isPrivate ||
                     toLowerR === myConfMailNameR ||
                     toLowerR === 'all' ||
                     toLowerR === 'eall';
    if (!canReply) {
      emitText(socket, '\r\nNot your message.\r\n');
      displayMessageNavigationPrompt(socket, session);
      return;
    }

    // The post-capture body of the R command — extracted as a local async
    // function so captureRealAndInternetNames can resume here after an
    // inline REALNAME / INTERNETNAME prompt completes.
    const continueReply = () => {
      // express.e:9881-9884: header box + "To: fromName\r\n" (informational, no To: input)
      emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');

      // express.e:9882: AstrCopy(mailHeader.toName, mailHeader.fromName, 31)
      // — toName seeded from the original sender. checkToForward (express.e:9885)
      //   then redirects sysop replies via FORWARDMAIL tooltype.
      let toUser = msg.author;
      const confId = session.currentConf || 1;
      const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
      const { isSysopRecipient } = require('./message-entry.handler');
      const flags = getConferenceToolFlags(confId);
      const fwdUser = flags?.forwardMail || '';
      let forwardingNotice = '';
      // express.e:9919 stringCompare(name, tempUser.name) — slot 1's userName,
      // not just the literal token 'SYSOP'.
      if (fwdUser && isSysopRecipient(toUser)) {
        forwardingNotice = `    \x1b[36mForwarding mail To\x1b[33m:\x1b[0m ${fwdUser}\r\n`;
        toUser = fwdUser;
      }

      emitText(socket, `     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ${toUser}\r\n`);
      if (forwardingNotice) emitText(socket, forwardingNotice);

      // express.e:9886-9890: Subject prompt pre-filled with original subject
      emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
      emitText(socket, msg.subject);

      session.inputBuffer = msg.subject; // pre-fill for line editing
      if (!session.tempData) session.tempData = {};
      session.tempData.messageEntry = {
        toUser,
        subject: msg.subject,
        body: [],
        currentLine: 1,
        parentId: msg.id,
        replyOriginalToUser: msg.toUser,
        parentMsgStatus: (msg as any).status ?? null,
      };
      session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
    };

    // express.e:12162 captureRealAndInternetNames before replyToMSG.
    // Pass the resume callback so REALNAME / INTERNETNAME prompts (when
    // triggered) seamlessly hand off back into the reply flow.
    if (typeof captureNames === 'function') {
      const ok = captureNames(socket, session, continueReply);
      if (!ok) return; // capture in progress (or blocked); resume will fire if successful
    }
    continueReply();
    return;
  }

  // L - List messages - express.e:11197-11199
  if (command === 'L') {
    await listAllMessages(socket, session);
    return;
  }

  // Q - Quit - express.e:11194-11196
  if (command === 'Q') {
    await saveMessagePointerAndExit(socket, session);
    return;
  }

  // K - Keep (mark unread) - express.e:11124-11136
  // Clears recv flag and exits the message reader (RETURN RESULT_SUCCESS).
  // Only valid on public messages or messages addressed to the current user.
  if (command === 'K') {
    const msg = messages[currentIndex];
    const msgNum = (msg as any).msgNumber || msg.id;
    const { getConfMailName } = require('./message-entry.handler');
    const myConfMailName = getConfMailName(session).toLowerCase();

    // express.e:11125: IF((privateFlag=0) OR (stringCompare(mailHeader.toName,confMailName)=SUCCESS))
    // confMailName is the per-conference display name (NAME_TYPE_USERNAME/
    // REALNAME/INTERNETNAME), NOT the raw login username. In REALNAME
    // conferences the original mail's toName is the user's real name.
    const authorised = !msg.isPrivate || (msg.toUser || '').toLowerCase() === myConfMailName;
    if (!authorised) {
      // express.e:11134: aePuts('Not your message.\b\n') then JUMP contloop
      emitText(socket, '\r\nNot your message.\r\n');
      displayMessageNavigationPrompt(socket, session);
      return;
    }

    // express.e:11126: mailHeader.recv:=0; saveOverHeader(gfh)
    const confId: number = session.tempData.msgReaderConfId || session.currentConf || 1;
    const bbsDataPath: string = config.get('dataDir');
    await unmarkMessageReceived(confId, msgNum, bbsDataPath);

    // express.e:11128: IF lastNewReadConf>=mailHeader.msgNumb THEN lastNewReadConf--
    if ((session.lastNewReadConf || 0) >= msgNum) {
      session.lastNewReadConf = Math.max(msgNum - 1, 0);
    }

    // express.e:11129: IF mailStat.lowestNotDel>=mailHeader.msgNumb THEN lastNewReadConf:=lowestNotDel
    const lowestNotDel = messages.length > 0
      ? ((messages[0] as any).msgNumber || messages[0].id)
      : 0;
    if (lowestNotDel >= msgNum) {
      session.lastNewReadConf = lowestNotDel;
    }

    // Back up highest-read pointer so the pointer save won't re-mark it read
    if ((session.tempData.msgReaderHighestRead || 0) >= msgNum) {
      session.tempData.msgReaderHighestRead = Math.max(msgNum - 1, 0);
    }

    // express.e:11131-11132: kMsgFlag:=TRUE; RETURN RESULT_SUCCESS — exit reader entirely
    await saveMessagePointerAndExit(socket, session);
    return;
  }

  // F - Forward message - express.e:11178-11191, forwardMSG:9807-9871
  if (command === 'F') {
    const msg = messages[currentIndex];
    // express.e:11179 forward auth:
    //   IF (privateFlag=0)
    //   OR stringCompare(toName, confMailName)=SUCCESS
    //   OR StrCmp(toName, 'EALL', 5)
    // confMailName = per-conf display name (REALNAME / INTERNETNAME / USERNAME).
    // EALL is allowed because it's a group recipient, not a single user.
    const { getConfMailName, captureRealAndInternetNames: captureNames } = require('./message-entry.handler');
    const myConfMailName = getConfMailName(session).toLowerCase();
    const toLower = (msg.toUser || '').toLowerCase();
    const isEallAddressed = toLower === 'eall';
    const isAddressedToMe = toLower === myConfMailName;
    const isAddressedToAll = toLower === 'all';
    const canForward = !msg.isPrivate || isAddressedToMe || isAddressedToAll || isEallAddressed;
    if (!canForward) {
      // express.e:11920: '\b\nMessage not deleted, not your mail.\b\n\b\n'
      emitText(socket, '\r\nMessage not deleted, not your mail.\r\n\r\n');
      displayMessageNavigationPrompt(socket, session);
      return;
    }

    const continueForward = () => {
      // Store original message for forwarding
      session.tempData.forwardOriginalMessage = msg;
      session.tempData.forwardOriginalIndex = currentIndex;
      session.tempData.forwardData = {
        originalToUser: msg.toUser,
        originalSubject: msg.subject,
        canDeleteOriginal: isAddressedToMe && checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)
      };

      // Prompt for recipient (express.e:9816: msgToHeader())
      emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');
      emitPrompt(socket, '     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ');

      session.subState = LoggedOnSubState.FORWARD_MESSAGE_TO;
    };

    // express.e:12154 captureRealAndInternetNames before forwardMSG.
    // Pass continueForward as the resume so an inline REALNAME /
    // INTERNETNAME prompt (when triggered) hands off back into the
    // forward flow once the field is captured.
    if (typeof captureNames === 'function') {
      const ok = captureNames(socket, session, continueForward);
      if (!ok) return;
    }
    continueForward();
    return;
  }

  // D - Delete message - express.e:11113-11121
  if (command === 'D' && checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    const msg = messages[currentIndex];

    // express.e:11114 prompt-level check:
    //   IF (privateFlag=0) OR (stringCompare(toName, confMailName)=SUCCESS)
    // express.e:11917-11921 deleteMSG inner check (secStatus<210):
    //   IF stringCompare(fromName, confMailName)=SUCCESS THEN goAheadDel
    //   IF stringCompare(toName,   confMailName)=SUCCESS THEN goAheadDel
    //   ELSE 'Message not deleted, not your mail.'
    // Both compare against confMailName (per-conf display name), not the
    // raw login username — REALNAME/INTERNETNAME conferences need this.
    const { getConfMailName } = require('./message-entry.handler');
    const myConfMailName = getConfMailName(session).toLowerCase();
    const canDelete = (checkSecurity(session.user, ACSPermission.SYSOP_READ)) ||
      !msg.isPrivate ||
      (msg.author || '').toLowerCase() === myConfMailName ||
      (msg.toUser || '').toLowerCase() === myConfMailName;
    if (canDelete) {
      // Delete the message
      const msgNum = (msg as any).msgNumber || msg.id;
      try {
        await _deleteMessage(msg.id);
      } catch (err: any) {
        // express.e:11940 — when lockMsgBase fails, deleteMSG prints
        // 'Can't Lock MsgBase, Message not Deleted!' and returns failure
        // without touching DB or disk. message-repository.deleteMessage
        // throws "MsgBase locked for Conf<N> — Message not Deleted!" in
        // that case; surface it to the user verbatim and stay in the
        // reader so they can retry.
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.startsWith('MsgBase locked')) {
          emitText(socket, "\r\nCan't Lock MsgBase, Message not Deleted!\r\n");
        } else {
          emitText(socket, `\r\nError deleting message: ${errMsg}\r\n`);
        }
        displayMessageNavigationPrompt(socket, session);
        return;
      }

      // express.e:11936: '\b\nMessage N deleted...\b\n'
      emitText(socket, `\r\nMessage ${msgNum} deleted...\r\n`);

      // Remove from reader's message list
      messages.splice(currentIndex, 1);
      session.tempData.msgReaderMessages = messages;

      // If there are no more messages, exit (express.e goNextMsg→QUIT prompt→exit — no extra message)
      if (messages.length === 0) {
        await saveMessagePointerAndExit(socket, session);
        return;
      }

      // Display next message, or previous if we deleted the last one
      const nextIndex = currentIndex < messages.length ? currentIndex : currentIndex - 1;
      await displaySingleMessage(socket, session, nextIndex);
    } else {
      // express.e:11118-11119 JUMP contloop — nav prompt only
      emitText(socket, '\r\n');
      emitText(socket, 'Not your message.\r\n');
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // M - Move message (sysop only) - express.e:11105-11109
  if (command === 'M' && checkSecurity(session.user, ACSPermission.SYSOP_READ)) {
    const msg = messages[currentIndex];
    // Store message for move operation
    session.tempData.moveMessage = msg;
    session.tempData.moveMessageIndex = currentIndex;

    // Prompt for destination conference - express.e:27024-27025
    emitText(socket, '\r\n');
    emitPrompt(socket, 'Conference Number to move to (L to List): ');
    session.subState = LoggedOnSubState.MSG_MOVE_CONF_INPUT;
    return;
  }

  // Translation commands (T/TS/T!/T*) - express.e:11065-11103
  // Requires ACS_TRANSLATION permission
  if ((command === 'T' || command === 'TS' || command === 'T!' || command === 'T*') &&
      checkSecurity(session.user, ACSPerm.TRANSLATION)) {
    await handleTranslationCommand(socket, session, command);
    return;
  }

  // EH - Edit message header (sysop only) - express.e:11140-11141, 11602-11649
  if (command === 'EH' && checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
    const msg = messages[currentIndex];
    // Store message for edit operation
    session.tempData.editMessage = msg;
    session.tempData.editMessageIndex = currentIndex;
    session.tempData.editHeader = {
      from: msg.author,
      to: msg.toUser || 'ALL',
      subject: msg.subject,
      isPrivate: msg.isPrivate
    };

    // Prompt for From name - express.e:11611-11613
    emitText(socket, '\r\n');
    emitText(socket, `     ${AnsiUtil.colorize('From', 'cyan')}${AnsiUtil.colorize(':', 'yellow')} `);
    emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Enter', 'yellow')}${AnsiUtil.colorize(')', 'green')}`);
    emitText(socket, `=${AnsiUtil.colorize("'", 'green')}${AnsiUtil.colorize(msg.author, 'yellow')}${AnsiUtil.colorize("'", 'green')}${AnsiUtil.colorize('?', 'green')} `);
    session.subState = LoggedOnSubState.MSG_EDIT_HEADER_FROM;
    return;
  }

  // E or EM - Edit message body (sysop) - express.e:11142-11148 / 12183-12188
  // express.e: loadMsg(msgFile) → edit() → saveMsg(msgFile) overwrites the
  // canonical body file at msgBaseLocation/<N>. We re-use the existing body
  // editor (POST_MESSAGE_BODY + Msg. Options menu) and route the Save action
  // through overwriteMessageBody when editingExistingMsgId is set.
  if ((command === 'E' || command === 'EM') && checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
    const msg = messages[currentIndex];
    const msgNum = (msg as any).msgNumber || msg.id;
    const bodyLines: string[] = (msg.body || '').split('\n');

    // Set up messageEntry to feed the existing body editor flow.
    session.tempData.messageEntry = {
      toUser: msg.toUser || 'ALL',
      subject: msg.subject || '',
      body: bodyLines,
      currentLine: bodyLines.length + 1,
      isPrivate: !!msg.isPrivate,
      // Marker for saveMessage: overwrite this msg's body instead of
      // creating a new entry. Reader returns to nav prompt afterwards.
      editingExistingMsgId: msgNum,
      editingReturnIndex: currentIndex,
      // Disable file-attach during body edit (express.e:11144 fileattach:=FALSE)
      attachedFiles: [],
    };
    session.inputBuffer = '';

    // Use the existing promptForMessageBody flow — it shows the header,
    // ruler, existing lines, then drops to POST_MESSAGE_BODY.
    const { promptForMessageBody } = require('./message-entry.handler');
    if (typeof promptForMessageBody === 'function') {
      promptForMessageBody(socket, session);
    } else {
      // Fallback: emit prompt manually if the helper isn't exposed.
      emitText(socket, '\r\n   Enter your text. (Enter) alone to end. (75 chars/line)\r\n');
      session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    }
    return;
  }

  // U - User Account Edit - express.e:11154-11176, 12196-12217
  // Requires ACS_ACCOUNT_EDITING. Looks up the message author and launches account editor.
  // express.e: findUserFromName → loadAccount → editInfo; "User no longer exists.\r\n" if not found
  if (command === 'U' && checkSecurity(session.user, ACSPermission.ACCOUNT_EDITING)) {
    const msg = messages[currentIndex];
    const authorName: string = msg.author || '';
    if (authorName) {
      // handleEditUserAccount calls db.getUserByUsername, sets ACCOUNT_EDITOR_EDIT subState.
      // We must preserve the message reader context so we can return to the nav prompt.
      // express.e:11165-11170: sendCLS(); editInfo(); sendCLS(); displayMessage(); JUMP contloop
      // WEB_: account editor does not return to message reader automatically; display nav prompt after.
      // Store caller context so account editor exit can navigate back.
      session.tempData.msgReaderReturnAfterAccountEdit = true;
      handleEditUserAccount(socket, session, authorName);
    } else {
      // No author — treat as "User no longer exists."
      emitText(socket, 'User no longer exists.\r\n');
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // Number input — express.e:12264-12268: isDigit → msgNum:=Val(str) → goNextMsg
  // Express.e:12238-12261: a trailing "+" or "-" sets fwdDir for subsequent CR nav.
  // "N+" jumps to N forward-direction; "N-" jumps to N backward-direction; bare "+"/"-" with no digits steps in that direction.
  // Pure digits: "5" → jump to msg 5.
  // "5+" or "5-": jump to msg 5 and update fwdDir.
  // "+" or "-" alone: step forward/backward.
  const numWithDir = command.match(/^(\d+)([+-])?$/);
  if (numWithDir) {
    const targetNum = parseInt(numWithDir[1], 10);
    if (numWithDir[2] === '-') session.tempData.msgReaderFwdDir = -1;
    else if (numWithDir[2] === '+') session.tempData.msgReaderFwdDir = 1;
    const targetIdx = messages.findIndex((m: any) => ((m as any).msgNumber || m.id) === targetNum);
    if (targetIdx >= 0) {
      await displaySingleMessage(socket, session, targetIdx);
    } else {
      emitText(socket, '\r\n');
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // + alone — express.e:12238: same as CR (next message)
  if (command === '+') {
    session.tempData.msgReaderFwdDir = 1;
    if (currentIndex < messages.length - 1) {
      await displaySingleMessage(socket, session, currentIndex + 1);
    } else {
      const lastMsgNum = (messages[messages.length - 1] as any).msgNumber || messages[messages.length - 1].id;
      emitText(socket, `\r\nThe last message in this conference is ${lastMsgNum}\r\n`);
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // - alone — express.e:12249: previous message
  if (command === '-') {
    session.tempData.msgReaderFwdDir = -1;
    if (currentIndex > 0) {
      await displaySingleMessage(socket, session, currentIndex - 1);
    } else {
      const lowestNum = (messages[0] as any).msgNumber || messages[0].id;
      emitText(socket, `\r\nThe first message in this conference is ${lowestNum}\r\n`);
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // Invalid command — express.e:11213 aePuts('No such command!!\b\n') then JUMP contloop
  emitText(socket, '\r\n');
  emitText(socket, 'No such command!!\r\n');
  displayMessageNavigationPrompt(socket, session);
}

/**
 * Initiate message list — express.e:8820-8878 (listMSGs)
 * Prompts: "Starting message [N]: " then shows columnar list.
 */
async function listAllMessages(socket: any, session: BBSSession): Promise<void> {
  const messages = session.tempData.msgReaderMessages;
  if (!messages || messages.length === 0) {
    emitText(socket, '\r\n');
    await displaySingleMessage(socket, session, session.tempData.msgReaderIndex);
    return;
  }
  // lowestNotDel = lowest non-deleted message number in list
  const lowestMsgNum = (messages[0] as any).msgNumber || messages[0].id;

  // express.e:8831: "Starting message [N]: " prompt
  emitText(socket, `\x1b[32mStarting message \x1b[33m[\x1b[0m${lowestMsgNum}\x1b[33m]\x1b[0m: `);
  session.tempData.msgListLowest = lowestMsgNum;
  session.subState = LoggedOnSubState.MSG_LIST_START_INPUT;
}

/**
 * Handle "Starting message [N]: " input — express.e:8833-8877
 */
export async function handleMsgListStartInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const messages = session.tempData.msgReaderMessages;
  const lowestMsgNum = session.tempData.msgListLowest || 1;
  let startNum: number;

  if (input.trim() === '') {
    // express.e:8834-8836: blank → use lowestNotDel
    startNum = lowestMsgNum;
  } else {
    const parsed = parseInt(input.trim(), 10);
    if (isNaN(parsed)) {
      // express.e:8840-8842: Val returned 0 → RETURN RESULT_FAILURE (back to nav)
      await displaySingleMessage(socket, session, session.tempData.msgReaderIndex);
      return;
    }
    startNum = parsed;
  }

  // express.e:8845-8878: list messages from startNum
  //
  // express.e:8854 filter — listMSGs shows ONLY messages where:
  //   toName == confMailName  (mail addressed to me)
  //   OR toName == 'eall'     (group-addressed)
  //   OR toName == 'all' AND conf has MAILSCAN_ALL set
  //
  // This is a NARROWER filter than the read-mail "canRead" check upstream
  // — listMSGs is "what's in MY inbox", not "what can I read at all".
  // The previous TS port reused the broad msgReaderMessages list, so users
  // saw every public message in the conference under L instead of just
  // mail addressed to them.
  const { getConfMailName } = require('./message-entry.handler');
  const myConfMailName = getConfMailName(session).toLowerCase();
  // express.e:8854 cb.handle[0] AND MAILSCAN_ALL — bit 7 (0x80) of the
  // user's per-msgbase scanFlags byte (axconsts.e:48). When set, ALL-
  // addressed messages are included in the L listing for this conf;
  // otherwise they're hidden (unless they happen to be addressed to me
  // or EALL). The same gate is already applied to mail scan via
  // getMessagesForConfScan; we now mirror it here so L behaviour
  // matches express.e exactly.
  const { loadMsgPointers, validatePointers } = require('../../utils/message-pointers.util');
  const MAILSCAN_ALL_BIT = 1 << 7;
  let mailscanAllForThisConf = false;
  try {
    const confId = session.currentConf || 1;
    const msgBaseId = session.currentMsgBase || 1;
    const confBase = await loadMsgPointers(session.user.id, confId, msgBaseId);
    const mailStat = require('../../services/MessageIndexManager').messageIndexManager.readMailStats(confId);
    const validated = mailStat ? validatePointers(confBase, mailStat) : confBase;
    mailscanAllForThisConf = (validated.scanFlags & MAILSCAN_ALL_BIT) !== 0;
  } catch {
    // Pointer load failure → leave as false (most-restrictive default,
    // matching the common "user hasn't enabled all-scan" case).
  }
  const filtered = messages.filter((m: any) => {
    const num = (m as any).msgNumber || m.id;
    if (num < startNum) return false;
    const toL = (m.toUser || '').toLowerCase();
    if (toL === myConfMailName) return true;
    if (toL === 'eall') return true;
    if (toL === 'all' && mailscanAllForThisConf) return true;
    return false;
  });
  let wroteHeader = false;

  emitText(socket, '\r\n');

  for (const msg of filtered) {
    const msgNum = (msg as any).msgNumber || msg.id;

    if (!wroteHeader) {
      // express.e:8856-8858: '\b\n\b\n' then header
      emitText(socket, '\r\n\r\n\x1b[32mMsg    Type     From                           Subject              \r\n');
      emitText(socket, '\x1b[33m------ -------  -----------------------------  ---------------------\r\n');
      emitText(socket, '\x1b[0m');
      wroteHeader = true;
    }

    // express.e:8863: P/p = Public, else Private
    const typeStr = msg.isPrivate ? 'Private' : 'Public ';
    // express.e:8864: \z\r\d[6] \s  \l\s[29]  \l\s[21]
    const msgNumStr = String(msgNum).padStart(6, '0');  // express.e \z\r\d[6] = zero-fill
    const fromPad = (msg.author || '').substring(0, 29).padEnd(29);
    const subjPad = (msg.subject || '').substring(0, 21).padEnd(21);
    emitText(socket, `${msgNumStr} ${typeStr}  ${fromPad}  ${subjPad}\x1b[0m\r\n`);
  }

  // express.e:8876-8877: no 'No messages found.' message — just exits if nothing matched

  emitText(socket, '\r\n');
  // Return to current message
  await displaySingleMessage(socket, session, session.tempData.msgReaderIndex);
}

/**
 * Save message pointer and exit reader.
 *
 * WEB_: after exit we return straight to DISPLAY_MENU rather than replaying
 * DISPLAY_CONF_BULL → DISPLAY_NODE_BULL → ... the way the pre-fix code did.
 * express.e's R command exits back to STATE_LOGGEDON/SUBSTATE_READ_COMMAND
 * (the menu prompt), not through the login bulletin chain — see express.e
 * main loop at 32024 (processLoggedOnUser) where R returns. The previous
 * DISPLAY_CONF_BULL transition was a divergence that showed CONF_BULL/NODE_
 * BULL/MENU again every time the user pressed Enter at the last message
 * (reported 2026-04-24).
 */
export async function saveMessagePointerAndExit(socket: any, session: BBSSession): Promise<void> {
  const highestRead = session.tempData.msgReaderHighestRead;

  // Update and save read pointer - express.e:11985
  if (highestRead > session.lastMsgReadConf) {
    session.lastMsgReadConf = highestRead;
    await _updateReadPointer(session.user.id, session.currentConf, session.currentMsgBase, highestRead);
  }

  // Clean up temp data
  delete session.tempData.msgReaderMessages;
  delete session.tempData.msgReaderIndex;
  delete session.tempData.msgReaderHighestRead;

  emitText(socket, '\r\n');
  session.menuPause = false;

  // If we were reading mail during confScan, return to scan (express.e:11772+)
  if (session.tempData?.confScanReturnAfterRead) {
    delete session.tempData.confScanReturnAfterRead;
    const { advanceConferenceScan } = require('../message/message-scan.handler');
    await advanceConferenceScan(socket, session);
    return;
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * E Command: Enter Message (internalCommandE)
 * Original: express.e:24860-24872
 *
 * Initiates private message posting workflow.
 * Prompts for recipient, subject, and message body using line-based input.
 */
export function handleEnterMessageFullCommand(
  socket: any,
  session: BBSSession,
  params: string = ''
): void {
  if (!checkSecurity(session.user, ACSPermission.ENTER_MESSAGE)) {
    ErrorHandler.permissionDenied(socket, 'post messages', {
      nextState: LoggedOnSubState.DISPLAY_CONF_BULL
    });
    return;
  }

  _setEnvStat(session, EnvStat.MAIL);

  // express.e:12471 captureRealAndInternetNames(conf, msgBaseNum) — gate the
  // entry on REALNAME/INTERNETNAME tooltype requirements. When the user
  // hasn't filled the required field, captureNames now prompts inline (per
  // express.e:28166-28225) and resumes by re-invoking this command after
  // the user supplies the value. We pass `params` through the resume so
  // the original `E <name>` form keeps its prefilled recipient.
  const { captureRealAndInternetNames: captureNames } = require('./message-entry.handler');
  if (typeof captureNames === 'function') {
    const ok = captureNames(socket, session, () => {
      handleEnterMessageFullCommand(socket, session, params);
    });
    if (!ok) return;
  }

  // express.e msgToHeader():9998-10001
  emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');

  session.inputBuffer = '';
  session.tempData = { isPrivate: true, messageEntry: {} };

  const firstParam = params.trim();
  if (firstParam && firstParam.length <= 30) {
    // express.e:10762-10774: parsedParams[0] ≤ 30 chars → pre-fill To:, JUMP skipEntry
    //   AstrCopy(mailHeader.toName, firstparam, 31)
    //   msgToHeader()                — separator already emitted above
    //   aePuts(mailHeader.toName)    — echo prefilled name
    //   aePuts('\b\n')               — post-name newline
    //   JUMP skipEntry               — fall into EALL/sysop/chooseAName chain
    //
    // Echo the To: prompt with the prefilled name + post-name newline, then
    // route through processToRecipient to run the FULL skipEntry sequence
    // (EALL exact match, sysop loadAccount, chooseAName canonical-form,
    // checkConfAccess, checkToForward). Previously this branch only handled
    // EALL and skipped the rest, allowing pre-filled recipients to bypass
    // sysop comment routing, conference-access checks, and FORWARDMAIL.
    emitText(socket, `     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ${firstParam}\r\n`);
    const { processToRecipient } = require('./message-entry.handler');
    void processToRecipient(socket, session, firstParam);
  } else {
    // No params — show To: prompt (express.e:10778-10780)
    emitText(socket, '     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ');
    session.subState = LoggedOnSubState.POST_MESSAGE_TO;
  }
}

// ============================================================================
// SYSOP MESSAGE COMMANDS (M/EH) - express.e:11105-11148, 11602-11649
// Extracted to messaging-sysop.ts; re-exported here for unchanged import paths.
// ============================================================================

export {
  setMoveEditDependencies,
  handleMsgMoveConfInput,
  handleMsgMoveMsgBaseInput,
  handleMsgMoveConfirm,
  handleMsgEditHeaderFrom,
  handleMsgEditHeaderTo,
  handleMsgEditHeaderSubject,
  handleMsgEditHeaderPrivate,
} from './messaging-sysop';

/**
 * Helper: Return to message reader after cancelled operation.
 * Exported so messaging-sysop.ts and messaging-translation.ts can call it
 * via require() to break circular dependencies.
 */
export async function returnToMessageReader(socket: any, session: BBSSession): Promise<void> {
  // Clean up any move/edit temp data
  delete session.tempData.moveMessage;
  delete session.tempData.moveMessageIndex;
  delete session.tempData.moveDestConf;
  delete session.tempData.moveDestConfName;
  delete session.tempData.moveDestMsgBase;
  delete session.tempData.editMessage;
  delete session.tempData.editMessageIndex;
  delete session.tempData.editHeader;

  // Return to message reader at current index
  const currentIndex = session.tempData.msgReaderIndex || 0;
  await displaySingleMessage(socket, session, currentIndex);
}

// ============================================================================
// TRANSLATION COMMANDS (T/TS/T!/T*) - express.e:11065-11103, 12108-12145
// Extracted to messaging-translation.ts; re-exported here for unchanged import paths.
// ============================================================================

export {
  handleChooseTranslatorInput,
} from './messaging-translation';
