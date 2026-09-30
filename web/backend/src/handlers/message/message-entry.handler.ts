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
import { messageBodyLineLimit, messageIndent, messageRule } from '../../utils/table-format.util';
import { lineInput, yesNo } from '../../utils/await-input';
import { higherAccess } from '../../utils/error-handling.util';
import { findAssign, resolveAssignPath } from '../../utils/path-util';
import { isFileRestricted } from '../../utils/file-restriction.util';
import { editKey, editorKeyCodes } from './line-editor';
import { reportMessage } from '../../achievements/sites';
import { fullEditOffered, editInFullScreen } from './message-full-editor';


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
 * tooltype) and the user hasn't filled those fields, prompt inline for
 * the missing field(s) before allowing message entry.
 *
 * Returns:
 *   true       — fields already set; caller proceeds with command.
 *   false      — capture in progress (substate set, prompt emitted).
 *                Caller MUST return; the handler will resume the
 *                deferred command after the user supplies the value.
 *                Pass `resume` to schedule what happens on success.
 *   throws     — none (defensive: never throws).
 */
export function captureRealAndInternetNames(
  socket: any,
  session: BBSSession,
  resume?: () => void | Promise<void>,
): boolean {
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  if (confId < 1 || msgBaseId < 1) return true;

  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  // express.e:28159-28164 OR's all four checks (REALNAME, REALNAME.<n>,
  // INTERNETNAME, INTERNETNAME.<n>) into realNamesUsed/internetNamesUsed.
  const realNamesUsed = !!(flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId));
  const internetNamesUsed = !!(flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId));
  const userMisc: any = (session.user as any) || {};
  const realName = String(userMisc.realName || userMisc.realname || '').trim();
  const internetName = String(userMisc.internetName || userMisc.internetname || '').trim();

  // express.e:28166-28193 — REALNAME first (matches express.e order).
  if (realNamesUsed && realName.length === 0) {
    if (!resume) {
      // Legacy callers that don't pass a resume callback get the previous
      // blocking-notice fallback. Keeps backwards compat for any path that
      // hasn't been migrated yet.
      emitText(socket, '\r\nReal Names are required for messages in this conference/msgbase\r\n');
      emitText(socket, 'Use the account editor to set your real name first.\r\n\r\n');
      return false;
    }
    if (!session.tempData) session.tempData = {};
    session.tempData.captureResume = resume;
    emitText(socket, '\r\n');
    // express.e:28169-28173 - the sysop's REALNAMES screen if the board has
    // one, and the bare sentence ONLY when it does not. This port always
    // printed the sentence, so a board that had drawn the screen never showed
    // it.
    void showNameScreen(socket, session, 'REALNAMES').then(shown => {
      if (!shown) {
        emitText(socket, 'Real Names are required for messages in this conference/msgbase \r\n');
      }
      emitText(socket, '\r\n');
      emitText(socket, 'Real Name (Alpha Numeric): ');
    });
    session.subState = LoggedOnSubState.MSG_CAPTURE_REAL_NAME;
    return false;
  }

  // express.e:28195-28225 — INTERNETNAME after REALNAME.
  if (internetNamesUsed && internetName.length === 0) {
    if (!resume) {
      emitText(socket, '\r\nInternet Names are required for messages in this conference/msgbase\r\n');
      emitText(socket, 'Use the account editor to set your internet name first.\r\n\r\n');
      return false;
    }
    if (!session.tempData) session.tempData = {};
    session.tempData.captureResume = resume;
    emitText(socket, '\r\n');
    // express.e:28199-28202 - same rule as REALNAMES above.
    void showNameScreen(socket, session, 'INTERNETNAMES').then(shown => {
      if (!shown) {
        emitText(socket, 'Internet Names are required for messages in this conference/msgbase\r\n');
      }
      emitText(socket, '\r\n');
      emitText(socket, 'Internet Name (Alpha Numeric No Spaces): ');
    });
    session.subState = LoggedOnSubState.MSG_CAPTURE_INTERNET_NAME;
    return false;
  }

  return true;
}

/**
 * Handle capture-real-name input — express.e:28173-28191 REPEAT loop.
 * Empty input → RESULT_FAILURE (return user to safe state).
 * Otherwise: validate (no wildcards), accept, advance to internet capture
 * if needed, else call the resume callback.
 */
export async function handleCaptureRealNameInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = (input || '').trim().substring(0, 25); // express.e:28175 lineInput max=25
  // express.e:28177 — empty → RESULT_FAILURE → bail to safe state.
  if (trimmed.length === 0) {
    emitText(socket, '\r\n');
    delete session.tempData?.captureResume;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }
  // express.e:28181-28185 — wildcards are rejected.
  if (trimmed.includes('*') || trimmed.includes('?')) {
    emitText(socket, '\r\nNo wildcards allowed in a name.\r\n');
    emitText(socket, 'Real Name (Alpha Numeric): ');
    return; // stay in MSG_CAPTURE_REAL_NAME (express.e REPEAT/UNTIL loop)
  }

  // express.e:28184 findUserFromName(NAME_TYPE_REALNAME, ...) — duplicate
  // name rejection. "Already in use!, try another." stays in the prompt.
  emitText(socket, '\r\nChecking for duplicate name...');
  if (_db?.getUserByRealname) {
    try {
      const existing = await _db.getUserByRealname(trimmed);
      if (existing && existing.id !== session.user?.id) {
        emitText(socket, '\r\nAlready in use!, try another.\r\n\r\n');
        emitText(socket, 'Real Name (Alpha Numeric): ');
        return; // loop
      }
    } catch (err) {
      console.error('[CaptureRealName] Duplicate-check failed:', err);
      // Fall through — accept the value rather than block on a DB hiccup.
    }
  }

  // Persist on the live user object so subsequent messages don't re-prompt.
  const userMisc: any = (session.user as any) || {};
  userMisc.realName = trimmed;
  // (Sync to disk via UserFileManager / DB happens at logoff; the in-memory
  // value covers the rest of this session, matching express.e's
  // loggedOnUserMisc.realName which is also session-scoped.)
  emitText(socket, '\r\nOk!\r\n');

  // Now check if internet name is also needed (express.e:28195-28225).
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  const internetNamesUsed = !!(flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId));
  const internetName = String(userMisc.internetName || userMisc.internetname || '').trim();
  if (internetNamesUsed && internetName.length === 0) {
    emitText(socket, '\r\n');
    emitText(socket, 'Internet Names are required for messages in this conference/msgbase\r\n');
    emitText(socket, '\r\n');
    emitText(socket, 'Internet Name (Alpha Numeric No Spaces): ');
    session.subState = LoggedOnSubState.MSG_CAPTURE_INTERNET_NAME;
    return;
  }

  // All captures done — invoke the resume callback.
  const resume = session.tempData?.captureResume;
  delete session.tempData?.captureResume;
  if (typeof resume === 'function') {
    await resume();
  }
}

/**
 * Handle capture-internet-name input — express.e:28204-28223.
 */
export async function handleCaptureInternetNameInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const trimmed = (input || '').trim().substring(0, 9); // express.e:28206 lineInput max=9
  if (trimmed.length === 0) {
    emitText(socket, '\r\n');
    delete session.tempData?.captureResume;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }
  if (trimmed.includes('*') || trimmed.includes('?')) {
    emitText(socket, '\r\nNo wildcards allowed in a name.\r\n');
    emitText(socket, 'Internet Name (Alpha Numeric No Spaces): ');
    return;
  }
  if (/\s/.test(trimmed)) {
    // express.e:28205 prompt explicitly says "No Spaces" — enforce.
    emitText(socket, '\r\nNo spaces allowed.\r\n');
    emitText(socket, 'Internet Name (Alpha Numeric No Spaces): ');
    return;
  }

  // express.e:28216 findUserFromName(NAME_TYPE_INTERNETNAME, ...) —
  // duplicate-name rejection on internetName.
  emitText(socket, '\r\nChecking for duplicate name...');
  if (_db?.getUserByInternetname) {
    try {
      const existing = await _db.getUserByInternetname(trimmed);
      if (existing && existing.id !== session.user?.id) {
        emitText(socket, '\r\nAlready in use!, try another.\r\n\r\n');
        emitText(socket, 'Internet Name (Alpha Numeric No Spaces): ');
        return;
      }
    } catch (err) {
      console.error('[CaptureInternetName] Duplicate-check failed:', err);
    }
  }

  const userMisc: any = (session.user as any) || {};
  userMisc.internetName = trimmed;
  emitText(socket, '\r\nOk!\r\n');

  const resume = session.tempData?.captureResume;
  delete session.tempData?.captureResume;
  if (typeof resume === 'function') {
    await resume();
  }
}

export { isExtSendMsgBase, getConfMailName, getConfMailNameFor, isSysopRecipient } from './conf-mail-name';
import { isExtSendMsgBase, getConfMailName, isSysopRecipient } from './conf-mail-name';

/**
 * express.e:9909-9950 checkToForward(check=1) — when the conf has
 * FORWARDMAIL=<user> tooltype set AND the recipient is the sysop, redirect
 * to <user> and print "    Forwarding mail To: <name>".
 *
 * Mutates session.tempData.messageEntry.toUser in place. Caller should run
 * this AFTER the recipient name is finalized (matches express.e:10845/9885).
 */
export function applyConfForwardMail(socket: any, session: BBSSession): void {
  const entry = session.tempData?.messageEntry;
  if (!entry?.toUser) return;
  const confId = session.currentConf || 1;
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  const fwdUser = flags?.forwardMail || '';
  if (!fwdUser) return;
  if (isSysopRecipient(entry.toUser)) {
    entry.toUser = fwdUser;
    emitText(socket, `    \x1b[36mForwarding mail To\x1b[33m:\x1b[0m ${fwdUser}\r\n`);
  }
}

/**
 * Run the express.e enterMSG "skipEntry" check sequence on a recipient
 * (express.e:10785-10845). Used by both the interactive To: prompt
 * (handleMessageToInput) and the pre-filled `E <name>` entry path
 * (handleEnterMessageFullCommand). Caller is responsible for emitting the
 * post-Enter '\r\n' that lineInput would have produced — this function
 * starts directly at the EALL/sysop/chooseAName logic.
 *
 * Express.e:10802 StrCmp(str,'eall',5) requires EXACT 'eall' match (the
 * length-5 strncmp compares the trailing null too). We mirror that here.
 *
 * On success: sets messageEntry.toUser, runs checkToForward, calls
 * promptForSubject. On failure: emits the express.e error string and
 * returns the user to DISPLAY_MENU.
 */
export async function processToRecipient(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10762,10779 — lineInput max 30 chars; truncate silently if longer
  const recipient = input.trim().substring(0, 30);

  // Blank = ALL (express.e:10796-10798)
  if (recipient === '') {
    session.tempData.messageEntry.toUser = 'ALL';
    // express.e:10845 checkToForward runs after recipient is finalized.
    // ALL is not the sysop so this is a no-op, but keep the call symmetric
    // with the other branches.
    applyConfForwardMail(socket, session);
    promptForSubject(socket, session);
    return;
  }

  // Check for EALL - express.e:10800-10816
  // express.e:10802 StrCmp(str,'eall',5) — exact match only.
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
      applyConfForwardMail(socket, session);
      promptForSubject(socket, session);
    } else {
      // express.e:10814 - No permission, reject.
      //
      // express.e answers a caller who may not use EALL with "User does not
      // exist!!", which is true of no user and explains nothing: EALL is not a
      // user, it is the public recipient, and the real reason is the missing
      // permission. The express.e line stays first for parity; the sentence
      // after it is the one that lets a sysop fix his own board.
      emitText(socket, '\r\nUser does not exist!!\r\n');
      emitText(
        socket,
        '[INFO] EALL posts to everyone and needs ACS.EALL_MESSAGES, which your access level does not grant.\r\n\r\n',
      );
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
    //   NAME_TYPE_USERNAME    → tempUserKeys.userName(31)
    //   NAME_TYPE_REALNAME    → tempUserMisc.realName(26)
    //   NAME_TYPE_INTERNETNAME → tempUserMisc.internetName(10)
    // confNameType resolves per express.e:5017-5024 — REALNAME wins over
    // INTERNETNAME, INTERNETNAME wins over default USERNAME.
    const confId = session.currentConf || 1;
    const msgBaseId = session.currentMsgBase || 1;
    const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
    const flags = getConferenceToolFlags(confId);
    const requireRealname = flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId);
    const requireInternetname = flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId);
    if (requireRealname && resolvedUser.realName) {
      resolved = String(resolvedUser.realName).substring(0, 26);
    } else if (requireInternetname && (resolvedUser.internetName || resolvedUser.internetname)) {
      resolved = String(resolvedUser.internetName || resolvedUser.internetname).substring(0, 10);
    } else if (resolvedUser.username) {
      // Default NAME_TYPE_USERNAME — normalize to canonical username casing
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
  applyConfForwardMail(socket, session);
  promptForSubject(socket, session);
}

/**
 * Handle recipient (To:) input - express.e:10771-10838
 *
 * Emits the post-Enter '\r\n' (mirrors lineInput's CR/LF on submit), then
 * delegates to processToRecipient for the express.e:10785+ skipEntry logic.
 */
export async function handleMessageToInput(socket: any, session: BBSSession, input: string): Promise<void> {
  emitText(socket, '\r\n');
  await processToRecipient(socket, session, input);
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

  void promptForMessageBody(socket, session);
}

/** The line editor's cursor - express.e edit()'s `x` - kept beside `space` (inputBuffer). */
type EditorSession = BBSSession & { bodyCursorX?: number };

/**
 * Keys typed into the line editor - express.e edit() 10166-10360.
 *
 * Each key is one pass of edit()'s loop (line-editor.ts editKey). A pass
 * that ends the line stores it and opens the next (brk / bEG_IN); Enter on
 * an empty line ends entry and opens Msg. Options.
 */
export async function handleMessageBodyKeys(socket: any, session: BBSSession, data: string): Promise<void> {
  const s = session as EditorSession;
  const maxLineLen = messageBodyLineLimit(session);
  for (const c of editorKeyCodes(data)) {
    // A key after the one that ended entry is not the editor's to take.
    if (session.subState !== LoggedOnSubState.POST_MESSAGE_BODY) return;
    const r = editKey({ space: session.inputBuffer || '', x: s.bodyCursorX ?? 0 }, c, maxLineLen);
    session.inputBuffer = r.space;
    s.bodyCursorX = r.x;
    if (r.echo) emitText(socket, r.echo);
    if (r.brk === 'blank') endOfBody(socket, session);
    else if (r.brk === 'line') storeBodyLine(socket, session, r.committed ?? '');
  }
}

/**
 * A whole line entered at the line editor: an empty one ends entry, any
 * other is stored as `brk:` stores it. The key path (handleMessageBodyKeys)
 * comes through the same two functions.
 */
export async function handleMessageBodyInput(socket: any, session: BBSSession, input: string): Promise<void> {
  if (input === '') {
    endOfBody(socket, session);
    return;
  }
  session.inputBuffer = '';
  (session as EditorSession).bodyCursorX = 0;
  storeBodyLine(socket, session, input);
}

/**
 * express.e:10358-10375 `brk: lines++` and `bEG_IN:` - the line is stored
 * and the next ` N> ` is printed with whatever the word wrap carried onto
 * it. There is no line limit: express removed it (10360-10362).
 */
function storeBodyLine(socket: any, session: BBSSession, line: string): void {
  const entry = session.tempData.messageEntry;
  entry.body.push(line);
  entry.currentLine = entry.body.length + 1;
  // Prompt and carried text in ONE call, so the width choke measures the row.
  emitText(socket, linePromptFor(entry.currentLine) + (session.inputBuffer || ''));
}

/**
 * express.e:10364-10371 - Enter on an empty line: `lines--`, rawArrow off,
 * `aePuts('\b\n')`, and on into the Msg. Options loop.
 */
function endOfBody(socket: any, session: BBSSession): void {
  session.inputBuffer = '';
  (session as EditorSession).bodyCursorX = 0;
  emitText(socket, '\r\n');
  startMsgOptions(socket, session, false);
}

/**
 * express.e `checkSecurity(ACS_ATTACH_FILES) AND fileattach` (10376, 10385,
 * 10511): an edit a door asked for (JH_EF) or EM clears fileattach.
 */
function attachAllowed(session: BBSSession): boolean {
  return checkSecurity(session.user, ACSPermission.ATTACH_FILES) && fileAttach(session);
}

/** express.e `fileattach` - cleared by JH_EF (3477) and EM (11143). */
function fileAttach(session: BBSSession): boolean {
  return session.tempData?.messageEntry?.fileAttach !== false;
}

/** express.e mailHeader.status: "R" private, "P" public. */
function isPublic(session: BBSSession): boolean {
  return !session.tempData?.messageEntry?.isPrivate;
}

/**
 * express.e:10378 / 10388 - X shows when
 *   fileattach AND (((status="P") AND ACS_PUB_MSGFILES) OR (ACS_PRI_MSGFILES AND (status<>"P")))
 */
function xferShown(session: BBSSession): boolean {
  if (!fileAttach(session)) return false;
  return isPublic(session)
    ? checkSecurity(session.user, ACSPermission.PUB_MSGFILES)
    : checkSecurity(session.user, ACSPermission.PRI_MSGFILES);
}

/**
 * express.e:10374-10391 - the short menu, or with helplist the long one.
 */
function showOptionsMenu(socket: any, session: BBSSession, helpList: boolean): void {
  if (!helpList) {
    let menu = '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m,\x1b[33mC\x1b[36m,\x1b[33mD\x1b[36m,\x1b[33mE';
    if (attachAllowed(session)) menu += '\x1b[36m,\x1b[33mF';
    menu += '\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mS';
    if (xferShown(session)) menu += '\x1b[36m,\x1b[33mX';
    menu += '\x1b[36m,\x1b[33m? \x1b[0m>:';
    emitText(socket, menu);
    return;
  }
  let menu = '\r\n\x1b[33mA\x1b[32m>\x1b[36mbort\x1b[0m';
  menu += '\r\n\x1b[33mC\x1b[32m>\x1b[36montinue\x1b[0m';
  menu += '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Lines\x1b[0m';
  menu += '\r\n\x1b[33mE\x1b[32m>\x1b[36mdit\x1b[0m';
  if (attachAllowed(session)) menu += '\r\n\x1b[33mF\x1b[32m>\x1b[36mile Attachment\x1b[0m';
  menu += '\r\n\x1b[33mL\x1b[32m>\x1b[36mist\x1b[0m';
  menu += '\r\n\x1b[33mS\x1b[32m>\x1b[36mave\x1b[0m';
  if (xferShown(session)) menu += '\r\n\x1b[33mX\x1b[32m>\x1b[36mfer Files\x1b[0m';
  menu += '\r\n\x1b[0m >: ';
  emitText(socket, menu);
}

/** The ` N> ` a body line is typed behind - `\d[2]> `, `\d[3]> ` from line 100. */
function linePromptFor(lineNum: number): string {
  const n = lineNum <= 99
    ? String(lineNum).padStart(2)
    : String(lineNum).padStart(3);
  return `${n}> `;
}

/** E's Val(): the leading integer, 0 when there is none. */
function val(str: string): number {
  const n = parseInt(str.trim(), 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Where one pass of the Msg. Options loop goes next. */
type MsgOptionsNext = 'cont2' | 'help' | 'return';

/**
 * express.e edit() 10373-10578, the Msg. Options loop:
 *
 *   REPEAT
 *   cont2:
 *     <menu>; stat:=lineInput('','',10,INPUT_TIMEOUT,str)
 *     ... one command ...
 *   UNTIL stat<0
 *
 * Every prompt in it is express's own lineInput / yesNo (utils/await-input),
 * which echo, end on Enter and print their own line break. Whatever a
 * command does not RETURN from comes back round to cont2 and the menu -
 * a bare Enter included.
 */
async function msgOptions(socket: any, session: BBSSession, helplist: boolean): Promise<void> {
  session.subState = LoggedOnSubState.POST_MESSAGE_OPTIONS;
  for (;;) {
    showOptionsMenu(socket, session, helplist);
    const str = await lineInput(socket, session, 10);
    const next = await msgOption(socket, session, str);
    if (next === 'return') return;
    helplist = next === 'help';
  }
}

/**
 * Run the Msg. Options loop. It waits on the caller's keys, so it is not
 * awaited here (a keystroke's dispatch would wait on the next keystroke);
 * when edit() returns, the board carries on as it does after any
 * message-entry key (command.handler afterMessageEntryInput).
 */
function startMsgOptions(socket: any, session: BBSSession, helplist: boolean): void {
  const before = session.subState;
  msgOptions(socket, session, helplist)
    .then(() => {
      const { afterMessageEntryInput } = require('../command.handler');
      return afterMessageEntryInput(socket, session, before);
    })
    .catch((err: unknown) => console.error('[Msg. Options] failed:', err));
}

/**
 * One line typed at Msg. Options, acted on as the body of edit()'s REPEAT
 * (10394-10576). Loops back to the menu unless the command returned.
 */
export async function handleMessageOptionsInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const next = await msgOption(socket, session, input);
  if (next !== 'return') startMsgOptions(socket, session, next === 'help');
}

async function msgOption(socket: any, session: BBSSession, str: string): Promise<MsgOptionsNext> {
  const entry = session.tempData?.messageEntry;
  if (!entry) return 'return';
  // express.e:10394 messageMenuChar:=str[0]
  const c = str[0] ?? '';

  // express.e:10397-10400
  if (c === '?') return 'help';

  if (c === 'D' || c === 'd') {
    await deleteLine(socket, session);
    return 'cont2';
  }

  if (c === 'C' || c === 'c') {
    continueEntry(socket, session);
    return 'return';
  }

  if (c === 'E' || c === 'e') {
    await editLine(socket, session);
    return 'cont2';
  }

  // express.e:10495-10506
  if (c === 'L' || c === 'l') {
    emitText(socket, '\r\n');
    entry.body.forEach((bodyLine: string, j: number) => {
      emitText(socket, `${linePromptFor(j + 1)}${bodyLine}\r\n`);
    });
    return 'cont2';
  }

  if (c === 'F' || c === 'f') {
    await attachFile(socket, session);
    return 'cont2';
  }

  // express.e:10557-10560
  if (c === 'S' || c === 's') {
    await saveMessage(socket, session);
    return 'return';
  }

  // express.e:10562-10566 - rzmsg:=1: the save that follows takes a batch
  // upload into the message's F<n> directory (saveNewMSG 10721-10740).
  if (fileAttach(session) && (c === 'X' || c === 'x') && (
    (checkSecurity(session.user, ACSPermission.PRI_MSGFILES) && !isPublic(session))
    || (checkSecurity(session.user, ACSPermission.PUB_MSGFILES) && isPublic(session))
  )) {
    entry.rzmsg = true;
    await saveMessage(socket, session);
    return 'return';
  }

  // express.e:10567-10572
  if (c === 'A' || c === 'a') {
    emitText(socket, '\r\nAbort message entry (y/n)? ');
    if (await yesNo(socket, session, 0)) {
      await abortEntry(socket, session);
      return 'return';
    }
  }

  return 'cont2';
}

/**
 * express.e:10401-10450 - D. The line number is read with lineInput(5);
 * an empty answer goes back to the menu, an unknown one says so and asks
 * again, and yesNo(0) confirms.
 */
async function deleteLine(socket: any, session: BBSSession): Promise<void> {
  const body: string[] = session.tempData.messageEntry.body;
  let stat: number;
  for (;;) {
    if (body.length === 0) {
      emitText(socket, '\r\nNo lines to delete.\r\n');
      return;
    }
    emitText(socket, `\r\n\x1b[36mLine number to delete \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${body.length}\x1b[32m]\x1b[0m? `);
    const str = await lineInput(socket, session, 5);
    if (str.length === 0) return;
    stat = val(str);
    if (stat >= 1 && stat <= body.length) break;
    emitText(socket, `\r\nLine ${stat} does not exist.\r\n`);
  }
  emitText(socket, `\r\n${linePromptFor(stat)}${body[stat - 1]}\r\n`);
  emitText(socket, '\r\n\x1b[36mIs this the correct line \x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mN\x1b[32m)\x1b[0m? ');
  if (await yesNo(socket, session, 0)) {
    body.splice(stat - 1, 1);
    session.tempData.messageEntry.currentLine = body.length + 1;
    emitText(socket, `\r\nDeleted line ${stat}.\r\n`);
  }
}

/**
 * express.e:10452-10466 - C. The last line is opened again with the cursor
 * at its end (x:=StrLen(space)) and entry goes on from bEG_IN.
 */
function continueEntry(socket: any, session: BBSSession): void {
  const entry = session.tempData.messageEntry;
  emitText(socket, '\r\n');
  const space: string = entry.body.length > 0 ? entry.body.pop() : '';
  entry.currentLine = entry.body.length + 1;
  session.inputBuffer = space;
  (session as EditorSession).bodyCursorX = space.length;
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
  emitText(socket, linePromptFor(entry.currentLine) + space);
}

/**
 * express.e:10467-10493 - E. `loopHere:` asks for the line with
 * lineInput(5) until it exists or the answer is empty.
 */
async function editLine(socket: any, session: BBSSession): Promise<void> {
  const body: string[] = session.tempData.messageEntry.body;
  if (body.length < 1) {
    emitText(socket, '\r\nNo Lines to edit!\r\n');
    return;
  }
  for (;;) {
    emitText(socket, `\r\n\x1b[36mLine number to edit \x1b[32m[\x1b[33m1\x1b[32m..\x1b[33m${body.length}\x1b[32m]\x1b[0m? `);
    const str = await lineInput(socket, session, 5);
    if (str.length === 0) return;
    const x = val(str);
    if (x >= 1 && x <= body.length) {
      await editMessageLine(socket, session, x);
      return;
    }
    emitText(socket, `\r\nLine ${x} does not exist.\r\n`);
  }
}

/**
 * express.e:10485-10491 - the line under the Edit Line rule, re-typed with
 * lineInput('\b\n    ',temp,maxLineLen,...): the old text is the default
 * and the field holds maxLineLen, as the editor's own lines do.
 */
export async function editMessageLine(socket: any, session: BBSSession, x: number): Promise<void> {
  const body: string[] = session.tempData.messageEntry.body;
  emitText(socket, '\r\n    Edit Line');
  emitText(socket, `\r\n${messageRule(session, 'editLine')}`);
  emitText(socket, `\r\n${messageIndent(session, 'editLine')}`);
  body[x - 1] = await lineInput(socket, session, messageBodyLineLimit(session), body[x - 1]);
}

/**
 * express.e:10508-10555 - F. One path (the console's file requester is not
 * a caller's), `5 <dir>` lists and goes back to the menu, and each path must
 * be on a mounted device, exist and not be Restricted, or it is dropped.
 * What survives is asked about with yesNo(2) and the answer goes in front.
 * The list starts afresh every time (attachedFiles.clear(), 10524).
 */
async function attachFile(socket: any, session: BBSSession): Promise<void> {
  if (!attachAllowed(session)) {
    higherAccess(socket);
    return;
  }
  const entry = session.tempData.messageEntry;
  emitText(socket, "\r\nEnter path/filename to attach ('5 <DIR>'=DIR): ");
  const attachedFile = await lineInput(socket, session, 250);
  if (attachedFile[0] === '5' && attachedFile[1] === ' ') {
    await displayDirectoryListing(socket, session, attachedFile.substring(2).trim() || '.');
    return;
  }
  const attachedFiles: string[] = [attachedFile];
  for (let i = attachedFiles.length - 1; i >= 0; i--) {
    const file = attachedFiles[i];
    if (file.length > 0) {
      if (!deviceMounted(file)) {
        emitText(socket, '\r\nDevice not Mounted.\r\n');
        emitText(socket, '\r\n');
        attachedFiles.splice(i, 1);
      }
      // No ELSE in express: an unmounted path is examined too, fails its
      // Lock and is removed a second time - a no-op for the one path here.
      if (await restricted(socket, session, file)) attachedFiles.splice(i, 1);
    }
  }
  entry.attachedFiles = attachedFiles;
  if (attachedFiles.length > 0) {
    emitText(socket, 'Delete file(s) when message is deleted ');
    const yes = await yesNo(socket, session, 2);
    attachedFiles.unshift(yes ? 'Y' : 'N');
  }
}

/**
 * MiscFuncs.e findAssign(): the path must name a device - the part before
 * its first `:` - and that device must be mounted. A path with no colon
 * names none.
 */
function deviceMounted(file: string): boolean {
  const colon = file.indexOf(':');
  if (colon < 0) return false;
  return findAssign(file.slice(0, colon + 1)) !== null;
}

/**
 * express.e:9579-9608 restricted(). TRUE unless the path can be examined:
 * a path that cannot be locked is refused without a word, and one whose
 * comment starts "Restricted" is reported and logged. This board keeps a
 * file's comment as its DIR description (utils/file-restriction.util).
 */
async function restricted(socket: any, session: BBSSession, file: string): Promise<boolean> {
  const hostPath = resolveAssignPath(file);
  if (!amigafs.existsSync(hostPath)) return true;
  const conf = session.currentConf ?? 1;
  if (await isFileRestricted(conf, config.get('dataDir'), path.basename(hostPath))) {
    emitText(socket, '\r\n ');
    emitText(socket, file);
    emitText(socket, '\r\n >>Restricted File<< Updating CallersLog\r\n');
    await _callersLog?.(
      session.user?.id ?? null,
      session.user?.username ?? 'unknown',
      `\tAttempt to examine RESTRICTED file ${file.slice(0, 100)}`,
    );
    return true;
  }
  return false;
}

/**
 * edit() returned -1 (express.e:10571). A caller that is not message entry
 * (JH_EF) takes it; enterMSG prints its `\b\n` (10966) and goes back. EM
 * (11145) prints nothing of its own.
 */
async function abortEntry(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData?.messageEntry;
  if (entry?.finishOutside) {
    await entry.finishOutside(null);
    return;
  }
  if (!entry?.editingExistingMsgId) emitText(socket, '\r\n');
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
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
    await promptForMessageBody(socket, session);
    return;
  }

  // Load parent message (express.e:10887-10888: IF(stat:=loadMsg(...)))
  const parentId = session.tempData.messageEntry.parentId;
  const parentMsg = await _db.getMessage(parentId);

  if (!parentMsg) {
    await promptForMessageBody(socket, session);
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

  session.tempData.quoteData = {
    parentMessage: parentMsg,
    parentLines,
    totalLines: parentLines.length
  };
  void askQuoteRange(socket, session);
}

/**
 * express.e:10901-10903 - the range is read with lineInput(6): echoed, at
 * most six characters, and ended with lineInput's own line break.
 */
async function askQuoteRange(socket: any, session: BBSSession): Promise<void> {
  session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_RANGE;
  emitText(socket, '\r\n Enter Startline,Endline or (*=ALL, A=Abort): ');
  const str = await lineInput(socket, session, 6);
  quoteRange(socket, session, str);
}


/**
 * Save message to database - express.e:10909 saveNewMSG()
 */
async function saveMessage(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;

  // edit() returned RESULT_SUCCESS to a caller that is not message entry -
  // JH_EF saves the lines to its own file (express.e:1148-1150).
  if (entry?.finishOutside) {
    await entry.finishOutside(entry.body);
    return;
  }

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

    // express.e:10649 — `AstrCopy(mh.fromName, confMailName, 31)` uses the
    // per-conference display name (NAME_TYPE_USERNAME/REALNAME/INTERNETNAME),
    // not the raw login username. In USERNAME conferences the two are equal,
    // but REALNAME/INTERNETNAME conferences must store the conference-typed
    // name so the recipient's "Is this my mail?" check (express.e:8943,
    // 11125, etc., all of which compare against confMailName) sees a match.
    const fromName = getConfMailName(session);

    const message = {
      subject: entry.subject,
      body: messageBody,
      author: fromName,
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
        // express.e:10649 — fromName comes from confMailName, not the raw
        // login username (matters for REALNAME/INTERNETNAME conferences).
        from: fromName,
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

    // express.e:10654-10685 — EXTSEND.<n> external mailbox dump. When the
    // msgbase has the EXTSEND tooltype set AND the message is NOT a comment
    // to sysop, also write a parallel copy to <msgBaseLocation>/EXT-OUT/<i>.msg
    // for UUCP/FidoNet gateway processors to pick up. This is independent
    // of the canonical save above — failure here doesn't block the main
    // save (gateway is best-effort by design).
    try {
      const { writeExtSendDumpIfApplicable } = require('../../utils/message-file.util');
      const messageDateUnixSec = Math.floor(messageDate.getTime() / 1000);
      await writeExtSendDumpIfApplicable(
        session.currentConf || 1,
        session.currentMsgBase || 1,
        {
          fromName,
          toName: entry.toUser,
          subject: entry.subject,
          msgDate: messageDateUnixSec,
        },
        messageBody.split('\n'),
        !!entry.isComment,
        config.get('dataDir'),
      );
    } catch (extErr) {
console.error('[Message] EXTSEND dump failed (non-fatal):', extErr);
    }

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
    // Whether the recipient is the sysop: decided inside the webhook block
    // below, read again by the achievements site after it.
    let toUserIsSysop = false;
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
      toUserIsSysop = entry.toUser.toLowerCase() === 'sysop';
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

    // Achievements (SP2): the message facts, beside the webhook and outside
    // its try. Non-throwing.
    reportMessage(session as any, { body: entry.body, isPrivate: entry.isPrivate, parentId: entry.parentId || null, toUserIsSysop }, session.currentConf || 1);

    // express.e:9898-9903 (replyToMSG): after saving, prompt "Delete original message (y/N)?"
    // only if user has DELETE permission AND original message was addressed to current user.
    //
    // express.e compares against confMailName (the per-conference display
    // name picked by NAME_TYPE_USERNAME/REALNAME/INTERNETNAME — see
    // express.e:12459-12466 + 9899). For REALNAME conferences the original
    // mail's `toName` is the user's real name, NOT their login username,
    // so the previous comparison against session.user.username silently
    // suppressed the delete-original prompt.
    const replyOriginalToUser: string = entry.replyOriginalToUser || '';
    const myConfMailName = getConfMailName(session);
    if (
      replyOriginalToUser &&
      replyOriginalToUser.toLowerCase() === myConfMailName.toLowerCase() &&
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
    // express.e differentiates two failure modes here:
    //   - lockMsgBase() returns 0 (express.e:10744): another task holds the lock.
    //     Verbatim text: 'ERROR! Another task has the MsgBase locked!\b\n
    //                     Message has not been saved!\b\n\b\n'
    //   - saveMessageHeader / Open(<msgNum>, MODE_NEWFILE) fails (10696, 10713):
    //     'Failed!\b\n\b\n'
    //
    // writeMessageFile throws an Error with the prefix "MsgBase locked" when
    // it exhausts retry attempts; everything else falls through to the
    // generic "Failed!" text.
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.startsWith('MsgBase locked')) {
      emitText(socket, '\r\nERROR! Another task has the MsgBase locked!\r\nMessage has not been saved!\r\n\r\n');
    } else {
      emitText(socket, 'Failed!\r\n\r\n');
    }
  }

  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;

  // Force the menu prompt to render. The debounce in displayMainMenu/displayMenuPrompt
  // could swallow the post-save prompt if any earlier code path bumped the timestamps;
  // bypassDebounce=true sidesteps that. We deliberately leave forceMenuDisplay=false so
  // expert-mode users (user.expert='X', set by the X command) don't get the full ANSI
  // menu redrawn over their preference — express.e suppresses the menu screen in expert
  // mode but still shows the trailing prompt (express.e:28586+ displayMenu).
  try {
    const { displayMainMenu } = require('../command-handler/menu');
    await displayMainMenu(socket, session, false /* forceMenuDisplay */, true /* bypassDebounce */);
  } catch (_) { /* swallow — advanceDisplayFlow is the fallback */ }
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
    void promptForMessageBody(socket, session);
    return;
  }

  // Messages to ALL/EALL cannot be private - express.e:10850
  if (toUser === 'ALL' || toUser === 'EALL') {
    session.tempData.messageEntry.isPrivate = false;
    void promptForMessageBody(socket, session);
    return;
  }

  // express.e:10860 — skip Private prompt entirely if msgbase is EXTSEND.
  // External msgbases (UUCP/FidoNet gateway) keep the default status; user
  // doesn't get to choose Private since these go off-system.
  if (isExtSendMsgBase(session)) {
    session.tempData.messageEntry.isPrivate = false;
    void promptForMessageBody(socket, session);
    return;
  }

  // express.e:10861 aePuts('         [36mPrivate ') then yesNo(2) → '[32m([33my[32m/[33mN[32m)[32m?[0m '
  emitText(socket, `${messageIndent(session, 'private')}\x1b[36mPrivate \x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)?\x1b[0m `);
  session.subState = LoggedOnSubState.POST_MESSAGE_PRIVATE;
}

/**
 * The answer to the quote range - express.e:10904-10944.
 */
function quoteRange(socket: any, session: BBSSession, input: string): void {
  const quoteData = session.tempData.quoteData;
  const messageData = session.tempData.messageEntry;
  const raw = input.trim();
  // express.e:10908 firstCharValue(str) — use first char for A/* checks
  const firstChar = (raw[0] || '').toUpperCase();

  if (!quoteData) {
    void promptForMessageBody(socket, session);
    return;
  }

  // express.e:10909-10913: IF firstChar='A' → abort (i:=-1, lines:=0, exit:=TRUE)
  // express.e silently clears msgBuf and goes to edit() with empty body (no "Quote aborted" msg)
  if (firstChar === 'A') {
    delete session.tempData.quoteData;
    messageData.body = [];
    messageData.currentLine = 1;
    void promptForMessageBody(socket, session);
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
    void askQuoteRange(socket, session);
    return;
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

  messageData.body.splice(0, 0, ...quotedLines);
  messageData.currentLine = messageData.body.length + 1;

  delete session.tempData.quoteData;

  // express.e falls through to edit() which shows header+ruler+pre-existing lines
  void promptForMessageBody(socket, session);
}

/**
 * The start of express.e's edit() (10093-10141): the full-screen editor
 * when it is on offer - asked "FullScreen Editor (y/N)?" unless the caller
 * chose it outright (editorType 2) - and the line editor otherwise.
 */
export async function promptForMessageBody(socket: any, session: BBSSession): Promise<void> {
  if (!session.tempData?.messageEntry?.lineEditorOnly && fullEditOffered(session)) {
    if ((session.user as { editorType?: number } | undefined)?.editorType === 2) {
      await runFullEdit(socket, session);
      return;
    }
    // express.e:10099-10100 aePuts('[36mFullScreen Editor[0m'); yesNo(2)
    emitText(socket, '\x1b[36mFullScreen Editor\x1b[0m\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ');
    session.subState = LoggedOnSubState.POST_MESSAGE_FULLEDIT_CONFIRM;
    return;
  }
  showLineEditor(socket, session);
}

/** express.e yesNo(2) at "FullScreen Editor": Y runs it, N or Enter the line editor. */
export async function handleFullEditConfirm(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = (input[0] || '').toUpperCase();
  if (ch !== 'Y' && ch !== 'N' && ch !== '\r' && ch !== '\n' && ch !== '') return;
  emitText(socket, ch === 'Y' ? 'Yes\r\n' : 'No\r\n');
  if (ch === 'Y') {
    await runFullEdit(socket, session);
    return;
  }
  showLineEditor(socket, session);
}

/**
 * express.e:10106-10141. What the caller has so far goes to msg.i, SysCmd
 * FULLEDIT runs, and the message is what it leaves in msg: saved straight
 * away, as edit() returns RESULT_SUCCESS to enterMSG (10962-10972). No msg
 * means the caller left without saving - the message is abandoned, as A
 * does. A FULLEDIT that did not run falls back to the line editor.
 */
async function runFullEdit(socket: any, session: BBSSession): Promise<void> {
  const entry = session.tempData.messageEntry;
  let outcome: string[] | 'abandoned' | 'not-run';
  // Several callers are synchronous and do not await this; a failure to run
  // the editor must end in the line editor, never in an unhandled rejection.
  try {
    outcome = await editInFullScreen(socket, session, entry?.body ?? []);
  } catch (err) {
    console.error('[FULLEDIT] full-screen editor failed, falling back to the line editor:', err);
    outcome = 'not-run';
  }
  session.tempData = session.tempData || {};
  session.tempData.messageEntry = entry;
  if (outcome === 'not-run') {
    showLineEditor(socket, session);
    return;
  }
  emitText(socket, '\r\n');
  if (outcome === 'abandoned') {
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }
  entry.body = outcome;
  await saveMessage(socket, session);
}

/**
 * The line editor - express.e:10148-10165 onwards.
 */
function showLineEditor(socket: any, session: BBSSession): void {
  // express.e:10146-10148: aePuts('\b\n') then
  //   StringF(tempstr,'   Enter your text. (Enter) alone to end. (\d chars/line)\b\n',maxLineLen)
  // - the length this caller's lines wrap at, not a fixed 75.
  emitText(socket, `\r\n   Enter your text. (Enter) alone to end. (${messageBodyLineLimit(session)} chars/line)\r\n`);
  // express.e:10150-10152: StrCopy(str,'|-------...');SetStr(str,75);StringF(tempstr,'   (\s)\b\n',str)
  // SetStr to 75: 9 full |-------| groups (72 chars) + |-- (3 chars) = 75
  emitText(socket, `${messageRule(session, 'bodyRuler')}\r\n`);

  const entry = session.tempData.messageEntry;

  // If body already has content (quoting/forwarding), show existing lines first
  if (!entry.body) {
    entry.body = [];
  }
  entry.currentLine = entry.body.length + 1;

  /*
   * Show any pre-existing lines (a quote preamble, or the lines already
   * typed), PROMPT AND TEXT IN ONE CALL.
   *
   * Two calls is two chances for the width choke to measure: it sees ` 5> `
   * alone, then a forty-column line alone, and wraps the second because it
   * cannot know four columns are already spent. A prompt assembled in
   * pieces defeats the choke by construction - the same ruling as the
   * message reader's nav prompt.
   */
  if (entry.body.length > 0) {
    entry.body.forEach((bodyLine: string, index: number) => {
      emitText(socket, `${linePromptFor(index + 1)}${bodyLine}\r\n`);
    });
  }

  // express.e:10162-10175 - an empty `space`, x at 0, and bEG_IN's prompt.
  session.inputBuffer = '';
  (session as EditorSession).bodyCursorX = 0;
  emitText(socket, linePromptFor(entry.currentLine));
  session.subState = LoggedOnSubState.POST_MESSAGE_BODY;
}

/**
 * Forward message handlers (express.e forwardMSG:9807-9871)
 * Implementation lives in message-forward.handler.ts since the round-21
 * split. Re-exported here so existing imports from this module keep
 * resolving without touching command.handler / input-handlers.
 */
export {
  handleForwardMessageToInput,
  handleForwardMessageSubjectInput,
  handleForwardMessagePrivateInput,
  handleForwardMessageDeleteOriginalInput,
  handleReplyDeleteOriginalInput,
} from './message-forward.handler';


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

  // An Amiga path (`BBS:Conf01`) through its assign; anything else relative to the BBS root.
  const bbsRoot = config.get('dataDir');
  const assigned = resolveAssignPath(dirPath);
  const fullPath = path.isAbsolute(assigned) ? assigned : path.join(bbsRoot, assigned);

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

/**
 * The screen a board may have drawn for a name requirement, or nothing.
 *
 * express.e prints its own sentence ONLY when the screen is absent
 * (`IF displayScreen(...)=FALSE THEN aePuts(...)`), so a board that drew one
 * gets the art and a board that did not gets the words. Silent, because not
 * having the file is the ordinary case and not a fault to report.
 */
async function showNameScreen(socket: any, session: any, screen: string): Promise<boolean> {
  try {
    const { displayScreen } = require('../screen.handler');
    return await displayScreen(socket, session, screen, true, true);
  } catch {
    return false;
  }
}
