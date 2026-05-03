/**
 * Message Entry Handler - Handles the E (Enter Message) command flow
 * 1:1 port from express.e:10749+ enterMSG()
 */

import { BBSSession } from '../../index';
import { AnsiUtil } from '../../utils/ansi.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/security.util';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { writeMessageFile, formatMessageDate } from '../../utils/message-file.util';
import { config } from '../../config';
import { runExecuteOn } from '../../services/batch-scheduler';
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import { mailOnSysopComment } from '../../services/mail-notification.service';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { getSystemTime, formatLongDateTime } from '../../utils/date-time.util';


// Dependencies (injected from index.ts)
let _db: any;
let _callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;

export function setMessageEntryDependencies(deps: {
  db: any;
  callersLog: typeof _callersLog;
}) {
  _db = deps.db;
  _callersLog = deps.callersLog;
}

/**
 * express.e:28151-28230 captureRealAndInternetNames — when the conf or
 * msgbase requires REALNAME / INTERNETNAME (per-conf or per-msgbase
 * tooltype) and the user hasn't filled those fields, block the message
 * entry. Express.e prompts inline with a uniqueness loop; we surface a
 * notice and abort so the user can set the field via the account editor
 * (which is closer to modern web UX) before retrying.
 *
 * Returns true if entry should proceed, false if blocked.
 */
export function captureRealAndInternetNames(socket: any, session: BBSSession): boolean {
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  if (confId < 1 || msgBaseId < 1) return true;

  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  // requireUsername / requireRealname are populated from REALNAME, REALNAME.<n>,
  // INTERNETNAME, INTERNETNAME.<n> tooltypes (see conference-tooltypes.util.ts).
  // express.e:28159-28164 OR's all four into realNamesUsed/internetNamesUsed.
  const realNamesUsed = !!(flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId));
  const userMisc: any = (session.user as any) || {};
  const realName = String(userMisc.realName || userMisc.realname || '').trim();
  const internetName = String(userMisc.internetName || userMisc.internetname || '').trim();

  if (realNamesUsed && realName.length === 0) {
    emitText(socket, '\r\nReal Names are required for messages in this conference/msgbase\r\n');
    emitText(socket, 'Use the account editor to set your real name first.\r\n\r\n');
    return false;
  }
  // We don't yet model an INTERNETNAME flag separately on ConferenceToolFlags
  // (the existing tooltype harvester doesn't pull INTERNETNAME). Internet
  // name enforcement is a follow-up; the realName gate covers the common
  // sysop config.
  return true;
}

/**
 * express.e:10787-10788 — EXTSEND.<msgBase> tooltype on the conf icon marks
 * a msgbase as "external" (e.g. routed to a UUCP/FidoNet gateway). When set:
 *   - express.e:10805-10808: EALL is forbidden
 *   - express.e:10860: Private prompt is skipped
 */
function isExtSendMsgBase(session: BBSSession): boolean {
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  return !!flags?.extSendMsgBases?.has?.(msgBaseId);
}

/**
 * express.e:9909-9950 checkToForward — when the conf has FORWARDMAIL=<user>
 * tooltype set AND the recipient is the sysop (slot 1), redirect the message
 * to <user> and print "    Forwarding mail To: <name>".
 *
 * Mutates session.tempData.messageEntry.toUser in place. Caller should run
 * this AFTER the recipient name is finalized (matches express.e:10845/9885).
 */
function applyConfForwardMail(socket: any, session: BBSSession): void {
  const entry = session.tempData?.messageEntry;
  if (!entry?.toUser) return;
  const confId = session.currentConf || 1;
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  const fwdUser = flags?.forwardMail || '';
  if (!fwdUser) return;
  // express.e:9919 stringCompare(name, sysop.name) — recipient is the sysop?
  // We accept either the literal token 'SYSOP' (handleMessageToInput maps to
  // slot 1) or a case-insensitive match against the slot-1 username if known.
  const toUpper = (entry.toUser || '').toUpperCase();
  if (toUpper === 'SYSOP') {
    entry.toUser = fwdUser;
    emitText(socket, `    \x1b[36mForwarding mail To\x1b[33m:\x1b[0m ${fwdUser}\r\n`);
  }
}

/**
 * Handle recipient (To:) input - express.e:10771-10838
 *
 * Async because we need DB lookups for chooseAName + checkConfAccess.
 */
export async function handleMessageToInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10762,10779 — lineInput max 30 chars; truncate silently if longer
  const recipient = input.trim().substring(0, 30);

  // Blank = ALL (express.e:10793-10795)
  if (recipient === '') {
    session.tempData.messageEntry.toUser = 'ALL';
    emitText(socket, '\r\n');
    // express.e:10845 checkToForward runs after recipient is finalized.
    // ALL is not the sysop so this is a no-op, but keep the call symmetric
    // with the other branches.
    applyConfForwardMail(socket, session);
    promptForSubject(socket, session);
    return;
  }

  // Check for EALL - express.e:10800-10816
  const recipientLower = recipient.toLowerCase();
  if (recipientLower === 'eall') {
    // express.e:10805-10808 — extSend (msgbase has EXTSEND.<n>) blocks EALL
    if (isExtSendMsgBase(session)) {
      emitText(socket, "\r\nCan't use EALL in external message bases!!\r\n\r\n");
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }
    // express.e:10810 - Check ACS_EALL_MESSAGES permission
    if (checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {
      session.tempData.messageEntry.toUser = 'EALL';
      emitText(socket, '\r\n');
      applyConfForwardMail(socket, session);
      promptForSubject(socket, session);
    } else {
      // express.e:10814 - No permission, reject
      emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
    }
    return;
  }

  // Check for SYSOP - express.e:10818-10820 maps to slot 1.
  // We pass through the literal 'SYSOP' token; saveMessage normalizes via
  // doCommentNotify path. checkConfAccess for sysop is implicitly allowed.
  if (recipientLower === 'sysop') {
    session.tempData.messageEntry.toUser = 'SYSOP';
    emitText(socket, '\r\n');
    // express.e:10845 — FORWARDMAIL redirect kicks in here for sysop comments
    applyConfForwardMail(socket, session);
    promptForSubject(socket, session);
    return;
  }

  // express.e:10822-10841 — chooseAName + canonical-form copy + checkConfAccess.
  // Lookup the recipient by username (the most common case). When we find
  // a match: normalize to the user's stored username, then verify they have
  // access to the current conference.
  let resolved = recipient;
  let resolvedUser: any = null;
  try {
    if (_db?.getUserByUsername) {
      resolvedUser = await _db.getUserByUsername(recipient);
    }
  } catch {
    // DB error → treat as unresolved, fall through (matches express.e
    // chooseAName behavior when user db is unavailable: aePuts a generic
    // error and proceeds — for safety we just skip access check here).
  }

  if (resolvedUser) {
    // express.e:10828-10836 — copy canonical name based on confNameType.
    // Per-conf USERNAME/REALNAME tooltype (or msgbase variant) drives this.
    // Default (no flag) = NAME_TYPE_USERNAME.
    const confId = session.currentConf || 1;
    const msgBaseId = session.currentMsgBase || 1;
    const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
    const flags = getConferenceToolFlags(confId);
    const requireRealname = flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId);
    const requireUsername = flags?.requireUsername || flags?.requireUsernameMsgBases?.has?.(msgBaseId);
    if (requireRealname && resolvedUser.realName) {
      resolved = String(resolvedUser.realName).substring(0, 26);
    } else if (requireUsername && resolvedUser.username) {
      resolved = String(resolvedUser.username).substring(0, 31);
    } else if (resolvedUser.username) {
      // Default — normalize to canonical username casing
      resolved = String(resolvedUser.username).substring(0, 31);
    }

    // express.e:10837-10840 — checkConfAccess.
    const { checkConfAccess } = require('./message-scan.handler');
    if (typeof checkConfAccess === 'function' && !checkConfAccess(resolvedUser, confId)) {
      emitText(socket, '\r\nUser does not have access to this conference!\r\n\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
      return;
    }
  }
  // express.e: when chooseAName fails AND extSend=FALSE we'd RETURN stat (10825).
  // For web: unresolved recipient is still accepted as a string — matches the
  // "unknown recipient → message gets stored, sysop can review" workflow that
  // the modern admin UI assumes. Flagged here for future strict-mode option.

  session.tempData.messageEntry.toUser = resolved;
  emitText(socket, '\r\n');
  applyConfForwardMail(socket, session);
  promptForSubject(socket, session);
}

/**
 * Handle subject input - express.e:10839-10849
 */
export async function handleMessageSubjectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10847 — lineInput('','',30,...) caps subject at 30 chars
  const subject = input.trim().substring(0, 30);

  // Blank = abort:
  // - replyToMSG:9890: RETURN RESULT_SUCCESS → back to reader
  // - enterMSG:10854: RETURN RESULT_FAILURE → back to menu
  if (subject === '') {
    emitText(socket, '\r\n');
    if (session.tempData?.messageEntry?.parentId) {
      // Reply context: return to message reader (express.e:9890 RESULT_SUCCESS)
      const msgReaderMessages = session.tempData.msgReaderMessages;
      const msgReaderIndex = session.tempData.msgReaderIndex || 0;
      const msgReaderHighest = session.tempData.msgReaderHighestRead;
      session.tempData = { msgReaderMessages, msgReaderIndex, msgReaderHighestRead: msgReaderHighest };
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, msgReaderIndex);
    } else {
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
    }
    return;
  }

  session.tempData.messageEntry.subject = subject;
  emitText(socket, '\r\n');

  promptForPrivate(socket, session);
}

/**
 * Handle Private/Public input - express.e:10862 yesNo(2) — single char Y/y = private
 */
export function handleMessagePrivateInput(socket: any, session: BBSSession, input: string): void {
  // express.e yesNo(2): single char — y/Y=yes, n/N=no, CR=no (default), else loop (ignore)
  const ch = (input[0] || '').toUpperCase();

  // Loop on anything that's not y/Y, n/N, or CR (express.e: readChar loop until valid)
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // stay in POST_MESSAGE_PRIVATE, wait for valid char
  }

  const isPrivate = (ch === 'Y');
  session.tempData.messageEntry.isPrivate = isPrivate;

  // echo "Yes\r\n" or "No\r\n" like yesNo() (express.e:2147-2155)
  emitText(socket, isPrivate ? 'Yes\r\n' : 'No\r\n');

  // express.e:10878-10884: IF(replyFlag=1) show "  Quote in Reply (y/N)?"
  if (session.tempData.messageEntry.parentId) {
    emitText(socket, '  \x1b[36mQuote in Reply \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
    session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_REPLY_CONFIRM;
    return;
  }

  promptForMessageBody(socket, session);
}

/**
 * Handle message body input - express.e edit() body entry loop.
 * Blank line ends body entry and shows the options menu (A/C/D/E/L/S/?).
 * No slash-command handling here — commands are at the options menu.
 */
export async function handleMessageBodyInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const line = input;

  // Blank line = end of body entry → show options menu (express.e: bkFlag=1 → REPEAT/UNTIL)
  if (line === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Add line to body — truncate at 75 chars (express.e: maxLineLen=75, edit() enforces via word-wrap)
  const truncated = line.length > 75 ? line.substring(0, 75) : line;
  session.tempData.messageEntry.body.push(truncated);
  session.tempData.messageEntry.currentLine++;

  // 800-line hard limit (express.e: maxMsgLines = 800)
  if (session.tempData.messageEntry.body.length >= 800) {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Next line prompt: " N> " — 2-digit for lines ≤99, 3-digit for 100+ (express.e format)
  emitLinePrompt(socket, session.tempData.messageEntry.currentLine);
}

/**
 * express.e:10374-10391 "Msg. Options: A,C,D,E[,F],L,S[,X],? >:"
 *
 * WEB_ divergences from express.e cont2 menu:
 *   - WEB_ I (Insert Line)         — convenience; not in express.e (use C/E)
 *   - WEB_ R (Replace Text)        — search-and-replace; not in express.e
 *   - WEB_ Q (Quote from Reply)    — re-quote mid-compose; express.e only quotes at entry
 *   - MISSING X (Xfer Files / Zmodem batch) — express.e:10378,10562-10566 sets rzmsg=1
 *     so saveNewMSG triggers Zmodem batch upload. Web BBS uses F file-attach instead.
 *     See task #34 for the rationale; intentional divergence.
 */
function showOptionsMenu(socket: any, session: BBSSession, helpList: boolean): void {
  session.subState = LoggedOnSubState.POST_MESSAGE_OPTIONS;
  const hasAttach = checkSecurity(session.user, ACSPermission.ATTACH_FILES);
  const hasParent = !!(session.tempData?.messageEntry?.parentId);
  if (!helpList) {
    // express.e:10375-10379 short menu — extended with WEB_ I/R/Q
    let menu = '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m,\x1b[33mC\x1b[36m,\x1b[33mD\x1b[36m,\x1b[33mE\x1b[36m';
    if (hasAttach) menu += ',\x1b[33mF\x1b[36m';
    menu += ',\x1b[33mI\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mS\x1b[36m';
    if (hasParent) menu += ',\x1b[33mQ\x1b[36m';
    menu += ',\x1b[33m? \x1b[0m>:';
    emitText(socket, menu);
  } else {
    // express.e:10381-10390 long menu — extended with WEB_ I/R/Q
    emitText(socket, '\r\n\x1b[33mA\x1b[32m>\x1b[36mbort\x1b[0m');
    emitText(socket, '\r\n\x1b[33mC\x1b[32m>\x1b[36montinue\x1b[0m');
    emitText(socket, '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Lines\x1b[0m');
    emitText(socket, '\r\n\x1b[33mE\x1b[32m>\x1b[36mdit\x1b[0m');
    if (hasAttach) emitText(socket, '\r\n\x1b[33mF\x1b[32m>\x1b[36mile Attachment\x1b[0m');
    emitText(socket, '\r\n\x1b[33mI\x1b[32m>\x1b[36mnsert Line\x1b[0m');
    emitText(socket, '\r\n\x1b[33mL\x1b[32m>\x1b[36mist\x1b[0m');
    emitText(socket, '\r\n\x1b[33mR\x1b[32m>\x1b[36meplace Text\x1b[0m');
    emitText(socket, '\r\n\x1b[33mS\x1b[32m>\x1b[36mave\x1b[0m');
    if (hasParent) emitText(socket, '\r\n\x1b[33mQ\x1b[32m>\x1b[36muote from Reply\x1b[0m');
    // express.e:10389 helplist:=0 resets so next prompt shows short menu
    emitText(socket, '\r\n\x1b[0m >: ');
  }
}

/** Line prompt exactly matching express.e: " N> " format */
function emitLinePrompt(socket: any, lineNum: number): void {
  const n = lineNum <= 99
    ? String(lineNum).padStart(2)
    : String(lineNum).padStart(3);
  emitText(socket, `${n}> `);
}

/**
 * Handle the "Msg. Options:" menu — express.e cont2: loop.
 * Single-letter commands: A, C, D, E, L, S, ?
 */
export async function handleMessageOptionsInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10394 messageMenuChar:=str[0] — only first char matters
  const cmd = (input.trim()[0] || '').toUpperCase();
  // Bare CR/empty input arriving while a previous async command (e.g. S=save) is still
  // running would race with the subState transition and re-emit "Msg. Options:" before
  // the BBS menu prompt. Express.e's lineInput is synchronous; ours is not, so swallow
  // empty inputs at this prompt instead of looping back.
  if (!cmd) return;
  const messageData = session.tempData.messageEntry;
  const lines: string[] = messageData.body;

  if (cmd === '?') {
    showOptionsMenu(socket, session, true);
    return;
  }

  if (cmd === 'A') {
    // Abort — confirm first (express.e: 'Abort message entry (y/n)?')
    emitText(socket, '\r\nAbort message entry (y/n)? ');
    session.subState = LoggedOnSubState.POST_MESSAGE_ABORT_CONFIRM;
    return;
  }

  if (cmd === 'C') {
    // express.e:10452-10466: lines--, restore last line content into space, JUMP bEG_IN
    // BEG_IN pre-fills the edit buffer (space) so pressing Enter commits existing content.
    emitText(socket, '\r\n');
    let restoreContent = '';
    if (messageData.body.length > 0) {
      restoreContent = messageData.body.pop()!;
      messageData.currentLine = messageData.body.length + 1;
    }
    // Pre-fill inputBuffer so pressing Enter immediately commits the restored line
    // (express.e: space = msgBuf.item(lines); bkFlag=0; x=StrLen(space); JUMP bEG_IN)
    session.inputBuffer = restoreContent;
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    // Show prompt + pre-filled content (express.e BEG_IN: StringF(str,'\d[2]> \s',...))
    emitLinePrompt(socket, messageData.currentLine);
    emitText(socket, restoreContent);
    return;
  }

  if (cmd === 'D') {
    // Delete line
    if (lines.length === 0) {
      emitText(socket, '\r\nNo lines to delete.\r\n');
      showOptionsMenu(socket, session, false);
      return;
    }
    emitText(socket, `\r\n\x1b[36mLine number to delete \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${lines.length}\x1b[32m]\x1b[0m? `);
    session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_LINE;
    return;
  }

  if (cmd === 'E') {
    // Edit line
    if (lines.length === 0) {
      emitText(socket, '\r\nNo Lines to edit!\r\n');
      showOptionsMenu(socket, session, false);
      return;
    }
    emitText(socket, `\r\n\x1b[36mLine number to edit \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${lines.length}\x1b[32m]\x1b[0m? `);
    session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE;
    return;
  }

  if (cmd === 'L') {
    // List all lines (express.e: FOR j:=0 TO lines-1 … aePuts(space))
    emitText(socket, '\r\n');
    lines.forEach((bodyLine, index) => {
      const n = index >= 99 ? String(index + 1).padStart(3) : String(index + 1).padStart(2);
      emitText(socket, `${n}> ${bodyLine}\r\n`);
    });
    showOptionsMenu(socket, session, false);
    return;
  }

  if (cmd === 'S') {
    // Save (express.e: RETURN RESULT_SUCCESS)
    await saveMessage(socket, session);
    return;
  }

  // express.e:10376 — F: File Attachment (gated on ACS_ATTACH_FILES)
  if (cmd === 'F') {
    if (!checkSecurity(session.user, ACSPermission.ATTACH_FILES)) {
      showOptionsMenu(socket, session, false);
      return;
    }
    emitText(socket, "\r\nEnter path/filename to attach ('5 <DIR>'=DIR): ");
    session.subState = LoggedOnSubState.POST_MESSAGE_ATTACH_FILE;
    return;
  }

  // WEB_: I — Insert line at position
  if (cmd === 'I') {
    emitText(socket, `\r\n\x1b[36mInsert before line \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${lines.length + 1}\x1b[32m]\x1b[0m? `);
    session.subState = LoggedOnSubState.POST_MESSAGE_INSERT_LINE;
    return;
  }

  // WEB_: R — Replace text throughout message
  if (cmd === 'R') {
    emitText(socket, '\r\n\x1b[36mSearch for: \x1b[0m');
    session.subState = LoggedOnSubState.POST_MESSAGE_REPLACE_SEARCH;
    return;
  }

  // WEB_: Q — Quote from parent message (only when replying)
  if (cmd === 'Q') {
    if (!messageData.parentId) {
      showOptionsMenu(socket, session, false);
      return;
    }
    const parentMsg = await _db.getMessage(messageData.parentId);
    if (!parentMsg) {
      showOptionsMenu(socket, session, false);
      return;
    }
    const parentLines: string[] = parentMsg.body.split('\n');
    emitText(socket, '\r\n');
    parentLines.forEach((line: string, index: number) => {
      emitLinePrompt(socket, index + 1);
      emitText(socket, `${line}\r\n`);
    });
    emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');
    session.tempData.quoteData = {
      parentMessage: parentMsg,
      parentLines,
      totalLines: parentLines.length,
      appendToEnd: true  // WEB_: mid-compose quote appends rather than prepends
    };
    session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE;
    return;
  }

  // Unknown — redisplay menu (express.e loops back to cont2:)
  showOptionsMenu(socket, session, false);
}

/**
 * Handle abort confirmation "Abort message entry (y/n)?"
 * express.e:10567-10572: yesNo(0), IF stat>0 RETURN -1
 */
export async function handleMessageAbortConfirm(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e yesNo(0): single char, no default — loops on CR and unknown; only Y or N exits
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N') {
    return; // loop — stay in POST_MESSAGE_ABORT_CONFIRM (matches yesNo(0) loop on CR/unknown)
  }
  if (ch === 'Y') {
    emitText(socket, 'Yes\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }
  emitText(socket, 'No\r\n');
  showOptionsMenu(socket, session, false);
}

/**
 * Handle "Quote in Reply (y/N)?" confirmation — express.e:10878-10950
 * Called after Private prompt when replying (parentId is set).
 */
export async function handleMessageQuoteReplyConfirm(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e yesNo(2): single char, loop on unknown, CR=no (default)
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop — stay in POST_MESSAGE_QUOTE_REPLY_CONFIRM
  }
  emitText(socket, ch === 'Y' ? 'Yes\r\n' : 'No\r\n');

  if (ch !== 'Y') {
    // No quote — go straight to body editor
    promptForMessageBody(socket, session);
    return;
  }

  // Load parent message (express.e:10887-10888: IF(stat:=loadMsg(...)))
  const parentId = session.tempData.messageEntry.parentId;
  const parentMsg = await _db.getMessage(parentId);

  if (!parentMsg) {
    promptForMessageBody(socket, session);
    return;
  }

  const parentLines: string[] = parentMsg.body.split('\n');

  // Display parent lines with numbers — express.e:10894 uses '\z\l\d[2]> \s\b\n'
  // (zero-padded width 2: "05> "). The body editor's prompt at 10172 uses '\d[2]>'
  // (space-padded: " 5> "). These are different by design — quote display zero-pads.
  // express.e:10891 sets nonStopDisplayFlag=FALSE + lineCount=0; the loop
  // body calls checkForPause() per line so long parent messages page
  // through the screen.
  emitText(socket, '\r\n');
  const { checkForPause } = require('../../utils/flag-pause.util');
  if (!session.tempData) session.tempData = {} as any;
  session.tempData.nonStopDisplayFlag = false;
  session.tempData.lineCount = 0;
  for (let index = 0; index < parentLines.length; index++) {
    const n = index + 1;
    const numStr = n <= 99 ? String(n).padStart(2, '0') : String(n);
    emitText(socket, `${numStr}> ${parentLines[index]}\r\n`);
    const cont = await checkForPause(socket, session);
    if (cont === false) break;  // user pressed N — stop showing further lines
  }

  // express.e:10902: aePuts('\b\n Enter Startline,Endline or (*=ALL, A=Abort): ') — plain text
  emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');

  session.tempData.quoteData = {
    parentMessage: parentMsg,
    parentLines,
    totalLines: parentLines.length
  };
  session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE;
}


/**
 * Save message to database - express.e:10909 saveNewMSG()
 */
async function saveMessage(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;

  // express.e:10972: aePuts('Saving...') — plain text, no newline after (saveNewMSG continues inline)
  emitText(socket, '\r\nSaving...');

  // express.e EM (11142-11148 / 12183-12188): edit-existing branch.
  // editingExistingMsgId is set by the EM command in messaging.handler.ts.
  // Skip the new-message creation path and overwrite the canonical body
  // file in place, then return to the message reader nav prompt.
  if (entry?.editingExistingMsgId) {
    try {
      const { overwriteMessageBody } = require('../../utils/message-file.util');
      const messageBody = entry.body.join('\n');
      await overwriteMessageBody(
        session.currentConf || 1,
        entry.editingExistingMsgId,
        messageBody,
        config.get('dataDir'),
      );
      // Sync DB body so search index/web UI stays in sync
      try {
        await _db.updateMessage?.(entry.editingExistingMsgId, { body: messageBody });
      } catch { /* DB sync best-effort */ }

      emitText(socket, ` Message ${entry.editingExistingMsgId} body updated.\r\n\r\n`);

      // Return to message reader at the same index — express.e:11148+
      // displayMessage(gfh) re-renders, JUMP nextMenu shows nav prompt.
      const returnIndex = entry.editingReturnIndex ?? 0;
      const messages = session.tempData.msgReaderMessages || [];
      // Update in-memory copy too so the redisplay shows new body
      if (messages[returnIndex]) {
        messages[returnIndex].body = messageBody;
      }
      session.tempData.messageEntry = undefined as any;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, returnIndex);
    } catch (err: any) {
      console.error('[EM] Error overwriting message body:', err);
      emitText(socket, '\r\nError saving body.\r\n');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
      session.tempData = undefined;
    }
    return;
  }

  try {
    // Create message object
    const messageBody = entry.body.join('\n');
    const messageDate = getSystemTime();

    // express.e:10790-10794 + 10867-10874 — status:
    //   Private prompt = Y       → 'R' (PRIVATE)
    //   Private prompt = N + censored → 'p' (CENSORED)
    //   Private prompt = N         → 'P' (NORMAL)
    // Reply preserves 'p' if original was 'p' (express.e:10870, replyFlag
    // path: `IF checkSecurity(ACS_CENSORED) OR ((mailHeader.status="p") AND
    // (replyFlag=1)) THEN status:='p'`).
    const { MsgStatus } = require('../../services/MessageIndexManager');
    const userIsCensored = checkSecurity(session.user, ACSPermission.CENSORED);
    const parentWasCensored = entry.parentId &&
      (entry.parentMsgStatus === 'p' || entry.parentMsgStatus === MsgStatus.CENSORED);
    const censored = !entry.isPrivate && (userIsCensored || parentWasCensored);
    let status: number;
    if (entry.isPrivate) {
      status = MsgStatus.PRIVATE; // 'R'
    } else if (censored) {
      status = MsgStatus.CENSORED; // 'p'
    } else {
      status = MsgStatus.NORMAL;   // 'P'
    }

    const message = {
      subject: entry.subject,
      body: messageBody,
      author: session.user!.username,
      timestamp: messageDate,
      conferenceId: session.currentConf || 1,
      messageBaseId: session.currentMsgBase || 1,
      isPrivate: entry.isPrivate,
      toUser: entry.toUser,
      parentId: entry.parentId || null,
      attachments: entry.attachedFiles || [],
      edited: false,
      editedBy: null,
      editedAt: null,
      transferFiles: entry.transferFiles || false,
      censored
    } as any;

    // CRITICAL: Write message to DISK (AmiExpress format)
    // Express.e:10694-10704 - Messages MUST be on disk for doors to read.
    // express.e:10652 lockMsgBase() — pass nodeId so the MailLock file
    // identifies the writer for the on-disk staleness check.
    // express.e:10707-10711 — attachedFiles → saveAttachList(<msgBase>A<N>):
    // first item in attachedFiles[] is 'Y' or 'N' delete-on-msg-delete flag
    // (express.e:10546-10549 inserts that at the head of the list).
    const rawAttachments: string[] = (entry.attachedFiles || []).filter(Boolean);
    let deleteOnMessageDelete = false;
    let attachmentNames: string[] = [];
    if (rawAttachments.length > 0) {
      const first = rawAttachments[0];
      if (first === 'Y' || first === 'N') {
        deleteOnMessageDelete = first === 'Y';
        attachmentNames = rawAttachments.slice(1);
      } else {
        attachmentNames = rawAttachments;
      }
    }
    const msgNum = await writeMessageFile(
      session.currentConf || 1,
      session.currentMsgBase || 1,
      {
        from: session.user!.username,
        to: entry.toUser,
        subject: entry.subject,
        date: formatMessageDate(messageDate),
        body: messageBody,
        status,
        // typed as `any` extension on MessageFile — writeMessageFile reads it
        // off the message obj and writes A<N> file matching express.e
        // saveAttachList format.
        attachments: {
          filenames: attachmentNames,
          deleteOnMessageDelete,
        },
      } as any,
      config.get('dataDir'),
      session.nodeId || 0
    );

    // express.e:10692-10705: aePuts('Message Number N...') + write + aePuts('done!\b\n\b\n')
    emitText(socket, `Message Number ${msgNum}...done!\r\n\r\n`);

    // Save to database (for web UI / search indexing only).
    // Body file + HeaderFile already written by writeMessageFile above —
    // tell createMessage to skip its own disk-write to avoid duplicates.
    const messageId = await _db.createMessage(message, { skipDiskWrite: true });

    // Increment messagesPosted counter (express.e:10127)
    session.user!.messagesPosted = (session.user!.messagesPosted || 0) + 1;

    // DISK-BASED: Write updated user stats to user.data/keys/misc files
    // This ensures messagesPosted is persisted immediately (safer than waiting for logoff)
    if (session.user!.slotNumber) {
      try {
        const { userFileManager } = require('../../services/UserFileManager');
        userFileManager.updateUserDataFile(session.user!, session.user!.slotNumber);
console.log(`[Message] Updated user ${session.user!.username} disk files (messagesPosted=${session.user!.messagesPosted}, slot=${session.user!.slotNumber})`);
      } catch (diskErr) {
console.error('[Message] Error writing user disk files:', diskErr);
        // Continue anyway - database has the stats, can sync later
      }
    }

    // Log the action
    await _callersLog(
      session.user!.id,
      session.user!.username,
      'Posted message',
      `#${messageId}: "${entry.subject}" to ${entry.toUser}`
    );

    // Trigger webhook for new message
console.log('[Message] About to trigger NEW_MESSAGE webhook');
    try {
      const { webhookService, WebhookTrigger } = await import('../../services/webhook.service');

      const conference = await _db.getConferenceById(session.currentConf);
      const messageBase = await _db.getMessageBaseById(session.currentMsgBase);

console.log(`[Message] Calling webhook for message: subject="${entry.subject}", toUser="${entry.toUser}", isPrivate=${entry.isPrivate}`);
      await webhookService.sendWebhook(WebhookTrigger.NEW_MESSAGE, {
        username: session.user!.username,
        userId: session.user!.id,
        gdprConsented: !!(session.user as any)?.gdprConsentAt,
        subject: entry.subject,
        conference: conference?.name || 'Unknown',
        messageBase: messageBase?.name || 'Unknown',
        toUser: entry.toUser,
        isPrivate: entry.isPrivate
      });
console.log('[Message] Webhook call completed');

      // If message is to sysop, also trigger COMMENT_POSTED webhook.
      // express.e:10717-10719 saveNewMSG fires doCommentNotify when
      // tempUser.slotNumber=1 — i.e. the recipient is the sysop slot.
      // We accept both the literal 'SYSOP' token AND a DB lookup that
      // resolves to slot 1, so sysops who don't go by 'sysop' still
      // get the notification.
      let toUserIsSysop = entry.toUser.toLowerCase() === 'sysop';
      if (!toUserIsSysop && entry.toUser) {
        try {
          const resolved = await _db?.getUserByUsername?.(entry.toUser);
          if (resolved && (resolved.slotNumber === 1 || resolved.slot === 1)) {
            toUserIsSysop = true;
          }
        } catch { /* DB lookup failure — fall through to literal check */ }
      }
      if (toUserIsSysop) {
        await webhookService.sendWebhook(WebhookTrigger.COMMENT_POSTED, {
          username: session.user!.username,
          userId: session.user!.id,
          gdprConsented: !!(session.user as any)?.gdprConsentAt,
          subject: entry.subject,
          conference: conference?.name || 'Unknown'
        });

        // EXECUTE_ON_SYSOP_COMMENT tooltype
        await runExecuteOn('SYSOP_COMMENT', session.nodeId || 1, {
          username: session.user!.username,
          location: session.user!.location || ''
        });

        // MAIL_ON_SYSOP_COMMENT tooltype - express.e:6705-6709
        await mailOnSysopComment(
          session.user!.username,
          entry.subject,
          entry.body.join('\n')
        );
      }
    } catch (error) {
console.error('[Webhook] Error sending new message webhook:', error);
      SysopDebugUtil.debug(
        socket,
        session,
        'Message Posting',
        `Failed to send webhook for message posted to sysop`,
        {
          error: error instanceof Error ? error.message : String(error),
          subject: entry.subject,
          conferenceId: session.currentConf
        },
        DebugSeverity.WARNING
      );
    }

    // express.e:9898-9903 (replyToMSG): after saving, prompt "Delete original message (y/N)?"
    // only if user has DELETE permission AND original message was addressed to current user.
    const replyOriginalToUser: string = entry.replyOriginalToUser || '';
    if (
      replyOriginalToUser &&
      replyOriginalToUser.toLowerCase() === (session.user?.username || '').toLowerCase() &&
      checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)
    ) {
      emitText(socket, 'Delete original message \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
      session.tempData.replyDeleteParentId = entry.parentId;
      session.subState = LoggedOnSubState.REPLY_DELETE_ORIGINAL;
      return; // state machine continues; DISPLAY_MENU set after delete confirm
    }

    // express.e saves message and returns to main loop; main loop sets menuPause:=TRUE
    session.menuPause = true;

  } catch (error) {
console.error('[saveMessage] Error:', error);
    SysopDebugUtil.debug(
      socket,
      session,
      'Message Posting',
      `Failed to save message`,
      {
        error: error instanceof Error ? error.message : String(error),
        subject: entry.subject,
        toUser: entry.toUser,
        conferenceId: session.currentConf
      },
      DebugSeverity.CRITICAL
    );
    // express.e:10713 aePuts('Failed!\b\n\b\n')
    emitText(socket, 'Failed!\r\n\r\n');
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;

  // Force the menu prompt to render. The debounce in displayMainMenu/displayMenuPrompt
  // could swallow the post-save prompt if any earlier code path bumped the timestamps;
  // forceMenuDisplay=true bypasses that. saveMessage is one place where we are CERTAIN
  // we want the menu prompt — no race.
  try {
    const { displayMainMenu } = require('../command-handler/menu');
    await displayMainMenu(socket, session, true /* forceMenuDisplay */);
  } catch (_) { /* swallow — advanceDisplayFlow is the fallback */ }
}

/**
 * Handle delete line number input - express.e:10555-10607
 */
export function handleMessageDeleteLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumber = parseInt(input.trim());
  const messageData = session.tempData.messageEntry;

  // Blank = back to options menu (express.e:10414-10416: stat=0 JUMP cont2)
  if (input.trim() === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Validate line number — express.e:10420-10423: show "Line N does not exist."
  const parsedNum = isNaN(lineNumber) ? 0 : lineNumber;
  if (parsedNum < 1 || parsedNum > messageData.body.length) {
    emitText(socket, `\r\nLine ${parsedNum} does not exist.\r\n`);
    emitText(socket, `\r\n\x1b[36mLine number to delete \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${messageData.body.length}\x1b[32m]\x1b[0m? `);
    return;
  }

  // Show the line then confirmation (no extra blank line — express.e:10431-10438)
  const lineIndex = parsedNum - 1;
  const lineNum = parsedNum <= 99 ? String(parsedNum).padStart(2) : String(parsedNum).padStart(3);
  emitText(socket, `\r\n${lineNum}> ${messageData.body[lineIndex]}\r\n`);
  emitText(socket, '\r\n\x1b[36mIs this the correct line \x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mN\x1b[32m)\x1b[0m? ');

  // Store the line number for confirmation
  session.tempData.messageEntry.pendingDeleteLine = lineIndex;
  session.subState = LoggedOnSubState.POST_MESSAGE_DELETE_CONFIRM;
}

/**
 * Handle delete confirmation - express.e:10555-10607
 */
export function handleMessageDeleteConfirm(socket: any, session: BBSSession, input: string): void {
  // express.e yesNo(0): single char, loops on CR/unknown — only Y or N exits
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N') {
    return; // loop — stay in POST_MESSAGE_DELETE_CONFIRM
  }
  const messageData = session.tempData.messageEntry;
  const lineIndex = messageData.pendingDeleteLine;
  const lineNum = lineIndex + 1;

  if (ch === 'Y') {
    emitText(socket, 'Yes\r\n');
    // express.e:10443-10447: msgBuf.remove(stat-1); lines--; aePuts("Deleted line N.\n")
    messageData.body.splice(lineIndex, 1);
    if (messageData.currentLine > messageData.body.length + 1) {
      messageData.currentLine = messageData.body.length + 1;
    }
    emitText(socket, `\r\nDeleted line ${lineNum}.\r\n`);
  } else {
    emitText(socket, 'No\r\n');
  }

  delete messageData.pendingDeleteLine;
  showOptionsMenu(socket, session, false);
}

/**
 * Handle edit line number input - express.e:10608-10630
 */
export function handleMessageEditLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumber = parseInt(input.trim());
  const messageData = session.tempData.messageEntry;

  // Blank = back to options menu (express.e:10478: StrLen(str)=0 JUMP cont2)
  if (input.trim() === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Validate line number — express.e:10481-10484: loops back to loopHere
  const parsedLine = isNaN(lineNumber) ? 0 : lineNumber;
  if (parsedLine < 1 || parsedLine > messageData.body.length) {
    emitText(socket, `\r\nLine ${parsedLine} does not exist.\r\n`);
    emitText(socket, `\r\n\x1b[36mLine number to edit \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${messageData.body.length}\x1b[32m]\x1b[0m? `);
    return;
  }

  // express.e:10486-10489: lineInput('\b\n    ',temp,maxLineLen,...) — pre-fills with current content
  const lineIndex = parsedLine - 1;
  const currentContent = messageData.body[lineIndex];
  emitText(socket, '\r\n    Edit Line');
  emitText(socket, '\r\n   (---------------------------------------------------------------------------)\r\n    ');
  emitText(socket, currentContent);
  // Pre-fill inputBuffer so pressing Enter immediately commits existing content unchanged
  // (matches express.e lineInput pre-fill: Enter = keep, typing = replace)
  session.inputBuffer = currentContent;

  messageData.pendingEditLine = lineIndex;
  session.subState = LoggedOnSubState.POST_MESSAGE_EDIT_LINE_CONTENT;
}

/**
 * Handle edit line content input - express.e:10608-10630
 */
export function handleMessageEditLineContent(socket: any, session: BBSSession, input: string): void {
  const messageData = session.tempData.messageEntry;
  const lineIndex = messageData.pendingEditLine;

  // express.e:10491 msgBuf.setItem(x-1,temp) — update with whatever user submitted
  // inputBuffer was pre-filled; Enter immediately = original content; typing replaces it
  messageData.body[lineIndex] = input;
  delete messageData.pendingEditLine;
  showOptionsMenu(socket, session, false);
}

/**
 * Helper: Prompt for message subject - express.e:10839-10849
 */
function promptForSubject(socket: any, session: BBSSession): void {
  // express.e:10847: '[36mSubject[33m: [32m([33mBlank[32m)[0m=[33mabort[32m?[0m '
  emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
  session.subState = LoggedOnSubState.POST_MESSAGE_SUBJECT;
}

/**
 * Helper: Prompt for Private/Public - express.e:10851-10864
 */
function promptForPrivate(socket: any, session: BBSSession): void {
  const toUser = session.tempData.messageEntry.toUser.toUpperCase();

  // express.e:10760 IF(comment=1) THEN JUMP skipAll — comments to sysop
  // skip ALL prompts (including Private) and go directly to the body editor.
  // express.e:8792 forces mailHeader.status:='R' so comments are always
  // Private. handleCommentToSysopCommand sets isComment=true to mark this
  // path.
  if (session.tempData.messageEntry.isComment) {
    session.tempData.messageEntry.isPrivate = true;
    promptForMessageBody(socket, session);
    return;
  }

  // Messages to ALL/EALL cannot be private - express.e:10850
  if (toUser === 'ALL' || toUser === 'EALL') {
    session.tempData.messageEntry.isPrivate = false;
    promptForMessageBody(socket, session);
    return;
  }

  // express.e:10860 — skip Private prompt entirely if msgbase is EXTSEND.
  // External msgbases (UUCP/FidoNet gateway) keep the default status; user
  // doesn't get to choose Private since these go off-system.
  if (isExtSendMsgBase(session)) {
    session.tempData.messageEntry.isPrivate = false;
    promptForMessageBody(socket, session);
    return;
  }

  // express.e:10861 aePuts('         [36mPrivate ') then yesNo(2) → '[32m([33my[32m/[33mN[32m)[32m?[0m '
  emitText(socket, '         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
  session.subState = LoggedOnSubState.POST_MESSAGE_PRIVATE;
}

/**
 * Handle file attachment input - express.e:10515-10556
 */
export async function handleMessageAttachFileInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const messageData = session.tempData.messageEntry;
  const attachedFile = input.trim();

  // Blank = cancel attachment, return to options menu
  if (attachedFile === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Check for directory command (express.e:10518-10521)
  if (attachedFile.startsWith('5 ')) {
    const dirPath = attachedFile.substring(2).trim() || '.';
    await displayDirectoryListing(socket, session, dirPath);
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('Enter path/filename to attach ', 'cyan'));
    emitText(socket, `${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Add file to attachedFiles array (express.e:10523-10524)
  if (!messageData.attachedFiles) {
    messageData.attachedFiles = [];
  }
  messageData.attachedFiles.push(attachedFile);

  // Ask if file should be deleted when message is deleted (express.e:10538-10549)
  emitText(socket, '\r\n');
  emitText(socket, `${AnsiUtil.colorize('Delete file(s) when message is deleted ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('Y', 'yellow')}${AnsiUtil.colorize('/', 'green')}${AnsiUtil.colorize('N', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize('?', 'green')} `);
  session.subState = LoggedOnSubState.POST_MESSAGE_ATTACH_DELETE_CONFIRM;
}

/**
 * Handle file attachment delete confirmation - express.e:10538-10549
 */
export function handleMessageAttachDeleteConfirm(socket: any, session: BBSSession, input: string): void {
  const answer = input.trim().toUpperCase();
  const messageData = session.tempData.messageEntry;

  // Store delete flag at position 0 of attachedFiles array (express.e:10545-10549)
  if (answer === 'Y' || answer === 'YES') {
    messageData.attachedFiles.unshift('Y');
  } else {
    messageData.attachedFiles.unshift('N');
  }

  showOptionsMenu(socket, session, false);
}

/**
 * Handle /R (Replace Text) - Search String Input
 */
export function handleMessageReplaceSearchInput(socket: any, session: BBSSession, input: string): void {
  const searchStr = input.trim();

  // Empty = cancel, return to options menu
  if (searchStr === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  // Store search string for next step
  if (!session.tempData.messageEntry.replaceData) {
    session.tempData.messageEntry.replaceData = {};
  }
  session.tempData.messageEntry.replaceData.search = searchStr;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Replace with: ', 'cyan'));
  session.subState = LoggedOnSubState.POST_MESSAGE_REPLACE_WITH;
}

/**
 * Handle /R (Replace Text) - Replacement String Input
 */
export function handleMessageReplaceWithInput(socket: any, session: BBSSession, input: string): void {
  const replaceStr = input;  // Allow empty replacement
  const messageData = session.tempData.messageEntry;
  const searchStr = messageData.replaceData?.search || '';

  if (!searchStr) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine('No search string!'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Perform replacement (case-sensitive, all occurrences)
  let replaceCount = 0;
  for (let i = 0; i < messageData.body.length; i++) {
    const oldLine = messageData.body[i];
    const newLine = oldLine.split(searchStr).join(replaceStr);
    if (oldLine !== newLine) {
      messageData.body[i] = newLine;
      replaceCount += (oldLine.split(searchStr).length - 1);
    }
  }

  emitText(socket, '\r\n');
  if (replaceCount > 0) {
    emitText(socket, AnsiUtil.colorize(`Replaced ${replaceCount} occurrence(s)`, 'green'));
  } else {
    emitText(socket, AnsiUtil.warningLine('No matches found'));
  }
  emitText(socket, '\r\n');

  // Clean up temp data
  delete messageData.replaceData;

  showOptionsMenu(socket, session, false);
}

/**
 * Handle /I (Insert Line) - Line Number Input
 */
export function handleMessageInsertLineInput(socket: any, session: BBSSession, input: string): void {
  const lineNumStr = input.trim();
  const messageData = session.tempData.messageEntry;

  // Empty = cancel, return to options menu
  if (lineNumStr === '') {
    showOptionsMenu(socket, session, false);
    return;
  }

  const lineNum = parseInt(lineNumStr, 10);

  // Validate line number
  if (isNaN(lineNum) || lineNum < 1 || lineNum > messageData.body.length + 1) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Invalid line number! Must be 1..${messageData.body.length + 1}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Insert before line ', 'cyan')}${AnsiUtil.colorize('[', 'green')}${AnsiUtil.colorize('1', 'yellow')}${AnsiUtil.colorize('..', 'green')}${AnsiUtil.colorize(String(messageData.body.length + 1), 'yellow')}${AnsiUtil.colorize(']', 'green')}${AnsiUtil.colorize('?', 'green')} `);
    return;
  }

  // Store line number for next step
  if (!messageData.insertData) {
    messageData.insertData = {};
  }
  messageData.insertData.lineNum = lineNum;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize('Enter text: ', 'cyan'));
  session.subState = LoggedOnSubState.POST_MESSAGE_INSERT_TEXT;
}

/**
 * Handle /I (Insert Line) - Text Input
 */
export function handleMessageInsertTextInput(socket: any, session: BBSSession, input: string): void {
  const text = input;  // Allow empty line
  const messageData = session.tempData.messageEntry;
  const lineNum = messageData.insertData?.lineNum || 1;

  // Insert line at position (array index is lineNum - 1)
  messageData.body.splice(lineNum - 1, 0, text);

  // Update current line counter
  messageData.currentLine++;

  emitText(socket, '\r\n');
  emitText(socket, AnsiUtil.colorize(`Line inserted at position ${lineNum}`, 'green'));
  emitText(socket, '\r\n');

  // Clean up temp data
  delete messageData.insertData;

  showOptionsMenu(socket, session, false);
}

/**
 * Handle /Q (Quote) - Line Range Input
 * express.e:10902-10944
 */
export function handleQuoteRangeInput(socket: any, session: BBSSession, input: string): void {
  const quoteData = session.tempData.quoteData;
  const messageData = session.tempData.messageEntry;
  const raw = input.trim();
  // express.e:10908 firstCharValue(str) — use first char for A/* checks
  const firstChar = (raw[0] || '').toUpperCase();

  if (!quoteData) {
    promptForMessageBody(socket, session);
    return;
  }

  // express.e:10909-10913: IF firstChar='A' → abort (i:=-1, lines:=0, exit:=TRUE)
  // express.e silently clears msgBuf and goes to edit() with empty body (no "Quote aborted" msg)
  if (firstChar === 'A') {
    delete session.tempData.quoteData;
    messageData.body = [];
    messageData.currentLine = 1;
    promptForMessageBody(socket, session);
    return;
  }

  let startLine = 0;
  let endLine = 0;

  // express.e:10916-10918: stat='*' → i=1, i2=lines (all)
  if (firstChar === '*') {
    startLine = 1;
    endLine = quoteData.totalLines;
  } else {
    // express.e:10920-10924: IF(i:=InStr(str,','))<>-1 → parse start,end
    const commaIdx = raw.indexOf(',');
    if (commaIdx !== -1) {
      startLine = parseInt(raw.substring(0, commaIdx), 10) || 0;
      endLine = parseInt(raw.substring(commaIdx + 1), 10) || 0;
    }
    // If no comma found, i and i2 stay 0 → EXIT condition fails → re-prompt (express.e loops)
  }

  // express.e:10927: EXIT (i>0 AND i<=lines AND i2>0 AND i2<=lines AND i<=i2)
  const valid = startLine > 0 && startLine <= quoteData.totalLines &&
                endLine > 0 && endLine <= quoteData.totalLines &&
                startLine <= endLine;

  if (!valid) {
    // express.e loops back to LOOP label and re-shows prompt — no error message
    emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');
    return; // subState stays POST_MESSAGE_QUOTE_RANGE
  }

  // express.e:10931-10944: copy selected lines, then append separator, ' ', ''
  // ORDER: selected lines → separator → blank → empty cursor line
  const quotedLines: string[] = [];

  // Copy selected lines into start of buffer (express.e:10931-10935)
  for (let i = startLine - 1; i < endLine; i++) {
    quotedLines.push(quoteData.parentLines[i]);
  }

  // Separator (express.e:10936-10939: formatLongDateTime + SetStr(str,70))
  const parentMsg = quoteData.parentMessage;
  const authorName = parentMsg.author || parentMsg.fromUser || parentMsg.fromName || 'Unknown';
  const parentDate = parentMsg.createdAt || parentMsg.created_at || parentMsg.timestamp;
  const msgDate = formatLongDateTime(parentDate instanceof Date ? parentDate : new Date(parentDate || Date.now()));
  const separator = ` -----[ ${authorName} ]--[ ${msgDate} ]----------------------------------------------------------------------`.substring(0, 70);
  quotedLines.push(separator);       // express.e:10939
  quotedLines.push(' ');             // express.e:10942 msgBuf.setItem(lines,' ')
  // express.e:10944 msgBuf.setItem(lines,'') — empty line is where cursor starts in BEG_IN

  // WEB_: mid-compose quote (from options menu) appends to existing body;
  // initial reply quote (appendToEnd=false) prepends per express.e:10931-10935
  if (quoteData.appendToEnd) {
    messageData.body.push(...quotedLines);
  } else {
    messageData.body.splice(0, 0, ...quotedLines);
  }
  messageData.currentLine = messageData.body.length + 1;

  delete session.tempData.quoteData;

  // express.e falls through to edit() which shows header+ruler+pre-existing lines
  promptForMessageBody(socket, session);
}

/**
 * Helper: Prompt for message body - express.e:10898-10909
 */
export function promptForMessageBody(socket: any, session: BBSSession): void {
  // express.e: aePuts("   Enter your text. (Enter) alone to end. (75 chars/line)\n")
  emitText(socket, '\r\n   Enter your text. (Enter) alone to end. (75 chars/line)\r\n');
  // express.e:10150-10152: StrCopy(str,'|-------...');SetStr(str,75);StringF(tempstr,'   (\s)\b\n',str)
  // SetStr to 75: 9 full |-------| groups (72 chars) + |-- (3 chars) = 75
  emitText(socket, '   (|-------|-------|-------|-------|-------|-------|-------|-------|-------|--)\r\n');

  const entry = session.tempData.messageEntry;

  // If body already has content (quoting/forwarding), show existing lines first
  if (!entry.body) {
    entry.body = [];
  }
  if (!entry.currentLine) {
    entry.currentLine = entry.body.length + 1;
  }

  // Show any pre-existing lines (e.g. quote preamble inserted before editor)
  if (entry.body.length > 0) {
    entry.body.forEach((bodyLine: string, index: number) => {
      emitLinePrompt(socket, index + 1);
      emitText(socket, `${bodyLine}\r\n`);
    });
  }

  emitLinePrompt(socket, entry.currentLine);
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Forward message handlers (express.e forwardMSG:9807-9871)
 */

/**
 * Handle recipient input for message forwarding (express.e:9817-9823)
 *
 * Mirrors handleMessageToInput's resolution path (#27):
 *   - blank → 'ALL'
 *   - 'eall' + EXTSEND on this msgbase → "Can't use EALL in external message bases!!"
 *   - 'eall' without ACS_EALL_MESSAGES → "User does not exist!!"
 *   - 'sysop' → 'SYSOP' (then FORWARDMAIL kicks in)
 *   - regular → DB lookup, normalize to canonical name per confNameType,
 *     checkConfAccess gate
 *   - unconditionally apply applyConfForwardMail (express.e:9823 checkToForward)
 */
export async function handleForwardMessageToInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = (input || '').trim().substring(0, 30);
  // Stash a temporary messageEntry so the existing isExtSendMsgBase /
  // applyConfForwardMail helpers (which read session.tempData.messageEntry)
  // work in the forward context too.
  session.tempData.messageEntry = session.tempData.messageEntry || {};

  if (trimmed === '') {
    session.tempData.forwardData.toUser = 'ALL';
    session.tempData.messageEntry.toUser = 'ALL';
    emitText(socket, '\r\n');
    applyConfForwardMail(socket, session);
    if (session.tempData.messageEntry.toUser !== 'ALL') {
      session.tempData.forwardData.toUser = session.tempData.messageEntry.toUser;
    }
    promptForwardSubject(socket, session);
    return;
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'eall') {
    if (isExtSendMsgBase(session)) {
      emitText(socket, "\r\nCan't use EALL in external message bases!!\r\n\r\n");
      // Bail back to reader rather than dropping to menu — forward was cancelled
      const messages = session.tempData.msgReaderMessages || [];
      const currentIndex = session.tempData.forwardOriginalIndex || 0;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      delete session.tempData.forwardData;
      delete session.tempData.forwardOriginalMessage;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, currentIndex);
      return;
    }
    if (!checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {
      emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
      const messages = session.tempData.msgReaderMessages || [];
      const currentIndex = session.tempData.forwardOriginalIndex || 0;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      delete session.tempData.forwardData;
      delete session.tempData.forwardOriginalMessage;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, currentIndex);
      return;
    }
    session.tempData.forwardData.toUser = 'EALL';
    session.tempData.messageEntry.toUser = 'EALL';
    emitText(socket, '\r\n');
    applyConfForwardMail(socket, session);
    promptForwardSubject(socket, session);
    return;
  }

  if (lower === 'sysop') {
    session.tempData.forwardData.toUser = 'SYSOP';
    session.tempData.messageEntry.toUser = 'SYSOP';
    emitText(socket, '\r\n');
    applyConfForwardMail(socket, session);
    if (session.tempData.messageEntry.toUser !== 'SYSOP') {
      session.tempData.forwardData.toUser = session.tempData.messageEntry.toUser;
    }
    promptForwardSubject(socket, session);
    return;
  }

  // express.e:10822-10841 — chooseAName + canonical name + checkConfAccess.
  // Forward path uses the same logic as enterMSG.
  let resolved = trimmed;
  let resolvedUser: any = null;
  try {
    if (_db?.getUserByUsername) {
      resolvedUser = await _db.getUserByUsername(trimmed);
    }
  } catch {
    /* fall through — accept as-is */
  }

  if (resolvedUser) {
    const confId = session.currentConf || 1;
    const msgBaseId = session.currentMsgBase || 1;
    const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
    const flags = getConferenceToolFlags(confId);
    const requireRealname = flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId);
    const requireUsername = flags?.requireUsername || flags?.requireUsernameMsgBases?.has?.(msgBaseId);
    if (requireRealname && resolvedUser.realName) {
      resolved = String(resolvedUser.realName).substring(0, 26);
    } else if (requireUsername && resolvedUser.username) {
      resolved = String(resolvedUser.username).substring(0, 31);
    } else if (resolvedUser.username) {
      resolved = String(resolvedUser.username).substring(0, 31);
    }
    const { checkConfAccess } = require('./message-scan.handler');
    if (typeof checkConfAccess === 'function' && !checkConfAccess(resolvedUser, confId)) {
      emitText(socket, '\r\nUser does not have access to this conference!\r\n\r\n');
      const messages = session.tempData.msgReaderMessages || [];
      const currentIndex = session.tempData.forwardOriginalIndex || 0;
      session.subState = LoggedOnSubState.MSG_READER_NAV;
      delete session.tempData.forwardData;
      delete session.tempData.forwardOriginalMessage;
      const { displaySingleMessage } = require('./messaging.handler');
      await displaySingleMessage(socket, session, currentIndex);
      return;
    }
  }

  session.tempData.forwardData.toUser = resolved;
  session.tempData.messageEntry.toUser = resolved;
  emitText(socket, '\r\n');
  applyConfForwardMail(socket, session);
  if (session.tempData.messageEntry.toUser !== resolved) {
    session.tempData.forwardData.toUser = session.tempData.messageEntry.toUser;
  }
  promptForwardSubject(socket, session);
}

function promptForwardSubject(socket: any, session: BBSSession): void {
  // express.e:9825-9826: Subject prompt with default = original subject.
  const originalSubject = session.tempData.forwardOriginalMessage?.subject || '';
  emitText(socket, '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ');
  if (originalSubject) {
    emitText(socket, originalSubject);
    session.inputBuffer = originalSubject;
  }
  session.subState = LoggedOnSubState.FORWARD_MESSAGE_SUBJECT;
}

/**
 * Handle subject input for message forwarding (express.e:9826-9835)
 */
export async function handleForwardMessageSubjectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // If subject is blank, abort (express.e:9832-9835)
  if (!input) {
    emitText(socket, '\r\n');
    // Return to message reader
    const messages = session.tempData.msgReaderMessages || [];
    const currentIndex = session.tempData.forwardOriginalIndex || 0;
    session.subState = LoggedOnSubState.MSG_READER_NAV;

    // Re-display the message
    const { displaySingleMessage } = require('./messaging.handler');
    await displaySingleMessage(socket, session, currentIndex);
    return;
  }

  // express.e:9826 — lineInput('','',30,...) caps subject at 30 chars
  session.tempData.forwardData.subject = input.substring(0, 30);

  // Prompt for privacy (express.e:9837-9851)
  emitText(socket, '         \x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
  session.subState = LoggedOnSubState.FORWARD_MESSAGE_PRIVATE;
}

/**
 * Handle privacy choice for message forwarding (express.e:9837-9851)
 *
 * yesNo(2) semantics: y/Y/n/N exit; CR defaults to N; anything else loops.
 */
export async function handleForwardMessagePrivateInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop — yesNo(2) waits for valid char
  }
  const isPrivate = ch === 'Y';
  emitText(socket, isPrivate ? 'Yes\r\n' : 'No\r\n');

  // Store privacy setting
  session.tempData.forwardData.isPrivate = isPrivate;

  // Check if user can delete original message (express.e:9853-9860)
  if (session.tempData.forwardData.canDeleteOriginal) {
    // express.e:9855: aePuts('Delete original message ') then yesNo(2) = (y/N)?
    emitText(socket, 'Delete original message \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m ');
    session.subState = LoggedOnSubState.FORWARD_MESSAGE_DELETE_ORIGINAL;
  } else {
    // Skip to saving message
    await saveForwardedMessage(socket, session, false);
  }
}

/**
 * Handle delete original confirmation for message forwarding (express.e:9853-9860)
 *
 * yesNo(2) semantics: y/Y/n/N exit; CR defaults to N; anything else loops.
 */
export async function handleForwardMessageDeleteOriginalInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop
  }
  const deleteOriginal = ch === 'Y';
  emitText(socket, deleteOriginal ? 'Yes\r\n' : 'No\r\n');

  // Save forwarded message and optionally delete original
  await saveForwardedMessage(socket, session, deleteOriginal);
}

/**
 * Handle delete-original confirmation after a Reply is saved — express.e:9898-9903.
 * yesNo(2): loop on CR/unknown; Y=yes, N/Enter=no.
 */
export async function handleReplyDeleteOriginalInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') {
    return; // loop
  }
  emitText(socket, ch === 'Y' ? 'Yes\r\n' : 'No\r\n');

  if (ch === 'Y') {
    const parentId = session.tempData.replyDeleteParentId;
    if (parentId) {
      try {
        await _db.deleteMessage(parentId);
      } catch (_) { /* ignore */ }
    }
  }

  // express.e:9907 ENDPROC RESULT_SUCCESS → returns to main loop → menuPause=true
  session.menuPause = true;
  delete session.tempData?.replyDeleteParentId;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
}

/**
 * Save the forwarded message (express.e:9862-9871)
 *
 * Goes through writeMessageFile so the forwarded message gets the same
 * lockMsgBase + canonical-status + attachment-list treatment as enterMSG
 * outputs. Status follows express.e:9843-9851 — 'R' if Private, 'p' if
 * censored or original was 'p', else 'P'.
 */
async function saveForwardedMessage(socket: any, session: BBSSession, deleteOriginal: boolean): Promise<void> {
  emitText(socket, '\r\nSaving...');

  try {
    const originalMsg = session.tempData.forwardOriginalMessage;
    const forwardData = session.tempData.forwardData;

    // express.e:9843-9851 status computation:
    //   Private → 'R'
    //   Public + (ACS_CENSORED OR original was 'p') → 'p'
    //   Public                                       → 'P'
    const { MsgStatus } = require('../../services/MessageIndexManager');
    const wasOriginalCensored = originalMsg?.status === 'p' ||
                                originalMsg?.status === MsgStatus.CENSORED ||
                                originalMsg?.censored === true;
    const userIsCensored = checkSecurity(session.user, ACSPermission.CENSORED);
    let status: number;
    if (forwardData.isPrivate) {
      status = MsgStatus.PRIVATE; // 'R'
    } else if (userIsCensored || wasOriginalCensored) {
      status = MsgStatus.CENSORED; // 'p'
    } else {
      status = MsgStatus.NORMAL; // 'P'
    }

    const { writeMessageFile, formatMessageDate } = require('../../utils/message-file.util');
    const messageDate = getSystemTime();
    const confId = originalMsg.conferenceId || session.currentConf || 1;
    const msgBaseId = originalMsg.messageBaseId || session.currentMsgBase || 1;
    // express.e:10707-10711 — forwarded messages also write A<N> attachment
    // list when present (forward inherits attachments from original).
    const inheritedAttachments: string[] = (originalMsg as any)?.attachments || [];
    const msgNum = await writeMessageFile(
      confId,
      msgBaseId,
      {
        from: session.user.username,
        to: forwardData.toUser,
        subject: forwardData.subject,
        date: formatMessageDate(messageDate),
        body: originalMsg.body || '',
        status,
        attachments: inheritedAttachments.length > 0
          ? { filenames: inheritedAttachments, deleteOnMessageDelete: false }
          : undefined,
      } as any,
      config.get('dataDir'),
      session.nodeId || 0,
    );

    // express.e:10692-10705: aePuts('Message Number N...done!\b\n\b\n')
    emitText(socket, `Message Number ${msgNum}...done!`);

    // Mirror to DB for web UI / search index — disk has the canonical copy.
    await _db.createMessage({
      subject: forwardData.subject,
      body: originalMsg.body,
      author: session.user.username,
      timestamp: messageDate,
      conferenceId: confId,
      messageBaseId: msgBaseId,
      isPrivate: forwardData.isPrivate,
      toUser: forwardData.toUser,
      parentId: null,
      attachments: inheritedAttachments,
      edited: false,
      editedBy: null,
      editedAt: null,
      censored: status === MsgStatus.CENSORED,
    } as any, { skipDiskWrite: true });

    // Delete original if requested
    if (deleteOriginal) {
      await _db.deleteMessage(originalMsg.id);

      // Remove from reader's message list
      const messages = session.tempData.msgReaderMessages || [];
      const originalIndex = session.tempData.forwardOriginalIndex || 0;
      messages.splice(originalIndex, 1);
      session.tempData.msgReaderMessages = messages;
    }

    emitText(socket, ' done.\r\n');

    // Return to message reader
    const messages = session.tempData.msgReaderMessages || [];
    const currentIndex = session.tempData.forwardOriginalIndex || 0;

    // If we deleted the original and there are no more messages, exit
    if (deleteOriginal && messages.length === 0) {
      emitText(socket, 'No more messages.\r\n');
      const { saveMessagePointerAndExit } = require('./messaging.handler');
      await saveMessagePointerAndExit(socket, session);
      return;
    }

    // Display next message (or previous if we deleted the last one)
    const nextIndex = deleteOriginal && currentIndex < messages.length ? currentIndex : currentIndex;
    session.subState = LoggedOnSubState.MSG_READER_NAV;

    const { displaySingleMessage } = require('./messaging.handler');
    await displaySingleMessage(socket, session, deleteOriginal ? Math.min(nextIndex, messages.length - 1) : nextIndex);

  } catch (error: any) {
console.error('[ForwardMessage] Error saving forwarded message:', error);
    emitText(socket, '\r\nError forwarding message.\r\n');

    // Return to message reader
    session.subState = LoggedOnSubState.MSG_READER_NAV;
    const { displaySingleMessage } = require('./messaging.handler');
    const currentIndex = session.tempData.forwardOriginalIndex || 0;
    await displaySingleMessage(socket, session, currentIndex);
  }
}

/**
 * Handle text file upload input
 * Web extension: Import text file contents into message body
 */
export async function handleUploadFileInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const filePath = input.trim();

  // Check for directory listing command
  if (filePath.startsWith('5 ')) {
    const dirPath = filePath.substring(2).trim() || '.';
    await displayDirectoryListing(socket, session, dirPath);
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Empty input = cancel
  if (filePath === '') {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize('Upload cancelled.', 'yellow'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
    return;
  }

  // Resolve file path
  const bbsRoot = config.get('dataDir');
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(bbsRoot, filePath);

  // Check if file exists
  if (!amigafs.existsSync(fullPath)) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`File not found: ${filePath}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Check if it's a file (not directory)
  const stats = amigafs.statSync(fullPath);
  if (!stats.isFile()) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Path is not a file: ${filePath}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize('Enter path/filename to import ', 'cyan')}${AnsiUtil.colorize('(', 'green')}${AnsiUtil.colorize('5 <DIR>', 'yellow')}${AnsiUtil.colorize(')', 'green')}=${AnsiUtil.colorize('DIR', 'yellow')}${AnsiUtil.colorize(')', 'green')}${AnsiUtil.colorize(':', 'cyan')} `);
    return;
  }

  // Read file contents
  try {
    const fileContents = amigafs.readFileSync(fullPath, 'utf-8');
    const contentStr = typeof fileContents === 'string' ? fileContents : fileContents.toString('utf-8');
    const lines = contentStr.split(/\r?\n/);

    // Import lines into message body
    const messageData = session.tempData.messageEntry;
    let importedLines = 0;

    for (const line of lines) {
      // Limit to 200 lines total
      if (messageData.body.length >= 200) {
        emitText(socket, '\r\n');
        emitText(socket, AnsiUtil.warningLine(`Maximum message length reached (200 lines). Imported ${importedLines} lines.`));
        break;
      }

      messageData.body.push(line);
      importedLines++;
    }

    messageData.currentLine = messageData.body.length + 1;

    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.colorize(`Imported ${importedLines} line(s) from ${path.basename(filePath)}`, 'green'));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(messageData.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  } catch (error) {
    emitText(socket, '\r\n');
    emitText(socket, AnsiUtil.errorLine(`Error reading file: ${(error as Error).message}`));
    emitText(socket, '\r\n');
    emitText(socket, `${AnsiUtil.colorize(String(session.tempData.messageEntry.currentLine).padStart(3), 'yellow')}> `);
    session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  }
}

/**
 * Display directory listing for file attachment selection
 * 1:1 port from express.e:8343-8387 myDirRecurse()
 *
 * @param socket - Socket connection
 * @param session - User session
 * @param dirPath - Directory path to list
 */
async function displayDirectoryListing(socket: any, session: BBSSession, dirPath: string): Promise<void> {
  emitText(socket, '\r\n');

  // Resolve path relative to BBS root
  const bbsRoot = config.get('dataDir');
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(bbsRoot, dirPath);

  // Check if path exists (express.e:8353-8364)
  if (!amigafs.existsSync(fullPath)) {
    emitText(socket, AnsiUtil.errorLine(`${dirPath} does not exist`));
    emitText(socket, '\r\n');
    return;
  }

  // Check if it's a directory (express.e:8367)
  const stats = amigafs.statSync(fullPath);
  if (!stats.isDirectory()) {
    // If it's a file, just display the file info (express.e:8382)
    displayFileInfo(socket, path.basename(fullPath), stats);
    return;
  }

  // Display directory header (express.e:8368-8369)
  emitText(socket, `${AnsiUtil.colorize('Directory of ', 'cyan')}${AnsiUtil.colorize(dirPath, 'white')}\r\n`);
  emitText(socket, '\r\n');

  // Read directory contents (express.e:8371-8380)
  try {
    const entries = amigafs.readdirSync(fullPath);

    for (const entry of entries) {
      const entryPath = path.join(fullPath, entry);
      try {
        const entryStats = amigafs.statSync(entryPath);
        displayFileInfo(socket, entry, entryStats);
      } catch (error) {
        // Skip files that can't be stat'd
console.warn(`[Directory Listing] Cannot stat ${entry}:`, error);
      }
    }
  } catch (error) {
    emitText(socket, AnsiUtil.errorLine(`Error reading directory: ${(error as Error).message}`));
    emitText(socket, '\r\n');
  }

  emitText(socket, '\r\n');
}

/**
 * Display information for a single file
 * Port from express.e:8325-8341 myDirDisplay()
 *
 * @param socket - Socket connection
 * @param filename - File name
 * @param stats - File stats
 */
function displayFileInfo(socket: any, filename: string, stats: any): void {
  // Format file size or "Dir" indicator (express.e:8333-8337)
  const sizeStr = stats.isDirectory()
    ? AnsiUtil.colorize('     Dir', 'blue')
    : AnsiUtil.colorize(String(stats.size).padStart(8), 'white');

  // Format modification date/time (express.e:8327-8332, 8339-8340)
  const mtime = stats.mtime || getSystemTime();
  const dateStr = `${String(mtime.getMonth() + 1).padStart(2, '0')}/${String(mtime.getDate()).padStart(2, '0')}/${String(mtime.getFullYear()).substring(2)}`;
  const timeStr = `${String(mtime.getHours()).padStart(2, '0')}:${String(mtime.getMinutes()).padStart(2, '0')}:${String(mtime.getSeconds()).padStart(2, '0')}`;

  // Display file info line (express.e:8339-8340)
  // Format: filename (25 chars) size (8 chars) date time
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize(filename.padEnd(25).substring(0, 25), stats.isDirectory() ? 'yellow' : 'green'));
  emitText(socket, ' ');
  emitText(socket, sizeStr);
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize(dateStr, 'cyan'));
  emitText(socket, ' ');
  emitText(socket, AnsiUtil.colorize(timeStr, 'cyan'));
  emitText(socket, '\r\n');
}
