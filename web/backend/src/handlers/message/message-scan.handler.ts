/**
 * Message Scan Handler - Conference message scanning system
 *
 * 1:1 port from express.e:28066-28120 confScan()
 */

import { checkSecurity } from '../../utils/acs.util';
import { narrowMailRow } from '../../utils/table-format.util';
import { ACSPermission } from '../../constants/acs-permissions';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import { parseInfoFile } from '../../utils/info-file.util';
import { loadMsgPointers } from '../../utils/message-pointers.util';
import { config } from '../../config';
import * as fs from 'fs';
import * as path from 'path';
import { dateTimeToDateStamp } from '../../utils/date-time.util';
import { getConferenceDir } from '../../utils/file-hold.util';

// Dependencies injected from index.ts
let _conferences: any[] = [];
let _messageBases: any[] = [];

export function setMessageScanDependencies(
  _db: any,
  _displayScreen: any,
  _parseMciCodes: any,
  _addAnsiEscapes: any,
  _loadScreenFile: any,
  conferences: any[],
  messageBases: any[]
) {
  _conferences = conferences;
  _messageBases = messageBases;
}

/**
 * `Scanning Conference: <name> - `, and it starts at the LEFT MARGIN.
 *
 * The sysop, 2026-09-22, joining a conference on a C64: "the amiga demoscene
 * conference has a cut off up rough internal no new mail today line". What
 * reached him was `ough Internal - No mail today!` - the TAIL of this line,
 * its first twenty-five characters gone. Fed the whole string the transducer
 * wraps it correctly; the head was never on a row of its own, because the
 * line began at column fifteen and simply carried on from wherever the
 * cursor had been left.
 *
 * The leading CR is free on every terminal this board serves and makes that
 * screen impossible, whichever screen left the cursor there. A line that
 * announces which conference is being scanned has no business starting
 * halfway across one.
 *
 * Exported so the test drives THIS string rather than a copy of it.
 */
export function scanningConferenceLine(confName: string): string {
  return `\r\x1b[32mScanning Conference\x1b[33m: \x1b[0m${confName} - `;
}

/**
 * One mail-scan row (C64/40-col Task 5d).
 *
 * 80 columns: express.e:11720's single row, byte-identical.
 * Narrow: number+type on one line, sender and subject stacked underneath,
 * so nothing is clipped away by a 29/21 column budget that does not exist
 * on a C64.
 */
export function buildMailScanRow(
  m: { isPrivate: boolean; from: string; subject: string; msgNum: number },
  narrow: boolean
): string[] {
  if (!narrow) {
    const status = m.isPrivate ? 'Private' : 'Public ';
    const num = String(m.msgNum).padStart(6, '0');
    const from = (m.from || '').substring(0, 29).padEnd(29);
    const subj = (m.subject || '').substring(0, 21).padEnd(21);
    return [`${status}  ${from}  ${subj}  \x1b[0m${num}`];
  }
  return narrowMailRow(m);
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

  // express.e:8511-8512 - area-name access: confAccess is an AREA NAME whose
  // icon (Access/AREA.<name>.info) carries a `Conf.<n>` tooltype for every
  // conference it grants. This is the path a board with more than nine
  // conferences takes - the X/_ string caps at nine (axobjects.e), so uprough's
  // fourteen live here. checkToolTypeExists(TOOLTYPE_AREA, area, "Conf.N").
  return areaGrantsConference(user.confAccess, conferenceId);
}

/**
 * Does the area named `areaName` grant conference `conferenceId`? Reads the
 * area's icon tooltypes and looks for `Conf.<n>` (case-insensitive; a disabled
 * or parenthesised tooltype has a different key and is naturally excluded).
 * express.e:8511-8512 checkToolTypeExists(TOOLTYPE_AREA, area, "Conf.N").
 */
function areaGrantsConference(areaName: string, conferenceId: number): boolean {
  const area = (areaName || '').trim();
  if (!area) return false;
  const areaFile = path.join(config.getConfig().dataDir, 'Access', `AREA.${area}.info`);
  const want = `CONF.${conferenceId}`;
  try {
    // A commented tooltype (the `(CONF.<NUM>)` template, or a disabled grant)
    // is not a grant - express.e's checkToolTypeExists skips them.
    for (const tt of parseInfoFile(areaFile).tooltypes) {
      if (!tt.commented && tt.key.trim().toUpperCase() === want) return true;
    }
  } catch {
    // No area icon, or unreadable -> no grant (fail closed).
  }
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
 * Finish the conference scan: reset state and write AquaScan.UserData.
 * Called after both mail and file scan phases are complete.
 */
function finishConferenceScan(session: any): void {
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

  // The caller (the display flow) goes on to the conference bulletin.
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
/**
 * partUploadOK(1)'s notice and question, express.e:17586 and 17613:
 * `There are some incompleted uploads of yours\b\n`, then (option TRUE)
 * `View them (Y/N)? ` - plain, capital N. The port coloured it and printed
 * `(Y/n)`.
 */
export function partialUploadsNotice(): string[] {
  return [
    '\r\nThere are some incompleted uploads of yours\r\n',
    'View them (Y/N)? ',
  ];
}

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
    for (const line of partialUploadsNotice()) socket.emit('ansi-output', line);

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
  //
  // Owed here, paid by the display flow: a doPause() in this function set
  // paginatedScreen while advanceDisplayFlow carried on into the rejoin, so
  // the prompt was buried. Without it the conference bulletin drew straight
  // over the scan ("no pause after mail scan", sysop, 2026-09-29).
  socket.emit('ansi-output', '\r\n');
  session.confScanPauseOwed = true;
}

/**
 * MAILSCAN_PROMPT on this node's icon (express.e:28075).
 */
function nodeAsksBeforeScanning(session: any): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { parseInfoFile } = require('../../utils/amiga-command-parser.util');
    return parseInfoFile(path.join(config.get('dataDir'), `Node${session.nodeId}.info`)).has('MAILSCAN_PROMPT');
  } catch {
    return false;
  }
}

/**
 * confScan (express.e:28066-28150), the logon scan, as one procedure: the
 * optional "Scan for Mail" question, then every conference the caller may
 * join - each message base joined with confScan=TRUE, whose mail scan is
 * searchNewMail with its table, "Would you like to read it now" and
 * replyPrompt (handlers/message/read-msg) - its new files straight after it,
 * and the part-upload check at the end.
 *
 * It replaces a state machine that stopped at every question and was resumed
 * from key handlers. Answering a message from inside it (R) left the machine
 * behind: the reply ended at the menu, the scan never finished, and the menu
 * stayed suppressed for the rest of the call (sysop, 2026-09-30: "stuck here"
 * after "Saving...Message Number 3...done!"). A procedure cannot be left
 * half-way: replyPrompt returns into it.
 */
export async function performConferenceScan(socket: any, session: any): Promise<number> {
  const user = session.user;
  if (!user) return 0;

  session.currentStat = 9; // ENV_SCANNING (28071)
  if (!session.tempData) session.tempData = {};
  session.tempData.lineCount = 0;
  session.inConfScan = true;

  // 'New Since' is the previous logon while the scan runs.
  session.tempData.confScanOriginalNewSinceDate = user.newSinceDate;
  if (user.lastLoginBeforeUpdate) user.newSinceDate = user.lastLoginBeforeUpdate;

  const { joinConference, FORCE_MAILSCAN_NONE, FORCE_MAILSCAN_SKIP } = require('../operations/conference.handler');
  const { yesNo } = require('../../utils/await-input');
  const { emitText } = require('../../utils/output.util');
  try {
    const prompt = nodeAsksBeforeScanning(session);
    let mscan = true;
    if (prompt) {
      emitText(socket, '\r\n\x1b[0mScan for Mail ');
      mscan = await yesNo(socket, session, 1);
    }
    if (prompt && !mscan) return 0;

    emitText(socket, '\r\nScanning conferences for mail...\r\n\r\n');
    session.tempData.lineCount = 2;
    session.currentConf = 0;
    session.currentConference = 0;

    const { runSysCommandInFlow } = require('../command-execution.handler');
    const numConf = _conferences?.length || 0;
    for (let conf = 1; conf <= numConf; conf++) {
      if (!checkConfAccess(user, conf)) continue;
      const bases = _messageBases.filter((mb: any) => mb.conferenceId === conf);
      const fscan = await checkFileConfScan(conf, user.id, bases[0]?.id ?? 1);
      for (const base of bases) {
        if (!prompt) mscan = await checkMailConfScan(conf, base.id, user.id);
        await joinConference(
          socket, session, conf, base.id, true, false,
          mscan ? FORCE_MAILSCAN_NONE : FORCE_MAILSCAN_SKIP, true,
        );
      }
      // 28099-28107: the conference's new files, with the pause flag set.
      if (fscan) {
        session.newFilesPauseFlag = true;
        session.currentConf = conf;
        session.currentConference = conf;
        // Inside confScan: the door's exit returns here, not to the menu.
        await runSysCommandInFlow(socket, session, 'N', 'S U');
        session.currentConf = 0;
        session.currentConference = 0;
        session.newFilesPauseFlag = false;
      }
    }

    // 28117-28147
    if (checkSecurity(user, ACSPermission.UPLOAD)) {
      const confAccess = user.confAccess || user.conferenceAccess || '';
      await performPartialUploadCheck(socket, session, numConf, confAccess, user);
    }
    return 0;
  } finally {
    finishConferenceScan(session);
  }
}
