/**
 * Zoom's mail: what goes into a caller's QWK packet - express.e qwkZoom
 * (26741-26856) and qwkZoomConf (26552-26739).
 *
 * The packet is read from the message base on disk, as express.e reads it:
 * MailStats for the range, HeaderFile for each message, the body file for its
 * text. The caller's manual read pointer (lastMsgReadConf, confBase.confYM)
 * is where each conference starts, and Zoom moves it past what it read.
 *
 * This used to come from the SQL `messages` mirror with no private-mail rule
 * at all, so other callers' private mail went into anyone's packet.
 */
import * as path from 'path';
import type { BBSSession } from '../../index';
import type { QWKMessage } from '../../types';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { emitText } from '../../utils/output.util';
import * as amigafs from '../../utils/amigafs';
import { decodeMessageBody } from '../../utils/message-file.util';
import { fromAmigaTime } from '../../utils/date-time.util';
import { messageIndexManager, MsgStatus } from '../../services/MessageIndexManager';
import type { MsgHeader } from '../../services/MessageIndexManager';
import { mayReadPrivateMail, msgBaseDir, readStats } from './read-msg';
import { getConfMailNameFor } from './conf-mail-name';

/** axconsts.e:47 - confBase.handle[0]'s Zoom bit. */
const ZOOM_SCAN_MASK = 2;

/** qwkZoomConf's per-conference cap (26636). */
const ZOOM_CONF_LIMIT = 200;

/**
 * 26650-26651: does this header go into the caller's packet?
 *
 *   IF to me OR from me OR status "P" OR status "p" OR ACS_SYSOP_READ
 *     IF (recv=FALSE OR ACS_SYSOP_READ) AND status<>"D"
 */
export function zoomTakes(session: BBSSession, h: MsgHeader, me: string): boolean {
  const sysopRead = checkSecurity(session.user, ACSPermission.SYSOP_READ);
  const isPublic = h.status === MsgStatus.NORMAL || h.status === MsgStatus.CENSORED;
  if (!isPublic && !mayReadPrivateMail(session, h, me, { allGrants: false })) return false;
  return (h.recv === 0 || sysopRead) && h.status !== MsgStatus.DELETED;
}

/** loadMsg (26668-26672): the body's lines, or MESSAGE IS MISSING. */
function zoomBody(conf: number, h: MsgHeader): string {
  try {
    const text = decodeMessageBody(amigafs.readFileSync(path.join(msgBaseDir(conf), String(h.msgNumb))) as Buffer);
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines.map((line) => `${line}\n`).join('');
  } catch {
    return 'MESSAGE IS MISSING\n';
  }
}

export interface ZoomConfResult {
  messages: QWKMessage[];
  /** The read pointer after the conference: lastMsgReadConf:=msgNum (26725). */
  msgNum: number;
}

/**
 * The scan of one conference's message base, qwkZoomConf 26579-26725:
 * clamp the read pointer into the base (26581-26585), then walk the headers
 * from it - every header advances it, taken or not (26715) - until the base
 * ends or 200 messages are taken.
 */
export function zoomConf(session: BBSSession, conf: number, msgBase: number, lastMsgReadConf: number): ZoomConfResult {
  const stats = readStats(conf);
  let msgNum = lastMsgReadConf;
  if (msgNum < stats.lowestKey) msgNum = stats.lowestKey;
  if (msgNum > stats.highMsgNum) msgNum = stats.highMsgNum;

  const me = getConfMailNameFor(session.user, conf, msgBase);
  const headers = messageIndexManager.readHeaderFile(conf);
  const messages: QWKMessage[] = [];
  while (msgNum < stats.highMsgNum && messages.length < ZOOM_CONF_LIMIT) {
    // loadMessageHeader (12383): the record at msgNum-lowestKey; a short
    // read ends the walk (mystat=RESULT_FAILURE).
    const h = headers[msgNum - stats.lowestKey];
    if (!h) break;
    if (zoomTakes(session, h, me)) {
      messages.push({
        id: h.msgNumb,
        conference: conf,
        subject: h.subject,
        from: h.fromName,
        to: h.toName,
        date: fromAmigaTime(h.msgDate), // express.e's stored-date form
        body: zoomBody(conf, h),
        isPrivate: !(h.status === MsgStatus.NORMAL || h.status === MsgStatus.CENSORED),
        isReply: false,
      });
    }
    msgNum++;
  }
  if (msgNum > stats.highMsgNum) msgNum = stats.highMsgNum;
  return { messages, msgNum };
}

export interface ZoomResult {
  /** Conferences the caller may enter - CONTROL.DAT's list (26776-26806). */
  conferences: Array<{ id: number; name: string }>;
  messages: QWKMessage[];
  /** Conferences flagged for Zoom; 0 = "No conferences selected" (26849). */
  zoomed: number;
}

/**
 * qwkZoom's conference loop (26825-26853), with saveMsgPointers /
 * loadMsgPointers of the current conference around it, so a pointer the
 * caller moved with R is where Zoom starts and the one Zoom leaves is the
 * caller's afterwards.
 *
 * The port keeps one message base per conference on disk (MessageIndexManager
 * is per conference), so each conference is zoomed as message base 1.
 */
export async function qwkZoom(socket: any, session: BBSSession): Promise<ZoomResult> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pointers = require('../../utils/message-pointers.util');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { checkConfAccess } = require('./message-scan.handler');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { getConferences } = require('../screen.handler');

  const userId = String((session.user as any).id);
  const currentConf = session.currentConf || 1;
  const currentMsgBase = session.currentMsgBase || 1;
  const msgBase = 1;

  // 26825 saveMsgPointers(currentConf,currentMsgBase)
  if (session.lastMsgReadConf) {
    await pointers.updateReadPointer(userId, currentConf, currentMsgBase, session.lastMsgReadConf);
  }

  const all: Array<{ id: number; name: string }> = getConferences() || [];
  const result: ZoomResult = { conferences: [], messages: [], zoomed: 0 };
  for (let conf = 1; conf <= all.length; conf++) {
    if (!checkConfAccess(session.user, conf)) continue;
    const name = all.find((c) => c.id === conf)?.name ?? `Conference ${conf}`;
    result.conferences.push({ id: conf, name });

    // 26592: cb.handle[0] AND ZOOM_SCAN_MASK, else RESULT_ABORT.
    const flags: number = await pointers.getConferenceScanFlags(userId, conf, msgBase);
    if (!(flags & ZOOM_SCAN_MASK)) continue;
    result.zoomed++;

    // 26597
    emitText(socket, `\x1b[32mZooming Conference\x1b[33m: \x1b[0m  ${name}   `);

    // 26610-26613: no HeaderFile, no conference.
    if (!amigafs.existsSync(path.join(msgBaseDir(conf), 'HeaderFile'))) {
      emitText(socket, 'Message Base does not exist\r\n');
      continue;
    }

    // 26564 loadMsgPointers(confNum,msgBaseNum)
    const cb = await pointers.loadMsgPointers(userId, conf, msgBase);
    const { messages, msgNum } = zoomConf(session, conf, msgBase, cb.lastMsgReadConf || 0);
    result.messages.push(...messages);

    // 26725 lastMsgReadConf:=msgNum, 26728 saveMsgPointers
    await pointers.updateReadPointer(userId, conf, msgBase, msgNum);

    // 26730-26734
    emitText(socket, messages.length === 0 ? '\tNo New Mail!\r\n' : '\r\n');
  }

  // 26847 loadMsgPointers(currentConf,currentMsgBase)
  const cur = await pointers.loadMsgPointers(userId, currentConf, currentMsgBase);
  session.lastMsgReadConf = cur.lastMsgReadConf;

  return result;
}
