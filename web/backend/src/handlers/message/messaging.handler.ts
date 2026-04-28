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
import { getAllMessageIds, readMessageFile, markMessageReceived, unmarkMessageReceived } from '../../utils/message-file.util';
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
 * From express.e:8902-8910 - When toUser is "EALL", display as "{confName} (ALL)"
 */
function formatRecipientDisplay(msg: any, session: BBSSession): string {
  if (!msg.isPrivate) {
    return 'ALL';
  }
  // Check for EALL (case-insensitive) - express.e:8904-8907
  // confMailName = loggedOnUserKeys.userName (express.e:12461) — the user's own name
  if (msg.toUser && msg.toUser.toLowerCase() === 'eall') {
    const mailName = (session.user as any)?.username || (session.user as any)?.name || 'User';
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

  // Get all message IDs from disk
  const messageIds = await getAllMessageIds(confId, bbsDataPath);
  const messages: any[] = [];

  // Read each message from disk
  for (const msgNum of messageIds) {
    const message = await readMessageFile(confId, msgNum, bbsDataPath);
    if (!message) {
      continue; // Skip corrupted/missing files
    }

    // Filter by privacy: show public messages and private messages to/from this user
    if (!message.isPrivate) {
      // Public message - show to everyone
      messages.push({
        id: msgNum,
        msgNumber: msgNum,
        subject: message.subject,
        body: message.body,
        author: message.from,
        toUser: message.to,
        timestamp: new Date(message.date), // Parse DD-MMM-YY HH:MM:SS format
        isPrivate: false
      });
    } else if (username &&
               (message.to.toLowerCase() === username ||
                message.from.toLowerCase() === username)) {
      // Private message to or from this user
      messages.push({
        id: msgNum,
        msgNumber: msgNum,
        subject: message.subject,
        body: message.body,
        author: message.from,
        toUser: message.to,
        timestamp: new Date(message.date),
        isPrivate: true
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

  // Initialize message reader state
  session.tempData = session.tempData || {};
  session.tempData.msgReaderMessages = messages;
  session.tempData.msgReaderIndex = startIndex;
  session.tempData.msgReaderHighestRead = lastRead;

  // Display first (unread) message
  await displaySingleMessage(socket, session, startIndex);
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

  // Display message body - express.e:8965-8969
  emitText(socket, `${msg.body}\r\n`);
  emitText(socket, '\r\n');

  // express.e:8943-8949 - Mark message as received if addressed to current user
  // IF(stringCompare(mailHeader.toName,confMailName)=RESULT_SUCCESS)
  //   IF(mailHeader.recv=0)
  //     mailHeader.recv:=getSystemTime()
  //     saveOverHeader(gfh)
  //   ENDIF
  // ENDIF
  const currentUsername = session.user?.username?.toLowerCase();
  if (currentUsername && msg.toUser && !msg.receivedAt) {
    const toUserLower = msg.toUser.toLowerCase();
    if (toUserLower === currentUsername) {
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
    emitText(socket, `${msg.body}\r\n\r\n`);
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

  // CR/Enter - Next message - express.e:12082-12085 JUMP goNextMsg
  if (command === '' || command === 'N') {
    if (currentIndex < messages.length - 1) {
      await displaySingleMessage(socket, session, currentIndex + 1);
    } else {
      // express.e noMorePlus():12299-12309: "The last message in this conference is N\r\n"
      const lastMsg = messages[messages.length - 1];
      const lastMsgNum = (lastMsg as any).msgNumber || lastMsg.id;
      emitText(socket, `\r\nThe last message in this conference is ${lastMsgNum}\r\n`);
      await saveMessagePointerAndExit(socket, session);
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

    // express.e:9881-9884: header box + "To: fromName\r\n" (informational, no To: input)
    emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');
    emitText(socket, `     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ${msg.author}\r\n`);

    // express.e:9886-9890: Subject prompt pre-filled with original subject (no "Re: " prefix)
    // blank = abort (RETURN RESULT_SUCCESS = return to reading)
    emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
    emitText(socket, msg.subject);

    session.inputBuffer = msg.subject; // pre-fill for line editing
    session.tempData.messageEntry = {
      toUser: msg.author,
      subject: msg.subject,
      body: [],
      currentLine: 1,
      parentId: msg.id,
      // express.e:9880: frm = mailHeader.toName; used for delete-original eligibility (9898-9903)
      replyOriginalToUser: msg.toUser,
    };
    // express.e:9894 replyFlag=1 → enterMSG skips To:/Subject: and jumps to skipBegin
    // We go to POST_MESSAGE_SUBJECT to capture any subject edit; handler will proceed to Private
    session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
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
    const username = (session.user?.username || '').toLowerCase();

    // express.e:11125: IF((privateFlag=0) OR (stringCompare(mailHeader.toName,confMailName)=SUCCESS))
    const authorised = !msg.isPrivate || (msg.toUser || '').toLowerCase() === username;
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
    // Check if user can forward this message:
    // - Public messages (not private)
    // - Private messages to you
    // - Messages to ALL
    if (!msg.isPrivate || msg.toUser === session.user.username || msg.toUser === 'ALL') {
      // Store original message for forwarding
      session.tempData.forwardOriginalMessage = msg;
      session.tempData.forwardOriginalIndex = currentIndex;
      session.tempData.forwardData = {
        originalToUser: msg.toUser,
        originalSubject: msg.subject,
        canDeleteOriginal: msg.toUser === session.user.username && checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)
      };

      // Prompt for recipient (express.e:9816: msgToHeader())
      emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');
      emitPrompt(socket, '     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ');

      session.subState = LoggedOnSubState.FORWARD_MESSAGE_TO;
    } else {
      // express.e:11920: '\b\nMessage not deleted, not your mail.\b\n\b\n'
      emitText(socket, '\r\nMessage not deleted, not your mail.\r\n\r\n');
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // D - Delete message - express.e:11113-11121
  if (command === 'D' && checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
    const msg = messages[currentIndex];

    // express.e deleteMSG:11917-11921: secStatus<210 requires fromName=user OR toName=user
    // (sysop secStatus≥210 bypasses check)
    const username = session.user.username.toLowerCase();
    const canDelete = (checkSecurity(session.user, ACSPermission.SYSOP_READ)) ||
      !msg.isPrivate ||
      (msg.author || '').toLowerCase() === username ||
      (msg.toUser || '').toLowerCase() === username;
    if (canDelete) {
      // Delete the message
      const msgNum = (msg as any).msgNumber || msg.id;
      await _deleteMessage(msg.id);

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

  // E or EM - Edit message body (sysop only) - express.e:11142-11148
  // WEB_: no Emacs editor; re-display message then nav prompt (express.e:11150 displayMessage + JUMP nextMenu)
  if ((command === 'E' || command === 'EM') && checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
    await displaySingleMessage(socket, session, currentIndex);
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
  // Jump to the message with that number
  if (/^\d+$/.test(command)) {
    const targetNum = parseInt(command, 10);
    const targetIdx = messages.findIndex((m: any) => ((m as any).msgNumber || m.id) === targetNum);
    if (targetIdx >= 0) {
      await displaySingleMessage(socket, session, targetIdx);
    } else {
      // express.e: readit would hit "That message has been deleted." or skip past range
      emitText(socket, '\r\n');
      displayMessageNavigationPrompt(socket, session);
    }
    return;
  }

  // + — advance forward (already handled by CR; express.e:12238 fwdFlag:=1)
  // - — go backward; find previous message
  if (command === '-' || command.endsWith('-')) {
    if (currentIndex > 0) {
      await displaySingleMessage(socket, session, currentIndex - 1);
    } else {
      // express.e noMoreMinus(): "The first message in this conference is N\r\n"
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
  // msgReaderMessages is already filtered for this user; apply start number filter
  const filtered = messages.filter((m: any) => ((m as any).msgNumber || m.id) >= startNum);
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

  // express.e msgToHeader():9998-10001
  emitText(socket, '\r\n                       \x1b[32m(\x1b[33m------------------------------\x1b[32m)\x1b[0m\r\n');

  session.inputBuffer = '';
  session.tempData = { isPrivate: true, messageEntry: {} };

  const firstParam = params.trim();
  if (firstParam && firstParam.length <= 30) {
    // express.e:10762-10774: parsedParams[0] ≤ 30 chars → pre-fill To:, JUMP skipEntry
    // express.e:10785-10816: after skipEntry, run EALL/recipient checks
    const firstParamLower = firstParam.toLowerCase();

    // express.e:10802: StrCmp(str,'eall',5) — check first 4 chars for 'eall'
    if (firstParamLower === 'eall' || firstParamLower.startsWith('eall')) {
      // express.e:10810: IF(checkSecurity(ACS_EALL_MESSAGES))
      if (!checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {
        // express.e:10814: aePuts('\b\nUser does not exist!!\b\n\b\n')
        emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
        session.tempData = undefined;
        return;
      }
      // express.e:10811-10812: aFlag:=2; toName:='EALL'
      session.tempData.messageEntry.toUser = 'EALL';
    } else {
      session.tempData.messageEntry.toUser = firstParam;
    }

    emitText(socket, `     \x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m\'\x1b[33mALL\x1b[32m\'\x1b[32m?\x1b[0m ${session.tempData.messageEntry.toUser}\r\n`);
    // Skip To: prompt — go straight to Subject (skipEntry → line 10785)
    emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
    session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
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
