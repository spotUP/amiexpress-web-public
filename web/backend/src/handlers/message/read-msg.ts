/**
 * The message reader - express.e readMSG (11972-12296), readit (12321-12370),
 * noMorePlus / noMoreMinus (12298-12319), displayMessage (8880-8970),
 * deleteMSG (11905-11935) and listMSGs (8820-8878), ported as written.
 *
 * express.e walks message NUMBERS: msgNum against the conference's MailStats
 * (lowestKey, highMsgNum, lowestNotDel), each header read from HeaderFile at
 * msgNum-lowestKey (loadMessageHeader, 12372). The reader this replaces built a
 * list of the messages the caller could read and stepped through that, which
 * is where "No new messages." in a conference with messages, silently skipped
 * numbers and the wrong first/last came from (sysop 2026-09-30: "far from 1:1
 * with the amiexpress sources").
 *
 * The loop keeps express.e's labels as the values of `at`: cont (the prompt),
 * passItIN (a number, + or -), goNextMsg (readit), nextMenu (a blank line,
 * then cont). Input is express.e's own lineInput / yesNo (utils/await-input),
 * so each prompt sits where the source has it.
 */
import type { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { emitText, clearTheScreen } from '../../utils/output.util';
import { formatLongDateTime } from '../../utils/date-time.util';
import { isNarrow } from '../../utils/table-format.util';
import { lineInput, yesNo } from '../../utils/await-input';
import { messageIndexManager, MsgStatus } from '../../services/MessageIndexManager';
import type { MailStat, MsgHeader } from '../../services/MessageIndexManager';
import { translationService, TranslatorMode } from '../../services/TranslationService';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';

/** What express.e keeps in globals while a conference's mail is being read. */
export interface Reader {
  conf: number;
  msgBase: number;
  stats: MailStat;
  msgNum: number;
  /** fwdFlag: 1 reading upward, -1 downward, 0 in replyPrompt (10990). */
  fwdFlag: 1 | 0 | -1;
  fwdDir: '+' | '-';
  noDirF: 0 | 1;
  /** Set once readit has run - "a message has been looked at". */
  tempFlag: 0 | 1;
  privateFlag: 0 | 1;
  nonStopMail: boolean;
  numOfZMsgs: number;
  helplist: 0 | 1 | 2;
  /** mailHeader - the header readit last loaded. */
  header?: MsgHeader;
  /** K was used: the scan pointer stays where K put it (11763). */
  kMsgFlag?: boolean;
}

const SCRNCLR = 8; // UserFlags.SCRNCLR

/** stringCompare(a,b)=RESULT_SUCCESS: the names are the same, whatever the case. */
export function sameName(a: string | undefined, b: string | undefined): boolean {
  return (a || '').toLowerCase() === (b || '').toLowerCase();
}

function confMailName(session: BBSSession): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getConfMailName } = require('./conf-mail-name');
  return getConfMailName(session) || '';
}

/** `\l\s[30]` - left-justified in 30 columns, cut at 30. */
function field30(text: string): string {
  return (text || '').slice(0, 30).padEnd(30);
}

/** The message base's directory: `<conf>/MsgBase/` (msgBaseLocation). */
function msgBaseDir(conf: number): string {
  // The writers' own path (message-file.util), so a message is read from
  // where it was saved.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMessagesDir } = require('../../utils/message-file.util');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../config');
  return getMessagesDir(conf, config.get('dataDir'));
}

/** checkScreenClear (express.e:2013): sendCLS when the caller asked for clears. */
function checkScreenClear(socket: any, session: BBSSession): void {
  if (((session.user as any)?.userFlags || 0) & SCRNCLR) emitText(socket, clearTheScreen(socket));
}

/** getMailStatFile - the conference's MailStats as they are on disk now. */
function readStats(conf: number): MailStat {
  return messageIndexManager.readMailStats(conf)
    ?? { lowestKey: 1, highMsgNum: 1, lowestNotDel: 0, pad: Buffer.alloc(6) };
}

/** loadMessageHeader (12372): the record at msgNum-lowestKey, or null. */
function loadMessageHeader(r: Reader): MsgHeader | null {
  const headers = messageIndexManager.readHeaderFile(r.conf);
  return headers[r.msgNum - r.stats.lowestKey] ?? null;
}

function isPublic(h: MsgHeader): boolean {
  return h.status === MsgStatus.NORMAL || h.status === MsgStatus.CENSORED;
}

/**
 * displayMessage (8880-8970). The header lines are express.e's own; a narrow
 * (C64) screen gets the board's one-field-per-line form of them.
 */
export interface Translation {
  mode: TranslatorMode;
  language: string;
}

export async function displayMessage(
  socket: any,
  session: BBSSession,
  r: Reader,
  h: MsgHeader,
  translation?: Translation,
): Promise<void> {
  if (h.status === MsgStatus.DELETED) {
    checkScreenClear(socket, session);
    emitText(socket, '\r\nThat message has been deleted.\r\n\r\n');
    return;
  }

  // 8898: a translated display is the body alone - no screen clear, no header,
  // and it does not mark the message received.
  if (!translation || translation.mode === TranslatorMode.TRANS_NONE) {
    showHeader(socket, session, r, h);
  }
  await showBody(socket, session, r, h, translation);
  await checkAttachedFile(socket, session, r, h.msgNumb);
}

/** 8898-8949: the header block, and the received mark. */
function showHeader(socket: any, session: BBSSession, r: Reader, h: MsgHeader): void {
  const date = formatLongDateTime(new Date(h.msgDate * 1000));
  checkScreenClear(socket, session);

  // 8902-8910: a message to EALL shows the reader's own name with (ALL).
  const to = h.toName.toLowerCase() === 'eall' ? `${confMailName(session)} (ALL)` : h.toName;
  const recvd = h.recv !== 0
    ? formatLongDateTime(new Date(h.recv * 1000))
    : (sameName(h.toName, 'ALL') ? 'N/A' : 'No');
  const status = isPublic(h) ? 'Public Message' : 'Private Message';

  if (isNarrow(session)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildMessageHeaderLines } = require('./messaging.handler');
    const lines: string[] = buildMessageHeaderLines(
      { dateStr: date, msgNumber: h.msgNumb, toDisplay: to, recvd, from: h.fromName, statusStr: status, subject: h.subject },
      true,
    );
    emitText(socket, `${lines.join('\r\n')}\r\n\r\n`);
  } else {
    emitText(socket, `\x1b[32mDate   \x1b[33m: \x1b[0m${field30(date)}   \x1b[32mNumber\x1b[33m: \x1b[0m${h.msgNumb}\r\n`);
    emitText(socket, `\x1b[32mTo     \x1b[33m: \x1b[0m${field30(to)}  `);
    emitText(socket, ` \x1b[32mRecv'd\x1b[33m: \x1b[0m${recvd}\r\n`);
    emitText(socket, `\x1b[32mFrom   \x1b[33m: \x1b[0m${field30(h.fromName)}   \x1b[32mStatus\x1b[33m: \x1b[0m${status}\r\n`);
    emitText(socket, `\x1b[32mSubject\x1b[33m: \x1b[0m${h.subject}\r\n\r\n`);
  }
  session.tempData = session.tempData || {};
  session.tempData.lineCount = (session.tempData.lineCount || 0) + 5;

  // 8943-8949: mail to this caller is marked received the first time.
  if (sameName(h.toName, confMailName(session)) && h.recv === 0) {
    h.recv = Math.floor(Date.now() / 1000);
    messageIndexManager.updateMessageHeader(r.conf, h.msgNumb, { recv: h.recv });
  }
}

/** 8951-8962: the body, paused (displayFile(..,TRUE,..)) unless non-stop. */
async function showBody(socket: any, session: BBSSession, r: Reader, h: MsgHeader, translation?: Translation): Promise<void> {
  let body = '';
  try {
    body = (amigafs.readFileSync(path.join(msgBaseDir(r.conf), String(h.msgNumb))) as Buffer).toString('latin1');
  } catch { /* displayFile of a missing file shows nothing */ }
  const lines = body.split('\n').map((line) => line.replace(/\r$/, ''));
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkForPause } = require('../../utils/flag-pause.util');
  session.tempData = session.tempData || {};
  const wasNonStop = !!session.tempData.nonStopDisplayFlag;
  const highlight = (((session.user as any)?.translatorID ?? 0) & 128) !== 0;
  if (r.nonStopMail) session.tempData.nonStopDisplayFlag = true;
  try {
    for (const line of lines) {
      const shown = translation && translation.mode !== TranslatorMode.TRANS_NONE
        ? translationService.translateText(line, translation.mode, translation.language, highlight)
        : line;
      emitText(socket, `${shown}\r\n`);
      if ((await checkForPause(socket, session)) === false) break;
    }
  } finally {
    session.tempData.nonStopDisplayFlag = wasNonStop;
  }
}

/**
 * checkAttachedFile(msgnumb, 1) - 9746. Until the Download prompt is ported
 * (plan item D5) the board still names the attached files.
 */
async function checkAttachedFile(socket: any, session: BBSSession, r: Reader, msgNumb: number): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readAttachList } = require('../../utils/message-file.util');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../../config');
    const list = await readAttachList(r.conf, msgNumb, config.get('dataDir'));
    if (list && list.filenames.length > 0) {
      emitText(socket, '\x1b[36mFiles attached\x1b[33m:\x1b[0m\r\n');
      for (const name of list.filenames) emitText(socket, `   ${name}\r\n`);
      emitText(socket, '\r\n');
    }
  } catch { /* an unreadable attach list is no attachment */ }
}

function noMorePlus(socket: any, r: Reader): void {
  if (!r.nonStopMail && r.noDirF === 0) {
    emitText(socket, `\r\nThe last message in this conference is ${r.stats.highMsgNum - 1}\r\n`);
  }
  r.nonStopMail = false;
}

function noMoreMinus(socket: any, r: Reader): void {
  if (!r.nonStopMail && r.noDirF === 0) {
    emitText(socket, `\r\nThe first message in this conference is ${r.stats.lowestNotDel}\r\n`);
  }
  r.nonStopMail = false;
}

/** readit (12321-12370). true = RESULT_SUCCESS, false = RESULT_FAILURE. */
async function readit(socket: any, session: BBSSession, r: Reader): Promise<boolean> {
  r.tempFlag = 1;
  const sysopRead = checkSecurity(session.user, ACSPermission.SYSOP_READ);
  const me = confMailName(session);

  do {
    if (r.msgNum > r.stats.highMsgNum - 1) {
      noMorePlus(socket, r);
      return false;
    }
    if (r.msgNum < r.stats.lowestKey) {
      noMoreMinus(socket, r);
      return false;
    }

    const h = loadMessageHeader(r);
    if (!h) {
      emitText(socket, '\r\nMSG Base Error!!!\r\n');
      return false;
    }
    r.header = h;

    let skip = false;
    r.privateFlag = 0;
    if ((h.status === MsgStatus.PRIVATE || h.status === MsgStatus.CENSORED) && !sysopRead) {
      if (!sameName(h.toName, me)
        && (!sameName(h.toName, 'eall') || !checkSecurity(session.user, ACSPermission.READ_PRIV_EALL))
        && (!sameName(h.toName, 'all') || !checkSecurity(session.user, ACSPermission.READ_PRIV_ALL))
        && !sameName(h.fromName, me)) {
        r.privateFlag = 1;
        if (r.noDirF !== 0) {
          skip = true;
        } else {
          emitText(socket, '\r\nThat message is Private.\r\n\r\n');
          r.nonStopMail = false;
          return true;
        }
      }
    }

    if (!skip && h.status === MsgStatus.DELETED) {
      r.privateFlag = 1;
      if (r.noDirF !== 0) {
        skip = true;
      } else {
        emitText(socket, '\r\nThat message has been deleted.\r\n\r\n');
        r.nonStopMail = false;
        r.msgNum += r.fwdFlag;
        return true;
      }
    }

    if (!skip) {
      r.numOfZMsgs++;
      await displayMessage(socket, session, r, h);
      if (r.msgNum > (session.lastMsgReadConf || 0)) session.lastMsgReadConf = r.msgNum;
      r.msgNum += r.fwdFlag;
      return true;
    }

    // nextMSG:
    if (r.msgNum > (session.lastMsgReadConf || 0)) session.lastMsgReadConf = r.msgNum;
    r.msgNum += r.fwdFlag;
  } while (!(r.msgNum > r.stats.highMsgNum || r.msgNum < r.stats.lowestKey));

  if (r.msgNum >= r.stats.highMsgNum) noMorePlus(socket, r);
  else noMoreMinus(socket, r);
  return false;
}

/** deleteMSG (11905-11935). */
async function deleteMSG(socket: any, session: BBSSession, r: Reader): Promise<boolean> {
  const h = r.header!;
  const me = confMailName(session);
  if (((session.user as any)?.secLevel ?? 0) < 210) {
    if (!sameName(h.fromName, me) && !sameName(h.toName, me)) {
      emitText(socket, '\r\nMessage not deleted, not your mail.\r\n\r\n');
      return false;
    }
  }

  const node = session.nodeId ?? 0;
  if (!messageIndexManager.acquireMailLock(r.conf, node)) {
    emitText(socket, "Can't Lock MsgBase, Message not Deleted!\r\n");
    return true;
  }
  try {
    r.stats = readStats(r.conf);
    const delMsgNum = r.msgNum - r.fwdFlag;
    if (r.stats.lowestNotDel === delMsgNum) r.stats.lowestNotDel += 1;
    messageIndexManager.writeMailStats(r.conf, r.stats);
    h.status = MsgStatus.DELETED;
    try {
      amigafs.unlinkSync(path.join(msgBaseDir(r.conf), String(delMsgNum)));
    } catch { /* DeleteFile of a file that is not there */ }
    messageIndexManager.updateMessageHeader(r.conf, delMsgNum, { status: MsgStatus.DELETED });
    emitText(socket, `\r\nMessage ${delMsgNum} deleted...\r\n`);
  } finally {
    messageIndexManager.releaseMailLock(r.conf, node);
  }
  return true;
}

/** Val(): the number a string starts with, or null when it starts with none. */
function val(text: string): number | null {
  const m = /^\s*([+-]?\d+)/.exec(text);
  return m ? parseInt(m[1], 10) : null;
}

/** loadMsg (9969-9996) of a message's own file: its lines, as the editor holds them. */
function loadMsgBody(conf: number, msgNumb: number): string[] | null {
  try {
    const text = (amigafs.readFileSync(path.join(msgBaseDir(conf), String(msgNumb))) as Buffer).toString('latin1');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadMsgLines } = require('./door-edit-file');
    return loadMsgLines(text);
  } catch {
    return null;
  }
}

/** getMoveConf(TRUE) (26990-27085). null is a failure; conf 0 means "none chosen". */
async function getMoveConf(socket: any, session: BBSSession): Promise<{ conf: number; msgBase: number } | null> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getConferences, parseMciCodes } = require('../screen.handler');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getInverse, getConfRelativeToggle } = require('../commands/user-commands.handler');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkConfAccess } = require('./message-scan.handler');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getMessageBases } = require('../command-handler/dependency-injection');

  let answer = '';
  for (;;) {
    emitText(socket, '\r\nConference Number to move to (L to List): ');
    answer = await lineInput(socket, session, 5);
    if (answer.length === 0) return { conf: 0, msgBase: 0 };
    if (answer !== 'L' && answer !== 'l') break;
    emitText(socket, '\r\n');
    emitText(socket, '                                 \x1b[32mConference List\r\n');
    emitText(socket, '\r\n');
    const list = await parseMciCodes('~CL|', session);
    emitText(socket, list?.parsed ?? '');
  }

  const conferences: Array<{ id: number; name: string }> = getConferences();
  let dest = getInverse(val(answer) ?? 0, session.user, getConfRelativeToggle(session));
  if (dest < 1) dest = 1;
  if (dest > conferences.length) dest = conferences.length;
  if (!checkConfAccess(session.user, dest)) {
    emitText(socket, '\r\nYou do not have access to the requested conference\r\n\r\n');
    return null;
  }
  const name = conferences.find((c) => c.id === dest)?.name ?? '';
  emitText(socket, `\r\nYou have chosen conference: ${name}\r\n`);

  let msgBase = 1;
  const bases: Array<{ conferenceId: number; id: number; name: string }> =
    (getMessageBases() || []).filter((b: any) => b.conferenceId === dest);
  if (bases.length > 1) {
    for (;;) {
      emitText(socket, '\r\nMessagebase Number to move to (L to List): ');
      answer = await lineInput(socket, session, 5);
      if (answer.length === 0) return { conf: 0, msgBase: 0 };
      if (answer !== 'L' && answer !== 'l') break;
      emitText(socket, '\r\n');
      emitText(socket, '                                 \x1b[32mMessagebase List\r\n');
      emitText(socket, '\r\n');
      const was = session.currentConf;
      session.currentConf = dest;
      const list = await parseMciCodes('~ML|', session);
      session.currentConf = was;
      emitText(socket, list?.parsed ?? '');
    }
    msgBase = val(answer) ?? 0;
    if (msgBase < 1) msgBase = 1;
    if (msgBase > bases.length) msgBase = bases.length;
    emitText(socket, `\r\nYou have chosen message base: ${bases[msgBase - 1]?.name ?? ''}\r\n`);
  }
  return { conf: dest, msgBase };
}

/** moveMSG (11827-11903). true = RESULT_SUCCESS. */
async function moveMSG(socket: any, session: BBSSession, r: Reader): Promise<boolean> {
  const chosen = await getMoveConf(socket, session);
  if (!chosen) return false;
  if (chosen.conf === 0) return true;

  if (chosen.conf === r.conf && chosen.msgBase === r.msgBase) {
    emitText(socket, '\r\nYou have not changed the message location\n');
    return false;
  }

  emitText(socket, '\r\nMove message (y/n)? ');
  if (!(await yesNo(socket, session, 0))) return false;

  const h = r.header!;
  const lines = loadMsgBody(r.conf, h.msgNumb);
  if (lines) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { writeMessageFile, formatMessageDate, getAttachListPath } = require('../../utils/message-file.util');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { config } = require('../../config');
    const dataDir = config.get('dataDir');
    let newNumb: number;
    try {
      // saveNewMSG(gfh,mh,FALSE): the header as it was - sender, date, status.
      newNumb = await writeMessageFile(chosen.conf, chosen.msgBase, {
        from: h.fromName,
        to: h.toName,
        subject: h.subject,
        date: formatMessageDate(new Date(h.msgDate * 1000)),
        body: lines.join('\n'),
        status: h.status,
      }, dataDir, session.nodeId ?? 0);
    } catch {
      emitText(socket, 'Failed!\r\n\r\n');
      return false;
    }
    if (h.recv !== 0) messageIndexManager.updateMessageHeader(chosen.conf, newNumb, { recv: h.recv });
    emitText(socket, `Message Number ${newNumb}...done!\r\n\r\n`);

    // 11890-11900 CASE 3: the attach list goes with the message.
    const from = getAttachListPath(r.conf, h.msgNumb, dataDir);
    try {
      const list = amigafs.readFileSync(from);
      amigafs.writeFileSync(getAttachListPath(chosen.conf, newNumb, dataDir), list);
      amigafs.unlinkSync(from);
    } catch { /* no attach list */ }
  }

  await deleteMSG(socket, session, r);
  return true;
}

/** The caller's MAILSCAN_ALL flag for this conference (confBase.handle[0]). */
async function mailScanAll(session: BBSSession, r: Reader): Promise<boolean> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadMsgPointers, validatePointers } = require('../../utils/message-pointers.util');
    const confBase = await loadMsgPointers((session.user as any).id, r.conf, r.msgBase);
    const validated = validatePointers(confBase, r.stats);
    return (validated.scanFlags & (1 << 7)) !== 0;
  } catch {
    return false;
  }
}

/** listMSGs (8820-8878): the caller's mail from a starting number. */
async function listMSGs(socket: any, session: BBSSession, r: Reader): Promise<void> {
  session.tempData = session.tempData || {};
  session.tempData.nonStopDisplayFlag = false;
  const oldMsgNum = r.msgNum;

  emitText(socket, `\x1b[32mStarting message \x1b[33m[\x1b[0m${r.stats.lowestNotDel}\x1b[33m]\x1b[0m: `);
  const answer = await lineInput(socket, session, 10);
  if (answer.length === 0) {
    r.msgNum = r.stats.lowestNotDel;
  } else {
    // Val(): the leading number, and nothing when there is none.
    const m = /^\s*([+-]?\d+)/.exec(answer);
    if (!m) {
      r.msgNum = oldMsgNum;
      return;
    }
    r.msgNum = parseInt(m[1], 10);
  }

  const me = confMailName(session);
  const all = await mailScanAll(session, r);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkForPause } = require('../../utils/flag-pause.util');
  let mailFlag = false;
  do {
    if (r.msgNum >= r.stats.highMsgNum) break;
    const h = loadMessageHeader(r);
    if (h && h.status !== MsgStatus.DELETED
      && (sameName(h.toName, me) || sameName(h.toName, 'eall') || (sameName(h.toName, 'all') && all))) {
      if (!mailFlag) {
        emitText(socket, '\r\n\r\n');
        emitText(socket, '\x1b[32mMsg    Type     From                           Subject              \r\n');
        emitText(socket, '\x1b[33m------ -------  -----------------------------  ---------------------\r\n');
        emitText(socket, '\x1b[0m');
        session.tempData.lineCount = (session.tempData.lineCount || 0) + 4;
        mailFlag = true;
      }
      const type = isPublic(h) ? 'Public ' : 'Private';
      const num = String(h.msgNumb).padStart(6, '0');
      emitText(socket, `${num} ${type}  ${h.fromName.slice(0, 29).padEnd(29)}  ${h.subject.slice(0, 21).padEnd(21)}  \x1b[0m\r\n`);
      if ((await checkForPause(socket, session)) === false) {
        r.msgNum = oldMsgNum;
        return;
      }
    }
    r.msgNum++;
  } while (r.msgNum <= r.stats.highMsgNum);
  r.msgNum = oldMsgNum;
}

/**
 * The Msg. Options prompt and its help lists: readMSG's (12007-12065) and
 * replyPrompt's (10991-11042). They differ in what the prompt names - the
 * reading span, or the message number - in the help list's closing `?` or
 * ` >: `, and in one capital letter.
 */
function readerPrompt(socket: any, session: BBSSession, r: Reader, loop: 'read' | 'reply'): void {
  let where: string;
  if (loop === 'reply') {
    where = String(r.msgNum);
  } else {
    const high = r.stats.highMsgNum - 1;
    where = r.fwdFlag === 1 ? `${r.msgNum}${r.fwdDir}${high}` : `${r.msgNum}${r.fwdDir}${r.stats.lowestKey}`;
    if (r.msgNum > high || r.msgNum < r.stats.lowestKey) where = 'QUIT';
  }
  const ask = loop === 'reply' ? ' >: ' : '? ';

  const del = checkSecurity(session.user, ACSPermission.DELETE_MESSAGE);
  const move = checkSecurity(session.user, ACSPermission.SYSOP_READ);
  if (r.helplist === 0) {
    if (r.nonStopMail) return;
    emitText(socket, '\r\n\x1b[32mMsg. Options: \x1b[33mA\x1b[36m'
      + (del ? ',\x1b[33mD' : '')
      + (move ? ',\x1b[33mM' : '')
      + '\x1b[36m,\x1b[33mF\x1b[36m,\x1b[33mR\x1b[36m,\x1b[33mL\x1b[36m,\x1b[33mQ'
      + `\x1b[36m,\x1b[33m?\x1b[36m,\x1b[33m??\x1b[36m,\x1b[32m<\x1b[33mCR\x1b[32m> \x1b[32m(\x1b[0m ${where}\x1b[32m )\x1b[0m${loop === 'reply' ? ' >: ' : '>: '}`);
    return;
  }
  const tail = `\r\n\x1b[32m<\x1b[33mCR\x1b[32m>\x1b[0m=\x1b[33mNext \x1b[32m(\x1b[0m ${where}\x1b[32m )\x1b[0m${ask}`;
  let out = '\x1b[33mA\x1b[32m>\x1b[36mgain\x1b[0m';
  if (r.helplist === 1) {
    if (del) out += '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Message\x1b[0m';
    if (move) out += '\r\n\x1b[33mM\x1b[32m>\x1b[36move\x1b[0m';
    out += '\r\n\x1b[33mF\x1b[32m>\x1b[36morward\x1b[0m';
    out += '\r\n\x1b[33mR\x1b[32m>\x1b[36meply\x1b[0m';
    out += '\r\n\x1b[33mL\x1b[32m>\x1b[36mist\x1b[0m';
    out += '\r\n\x1b[33mQ\x1b[32m>\x1b[36muit\x1b[0m';
  } else {
    if (del) out += '\r\n\x1b[33mD\x1b[32m>\x1b[36melete Message\x1b[0m';
    if (move) out += '\r\n\x1b[33mM\x1b[32m>\x1b[36move Message\x1b[0m';
    out += '\r\n\x1b[33mF\x1b[32m>\x1b[36morward\x1b[0m';
    out += '\r\n\x1b[33mR\x1b[32m>\x1b[36meply\x1b[0m';
    out += '\r\n\x1b[33mL\x1b[32m>\x1b[36mist all messages\x1b[0m';
    out += '\r\n\x1b[33mNS\x1b[32m>\x1b[36m Non-stop mode\x1b[0m';
    if (checkSecurity(session.user, ACSPermission.TRANSLATION)) {
      if (translationDiffers(session)) out += '\r\n\x1b[33mT\x1b[32m>\x1b[36mranslate\x1b[0m';
      out += '\r\n\x1b[33mTS\x1b[32m>\x1b[36m Select Language & Translate\x1b[0m';
      out += `\r\n\x1b[33mT!\x1b[32m>\x1b[36m Translate ${loop === 'reply' ? 'To Each' : 'to each'} language\x1b[0m`;
      out += '\r\n\x1b[33mT*\x1b[32m>\x1b[36m Translate from each language\x1b[0m';
    }
    out += '\r\n\x1b[33mK\x1b[32m>\x1b[36meep and quit\x1b[0m';
    if (checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
      out += '\r\n\x1b[33mE\x1b[32m>\x1b[36m Edit Emacs Message\x1b[0m';
      out += '\r\n\x1b[33mEH\x1b[32m>\x1b[36m Edit Message Header\x1b[0m';
      out += '\r\n\x1b[33mEM\x1b[32m>\x1b[36m Edit Message Body\x1b[0m';
    }
    if (checkSecurity(session.user, ACSPermission.ACCOUNT_EDITING)) {
      out += '\r\n\x1b[33mU\x1b[32m>\x1b[36mser Account Edit\x1b[0m';
    }
    out += '\r\n\x1b[33mQ\x1b[32m>\x1b[36muit\x1b[0m';
  }
  emitText(socket, out + tail);
  r.helplist = 0;
}

/** userLanguage differs from hostLanguage (12045). */
function translationDiffers(session: BBSSession): boolean {
  return translationService.getUserLanguage((session.user as any)?.id || 0) !== translationService.getHostLanguage();
}

/** doPause() as a call that returns when the caller has answered it. */
function doPause(socket: any, session: BBSSession): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { doPause: gate } = require('../screen.handler');
  return new Promise<void>((resolve) => gate(socket, session, () => resolve()));
}

/** chooseTranslator (11391-11427). */
async function chooseTranslator(socket: any, session: BBSSession): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { displayScreen } = require('../screen.handler');
  let shown = false;
  try {
    shown = await displayScreen(socket, session, 'LANGUAGES', true, true);
  } catch { /* no screen is the same as a screen that is not there */ }
  if (!shown) emitText(socket, 'Languages list unavailable\r\n\r\n');

  const user = session.user as any;
  for (;;) {
    emitText(socket, '\r\nLanguage (num) >: ');
    const answer = await lineInput(socket, session, 5);
    if (answer.length === 0) return;
    if (answer[0] === 'H' || answer[0] === 'h') {
      user.translatorID = ((user.translatorID ?? 0) ^ 128);
      emitText(socket, (user.translatorID & 128) ? 'WORD HIGHLIGHT ON' : 'WORD HIGHLIGHT OFF');
      continue;
    }
    const n = parseInt(answer, 10);
    if (!(n > 0)) return;
    const language = translationService.getAllLanguages()[n - 1];
    if (language) {
      translationService.setUserLanguage(user?.id || 0, language);
      user.translatorID = ((user.translatorID ?? 0) & 128) | n;
    }
    return;
  }
}

/** T, TS, T! and T* (12104-12143). */
async function translate(socket: any, session: BBSSession, r: Reader, str: string): Promise<void> {
  await translationService.initialize();
  const host = translationService.getHostLanguage();
  const lower = str.toLowerCase();
  if (lower === 't!' || lower === 't*') {
    for (const language of translationService.getAllLanguages()) {
      if (language === host) continue;
      const toHost = lower === 't*';
      emitText(socket, `\r\nTranslating ${toHost ? 'from' : 'to'} ${language}\r\n\r\n`);
      await displayMessage(socket, session, r, r.header!, {
        mode: toHost ? TranslatorMode.TRANS_DEFINED_TO_HOST : TranslatorMode.TRANS_HOST_TO_DEFINED,
        language,
      });
      await doPause(socket, session);
    }
    return;
  }
  if (lower === 'ts') await chooseTranslator(socket, session);
  await displayMessage(socket, session, r, r.header!, {
    mode: TranslatorMode.TRANS_HOST_TO_DEFINED,
    language: translationService.getUserLanguage((session.user as any)?.id || 0),
  });
}

/**
 * The commands that act on the message just read, and their outcome as the
 * label express.e jumps to. Filled by the stage that ports each of them.
 */
export type ReaderJump = 'cont' | 'goNextMsg' | 'nextMenu' | 'fallthrough' | 'exit';

/**
 * E, EH, EM (12178-12190, 11131-11146). Plain E is SysCmd EDITOR in express.e;
 * this board has none, and the sysop keeps E as the line editor, as EM.
 */
async function editCommand(socket: any, session: BBSSession, r: Reader, str: string): Promise<void> {
  if (str[1] === 'H' || str[1] === 'h') {
    await editHeader(socket, session, r);
    return;
  }
  await editBody(socket, session, r);
}

/** captureRealAndInternetNames(currentConf,currentMsgBase)=RESULT_SUCCESS. */
async function captureNames(socket: any, session: BBSSession): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const names = require('./msg-names');
  const stat = await names.captureRealAndInternetNames(
    socket, session, session.currentConf || 1, session.currentMsgBase || 1,
  );
  return stat === names.RESULT_SUCCESS;
}

/** The `(---...---)` rule over a To: prompt (msgToHeader 10019, replyToMSG 9880). */
function headerRule(session: BBSSession): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { messageRule } = require('../../utils/table-format.util');
  return messageRule(session, 'headerBox');
}

function toIndent(session: BBSSession): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { messageIndent } = require('../../utils/table-format.util');
  return messageIndent(session, 'to');
}

const SUBJECT_PROMPT = '\x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mBlank\x1b[32m)\x1b[0m=\x1b[33mabort\x1b[32m?\x1b[0m ';

/** forwardMSG (9807-9871). */
async function forwardMSG(socket: any, session: BBSSession, r: Reader): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const names = require('./msg-names');
  const h = r.header!;
  const frm = h.toName;
  const me = confMailName(session);

  // msgToHeader (10017-10020)
  emitText(socket, `\r\n${headerRule(session)}\r\n`);
  emitText(socket, `${toIndent(session)}\x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m `);
  const typed = await lineInput(socket, session, 30);
  const valid = await names.getAValidName(socket, session, typed, 'ALL');
  if (valid.name.length === 0) return;
  let toName: string = valid.name;
  toName = names.checkToForward(socket, session, toName, true).name;

  emitText(socket, SUBJECT_PROMPT);
  const subject = (await lineInput(socket, session, 30, h.subject)).slice(0, 30);
  if (subject.length === 0) {
    emitText(socket, '\r\n');
    return;
  }

  emitText(socket, '         \x1b[36mPrivate ');
  let status: number;
  if (await yesNo(socket, session, 2)) {
    status = MsgStatus.PRIVATE;
  } else if (checkSecurity(session.user, ACSPermission.CENSORED) || h.status === MsgStatus.CENSORED) {
    status = MsgStatus.CENSORED;
  } else {
    status = MsgStatus.NORMAL;
  }

  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE) && sameName(frm, me)) {
    emitText(socket, 'Delete original message ');
    if (await yesNo(socket, session, 2)) await deleteMSG(socket, session, r);
  }

  emitText(socket, '\r\nSaving...');
  // 9865: loadMsg of the message's own file - after a delete above there is
  // none, and nothing is saved (express.e does the same).
  const lines = loadMsgBody(r.conf, h.msgNumb);
  if (lines) await saveNewMSG(socket, session, r, { toName, subject, status }, lines);
}

/** saveNewMSG(gfh,mh) with update=TRUE (10640-10740): now, from this caller, unread. */
async function saveNewMSG(
  socket: any,
  session: BBSSession,
  r: Reader,
  mh: { toName: string; subject: string; status: number },
  lines: string[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { writeMessageFile, formatMessageDate } = require('../../utils/message-file.util');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../../config');
  try {
    const n = await writeMessageFile(r.conf, r.msgBase, {
      from: confMailName(session),
      to: mh.toName,
      subject: mh.subject,
      date: formatMessageDate(new Date()),
      body: lines.join('\n'),
      status: mh.status,
    }, config.get('dataDir'), session.nodeId ?? 0);
    emitText(socket, `Message Number ${n}...done!\r\n\r\n`);
    r.stats = readStats(r.conf);
  } catch (err) {
    const locked = err instanceof Error && err.message.startsWith('MsgBase locked');
    emitText(socket, locked
      ? '\r\nERROR! Another task has the MsgBase locked!\r\nMessage has not been saved!\r\n\r\n'
      : 'Failed!\r\n\r\n');
  }
}

/** replyToMSG (9874-9907). */
async function replyToMSG(socket: any, session: BBSSession, r: Reader): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const names = require('./msg-names');
  const h = r.header!;
  const frm = h.toName;
  const me = confMailName(session);

  emitText(socket, `${headerRule(session)}\r\n`);
  let toName = h.fromName;
  emitText(socket, `${toIndent(session)}\x1b[36mTo\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33mALL\x1b[32m'\x1b[32m?\x1b[0m ${toName}\r\n`);
  toName = names.checkToForward(socket, session, toName, true).name;

  emitText(socket, SUBJECT_PROMPT);
  const subject = (await lineInput(socket, session, 30, h.subject)).slice(0, 30);
  if (subject.length === 0) return;

  // enterMSG with replyFlag=1: Private, Quote in Reply, the editor, the save.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { enterReply } = require('./message-entry.handler');
  const saved = await new Promise<boolean>((resolve) => {
    enterReply(socket, session, {
      toUser: toName,
      subject,
      parentId: h.msgNumb,
      parentMsgStatus: h.status,
      onFinished: (ok: boolean) => resolve(ok),
    });
  });
  r.stats = readStats(r.conf);
  if (!saved) return;

  if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE) && sameName(frm, me)) {
    emitText(socket, 'Delete original message ');
    if (await yesNo(socket, session, 2)) await deleteMSG(socket, session, r);
  }
}

/** editHeader (11602-11650). */
async function editHeader(socket: any, session: BBSSession, r: Reader): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const names = require('./msg-names');
  const h = r.header!;
  let status = MsgStatus.NORMAL as number;
  emitText(socket, '\r\n');
  emitText(socket, `     \x1b[36mFrom\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33m${h.fromName}\x1b[32m'\x1b[32m?\x1b[0m `);
  const from = await names.getAValidName(socket, session, await lineInput(socket, session, 30), h.fromName);
  if (from.name.length === 0) return;
  if (from.flag) {
    emitText(socket, 'Invalid From Name. Aborting.\r\n');
    return;
  }
  emitText(socket, `     \x1b[36m  To\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33m${h.toName}\x1b[32m'\x1b[32m?\x1b[0m `);
  const to = await names.getAValidName(socket, session, await lineInput(socket, session, 30), h.toName);
  if (to.name.length === 0) return;
  emitText(socket, `  \x1b[36mSubject\x1b[33m: \x1b[32m(\x1b[33mEnter\x1b[32m)\x1b[0m=\x1b[32m'\x1b[33m${h.subject}\x1b[32m'\x1b[32m?\x1b[0m `);
  const typedSubject = await lineInput(socket, session, 30);
  const subject = typedSubject.length > 0 && typedSubject[0] >= ' ' ? typedSubject.slice(0, 30) : h.subject;

  if (!to.flag) {
    emitText(socket, '         \x1b[36mPrivate ');
    status = (await yesNo(socket, session, 2)) ? MsgStatus.PRIVATE : MsgStatus.NORMAL;
  }

  Object.assign(h, { fromName: from.name, toName: to.name, subject, status, recv: 0 });
  messageIndexManager.updateMessageHeader(r.conf, h.msgNumb, {
    fromName: from.name, toName: to.name, subject, status, recv: 0,
  });
}

/**
 * U (12196-12211; replyPrompt 11154-11176): the sender's account, in the
 * account editor, then the message again. readMSG tries SysCmd ACCOUNTS first.
 */
async function editUser(socket: any, session: BBSSession, r: Reader, loop: 'read' | 'reply'): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const names = require('./msg-names');
  const h = r.header!;
  const slot = names.findUserFromName(1, names.confNameTypeOf(session), h.fromName, false);
  if (!slot) {
    emitText(socket, 'User no longer exists.\r\n');
    return;
  }
  const account = names.loadAccount(slot);
  if (!account) {
    emitText(socket, 'Warning, error while loading account\r\n');
    return;
  }
  emitText(socket, clearTheScreen(socket));
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { callersLog } = require('../../server/database-helpers');
  await callersLog((session.user as any)?.id ?? null, (session.user as any)?.username ?? '', '\tAccount editing from mail.', undefined, session.nodeId ?? 1)
    .catch(() => undefined);

  let ran = false;
  if (loop === 'read') {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { hasSysCommand, runSysCommandInFlow } = require('../command-execution.handler');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { RESULT_SUCCESS } = require('../../constants/command-results');
    if (hasSysCommand('ACCOUNTS')) {
      ran = (await runSysCommandInFlow(socket, session, 'ACCOUNTS', String(slot))) === RESULT_SUCCESS;
    }
  }
  if (!ran) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { handleEditUserAccount } = require('../user/account.handler');
    await new Promise<void>((resolve) => {
      session.accountEditDone = resolve;
      handleEditUserAccount(socket, session, account.keys.userName);
    });
  }
  emitText(socket, clearTheScreen(socket));
  await displayMessage(socket, session, r, h);
}

/** EM / E: loadMsg, edit(), saveMsg on the message's own file (12182-12188). */
async function editBody(socket: any, session: BBSSession, r: Reader): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { editFileForDoor } = require('./door-edit-file');
  await editFileForDoor(socket, session, path.join(msgBaseDir(r.conf), String(r.header!.msgNumb)));
}

/**
 * readMSG - the R command's reader, from its parameters to its return. Resolves
 * when the caller leaves it (Q, or reading past either end).
 */
export async function readMSG(socket: any, session: BBSSession, params: string[]): Promise<void> {
  const conf = session.currentConf || 1;
  const stats = readStats(conf);
  const r: Reader = {
    conf,
    msgBase: session.currentMsgBase || 1,
    stats,
    msgNum: (session.lastMsgReadConf || 0) + 1,
    fwdFlag: 1,
    fwdDir: '+',
    noDirF: 0,
    tempFlag: 0,
    privateFlag: 0,
    nonStopMail: false,
    numOfZMsgs: 0,
    helplist: 0,
  };
  if (r.msgNum < stats.lowestKey) r.msgNum = stats.lowestKey;
  session.subState = LoggedOnSubState.MSG_READER_NAV;

  emitText(socket, '\r\n');
  r.nonStopMail = params.includes('NS');

  let str = '';
  let at: 'cont' | 'passItIN' | 'goNextMsg' | 'nextMenu' = 'cont';

  if (params.includes('S')) {
    if (r.msgNum > stats.highMsgNum - 1) {
      emitText(socket, 'No new messages.\r\n');
      emitText(socket, '\r\n');
      return;
    }
    at = 'goNextMsg';
  } else if (params.length > 0) {
    const first = params[0];
    if (first === '-' || first === '+' || /^\d/.test(first)) {
      str = first;
      at = 'passItIN';
    }
  }

  for (;;) {
    if (at === 'cont') {
      readerPrompt(socket, session, r, 'read');
      if (!r.nonStopMail) {
        str = await lineInput(socket, session, 10);
        emitText(socket, '\r\n'); // 12068
      }

      if (str.toLowerCase() === '??') { r.helplist = 2; at = 'cont'; continue; }
      if (str[0] === '?') { r.helplist = 1; at = 'cont'; continue; }
      if (/^ns/i.test(str)) r.nonStopMail = true;
      if (str.length === 0 || r.nonStopMail) { r.noDirF = 1; at = 'goNextMsg'; }
      else {
        const next = await command(socket, session, r, str);
        if (next === 'exit') return;
        at = next === 'fallthrough' ? 'passItIN' : next;
        if (at === 'cont') continue;
      }
    }

    if (at === 'passItIN') {
      if (!r.nonStopMail) {
        r.noDirF = 0;
      } else {
        r.noDirF = 1;
        r.fwdFlag = 1;
        r.fwdDir = '+';
      }
      let s = str;
      let jumped = false;
      if (s.endsWith('+')) {
        if (r.fwdFlag === -1) r.msgNum += 2;
        r.noDirF = 1;
        r.fwdFlag = 1;
        r.fwdDir = '+';
        if (s.trim()[0] === '+') jumped = true;
        else s = s.slice(0, -1) + ' ';
      }
      if (!jumped && s.endsWith('-')) {
        if (r.fwdFlag === 1) {
          r.msgNum -= 1;
          r.msgNum -= r.tempFlag;
        }
        r.noDirF = 1;
        r.fwdFlag = -1;
        r.fwdDir = '-';
        if (s.trim()[0] === '-') jumped = true;
        else s = s.slice(0, -1) + ' ';
      }
      if (jumped) {
        at = 'goNextMsg';
      } else {
        const t = s.trim();
        if (/^\d/.test(t)) {
          r.msgNum = parseInt(t, 10);
          at = 'goNextMsg';
        } else {
          at = 'nextMenu';
        }
      }
    }

    if (at === 'goNextMsg') {
      checkScreenClear(socket, session);
      if (!(await readit(socket, session, r))) {
        emitText(socket, '\r\n');
        return;
      }
      at = 'nextMenu';
    }

    if (at === 'nextMenu') {
      emitText(socket, '\r\n');
      at = 'cont';
    }
  }
}

/**
 * One command at the prompt (12087-12229), after ?, ??, NS and <CR> have been
 * taken. Returns the label express.e jumps to; 'fallthrough' is passItIN.
 */
async function command(socket: any, session: BBSSession, r: Reader, str: string): Promise<ReaderJump> {
  const first = str[0].toLowerCase();

  if (r.tempFlag) {
    const h = r.header!;
    const me = confMailName(session);
    const allowed = r.privateFlag === 0 || sameName(h.toName, me) || sameName(h.fromName, me)
      || checkSecurity(session.user, ACSPermission.SYSOP_READ);
    if (allowed) {
      switch (first) {
        case 'k':
          // 12094-12101: unread again, and the reader carries on.
          keepUnread(r, session);
          r.kMsgFlag = true;
          r.noDirF = 1;
          break;
        case 'f':
          if (await captureNames(socket, session)) await forwardMSG(socket, session, r);
          r.noDirF = 1;
          return 'nextMenu';
        case 'r':
          if (await captureNames(socket, session)) await replyToMSG(socket, session, r);
          r.noDirF = 1;
          return 'goNextMsg';
        case 'a':
          await displayMessage(socket, session, r, h);
          return 'nextMenu';
        case 't':
          if (checkSecurity(session.user, ACSPermission.TRANSLATION)) await translate(socket, session, r, str);
          return 'nextMenu';
        case 'm':
          if (checkSecurity(session.user, ACSPermission.SYSOP_READ) && (await moveMSG(socket, session, r))) {
            r.noDirF = 1;
            return 'goNextMsg';
          }
          break;
        case 'd':
          if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE)) {
            await deleteMSG(socket, session, r);
            r.noDirF = 1;
            return 'goNextMsg';
          }
          break;
        default:
          break;
      }
    }

    if (first === 'e' && checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
      await editCommand(socket, session, r, str);
      await displayMessage(socket, session, r, h);
      return 'nextMenu';
    }

    if (first === 'u' && checkSecurity(session.user, ACSPermission.ACCOUNT_EDITING)) {
      await editUser(socket, session, r, 'read');
      return 'nextMenu';
    }
  }

  if (first === 'l') {
    await listMSGs(socket, session, r);
    return 'nextMenu';
  }
  if (first === 'q') return 'exit';
  return 'fallthrough';
}

/**
 * The R command's reader, started from the command: it runs until the caller
 * leaves it, then the read pointer is kept and the menu comes back (express.e
 * internalCommandR -> callMsgFuncs(MAIL_READ) -> readMSG, 25518).
 */
export function startReadMSG(socket: any, session: BBSSession, params: string): void {
  const list = params.trim() ? params.trim().split(/\s+/) : [];
  void (async () => {
    try {
      await readMSG(socket, session, list);
    } catch (err) {
      console.error('[readMSG] reader failed:', err);
      emitText(socket, '\r\n');
    }
    await leaveReader(socket, session);
  })();
}

async function leaveReader(socket: any, session: BBSSession): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { _getDb } = require('./messaging.handler');
    await _getDb('readMSG').updateReadPointer(
      (session.user as any).id, session.currentConf || 1, session.currentMsgBase || 1, session.lastMsgReadConf || 0,
    );
  } catch (err) {
    console.error('[readMSG] could not keep the read pointer:', err);
  }
  session.inputWaiter = undefined;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
  session.menuPause = false;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { advanceDisplayFlow } = require('../command.handler');
  await advanceDisplayFlow(socket, session);
}

/**
 * replyPrompt (10982-11209): the loop after each message a mail scan shows.
 * RESULT_SUCCESS goes on to the next new message; RESULT_FAILURE (Q) stops
 * the scan of this message base.
 */
export async function replyPrompt(socket: any, session: BBSSession, r: Reader): Promise<'success' | 'failure'> {
  r.helplist = 0;
  const me = confMailName(session);
  for (;;) {
    r.fwdFlag = 0; // 10990 - delMsgNum is msgNum itself
    readerPrompt(socket, session, r, 'reply');
    let str = '';
    if (!r.nonStopMail) {
      str = await lineInput(socket, session, 10);
      emitText(socket, '\r\n'); // 11044
    }
    if (str.toLowerCase() === '??') { r.helplist = 2; continue; }
    if (str[0] === '?') { r.helplist = 1; continue; }
    if (/^ns/i.test(str)) r.nonStopMail = true;
    if (str.length === 0 || r.nonStopMail) return 'success';

    const h = r.header!;
    const first = str[0].toLowerCase();
    const mineOrPublic = r.privateFlag === 0 || sameName(h.toName, me);

    if (first === 'a') {
      await displayMessage(socket, session, r, h);
      continue;
    }
    if (checkSecurity(session.user, ACSPermission.TRANSLATION) && first === 't') {
      await translate(socket, session, r, str);
      continue;
    }
    if (checkSecurity(session.user, ACSPermission.SYSOP_READ) && first === 'm') {
      if (await moveMSG(socket, session, r)) return 'success';
    }
    if (checkSecurity(session.user, ACSPermission.DELETE_MESSAGE) && first === 'd') {
      if (mineOrPublic) {
        await deleteMSG(socket, session, r);
        return 'success';
      }
      emitText(socket, 'Not your message.\r\n');
      continue;
    }
    if (first === 'k') {
      if (mineOrPublic) {
        keepUnread(r, session);
        r.kMsgFlag = true;
        return 'success';
      }
      emitText(socket, 'Not your message.\r\n');
      continue;
    }
    if (first === 'e' && checkSecurity(session.user, ACSPermission.MESSAGE_EDIT)) {
      await editCommand(socket, session, r, str);
      await displayMessage(socket, session, r, h);
      continue;
    }
    if (first === 'u' && checkSecurity(session.user, ACSPermission.ACCOUNT_EDITING)) {
      await editUser(socket, session, r, 'reply');
      continue;
    }
    if (first === 'f') {
      if (mineOrPublic || /^eall$/i.test(h.toName)) {
        if (await captureNames(socket, session)) await forwardMSG(socket, session, r);
      } else {
        emitText(socket, 'Not your message.\r\n');
      }
      continue;
    }
    if (first === 'l') {
      await listMSGs(socket, session, r);
      continue;
    }
    if (first === 'q') {
      emitText(socket, '\r\n');
      return 'failure';
    }
    if (first === 'r') {
      if (mineOrPublic || /^eall$/i.test(h.toName)) {
        if (await captureNames(socket, session)) {
          await replyToMSG(socket, session, r);
          return 'success';
        }
      } else {
        emitText(socket, 'Not your message.\r\n');
        continue;
      }
    }
    emitText(socket, 'No such command!!\r\n');
  }
}

/** K (12094-12101, 11122-11129): the message is unread again. */
function keepUnread(r: Reader, session: BBSSession): void {
  const h = r.header!;
  h.recv = 0;
  messageIndexManager.updateMessageHeader(r.conf, h.msgNumb, { recv: 0 });
  const read = session.lastNewReadConf || 0;
  if (read >= h.msgNumb) session.lastNewReadConf = read - 1;
  if (r.stats.lowestNotDel >= h.msgNumb) session.lastNewReadConf = r.stats.lowestNotDel;
}

/**
 * searchNewMail (11651-11760): this message base's mail for the caller that
 * has not been received. `scanning` is express.e's currentConf=0 - a scan of
 * every conference (logon, MS), which prints the conference line and the
 * table; a join scan prints only "Found Mail!".
 */
export async function searchNewMail(
  socket: any,
  session: BBSSession,
  conf: number,
  msgBase: number,
  scanning: { confName: string; msgBaseName: string; msgBaseNum: number } | null,
): Promise<'success' | 'failure'> {
  const stats = readStats(conf);
  const r: Reader = {
    conf, msgBase, stats,
    msgNum: 0, fwdFlag: 1, fwdDir: '+', noDirF: 0, tempFlag: 0, privateFlag: 0,
    nonStopMail: false, numOfZMsgs: 0, helplist: 0, kMsgFlag: false,
  };
  session.tempData = session.tempData || {};

  if (stats.highMsgNum < (session.lastNewReadConf || 0)) session.lastNewReadConf = stats.lowestKey;

  if (scanning) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { scanningConferenceLine } = require('./message-scan.handler');
    if (scanning.msgBaseNum === 1) emitText(socket, scanningConferenceLine(scanning.confName));
    if (scanning.msgBaseName.length > 0) {
      if (scanning.msgBaseNum === 1) emitText(socket, '\r\n');
      emitText(socket, ` \x1b[32mMessage Base\x1b[33m: \x1b[0m${scanning.msgBaseName} - `);
    }
  }

  r.msgNum = session.lastNewReadConf || 0;
  if (r.msgNum <= 0) session.lastNewReadConf = r.msgNum = stats.lowestKey;
  if (r.msgNum < stats.lowestKey) r.msgNum = stats.lowestKey;
  if (r.msgNum >= stats.highMsgNum) {
    emitText(socket, scanning ? 'No mail today!\r\n' : '\r\n');
    if (!session.tempData.nonStopDisplayFlag) session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;
    return 'success';
  }

  const me = confMailName(session);
  const all = await mailScanAll(session, r);
  const isForMe = (h: MsgHeader): boolean =>
    sameName(h.toName, me) || sameName(h.toName, 'eall') || (sameName(h.toName, 'all') && all);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkForPause } = require('../../utils/flag-pause.util');

  let mailFlag = false;
  let displayMsg = 0;
  do {
    if (r.msgNum >= stats.highMsgNum) break;
    const h = loadMessageHeader(r);
    if (h && h.status !== MsgStatus.DELETED && isForMe(h) && h.recv === 0) {
      if (scanning) {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { buildMailScanRow } = require('./message-scan.handler');
        const narrow = isNarrow(session);
        if (!mailFlag) {
          displayMsg = r.msgNum;
          emitText(socket, '\r\n\r\n');
          if (narrow) {
            // A C64 row cannot hold 29/21 columns; the board's stacked form.
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const { narrowRule } = require('../../utils/table-format.util');
            emitText(socket, `\x1b[32mMsg    Type\r\n\x1b[33m${narrowRule()}\r\n`);
          } else {
            emitText(socket, '\x1b[32mType     From                           Subject                Msg    \r\n');
            emitText(socket, '\x1b[33m-------  -----------------------------  ---------------------  -------\r\n');
          }
          emitText(socket, '\x1b[0m');
          if (!session.tempData.nonStopDisplayFlag) session.tempData.lineCount = (session.tempData.lineCount || 0) + 4;
          mailFlag = true;
        }
        const rows: string[] = buildMailScanRow(
          { isPrivate: !isPublic(h), from: h.fromName, subject: h.subject, msgNum: h.msgNumb }, narrow,
        );
        emitText(socket, rows.map((row) => `${row}\r\n`).join(''));
        if ((await checkForPause(socket, session)) === false) return 'success';
      } else if (!mailFlag) {
        displayMsg = r.msgNum;
        mailFlag = true;
      }
    }
    r.msgNum++;
  } while (r.msgNum <= stats.highMsgNum);

  if (!mailFlag) {
    session.lastNewReadConf = r.msgNum;
    emitText(socket, scanning ? 'No mail today!\r\n' : '\r\n');
    return 'success';
  }

  if (!scanning) emitText(socket, '\r\nFound Mail!');
  emitText(socket, '\r\nWould you like to read it now ');
  const yes = await yesNo(socket, session, 1);
  emitText(socket, '\r\n');
  if (!yes) return 'success';

  // Reading: keys belong to replyPrompt's lineInput, and one that arrives
  // between prompts is dropped (command.handler's MSG_READER_NAV guard).
  const was = session.subState;
  session.subState = LoggedOnSubState.MSG_READER_NAV;
  try {
    r.msgNum = displayMsg;
    while (r.msgNum < stats.highMsgNum) {
      const h = loadMessageHeader(r);
      if (h && h.status !== MsgStatus.DELETED && isForMe(h)) {
        r.header = h;
        await displayMessage(socket, session, r, h);
        const outcome = await replyPrompt(socket, session, r);
        if (!r.kMsgFlag) session.lastNewReadConf = r.msgNum + 1;
        if (outcome === 'failure') return 'success';
      }
      r.msgNum++;
    }
    return 'success';
  } finally {
    session.subState = was;
  }
}
