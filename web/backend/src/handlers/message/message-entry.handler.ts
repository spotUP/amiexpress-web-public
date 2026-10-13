/**
 * Message Entry Handler - Handles the E (Enter Message) command flow
 * 1:1 port from express.e:10749+ enterMSG()
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/security.util';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { writeMessageFile, formatMessageDate, readMessageFile, getMessagesDir } from '../../utils/message-file.util';
import type { UploadStat } from '../../services/upload-end.service';
import { config } from '../../config';
import { runExecuteOn } from '../../services/batch-scheduler';
import { emitText, emitPrompt, emitLine, flushOutput } from '../../utils/output.util';
import { mailOnSysopComment } from '../../services/mail-notification.service';
import * as amigafs from '../../utils/amigafs';
import { amigaProtectionOf } from '../../amiga-emulation/api/dos/protection';
import * as path from 'path';
import { getSystemTime, formatLongDateTime, toAmigaTime, fromAmigaTime } from '../../utils/date-time.util';
import { messageBodyLineLimit, messageIndent, messageRule } from '../../utils/table-format.util';
import { lineInput, yesNo } from '../../utils/await-input';
import { higherAccess } from '../../utils/error-handling.util';
import { deviceMounted, resolveAssignPath } from '../../utils/path-util';
import { restricted } from '../../utils/file-restriction.util';
import { editKey, editorKeyCodes } from './line-editor';
import { sessionWantsPetscii } from '../../utils/petscii-session-model';
import { reportMessage } from '../../achievements/sites';
import { fullEditOffered, editInFullScreen } from './message-full-editor';
import { joinedConf } from '../../utils/joined-conf.util';


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
 * express.e:28151 captureRealAndInternetNames, for the callers that are still
 * sub-state driven: E, C, and the reader's R and F. The procedure itself is
 * msg-names.ts captureRealAndInternetNames, which prompts inline with
 * lineInput the way express.e does.
 *
 * Returns true when nothing is missing - the caller carries on. Otherwise the
 * prompt is running and it returns false: the caller returns, and `resume`
 * runs once the caller has typed the name(s). An empty line is express.e's
 * RESULT_FAILURE - the command ends and the menu comes back.
 */
export function captureRealAndInternetNames(
  socket: any,
  session: BBSSession,
  resume?: () => void | Promise<void>,
): boolean {
  const confId = session.currentConf || 1;
  const msgBaseId = session.currentMsgBase || 1;
  if (!namesMissing(session, confId, msgBaseId)) return true;

  void (async () => {
    const stat = await captureNames(socket, session, confId, msgBaseId);
    if (stat === RESULT_SUCCESS) {
      if (resume) await resume();
      return;
    }
    await endMessageEntry(socket, session);
  })().catch((err) => console.error('[captureRealAndInternetNames]', err));
  return false;
}

/** The test at the top of each half of captureRealAndInternetNames (28166, 28195). */
export function namesMissing(session: BBSSession, confId: number, msgBaseId: number): boolean {
  if (confId < 1 || msgBaseId < 1) return false;
  const { getConferenceToolFlags } = require('../../utils/conference-tooltypes.util');
  const flags = getConferenceToolFlags(confId);
  const realNamesUsed = !!(flags?.requireRealname || flags?.requireRealnameMsgBases?.has?.(msgBaseId));
  const internetNamesUsed = !!(flags?.requireInternetname || flags?.requireInternetnameMsgBases?.has?.(msgBaseId));
  const misc: any = session.user || {};
  const realName = String(misc.realName || misc.realname || '');
  const internetName = String(misc.internetName || misc.internetname || '');
  return (realNamesUsed && realName.length === 0) || (internetNamesUsed && internetName.length === 0);
}

/**
 * A message command that ends early (enterMSG RETURN RESULT_FAILURE) goes back
 * to the menu. The key handler that started it has already returned, so the
 * menu is brought up here.
 */
async function endMessageEntry(socket: any, session: BBSSession): Promise<void> {
  if (await finishEntry(session, session.tempData?.messageEntry, false)) return;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.tempData = undefined;
  const { advanceDisplayFlow } = require('../command.handler');
  await advanceDisplayFlow(socket, session);
}

/**
 * enterMSG returns to its caller. The message reader's replyToMSG (express.e
 * 9874-9907) waits on it and goes on with the delete-original question; the
 * E command has no such caller and goes back to the menu. true = handled.
 */
async function finishEntry(session: BBSSession, entry: any, saved: boolean): Promise<boolean> {
  const done = entry?.onFinished as ((saved: boolean) => void | Promise<void>) | undefined;
  if (!done) return false;
  session.tempData = undefined;
  await done(saved);
  return true;
}

/**
 * replyToMSG's enterMSG (express.e:9894-9895, replyFlag=1): To and Subject
 * are already settled by the reader, so entry starts at the Private question.
 * `onFinished` is told whether the reply was saved.
 */
export function enterReply(socket: any, session: BBSSession, entry: Record<string, unknown>): void {
  session.tempData = { messageEntry: { body: [], currentLine: 1, ...entry } };
  promptForPrivate(socket, session);
}

export { isExtSendMsgBase, getConfMailName, getConfMailNameFor, isSysopRecipient } from './conf-mail-name';
import { isExtSendMsgBase, getConfMailName } from './conf-mail-name';
import {
  RESULT_SUCCESS,
  accountHasConfAccess,
  accountName,
  captureRealAndInternetNames as captureNames,
  checkToForward,
  chooseAName,
  confNameTypeOf,
  loadAccount,
  type DiskAccount,
} from './msg-names';

/**
 * express.e:9909-9950 checkToForward(check=1) on the recipient being entered
 * (the reply and forward flows). See msg-names.ts checkToForward.
 */
export function applyConfForwardMail(socket: any, session: BBSSession): void {
  const entry = session.tempData?.messageEntry;
  if (!entry?.toUser) return;
  const fwd = checkToForward(socket, session, entry.toUser, true);
  entry.toUser = fwd.name;
  if (fwd.account) entry.toSlot = fwd.account.slot;
}

/**
 * express.e:10785-10845, enterMSG from `skipEntry` to the Subject prompt:
 * the recipient the caller typed (or gave as `E <name>`) becomes the
 * message's toName.
 *
 *   - blank is ALL (10796); nothing else is - `all` typed is looked up
 *   - `eall` needs ACS_EALL_MESSAGES and a non-EXTSEND base (10800-10816)
 *   - `sysop` is account 1 (10818-10820)
 *   - anything else goes through chooseAName (10822), which says
 *     "User does not exist!!" and ends the command when nobody has that
 *     name - except on an EXTSEND base, where any name may leave the board
 *   - a found account is addressed by the conference's confNameType
 *     (10828-10836) and must have access to the conference (10837-10840)
 *   - then checkToForward(str,toName,1) (10845)
 *
 * chooseAName may ask ` Expand: <name> Correct (Y/n)?`, so this waits on the
 * caller's keys: start it with `void`, never await it from a key handler.
 */
export async function processToRecipient(socket: any, session: BBSSession, input: string): Promise<void> {
  const entry = session.tempData.messageEntry;
  // AstrCopy(mailHeader.toName,tempStr,31)
  let toName = input.substring(0, 30);
  let aFlag = 0;
  let toAccount: DiskAccount | null = null;
  const extSend = isExtSendMsgBase(session);

  if (toName.length === 0) {
    // express.e:10796-10798
    aFlag = 1;
    toName = 'ALL';
  } else {
    // express.e:10800 StrCopy(str,toName,31); LowerStr(str); StrCmp(str,'eall',5)
    const str = toName.toLowerCase();
    if (str === 'eall') {
      if (extSend) {
        emitText(socket, "\r\nCan't use EALL in external message bases!!\r\n\r\n");
        await endMessageEntry(socket, session);
        return;
      }
      if (!checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {
        // express.e:10814
        emitText(socket, '\r\nUser does not exist!!\r\n\r\n');
        await endMessageEntry(socket, session);
        return;
      }
      aFlag = 2;
      toName = 'EALL';
    } else {
      let found = true;
      if (str === 'sysop') {
        // express.e:10819 loadAccount(1,tempUser,tempUserKeys,tempUserMisc)
        toAccount = loadAccount(1);
      } else {
        // express.e:10823 chooseAName(toName,...,IF extSend THEN 0 ELSE 1)
        toAccount = await chooseAName(socket, session, toName, !extSend);
        if (!toAccount) {
          if (!extSend) {
            await endMessageEntry(socket, session);
            return;
          }
          found = false;
        }
      }
      if (found && toAccount) {
        toName = accountName(toAccount, confNameTypeOf(session));
        if (!accountHasConfAccess(toAccount, session.currentConf || 1)) {
          // express.e:10838
          emitText(socket, '\r\nUser does not have access to this conference!\r\n\r\n');
          await endMessageEntry(socket, session);
          return;
        }
      }
    }
  }

  // express.e:10845 checkToForward(str,mailHeader.toName,1)
  const fwd = checkToForward(socket, session, toName, true);
  if (fwd.account) toAccount = fwd.account;
  entry.toUser = fwd.name;
  entry.aFlag = aFlag;
  entry.toSlot = toAccount?.slot;
  promptForSubject(socket, session);
}

/**
 * The To: line the caller typed (express.e:10779 lineInput). lineInput's own
 * line break, then the rest of enterMSG - which may prompt, so it runs on its
 * own rather than holding up the key that ended the line.
 */
export async function handleMessageToInput(socket: any, session: BBSSession, input: string): Promise<void> {
  emitText(socket, '\r\n');
  void processToRecipient(socket, session, input).catch((err) => console.error('[processToRecipient]', err));
}

/**
 * Handle subject input - express.e:10839-10849
 */
export async function handleMessageSubjectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  // express.e:10847 — lineInput('','',30,...) caps subject at 30 chars
  const subject = input.trim().substring(0, 30);

  // Blank = abort: enterMSG:10854 RETURN RESULT_FAILURE, back to the menu.
  // A reply asks its subject in read-msg's replyToMSG, which returns into
  // the reader on a blank one (9890) and never gets here.
  if (subject === '') {
    // lineInput's line break, then 10853's (C: 8787) aePuts('\b\n').
    emitText(socket, '\r\n\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
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

  promptQuoteOrBody(socket, session);
}

/**
 * express.e yesNo(2)'s prompt, byte for byte (express.e:2134; the same bytes
 * utils/await-input yesNo prints): `(y/N)?` with ESC[32m before the `?`.
 */
const YES_NO_2 = '\x1b[32m(\x1b[33my\x1b[32m/\x1b[33mN\x1b[32m)\x1b[32m?\x1b[0m ';

/**
 * express.e:10877-10880, after the Private question (or its skip):
 *   IF(replyFlag=1) ... aePuts('  [36mQuote in Reply ') ; yesNo(2)
 * and otherwise straight to the editor.
 */
function promptQuoteOrBody(socket: any, session: BBSSession): void {
  if (session.tempData.messageEntry.parentId) {
    emitText(socket, `  \x1b[36mQuote in Reply ${YES_NO_2}`);
    session.subState = LoggedOnSubState.POST_MESSAGE_QUOTE_REPLY_CONFIRM;
    return;
  }
  void promptForMessageBody(socket, session);
}

/** The line editor's cursor - express.e edit()'s `x` - kept beside `space` (inputBuffer). */
type EditorSession = BBSSession & { bodyCursorX?: number };

/** CTRL+W, ETB. */
const CTRL_W = 0x17;

/**
 * CTRL+W FROM A PETSCII CALLER: word wrap off, or on again - C*Base's key
 * (sysop decision D2, 2026-10-04; plan
 * `thoughts/shared/plans/2026-10-04-petscii-ctrl-l-case-toggle.md`).
 *
 * C*Base 3.3.7 flips `wordwrap` (`src/ml0123.a65:1993-2006`) and prints
 * prompt 50 or 51, "Word wrap on" / "Word wrap off", then goes back to the
 * line. It is ON whenever the Message-Maker opens (`bbs.bas` `poke994,1`), so
 * the flag lives on the message being written and every new one starts with
 * wrap on. The line is put back on a fresh prompt with the cursor where it
 * was, the way the board reprints it after a wrap.
 *
 * Only a PETSCII caller: express.e edit() drops every code below 32 (10293),
 * and an ANSI caller keeps express.e.
 */
function toggleWordWrap(socket: any, session: BBSSession): void {
  const entry = session.tempData.messageEntry;
  entry.wordWrap = entry.wordWrap === false;
  const space = session.inputBuffer || '';
  const x = (session as EditorSession).bodyCursorX ?? 0;
  emitText(
    socket,
    `\r\nWord wrap ${entry.wordWrap ? 'on' : 'off'}\r\n` + linePromptFor(entry.currentLine) + space
      + '\x1b[1D'.repeat(space.length - x),
  );
}

/**
 * Keys typed into the line editor - express.e edit() 10166-10360.
 *
 * Each key is one pass of edit()'s loop (line-editor.ts editKey). A pass
 * that ends the line stores it and opens the next (brk / bEG_IN); Enter on
 * an empty line ends entry and opens Msg. Options.
 */
export async function handleMessageBodyKeys(socket: any, session: BBSSession, data: string): Promise<void> {
  const s = session as EditorSession;
  const maxLineLen = lineLimit(session);
  for (const c of editorKeyCodes(data)) {
    // A key after the one that ended entry is not the editor's to take.
    if (session.subState !== LoggedOnSubState.POST_MESSAGE_BODY) return;
    if (c === CTRL_W && sessionWantsPetscii(session)) {
      toggleWordWrap(socket, session);
      continue;
    }
    const wordWrap = session.tempData.messageEntry.wordWrap !== false;
    const r = editKey({ space: session.inputBuffer || '', x: s.bodyCursorX ?? 0 }, c, maxLineLen, wordWrap);
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

/**
 * edit()'s maxLineLen: the screen's own limit, or a caller's smaller one
 * (createVoteTopic asks edit(FALSE,50), express.e:20603).
 */
function lineLimit(session: BBSSession): number {
  const screen = messageBodyLineLimit(session);
  const own = session.tempData?.messageEntry?.maxLineLen;
  return own ? Math.min(own, screen) : screen;
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
  body[x - 1] = await lineInput(socket, session, lineLimit(session), body[x - 1]);
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
      if (await restricted(socket, session, file, resolveAssignPath(file), config.get('dataDir'))) attachedFiles.splice(i, 1);
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
  emitText(socket, '\r\n');
  if (await finishEntry(session, entry, false)) return;
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

  // express.e:10886-10887 the message being replied to, off disk:
  //   StringF(tempStr,'\s\d',msgBaseLocation,mailHeader.msgNumb)
  //   IF(stat:=loadMsg(tempStr))
  // parentId is that msgNumb (the reader's message ids are message numbers).
  const parentId = Number(session.tempData.messageEntry.parentId);
  const file = await readMessageFile(joinedConf(session).conf, parentId, config.get('dataDir')).catch(() => null);

  if (!file) {
    await promptForMessageBody(socket, session);
    return;
  }
  // The quote's trailer names mailHeader.fromName and mailHeader.msgDate (10936-10938).
  const parentMsg = {
    author: file.from,
    timestamp: file.msgDate ? fromAmigaTime(file.msgDate) : new Date(0),
    body: file.body,
  };

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


/** What a post has to say, wherever it was composed. */
export interface NewMessageEntry {
  toUser: string;
  subject: string;
  body: string[];
  isPrivate: boolean;
  /** The recipient's account slot, when enterMSG loaded one (slot 1 = sysop). */
  toSlot?: number;
  parentId?: number | null;
  parentMsgStatus?: string | number;
  attachedFiles?: string[];
  isComment?: boolean;
  transferFiles?: boolean;
}

export type SaveOutcome =
  | { saved: true; msgNum: number }
  | { saved: false; reason: 'locked' | 'failed' };

/**
 * saveNewMSG (express.e:10909) without the screen: the one place a message
 * becomes a board message. The E command's editor and the SUBS door
 * (AEW_POSTMSG, amiga-emulation/xim/postmsg.ts) both come through here, so a
 * post counts, logs, notifies and is stored the same way whoever composed it.
 *
 * `onWritten` runs once the files are on disk and before the side effects,
 * which is where saveNewMSG prints "Message Number N...done!" (10692-10705).
 */
export async function saveNewMessage(
  socket: any,
  session: BBSSession,
  entry: NewMessageEntry,
  onWritten?: (msgNum: number) => void,
): Promise<SaveOutcome> {
  // edit()'s S, X and full-screen save count the post as they return
  // (express.e:10558, 10564, 10127) - before saveNewMSG, so a save that
  // then fails has still been counted.
  // In memory, as loggedOnUser's: the joined conference's count
  // (loadMsgPointers 4909), into its Conf.DB record at the next
  // saveMsgPointers (4943) and summed into user.data at logoff (8204-8207).
  session.user!.messagesPosted = (session.user!.messagesPosted || 0) + 1;

  // express.e:10694 - the message goes to <msgBaseLocation><msgNumb>: the base
  // joinConf loaded, which in a scan is the scanned one while currentConf is 0.
  const { conf: msgConf, msgBase: msgBaseId } = joinedConf(session);

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
      conferenceId: msgConf,
      messageBaseId: msgBaseId,
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
      msgConf,
      msgBaseId,
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
      await writeExtSendDumpIfApplicable(
        msgConf,
        msgBaseId,
        {
          fromName,
          toName: entry.toUser,
          subject: entry.subject,
          msgDate: toAmigaTime(messageDate),
        },
        messageBody.split('\n'),
        !!entry.isComment,
        config.get('dataDir'),
      );
    } catch (extErr) {
console.error('[Message] EXTSEND dump failed (non-fatal):', extErr);
    }

    // express.e:10692-10705: aePuts('Message Number N...') + write + aePuts('done!\b\n\b\n')
    onWritten?.(msgNum);

    // Save to database (for web UI / search indexing only).
    // Body file + HeaderFile already written by writeMessageFile above —
    // tell createMessage to skip its own disk-write to avoid duplicates.
    const messageId = await _db.createMessage(message, { skipDiskWrite: true });


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

      const conference = await _db.getConferenceById(msgConf);
      const messageBase = await _db.getMessageBaseById(msgBaseId);

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
      // entry.toSlot is the account enterMSG / commentToSYSOP loaded as
      // tempUser - slot 1 is the sysop (express.e:10717).
      toUserIsSysop = entry.toSlot === 1 || entry.toUser.toLowerCase() === 'sysop';
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
          conferenceId: msgConf
        },
        DebugSeverity.WARNING
      );
    }

    // Achievements (SP2): the message facts, beside the webhook and outside
    // its try. Non-throwing.
    reportMessage(session as any, { body: entry.body, isPrivate: entry.isPrivate, parentId: entry.parentId || null, toUserIsSysop }, msgConf);

    // A reply's "Delete original message" (express.e:9898-9903) is asked by
    // read-msg's replyToMSG once this save returns.

    return { saved: true, msgNum };
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
        conferenceId: msgConf
      },
      DebugSeverity.CRITICAL
    );
    // writeMessageFile throws an Error with the prefix "MsgBase locked" when
    // lockMsgBase gives up (express.e:10744); everything else is "Failed!".
    const errMsg = error instanceof Error ? error.message : String(error);
    return { saved: false, reason: errMsg.startsWith('MsgBase locked') ? 'locked' : 'failed' };
  }
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

  const outcome = await saveNewMessage(socket, session, entry, (msgNum) => {
    // express.e:10692-10705: aePuts('Message Number N...') + write + aePuts('done!\b\n\b\n')
    emitText(socket, `Message Number ${msgNum}...done!\r\n\r\n`);
  });
  const savedOk = outcome.saved;
  const savedMsgNum = outcome.saved ? outcome.msgNum : 0;
  if (outcome.saved) {
    // express.e saves message and returns to main loop; main loop sets menuPause:=TRUE
    session.menuPause = true;
  } else if (outcome.reason === 'locked') {
    // express.e:10744 - lockMsgBase() returned 0.
    emitText(socket, '\r\nERROR! Another task has the MsgBase locked!\r\nMessage has not been saved!\r\n\r\n');
  } else {
    // express.e:10696, 10713 - the header or the body could not be written.
    emitText(socket, 'Failed!\r\n\r\n');
  }

  // express.e:10721-10740 - X: the files are uploaded into the message
  // before saveNewMSG returns to its caller. A goodbye after the transfer
  // ends the call there (RESULT_STANDARD_LOGOFF, 10733-10737).
  if (savedOk && entry.rzmsg) {
    const stat = await sendMessageFiles(socket, session, joinedConf(session).conf, savedMsgNum);
    if (stat === 'goodbye') {
      session.tempData = undefined;
      const { handleGoodbyeCommand } = require('../commands/system-commands.handler');
      await handleGoodbyeCommand(socket, session, 'Y');
      return;
    }
  }

  if (await finishEntry(session, entry, savedOk)) return;
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
 * saveNewMSG's rzmsg block (express.e:10721-10740): the message's F<n>
 * directory is made, uploadaFile(0,'',TRUE) runs with rzmsg set - its files
 * are filed into F<n> (upload-filing.service fileIntoMessage) - and F<n> is
 * deleted afterwards, which AmigaDOS does only when nothing was put in it.
 * The reader offers what is there (read-msg getAttachType, type 2).
 */
async function sendMessageFiles(socket: any, session: BBSSession, conf: number, msgNumb: number): Promise<UploadStat> {
  const wanted = path.join(getMessagesDir(conf, config.get('dataDir')), `F${msgNumb}`);
  // 10722-10725 CreateDir
  try { amigafs.mkdirSync(wanted, { recursive: true }); } catch (err) { console.error('[X] CreateDir failed:', err); }
  const dir = amigafs.resolvePath(wanted) ?? wanted;
  // 10726-10727 setEnvStat(ENV_UPLOADING) has no home here; bgFileCheck:=FALSE
  // does: a message's file is filed by the message, never in the background.
  session.bgFileCheck = false;
  emitText(socket, '\r\n');
  session.rzmsg = { dir, msgNumb };
  try {
    const { uploadaFileAndWait } = require('../commands/user-commands.handler');
    return await uploadaFileAndWait(socket, session, true);
  } finally {
    // 10730 rzmsg:=NIL; 10731-10733 SetProtection + DeleteFile(F<n>)
    session.rzmsg = undefined;
    try { amigafs.rmdirSync(dir); } catch { /* it holds the files */ }
  }
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

  // express.e:10859 IF(aFlag=FALSE) AND (extSend=FALSE) - aFlag is set only
  // by a blank To: (ALL) and by EALL, so a message to either is public. An
  // EXTSEND base keeps its default status: the message leaves the board.
  if (session.tempData.messageEntry.aFlag || isExtSendMsgBase(session)) {
    session.tempData.messageEntry.isPrivate = false;
    promptQuoteOrBody(socket, session);
    return;
  }

  // express.e:10861 aePuts('         [36mPrivate ') ; yesNo(2)
  emitText(socket, `${messageIndent(session, 'private')}\x1b[36mPrivate ${YES_NO_2}`);
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
  let outcome: { lines: string[]; batchRequested: boolean } | 'abandoned' | 'not-run';
  // Several callers are synchronous and do not await this; a failure to run
  // the editor must end in the line editor, never in an unhandled rejection.
  try {
    // express.e:10122-10123 - the editor offers upload / attach when the
    // caller may file into this message.
    const attach = fileAttach(session);
    outcome = await editInFullScreen(socket, session, entry?.body ?? [], {
      batch: attach && (checkSecurity(session.user, ACSPermission.PRI_MSGFILES)
        || checkSecurity(session.user, ACSPermission.PUB_MSGFILES)),
      attach: attach && checkSecurity(session.user, ACSPermission.ATTACH_FILES),
    });
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
    if (await finishEntry(session, entry, false)) return;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = undefined;
    return;
  }
  entry.body = outcome.lines;
  // express.e:10133 rzmsg:=1 - the editor asked for the batch upload, so the
  // save takes the message's files (saveNewMSG 10721-10740), as X does.
  if (outcome.batchRequested && entry) entry.rzmsg = true;
  await saveMessage(socket, session);
}

/**
 * The line editor - express.e:10148-10165 onwards.
 */
function showLineEditor(socket: any, session: BBSSession): void {
  // express.e:10146-10148: aePuts('\b\n') then
  //   StringF(tempstr,'   Enter your text. (Enter) alone to end. (\d chars/line)\b\n',maxLineLen)
  // - the length this caller's lines wrap at, not a fixed 75.
  emitText(socket, `\r\n   Enter your text. (Enter) alone to end. (${lineLimit(session)} chars/line)\r\n`);
  // express.e:10150-10152: StrCopy(str,'|-------...');SetStr(str,75);StringF(tempstr,'   (\s)\b\n',str)
  // SetStr to 75: 9 full |-------| groups (72 chars) + |-- (3 chars) = 75
  // edit(..,maxLineLen) cuts its rule to the line (10149-10152); a caller
  // that names its own length (the voting booth's 50) gets that rule.
  const ownLimit = session.tempData?.messageEntry?.maxLineLen;
  emitText(socket, ownLimit
    ? `   (${'|-------'.repeat(16).slice(0, lineLimit(session))})\r\n`
    : `${messageRule(session, 'bodyRuler')}\r\n`);

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
 * Display directory listing for file attachment selection
 * 1:1 port from express.e:8343-8387 myDirRecurse()
 *
 * @param socket - Socket connection
 * @param session - User session
 * @param dirPath - Directory path to list
 */
export async function displayDirectoryListing(socket: any, session: BBSSession, dirPath: string): Promise<void> {
  // myDirAnyWhere (express.e:8402): '\b\n', the listing, '\b\n' (8427).
  emitText(socket, '\r\n');

  // An Amiga path (`BBS:Conf01`) through its assign; anything else relative to the BBS root.
  const bbsRoot = config.get('dataDir');
  const assigned = resolveAssignPath(dirPath);
  const fullPath = path.isAbsolute(assigned) ? assigned : path.join(bbsRoot, assigned);

  // myDirRecurse (8343-8387): a path that will not Lock returns silently.
  let stats: any;
  try {
    stats = amigafs.statSync(fullPath);
  } catch {
    emitText(socket, '\r\n');
    return;
  }

  if (!stats.isDirectory()) {
    displayFileInfo(socket, path.basename(fullPath), stats);
  } else {
    emitText(socket, `Directory of ${dirPath}\r\n`);
    let entries: string[] = [];
    try { entries = amigafs.readdirSync(fullPath); } catch { /* the ExNext loop just ends */ }
    for (const entry of entries) {
      try {
        displayFileInfo(socket, entry, amigafs.statSync(path.join(fullPath, entry)));
      } catch {
        // A file that will not stat is skipped.
      }
    }
  }
  emitText(socket, '\r\n');
}

/**
 * myDirProtect (express.e:8303-8317): `ps` starts as '--------' and bit x of
 * Eor(bits,15) writes pbits[x] at ps[7-x], pbits = d,e,w,r,a,p,s,h. rwed are
 * active-low (a SET bit denies), so Eor makes them read as granted; a,p,s,h
 * are active-high.
 */
export function myDirProtect(bits: number): string {
  const pbits = 'dewrapsh';
  const ps = '--------'.split('');
  const c = bits ^ 15;
  for (let x = 0; x <= 7; x++) {
    if ((c & (1 << x)) === (1 << x)) ps[7 - x] = pbits[x];
  }
  return ps.join('');
}

/** A host file's bits (owner r/w/x, delete follows write) shown the express.e way. */
function amigaProtection(mode: number): string {
  return myDirProtect(amigaProtectionOf(mode));
}

/**
 * One entry - myDirDisplay (express.e:8320-8341):
 *   ' \l\s[25] \s \s \s \r\z\d[2]:\r\z\d[2]:\r\z\d[2]\b\n'
 * The trailing h:m:s are never assigned in express, so they read 00:00:00.
 */
function displayFileInfo(socket: any, filename: string, stats: any): void {
  const size = stats.isDirectory() ? '     Dir' : String(stats.size).padStart(8);
  const date = formatLongDateTime(stats.mtime || getSystemTime());
  emitText(socket, ` ${filename.padEnd(25).slice(0, 25)} ${size} ${amigaProtection(stats.mode ?? 0)} ${date} 00:00:00\r\n`);
}
