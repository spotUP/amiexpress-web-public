/**
 * Message Scan Handler - Conference message scanning system
 *
 * 1:1 port from express.e:28066-28120 confScan()
 */

import { checkSecurity } from '../../utils/acs.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { AnsiUtil } from '../../utils/ansi.util';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import {
  loadMsgPointers,
  updateScanPointer,
  validatePointers,
  getConferenceScanFlags,
  getMailStatFile
} from '../../utils/message-pointers.util';
import { messageIndexManager, MsgStatus } from '../../services/MessageIndexManager';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { getAllMessageIds, readMessageFile, readMailStats, messageFileExists } from '../../utils/message-file.util';
import { config } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import { dateTimeToDateStamp } from '../../utils/date-time.util';
import { getConferenceDir } from '../../utils/file-hold.util';

// Dependencies injected from index.ts
let _db: any = null;
let _displayScreen: any = null;
let _parseMciCodes: any = null;
let _addAnsiEscapes: any = null;
let _loadScreenFile: any = null;
let _conferences: any[] = [];
let _messageBases: any[] = [];

export function setMessageScanDependencies(
  db: any,
  displayScreen: any,
  parseMciCodes: any,
  addAnsiEscapes: any,
  loadScreenFile: any,
  conferences: any[],
  messageBases: any[]
) {
  _db = db;
  _displayScreen = displayScreen;
  _parseMciCodes = parseMciCodes;
  _addAnsiEscapes = addAnsiEscapes;
  _loadScreenFile = loadScreenFile;
  _conferences = conferences;
  _messageBases = messageBases;
}

/**
 * Check if conferenceAccess uses area names instead of X/_ string
 * 1:1 port from express.e:458-465 isConfAccessAreaName()
 *
 * @param user - User object
 * @returns True if conferenceAccess contains area names (not just X/_)
 */
function isConfAccessAreaName(user: any): boolean {
  if (!user?.confAccess) return false;

  // express.e:461-465 - Check if any character is not 'X' or '_'
  let count = 0;
  for (let i = 0; i < user.confAccess.length; i++) {
    const c = user.confAccess[i];
    if (c !== 'X' && c !== '_') {
      count++;
    }
  }
  return count !== 0;
}

/**
 * Check if a command exists (e.g., 'N' for AquaScan)
 * @param commandName - Command name to check
 * @returns True if command is installed
 */
async function checkCommandExists(commandName: string): Promise<boolean> {
  try {
    const { getCommandCache } = require('../command-execution.handler');
    const cache = getCommandCache();
    const cmdUpper = commandName.toUpperCase();

    // Check both SYSCMD and BBSCMD caches
    const exists = cache.syscmd.some(([name]: [string, any]) => name === cmdUpper) ||
                   cache.bbscmd.some(([name]: [string, any]) => name === cmdUpper);
    return exists;
  } catch (error) {
console.log(`[checkCommandExists] Command ${commandName} not found or error:`, error);
    return false;
  }
}

/**
 * Check if conference should scan for new files
 * 1:1 port from express.e:591-608 checkFileConfScan()
 *
 * @param conf - Conference ID (1-based)
 * @param userId - User ID for checking scan flags
 * @returns True if should scan files
 */
async function checkFileConfScan(conf: number, userId: string, _msgBaseId: number = 1): Promise<boolean> {
  const flags = getConferenceToolFlags(conf);

  // express.e:595-596 - IF((checkToolTypeExists(TOOLTYPE_CONF,conf,'SHOW_NEW_FILES')))
  if (flags.showNewFiles) {
    return true;
  }

  // express.e:597-598 - ELSEIF (checkToolTypeExists(TOOLTYPE_CONF,conf,'NO_NEW_FILES'))
  // WEB_: express.e:601-607 — DB FILE_SCAN_MASK check omitted; this BBS uses QuickNew for
  // new-file listings. File scan only runs when SHOW_NEW_FILES is set in a conference .info.
  // express.e's DB flag path would auto-enable scanning for every new user, which triggers
  // AquaScan at every login. Sysops who want per-conference file scanning should set SHOW_NEW_FILES.
  return false;
}

/**
 * Check if user has access to a conference
 * 1:1 port from express.e:8499-8512 checkConfAccess()
 *
 * @param user - User object
 * @param conferenceId - Conference ID (1-based)
 * @returns True if user has access
 */
export function checkConfAccess(user: any, conferenceId: number): boolean {
  // express.e:8501-8502 - Check if user exists
  if (!user) return false;

  // express.e:8504-8509 - Check confAccess string (X/_ format)
  if (!isConfAccessAreaName(user)) {
    // Conference IDs are 1-based, so conferenceId=1 checks position [0]
    if (conferenceId <= (user.confAccess?.length || 0)) {
      if (user.confAccess[conferenceId - 1] === 'X') {
        return true;
      }
    }
    return false;
  }

  // express.e:8511-8512 - Area-based access (e.g., "Conf.1", "Conf.2")
  // Check if TOOLTYPE_AREA contains this conference name
  const confName = `Conf.${conferenceId}`;
  // For now, we don't support area-based access in the web version
  // This would require implementing checkToolTypeExists() for TOOLTYPE_AREA
  // Default to no access for area-based format
  return false;
}

/**
 * Check if message base should be scanned for new mail
 * 1:1 port from express.e:572-591 checkMailConfScan()
 *
 * For web version, simplified to always scan unless explicitly disabled
 *
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @returns True if should scan for mail
 */
const MAIL_SCAN_MASK = 4; // Bit flag for mail scan (matches AmiExpress MAIL_SCAN_MASK)

export async function checkMailConfScan(conferenceId: number, messageBaseId: number, userId: string): Promise<boolean> {
  const flags = getConferenceToolFlags(conferenceId);
  if (flags.forceNewscan) {
    return true;
  }
  if (flags.noNewscan) {
    return false;
  }

  // express.e:572-591 - also checks per-base flags (conf_base.handle[0] & MAIL_SCAN_MASK)
  try {
    const confBase = await loadMsgPointers(userId, conferenceId, messageBaseId);
    return (confBase.scanFlags & MAIL_SCAN_MASK) !== 0;
  } catch (error) {
console.error(`[checkMailConfScan] Failed to load conf_base for user ${userId} conf ${conferenceId} msgBase ${messageBaseId}:`, error);
    return true; // Fallback to scanning if we cannot determine
  }
}

/**
 * A single message entry used during confScan mail display
 * (express.e:11706 — matches toName, from, subject, msgNumb)
 */
export interface ScanMessage {
  msgNum: number;
  isPrivate: boolean;
  from: string;
  subject: string;
}

/**
 * State carried across yield points in advanceConferenceScan
 */
export interface ConfScanState {
  confIndex: number;          // next conference to process (0-based into _conferences)
  mscan: boolean;             // whether mail scan is enabled (from MAILSCAN_PROMPT answer or default)
  // express.e:28075 - prompt=TRUE when MAILSCAN_PROMPT tooltype present
  // When prompt=TRUE AND mscan=TRUE (user said Y): skip per-conf checkMailConfScan (scan all)
  // When prompt=FALSE: mscan starts TRUE, but per-conf checkMailConfScan() is called each time
  promptShown: boolean;       // whether MAILSCAN_PROMPT was displayed to the user
  fileScanDone: boolean;      // true after file scan phase completes
  pendingConf: number;        // conf number waiting for Y/N answer
  pendingMsgBase: number;     // msgBase ID for pending conf
  pendingMessages: ScanMessage[];
}

/**
 * Get messages that match the searchNewMail criteria for a user
 * express.e:11706 — toName === confMailName || 'eall' || 'all', msgNum > pointer, not deleted
 *
 * @param userId - User ID
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @param username - Username (case-insensitive match)
 * @param bbsDataPath - BBS data directory
 * @returns Array of matching ScanMessage entries
 */
async function getMessagesForConfScan(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  user: any,
  bbsDataPath: string
): Promise<ScanMessage[]> {
  // express.e:11706 — toName == confMailName (per-conf display name selected
  // by NAME_TYPE_USERNAME/REALNAME/INTERNETNAME). Previously we used
  // user.username directly, which silently hid mail addressed to the user's
  // realName / internetName in REALNAME / INTERNETNAME conferences.
  const { getConfMailNameFor } = require('./message-entry.handler');
  const safeName = String(getConfMailNameFor(user, conferenceId, messageBaseId) || '').toLowerCase();
  const results: ScanMessage[] = [];

  try {
    const mailStat = messageIndexManager.readMailStats(conferenceId);
    const headers = messageIndexManager.readHeaderFile(conferenceId);
    const confBase = await loadMsgPointers(userId, conferenceId, messageBaseId);
    const validated = mailStat ? validatePointers(confBase, mailStat) : confBase;
    const pointer = validated.lastNewReadConf || 0;

    // express.e:11706 gates 'all'-addressed messages on the per-conf
    // MAILSCAN_ALL flag (cb.handle[0] AND MAILSCAN_ALL). We pull that
    // bit out of the user's confBase.scanFlags (synced from Conf.DB).
    const MAILSCAN_ALL_BIT = 1 << 7;
    const includeAllInScan = (validated.scanFlags & MAILSCAN_ALL_BIT) !== 0;

    if (headers.length > 0) {
      for (const header of headers) {
        if (header.msgNumb <= pointer) continue;
        if (header.status === MsgStatus.DELETED) continue;
        if (!messageFileExists(conferenceId, header.msgNumb, bbsDataPath)) continue;

        const toLower = (header.toName || '').trim().toLowerCase();
        const isPrivate = header.status === MsgStatus.PRIVATE;

        // express.e:11706 — match toName === confMailName, 'eall', or 'all'
        // AND (mailHeader.recv=0) — exclude messages already marked received.
        // 'all' is gated on the MAILSCAN_ALL bit; without it set, 'all'
        // messages don't surface in mail scan.
        const matchesUser = toLower === safeName;
        const matchesEall = toLower === 'eall';
        const matchesAll = toLower === 'all' && includeAllInScan;
        if ((matchesUser || matchesEall || matchesAll) && header.recv === 0) {
          results.push({
            msgNum: header.msgNumb,
            isPrivate,
            from: (header.fromName || '').trim(),
            subject: ''  // HeaderFile doesn't carry subject; read from msg file on demand
          });
        }
      }
    } else {
      // Disk-based fallback. Same MAILSCAN_ALL gate as the HeaderFile path.
      const messageIds = await getAllMessageIds(conferenceId, bbsDataPath);
      for (const msgNum of messageIds) {
        if (msgNum <= pointer) continue;
        const message = await readMessageFile(conferenceId, msgNum, bbsDataPath);
        if (!message) continue;

        const toLower = (message.to || '').trim().toLowerCase();

        // express.e:11706 AND (mailHeader.recv=0) — skip already-received messages.
        // 'all' gated on MAILSCAN_ALL flag (computed above as includeAllInScan).
        const matchesUser = toLower === safeName;
        const matchesEall = toLower === 'eall';
        const matchesAll = toLower === 'all' && includeAllInScan;
        if ((matchesUser || matchesEall || matchesAll) && !message.receivedAt) {
          results.push({
            msgNum,
            isPrivate: message.isPrivate === true,
            from: (message.from || '').trim(),
            subject: (message.subject || '').trim()
          });
        }
      }
    }
  } catch (error) {
console.error(`[getMessagesForConfScan] conf ${conferenceId} msgBase ${messageBaseId}:`, error);
  }

  return results;
}

/**
 * Count new messages for a user in a specific message base
 *
 * @param userId - User ID
 * @param conferenceId - Conference ID
 * @param messageBaseId - Message base ID
 * @returns Count of new messages
 */
async function countNewMessages(
  userId: string,
  conferenceId: number,
  messageBaseId: number,
  user: any
): Promise<{ newPublic: number; newPrivate: number; lastScanned: number; mailStatHigh: number }> {
  // Same per-conf confMailName plumbing as getMessagesForConfScan above.
  const { getConfMailNameFor } = require('./message-entry.handler');
  const safeName = String(getConfMailNameFor(user, conferenceId, messageBaseId) || '').toLowerCase();
  let newPublic = 0;
  let newPrivate = 0;
  let lastScanned = 0;
  let mailStatHigh = 0;

  try {
    const mailStat = messageIndexManager.readMailStats(conferenceId);
    const headers = messageIndexManager.readHeaderFile(conferenceId);
    const confBase = await loadMsgPointers(userId, conferenceId, messageBaseId);
    const validated = mailStat ? validatePointers(confBase, mailStat) : confBase;

    const pointer = validated.lastNewReadConf || 0;
    mailStatHigh = mailStat?.highMsgNum || 0;
    lastScanned = pointer;

    if (headers.length > 0) {
      // Use binary HeaderFile if available, but only count entries that have
      // a readable .msg file in Messages/. HeaderFile may contain entries from
      // an old import that were never written as Messages/*.msg files, causing
      // a false new-message count when the reader finds nothing to show.
      const bbsDataPath = config.get('dataDir');
      for (const header of headers) {
        if (header.msgNumb <= pointer) {
          continue;
        }
        if (header.status === MsgStatus.DELETED) {
          continue;
        }
        if (!messageFileExists(conferenceId, header.msgNumb, bbsDataPath)) {
          continue;
        }

        lastScanned = Math.max(lastScanned, header.msgNumb);

        const toLower = (header.toName || '').trim().toLowerCase();
        const fromLower = (header.fromName || '').trim().toLowerCase();
        const isPrivate = header.status === MsgStatus.PRIVATE;

        if (isPrivate) {
          if (safeName && (toLower === safeName || fromLower === safeName)) {
            newPrivate++;
          }
        } else {
          newPublic++;
        }
      }
    } else {
      // Read from disk .msg files (AmiExpress format)
      // This is the PRIMARY method - database is only for web UI/search
      const bbsDataPath = config.get('dataDir');
      const messageIds = await getAllMessageIds(conferenceId, bbsDataPath);

      for (const msgNum of messageIds) {
        if (msgNum <= pointer) {
          continue;
        }

        // Read message from disk
        const message = await readMessageFile(conferenceId, msgNum, bbsDataPath);
        if (!message) {
          continue; // Skip if file doesn't exist or is corrupted
        }

        lastScanned = Math.max(lastScanned, msgNum);

        const toLower = (message.to || '').trim().toLowerCase();
        const fromLower = (message.from || '').trim().toLowerCase();
        const isPrivate = message.isPrivate;

        if (isPrivate) {
          if (safeName && (toLower === safeName || fromLower === safeName)) {
            newPrivate++;
          }
        } else {
          newPublic++;
        }
      }

      mailStatHigh = messageIds.length > 0 ? Math.max(...messageIds) : 0;
    }
  } catch (error) {
console.error(`Error counting messages in conf ${conferenceId} msgbase ${messageBaseId}:`, error);
  }

  return { newPublic, newPrivate, lastScanned, mailStatHigh };
}

/**
 * Finish the conference scan: reset state and write AquaScan.UserData.
 * Called after both mail and file scan phases are complete.
 */
async function finishConferenceScan(socket: any, session: any): Promise<void> {
  const user = session.user;

  // Restore originalNewSinceDate saved in tempData
  if (user && session.tempData?.confScanOriginalNewSinceDate !== undefined) {
    user.newSinceDate = session.tempData.confScanOriginalNewSinceDate;
    delete session.tempData.confScanOriginalNewSinceDate;
  }

console.log('[confScan] All conferences scanned');

  // Clear the confScan flag
  session.inConfScan = false;

  // express.e:28103 - currentConf:=0
  session.currentConference = 0;
  session.currentConf = 0;

  // Write current DateStamp to AquaScan.UserData for this user's slot.
  // AquaScan has no Write() LVO calls — it reads UserData but the BBS must update it.
  // Slot = (slotNumber - 1) * 16, format = 3 × BE UINT32 (days, minutes, ticks) + 4 pad bytes.
  if (session.user?.slotNumber && session.user.slotNumber > 0) {
    try {
      const userDataPath = path.join(config.get('dataDir'), 'Doors', 'AquaScan', 'AquaScan.UserData');
      const ds = dateTimeToDateStamp(new Date());
      const slotOffset = (session.user.slotNumber - 1) * 16;
      const buf = Buffer.alloc(12);
      buf.writeUInt32BE(ds.days, 0);
      buf.writeUInt32BE(ds.minutes, 4);
      buf.writeUInt32BE(ds.ticks, 8);
      const fd = fs.openSync(userDataPath, 'r+');
      fs.writeSync(fd, buf, 0, 12, slotOffset);
      fs.closeSync(fd);
console.log(`[confScan] Updated AquaScan.UserData slot ${session.user.slotNumber} -> days=${ds.days} min=${ds.minutes} tick=${ds.ticks}`);
    } catch (err) {
console.error('[confScan] Failed to update AquaScan.UserData:', err);
    }
  }

  // Clean up scan state
  delete session.tempData.confScanState;

  // Return to display flow
  const { LoggedOnSubState: SubState } = require('../../constants/bbs-states');
  session.menuPause = true;
  session.subState = SubState.DISPLAY_CONF_BULL;
  // Trigger display flow continuation from command handler
  const { advanceDisplayFlow } = require('../command.handler');
  if (advanceDisplayFlow) {
    await advanceDisplayFlow(socket, session);
  }
}

/**
 * Perform mail scan for a single conference — the per-join equivalent of confScan mail scan.
 * Called from joinConference when auto=FALSE and checkMailConfScan() returns true.
 * Mirrors the per-conference body of advanceConferenceScan (express.e:5122 callMsgFuncs(MAIL_SCAN,...)).
 *
 * express.e:11651-11778 searchNewMail() (single-conf invocation)
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param conf - Conference ID (1-based)
 * @param msgBaseId - Message base database ID
 */
export async function performSingleConfMailScan(socket: any, session: any, conf: number, msgBaseId: number): Promise<void> {
  const user = session.user;
  if (!user) return;

  const confName = _conferences.find((c: any) => c.id === conf)?.name || `Conf ${conf}`;
  const bbsDataPath = config.get('dataDir');

  // express.e:11706 — getMessagesForConfScan / countNewMessages now derive
  // confMailName per-conference internally from the user object, so REALNAME
  // / INTERNETNAME conferences pick up the right toName for the filter.
  const scanMsgs = await getMessagesForConfScan(user.id, conf, msgBaseId, user, bbsDataPath);

  const { newPublic, newPrivate, lastScanned } = await countNewMessages(user.id, conf, msgBaseId, user);
  session.lastScanNewPublic = (session.lastScanNewPublic || 0) + newPublic;
  session.lastScanNewPrivate = (session.lastScanNewPrivate || 0) + newPrivate;
  session.lastScanTotal = (session.lastScanTotal || 0) + newPublic + newPrivate;

  if (lastScanned > 0) {
    await updateScanPointer(user.id, conf, msgBaseId, lastScanned);
    // Keep session pointers in sync so saveMsgPointers() in joinConference gets the right values
    session.lastNewReadConf = lastScanned;
  }

  if (scanMsgs.length === 0) {
    // No mail for this conference — nothing to display (express.e:11772 - 'No mail today!')
    return;
  }

  // express.e:11712-11715 — header + table
  socket.emit('ansi-output', '\r\n\r\n');
  socket.emit('ansi-output', '\x1b[32mType     From                           Subject                Msg    \r\n');
  socket.emit('ansi-output', '\x1b[33m-------  -----------------------------  ---------------------  -------\r\n');
  socket.emit('ansi-output', '\x1b[0m');

  for (const m of scanMsgs) {
    const status = m.isPrivate ? 'Private' : 'Public ';
    const from = (m.from || '').substring(0, 29).padEnd(29);
    let subject = (m.subject || '').trim();
    if (!subject) {
      try {
        const msg = await readMessageFile(conf, m.msgNum, bbsDataPath);
        if (msg) subject = (msg.subject || '').trim();
      } catch (_e) { /* ignore */ }
    }
    const subj = subject.substring(0, 21).padEnd(21);
    const num = String(m.msgNum).padStart(6, '0');
    socket.emit('ansi-output', `${status}  ${from}  ${subj}  \x1b[0m${num}\r\n`);
  }
}

/**
 * Check all conferences for partial uploads belonging to this user.
 * 1:1 port from express.e:28117-28147 — the partial upload check phase of confScan().
 *
 * express.e uses partUploadOK(1) which:
 *   - Opens <currentConfDir>PartUpload/ directory
 *   - Scans filenames for the user's slot number suffix (@<slot>)
 *   - If found, calls uploadaFile(0,'URG',FALSE) to let user resume/abandon
 *
 * We mirror this: scan each conf's PartUpload/ directory for files ending with
 * '@<slotNumber>', prompt to resume via upload handler when found.
 *
 * @param socket  - Socket
 * @param session - BBS session
 * @param numConf - Total number of conferences
 * @param confAccess - User confAccess string
 * @param user    - User object
 */
async function performPartialUploadCheck(
  socket: any,
  session: any,
  numConf: number,
  confAccess: string,
  user: any
): Promise<void> {
  const { joinConference } = require('../operations/conference.handler');
  const { FORCE_MAILSCAN_SKIP } = require('../operations/conference.handler');
  const bbsDataPath = config.get('dataDir');
  const slotNumber = user.slotNumber ?? 0;

  // express.e:28117 - IF checkSecurity(ACS_UPLOAD) (already checked by caller)
  // express.e:28119 - FOR conf:=1 TO cmds.numConf
  for (let confIdx = 0; confIdx < numConf; confIdx++) {
    const conf = confIdx + 1;
    const accessChar = confAccess.length >= conf ? confAccess[conf - 1].toUpperCase() : '_';
    if (accessChar !== 'X') continue;

    // express.e:28121 - mystat:=joinConf(conf,1,TRUE,FALSE,FORCE_MAILSCAN_SKIP)
    const confMsgBases = _messageBases.filter(mb => mb.conferenceId === conf);
    const firstMsgBaseId = confMsgBases.length > 0 ? confMsgBases[0].id : 1;
    await joinConference(socket, session, conf, firstMsgBaseId, true, false, FORCE_MAILSCAN_SKIP, true);

    // express.e:28124 - mystat:=partUploadOK(1)
    // partUploadOK(1): scan PartUpload/ for files with this user's slot suffix
    const confDir = getConferenceDir(conf, bbsDataPath);
    const partUploadDir = path.join(confDir, 'PartUpload');

    let partialFiles: string[] = [];
    try {
      if (fs.existsSync(partUploadDir)) {
        const entries = fs.readdirSync(partUploadDir);
        // express.e:17584 - getUN(str) extracts @<slotNumber> from filename
        // Match files ending with @<slotNumber>
        const suffix = `@${slotNumber}`;
        partialFiles = entries.filter(f => f.endsWith(suffix) && f.trim().length > 0);
      }
    } catch (_e) {
      // express.e:17542-17544 - can't access dir: "Tell sysop bbs can't access..."
      // For web, silently skip inaccessible directories
      continue;
    }

    if (partialFiles.length === 0) continue;

    // express.e:28125 - IF(mystat=RESULT_FAILURE) - partials found for this user
    // express.e:28127 - setEnvStat(ENV_UPLOADING)
    session.currentConf = conf;

    // express.e:28130 - bgFileCheck tooltype check (web: always FALSE for remote)
    // express.e:28134 - mystat:=uploadaFile(0,'URG',FALSE)
    // Display partial upload notice and trigger upload handler
    socket.emit('ansi-output', '\r\nThere are some incompleted uploads of yours\r\n');
    socket.emit('ansi-output', `View them \x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)?\x1b[0m `);

    // For web version, we show the notice but cannot block here waiting for input.
    // Partial upload resume via 'URG' mode is triggered via the upload handler.
    // express.e:17634 rts_stat:=RESULT_FAILURE (view=yes) -> uploadaFile(0,'URG',FALSE)
    // WEB_: defer to upload handler; log the partial files for sysop visibility.
console.log(`[confScan] Partial uploads for slot ${slotNumber} in Conf${conf}:`, partialFiles);

    // express.e:28135 - IF mystat=RESULT_GOODBYE THEN modemOffHook() — not applicable for web
    // express.e:28137 - ELSEIF(mystat=RESULT_ABORT) aePuts('\b\n') — user answered N
    socket.emit('ansi-output', '\r\n');

    // express.e:28142 - EXIT mystat=RESULT_FAILURE
    // express.e:28143 - IF timeout/no_carrier/goodbye THEN RETURN mystat
    // (no carrier/timeout checking needed for web sessions)
  }

  // express.e:28145 - mystat:=doPause()
  // TODO: this doPause needs to be wired into the display flow state machine
  // (similar to round 7's CONF_BULL fix). A naked doPause() here sets
  // paginatedScreen but advanceDisplayFlow continues regardless, so the prompt
  // is buried by AUTO_REJOIN output. For now, fall through — CONF_BULL
  // screen + doPause inside AUTO_REJOIN serves as the visible pause.
  socket.emit('ansi-output', '\r\n');
}

/**
 * Advance the conference scan — processes the next pending conference.
 * Called on entry and after each Y/N answer in CONF_SCAN_MAIL_PROMPT state.
 * Exported so command.handler can call it after the user answers the prompt.
 *
 * express.e:11651-11778 searchNewMail()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function advanceConferenceScan(socket: any, session: any): Promise<void> {
  if (!session.tempData) session.tempData = {};
  const scanState: ConfScanState = session.tempData.confScanState;
  if (!scanState) {
console.warn('[advanceConferenceScan] no confScanState found');
    await finishConferenceScan(socket, session);
    return;
  }

  const { joinConference } = require('../operations/conference.handler');
  const { checkForPause } = require('../../utils/flag-pause.util');
  const { LoggedOnSubState: SubState } = require('../../constants/bbs-states');
  const bbsDataPath = config.get('dataDir');
  const user = session.user;
  const confAccess = user?.confAccess || user?.conferenceAccess || '';
  const numConf = _conferences?.length || 0;

  // ----------------------------------------------------------------
  // Mail scan phase: iterate starting from scanState.confIndex
  // express.e:28086-28114 - FOR conf:=1 TO cmds.numConf ... FOR msgbase:=1 TO n
  // ----------------------------------------------------------------
  for (let confIdx = scanState.confIndex; confIdx < numConf; confIdx++) {
    const conf = confIdx + 1; // 1-based conference number
    const confName = _conferences[confIdx]?.name || `Conf ${conf}`;

    // express.e:28087 - IF (checkConfAccess(conf))
    const accessChar = confAccess.length >= conf ? confAccess[conf - 1].toUpperCase() : '_';
    if (accessChar !== 'X') {
      continue;
    }

    // express.e:28089 - fscan:=checkFileConfScan(conf)
    // Computed here so the file scan phase below can use it per-conference.
    // Store in scanState so we can resume after a yield without recomputing.
    const confMsgBases = _messageBases.filter(mb => mb.conferenceId === conf);
    if (confMsgBases.length === 0) {
      continue;
    }
    const firstMsgBaseId = confMsgBases[0].id;

    // express.e:28092-28098 - FOR msgbase:=1 TO n (iterate ALL message bases)
    for (let mbIdx = 0; mbIdx < confMsgBases.length; mbIdx++) {
      const msgBase = confMsgBases[mbIdx];
      const msgBaseId = msgBase.id;

      // express.e:28097 - joinConf(conf,msgbase,TRUE,FALSE,...) always called
      await joinConference(socket, session, conf, msgBaseId, true, false, 0, true);

      // express.e:28094-28096:
      //   IF prompt=FALSE THEN mscan:=checkMailConfScan(conf,msgbase)
      // When MAILSCAN_PROMPT was NOT shown (promptShown=FALSE):
      //   mscan is overridden per-conf by checkMailConfScan().
      // When MAILSCAN_PROMPT was shown and user answered Y (promptShown=TRUE, mscan=TRUE):
      //   skip per-conf check — scan all conferences unconditionally.
      // When MAILSCAN_PROMPT was shown and user answered N (mscan=FALSE):
      //   entire block skipped before we get here (guarded above).
      let mscan: boolean;
      if (!scanState.promptShown) {
        // prompt=FALSE path: per-conf check determines scan
        mscan = await checkMailConfScan(conf, msgBaseId, user.id);
      } else {
        // prompt=TRUE, mscan=TRUE (user said Y): scan all
        mscan = scanState.mscan;
      }

      // express.e:28097 - joinConf called with FORCE_MAILSCAN_SKIP when mscan=FALSE
      if (!mscan) continue;

      // express.e:11670: inside searchNewMail, print header per conf
      socket.emit('ansi-output', `\x1b[32mScanning Conference\x1b[33m: \x1b[0m${confName} - `);

      // Get mail-scan messages (matching confMailName, eall, all).
      // express.e:11706 uses confMailName (per-conf display name), not raw
      // username — getMessagesForConfScan derives this internally now.
      const scanMsgs = await getMessagesForConfScan(user.id, conf, msgBaseId, user, bbsDataPath);

      // Update scan counters
      const { newPublic, newPrivate, lastScanned } = await countNewMessages(
        user.id, conf, msgBaseId, user
      );
      session.lastScanNewPublic = (session.lastScanNewPublic || 0) + newPublic;
      session.lastScanNewPrivate = (session.lastScanNewPrivate || 0) + newPrivate;
      session.lastScanTotal = (session.lastScanTotal || 0) + newPublic + newPrivate;
      if (lastScanned > 0) {
        await updateScanPointer(user.id, conf, msgBaseId, lastScanned);
      }

      if (scanMsgs.length === 0) {
        // express.e:11772 - 'No mail today!\b\n'
        socket.emit('ansi-output', 'No mail today!\r\n');
        continue;
      }

      // express.e:11712-11715 — blank lines + table header + reset
      socket.emit('ansi-output', '\r\n\r\n');
      socket.emit('ansi-output', '\x1b[32mType     From                           Subject                Msg    \r\n');
      socket.emit('ansi-output', '\x1b[33m-------  -----------------------------  ---------------------  -------\r\n');
      // express.e:11715 — `[0m` reset on its own line ends the header
      // block before the per-message rows. Audit D-9 flagged that the
      // newline was missing.
      socket.emit('ansi-output', '\x1b[0m\r\n');

      // express.e:11720 - per-message row
      for (const m of scanMsgs) {
        const status = m.isPrivate ? 'Private' : 'Public ';
        const from = (m.from || '').substring(0, 29).padEnd(29);
        // For header-only entries we may have no subject yet; fill from disk
        let subject = (m.subject || '').trim();
        if (!subject) {
          try {
            const msg = await readMessageFile(conf, m.msgNum, bbsDataPath);
            if (msg) subject = (msg.subject || '').trim();
          } catch (_e) { /* ignore */ }
        }
        const subj = subject.substring(0, 21).padEnd(21);
        const num = String(m.msgNum).padStart(6, '0');
        socket.emit('ansi-output', `${status}  ${from}  ${subj}  \x1b[0m${num}\r\n`);
      }

      // express.e:11737 — '\b\nFound Mail!' (banner) before the prompt.
      // Audit D-9 flagged this as missing; the BBS would jump straight
      // from the message table to the y/n prompt with no announcement.
      socket.emit('ansi-output', '\r\nFound Mail!\r\n');

      // express.e:11739 — '\b\nWould you like to read it now ' + yesNo(1) + '\b\n'
      socket.emit('ansi-output', '\r\nWould you like to read it now \x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)?\x1b[0m ');

      // Store state and yield for user input
      // confIndex resumes at this conf; after resuming we advance mbIdx via pendingMsgBase
      scanState.confIndex = confIdx;
      scanState.pendingConf = conf;
      scanState.pendingMsgBase = msgBaseId;
      scanState.pendingMessages = scanMsgs;
      session.subState = SubState.CONF_SCAN_MAIL_PROMPT;
      return; // yield — command handler will call back with Y/N
    }
  }

  // ----------------------------------------------------------------
  // All mail-scan conferences done — proceed to file scan phase.
  // express.e:28082 - the entire block (mail + file) is gated by
  //   IF (prompt=FALSE) OR (mscan=TRUE)
  // scanState.mscan=FALSE means user answered "N" to MAILSCAN_PROMPT,
  // so we skip the file scan entirely.
  // ----------------------------------------------------------------
  if (scanState.mscan) {
    const { runSysCommand } = require('../command-execution.handler');

    for (let confIdx = 0; confIdx < numConf; confIdx++) {
      const conf = confIdx + 1;
      const confName = _conferences[confIdx]?.name || `Conf ${conf}`;
      const accessChar = confAccess.length >= conf ? confAccess[conf - 1].toUpperCase() : '_';
      if (accessChar !== 'X') continue;

      const firstMsgBaseEntry = _messageBases.find(mb => mb.conferenceId === conf);
      const firstMsgBaseId = firstMsgBaseEntry ? firstMsgBaseEntry.id : 1;

      // express.e:28089 - fscan:=checkFileConfScan(conf)
      const fscan = await checkFileConfScan(conf, user.id, firstMsgBaseId);
      // express.e:28099-28107 - IF (mystat=RESULT_SUCCESS) AND (fscan) THEN runSysCommand('N','S U')
      if (fscan) {
console.log(`[confScan] File scan: ${confName}`);
        await joinConference(socket, session, conf, firstMsgBaseId, true, false, 0, true);
        session.newFilesPauseFlag = true;
        await runSysCommand(socket, session, 'N', 'S U');
        session.newFilesPauseFlag = false;
      }

      const shouldContinue = await checkForPause(socket, session);
      if (!shouldContinue) {
console.log(`[confScan] User stopped scan at conference ${conf}`);
        break;
      }
    }

    // express.e:28117-28147 - IF checkSecurity(ACS_UPLOAD)
    //   Check for partial uploads in each conference's PartUpload/ directory.
    //   partUploadOK(1) returns RESULT_FAILURE when partials belong to this user.
    if (checkSecurity(user, ACSPermission.UPLOAD)) {
      await performPartialUploadCheck(socket, session, numConf, confAccess, user);
    }
  }

  await finishConferenceScan(socket, session);
}

/**
 * Scan all conferences for new mail and files.
 * Entry point: initialises confScanState and delegates to advanceConferenceScan.
 * 1:1 port from express.e:28066-28150 confScan() + express.e:11651-11778 searchNewMail()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function performConferenceScan(socket: any, session: any): Promise<number> {
  if (!session.user) {
console.warn('confScan: No user in session');
    return 0; // RESULT_SUCCESS
  }

  // express.e:28071 - setEnvStat(ENV_SCANNING)
  session.currentStat = 9; // ENV_SCANNING
console.log('[confScan] Starting conference scan (express.e:28066-28150)');

  // Initialize temp data
  if (!session.tempData) session.tempData = {};
  session.tempData.lineCount = 0;

  // Suppress menu prompts during conference scan
  session.inConfScan = true;

  const user = session.user;
  const username = user?.username || 'Unknown';
console.log(`[confScan] Starting scan for ${username}. Total conferences: ${_conferences?.length || 0}`);

  // Cache original newSinceDate in tempData so finishConferenceScan can restore it
  session.tempData.confScanOriginalNewSinceDate = user?.newSinceDate;

  // Use previous login date for 'New Since' logic during scan
  if (user?.lastLoginBeforeUpdate) {
    user.newSinceDate = user.lastLoginBeforeUpdate;
console.log(`[confScan] Using previous login date for scan: ${user.newSinceDate.toISOString()}`);
  } else {
console.log(`[confScan] WARNING: No previous login date found for ${username}`);
  }

  // express.e:28083 - aePuts('\b\nScanning conferences for mail...\b\n\b\n')
  socket.emit('ansi-output', '\r\nScanning conferences for mail...\r\n\r\n');
  session.tempData.lineCount = (session.tempData.lineCount || 0) + 3;

  // Initialise confScanState if not already set (may be set by MAILSCAN_PROMPT_INPUT)
  if (!session.tempData.confScanState) {
    const state: ConfScanState = {
      confIndex: 0,
      mscan: true,
      // promptShown=FALSE means no MAILSCAN_PROMPT tooltype was present;
      // per-conf checkMailConfScan() will gate each conference.
      promptShown: false,
      fileScanDone: false,
      pendingConf: 0,
      pendingMsgBase: 0,
      pendingMessages: []
    };
    session.tempData.confScanState = state;
  }

  await advanceConferenceScan(socket, session);
  return 0; // RESULT_SUCCESS
}

/**
 * Display the MailScan screen and perform conference scan
 * Called during login flow (express.e:28566-28648)
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function displayMailScanScreen(socket: any, session: any): Promise<void> {
  // express.e:28073 - await displayScreen(SCREEN_MAILSCAN)
  if (_loadScreenFile) {
    const screenData = _loadScreenFile('MailScan', session.currentConf);

    if (screenData) {
      // Parse MCI codes with scan results
      let parsed = screenData.content;

      if (_parseMciCodes) {
        // parseMciCodes is async — was previously assigned without
        // await, leaving `parsed` as a Promise that subsequent
        // .replace() calls coerced to "[object Promise]". Audit
        // 2026-05-05.
        const result = await _parseMciCodes(parsed, session);
        parsed = result?.parsed ?? parsed;
      }

      // Replace scan-specific MCI codes
      parsed = parsed.replace(/%NM/g, (session.lastScanNewPublic || 0).toString());
      parsed = parsed.replace(/%PM/g, (session.lastScanNewPrivate || 0).toString());
      parsed = parsed.replace(/%TM/g, (session.lastScanTotal || 0).toString());

      // Add ESC prefix to ANSI codes
      if (_addAnsiEscapes) {
        parsed = _addAnsiEscapes(parsed);
      }

      // Normalize line endings
      parsed = parsed.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');

      socket.emit('ansi-output', parsed);
    }
  }

  // Now perform the actual scan — express.e confScan just calls joinConf/scanMessages; main loop sets menuPause:=TRUE
  await performConferenceScan(socket, session);
  session.menuPause = true;
}
