/**
 * Advanced Commands Handler
 *
 * Implements advanced BBS commands as 1:1 ports from express.e:
 * - GR (Greetings) - Amiga scene tribute - express.e:24411-24423
 * - MS (Mail Scan) - Scan all conferences for new mail - express.e:25250-25279
 * - CF (Conference Flags) - Manage conference scanning flags - express.e:24672-24750
 */

import { LoggedOnSubState } from '../../constants/bbs-states';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/acs.util';
import { AnsiUtil } from '../../utils/ansi.util';
import { ErrorHandler } from '../../utils/error-handling.util';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';

import type { BBSSession } from '../../index';

interface Conference {
  id: number;
  name: string;
}

interface Message {
  conferenceId: number;
  timestamp: Date;
  isPrivate: boolean;
  toUser?: string;
  author?: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

// Dependencies injected from index.ts
let _conferences: Conference[] = [];
let _messageBases: MessageBase[] = [];
let _messages: Message[] = [];
let _checkConfAccess: (user: any, conferenceId: number) => boolean;

/**
 * Set dependencies for advanced commands (called from index.ts)
 */
export function setAdvancedCommandsDependencies(deps: {
  conferences: Conference[];
  // Required: MS walks them, and a board wired without them scanned nothing
  // (sysop, 2026-09-30: "Scanning conferences for mail..." and the prompt).
  messageBases: MessageBase[];
  messages: Message[];
  checkConfAccess: typeof _checkConfAccess;
}) {
  _conferences = deps.conferences;
  _messageBases = deps.messageBases;
  _messages = deps.messages;
  _checkConfAccess = deps.checkConfAccess;
}

/**
 * GR Command - Greetings (Amiga Scene Tribute)
 *
 * From express.e:24411-24423:
 * PROC internalCommandGreets()
 *   aePuts('\b\nIn memory of those who came before us...\b\n\b\n')
 *   aePuts('[34m[[0mscoopex[34m][0m [34m[[0mlsd[34m][0m ...')
 *   ... (multiple lines of demo scene group names)
 * ENDPROC
 *
 * Displays a tribute to classic Amiga demo scene groups.
 * This is a nostalgic easter egg command.
 */
// express.e:24414-24421, one row per aePuts.
const GREETS: readonly (readonly string[])[] = [
  ['scoopex', 'lsd', 'skid row', 'alpha flight', 'trsi', 'bamiga sector one'],
  ['fairlight', 'defjam', 'paradox', 'legend', 'anthrox', 'crystal', 'angels'],
  ['vision factory', 'zenith', 'slipstream', 'dual crew', 'delight', 'shining'],
  ['quartex', 'global overdose', 'paranoimia', 'supplex', 'classic', 'hoodlum'],
  ['accumulators', 'hellfire', 'oracle', 'endless piracy', 'hqc', 'setrox'],
  ['prodigy', 'prestige', 'nemesis', 'genesis', 'loonies', 'horizon', 'agile'],
  ['crack inc', 'valhalla', 'sunflex inc', 'ministry', 'the band', 'razor1911'],
  ['conqueror and zike', 'mad', 'the company'],
];

/** Each group in blue brackets, a plain space between: express's bytes. */
function greetsRow(groups: readonly string[]): string {
  return groups.map(g => `\x1b[34m[\x1b[0m${g}\x1b[34m]\x1b[0m`).join(' ') + '\r\n\r\n';
}

export function handleGreetingsCommand(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\nIn memory of those who came before us...\r\n\r\n');
  for (const row of GREETS) socket.emit('ansi-output', greetsRow(row));

  // Nothing after the list: the main loop's menuPause/doPause follows.
  session.menuPause = true;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * MS Command - Mail Scan
 *
 * From express.e:25250-25279:
 * PROC internalCommandMS()
 *   - Save current conference/message base
 *   - Loop through all conferences user has access to
 *   - For each conference, loop through message bases
 *   - Join each base and scan for new mail
 *   - Restore original conference/message base
 * ENDPROC RESULT_SUCCESS
 *
 * Scans all accessible conferences for new messages addressed to the user.
 */
export async function handleMailScanCommand(socket: any, session: BBSSession): Promise<void> {
  // express.e:25250-25273 internalCommandMS: every conference and message base
  // the caller can reach, joined as the logon scan joins them, with
  // FORCE_MAILSCAN_ALL; then back to where they were.
  const { joinConference, FORCE_MAILSCAN_ALL, FORCE_MAILSCAN_SKIP } = require('../operations/conference.handler');
  const { emitText } = require('../../utils/output.util');

  if (!session.tempData) session.tempData = {};
  session.tempData.nonStopDisplayFlag = false;
  const oldConf = session.currentConf;
  const oldMsgBase = session.currentMsgBase;
  session.currentConf = 0;
  session.currentConference = 0;
  session.tempData.lineCount = 2;
  emitText(socket, '\r\nScanning conferences for mail...\r\n\r\n');

  for (const conf of _conferences) {
    if (!_checkConfAccess(session.user, conf.id)) continue;
    for (const msgBase of _messageBases.filter(mb => mb.conferenceId === conf.id)) {
      // joinConf(conf,msgbase,TRUE,FALSE,FORCE_MAILSCAN_ALL): TRUE is confScan.
      await joinConference(socket, session, conf.id, msgBase.id, true, false, FORCE_MAILSCAN_ALL, true);
    }
  }

  await joinConference(socket, session, oldConf, oldMsgBase, true, false, FORCE_MAILSCAN_SKIP);
  session.currentConf = oldConf;
  session.currentConference = oldConf;
  session.currentMsgBase = oldMsgBase;

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

/**
 * CF Command - Conference Flags
 *
 * From express.e:24672-24841 (170 lines):
 * PROC internalCommandCF()
 *   - Check ACS_CONFFLAGS permission
 *   - Display full-screen list of conferences with M/A/F/Z flags
 *   - Allow user to toggle flags for individual conferences
 *   - Parse patterns like "1,3,5" or "1.2" for bulk changes
 *   - Special commands: * (toggle all), + (all on), - (all off)
 *   - Save conference flag preferences per user in conf_base table
 * ENDPROC
 *
 * Manages which conferences are flagged for automatic scanning.
 * M = Mail scan, A = All messages, F = File scan, Z = Zoom scan
 */
export async function handleConferenceFlagsCommand(socket: any, session: BBSSession): Promise<void> {
  if (!checkSecurity(session.user, ACSPermission.CONFFLAGS)) {
    ErrorHandler.permissionDenied(socket, 'manage conference flags', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // Initialize CF session state
  session.tempData = session.tempData || {};
  session.tempData.cfLoop = true;

  // Start displaying the conference flags menu
  await displayConferenceFlagsMenu(socket, session);
}

/**
 * Display conference flags menu
 * express.e:24687-24733
 */
async function displayConferenceFlagsMenu(socket: any, session: BBSSession): Promise<void> {
  // express.e:24688 sendCLS() = form-feed char + '\b\n'
  socket.emit('ansi-output', '\x0c\r\n');

  // express.e:24691-24692 exact ANSI: [32m ... [0m and [33m ... [0m
  socket.emit('ansi-output', '\x1b[32m        M A F Z Conference                      M A F Z Conference\x1b[0m\r\n');
  socket.emit('ansi-output', '\x1b[33m        ~ ~ ~ ~ ~~~~~~~~~~~~~~~~~~~~~~~         ~ ~ ~ ~ ~~~~~~~~~~~~~~~~~~~~~~~\x1b[0m\r\n\r\n');

  // express.e:24692-24731 - List all accessible conferences with flags
  const { db } = require('../../database');
  let n = 0;

  for (const conf of _conferences) {
    // Check if user has access to this conference
    if (!_checkConfAccess(session.user, conf.id)) {
      continue;
    }

    // Get message bases for this conference
    const msgBases = await db.getMessageBases(conf.id);

    for (let m = 0; m < msgBases.length; m++) {
      const msgBase = msgBases[m];

      // Get user's scan flags for this conference/base
      const scanFlags = await getUserScanFlags(session.user.id, conf.id, msgBase.id);

      // express.e:24695-24726 - Determine flag status (F/D/*/space) per tooltype + user flags
      // c1 = MailScan column: FORCE_NEWSCAN -> 'F', NO_NEWSCAN -> 'D', bit set -> '*', else ' '
      // c2 = FileScan column: SHOW_NEW_FILES -> 'F', NO_NEW_FILES -> 'D', bit set -> '*', else ' '
      const confFlags = getConferenceToolFlags(conf.id);
      let mailFlag: string;
      if (confFlags.forceNewscan) {
        mailFlag = 'F';
      } else if (confFlags.noNewscan) {
        mailFlag = 'D';
      } else {
        mailFlag = (scanFlags & MAIL_SCAN_MASK) ? '*' : ' ';
      }
      let fileFlag: string;
      if (confFlags.showNewFiles) {
        fileFlag = 'F';
      } else if (confFlags.noNewFiles) {
        fileFlag = 'D';
      } else {
        fileFlag = (scanFlags & FILE_SCAN_MASK) ? '*' : ' ';
      }
      const allFlag = (scanFlags & MAILSCAN_ALL) ? '*' : ' ';
      const zoomFlag = (scanFlags & ZOOM_SCAN_MASK) ? '*' : ' ';

      // express.e:24728-24730 - Format conference name
      let confStr: string;
      let confTitle: string;

      if (msgBases.length > 1) {
        confStr = `${conf.id}.${m + 1}`;
        confTitle = `${conf.name} - ${msgBase.name}`;
      } else {
        confStr = `${conf.id}`;
        confTitle = conf.name;
      }

      // express.e:24731 - Output formatted line
      const line = AnsiUtil.colorize('[', 'blue') +
        confStr.padEnd(5) +
        AnsiUtil.colorize('] ', 'blue') +
        AnsiUtil.colorize(`${mailFlag} ${allFlag} ${fileFlag} ${zoomFlag} `, 'cyan') +
        confTitle.substring(0, 23);

      socket.emit('ansi-output', line);

      // express.e:24732-24733 - Two columns
      if (n % 2 === 1) {
        socket.emit('ansi-output', '\r\n');
      } else {
        socket.emit('ansi-output', ' ');
      }
      n++;
    }
  }

  // express.e:24749 '\b\n\b\nEdit which flags [M]ailScan, [A]ll Messages, [F]ileScan, [Z]oom >: '
  socket.emit('ansi-output', '\r\n\r\nEdit which flags [M]ailScan, [A]ll Messages, [F]ileScan, [Z]oom >: ');

  // Store context for input
  session.subState = LoggedOnSubState.CF_FLAG_SELECT_INPUT;
}

/**
 * Handle flag selection input (M/A/F/Z)
 * express.e:24738-24750
 */
export async function handleCFFlagSelectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const ch = input.trim().toUpperCase();
  let editMask: number;

  // express.e:24738-24747
  if (ch === 'M') {
    editMask = MAIL_SCAN_MASK;
  } else if (ch === 'F') {
    editMask = FILE_SCAN_MASK;
  } else if (ch === 'Z') {
    editMask = ZOOM_SCAN_MASK;
  } else if (ch === 'A') {
    editMask = MAILSCAN_ALL;
  } else {
    // express.e:24748-24750 - Exit if invalid
    session.tempData.cfLoop = false;
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  socket.emit('ansi-output', ch + '\r\n');

  // express.e:24769 "Enter Conference Numbers,'*' toggle all,'-' All off,'+' All on >: "
  socket.emit('ansi-output', "Enter Conference Numbers,'*' toggle all,'-' All off,'+' All on >: ");

  session.tempData.cfEditMask = editMask;
  session.subState = LoggedOnSubState.CF_CONF_SELECT_INPUT;
}

/**
 * Handle conference selection input
 * express.e:24755-24835
 */
export async function handleCFConfSelectInput(socket: any, session: BBSSession, input: string): Promise<void> {
  const confNums = input.trim();
  const editMask = session.tempData.cfEditMask;
  const { db } = require('../../database');

  socket.emit('ansi-output', '\r\n');

  // express.e:24757 - Empty input, return to menu
  if (confNums.length === 0) {
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    session.tempData = {};
    return;
  }

  // express.e:24759-24767 - '+' = all on
  if (confNums === '+') {
    for (const conf of _conferences) {
      if (!_checkConfAccess(session.user, conf.id)) continue;

      const msgBases = await db.getMessageBases(conf.id);
      for (const msgBase of msgBases) {
        await toggleScanFlag(session.user.id, conf.id, msgBase.id, editMask, true);
      }
    }
  }
  // express.e:24768-24776 - '-' = all off
  else if (confNums === '-') {
    for (const conf of _conferences) {
      if (!_checkConfAccess(session.user, conf.id)) continue;

      const msgBases = await db.getMessageBases(conf.id);
      for (const msgBase of msgBases) {
        await toggleScanFlag(session.user.id, conf.id, msgBase.id, editMask, false);
      }
    }
  }
  // express.e:24777-24834 - Parse comma-separated list
  else {
    const confList = confNums.split(',').map(s => s.trim()).filter(s => s.length > 0);

    for (const confStr of confList) {
      // Check if it's a conference.base format (e.g., "1.2")
      const parts = confStr.split('.');
      const confId = parseInt(parts[0]);
      const baseNum = parts.length > 1 ? parseInt(parts[1]) : null;

      if (isNaN(confId)) continue;

      const conf = _conferences.find(c => c.id === confId);
      if (!conf || !_checkConfAccess(session.user, confId)) continue;

      const msgBases = await db.getMessageBases(confId);

      if (baseNum !== null) {
        // Specific message base
        const msgBase = msgBases[baseNum - 1];
        if (msgBase) {
          await toggleScanFlag(session.user.id, confId, msgBase.id, editMask, null); // XOR toggle
        }
      } else {
        // All message bases in conference
        for (const msgBase of msgBases) {
          await toggleScanFlag(session.user.id, confId, msgBase.id, editMask, null); // XOR toggle
        }
      }
    }
  }

  // express.e:24836-24838 - Loop back to menu
  await displayConferenceFlagsMenu(socket, session);
}

// === UTILITY FUNCTIONS ===

// Scan flag bit masks (from express.e)
const ZOOM_SCAN_MASK = 2;   // Bit 1 - Zoom/QWK scanning enabled (express.e:axconsts.e:47)
const MAIL_SCAN_MASK = 4;   // Bit 2 - Mail scanning enabled (express.e:axconsts.e:45)
const FILE_SCAN_MASK = 8;   // Bit 3 - File scanning enabled (express.e:axconsts.e:46)
const MAILSCAN_ALL = 128;   // Bit 7 - Scan all messages, not just addressed to user (express.e:axconsts.e:48)

/**
 * The caller's scan masks for a conference/base: handle[0] of his Conf.DB
 * record, which is what express.e's CF edits (24780, 24789, Eor 24812) and every
 * scan reads back (572-591, 24700, 24710).
 */
async function getUserScanFlags(userId: string, confId: number, msgBaseId: number): Promise<number> {
  const { getConferenceScanFlags } = require('../../utils/message-pointers.util');
  try {
    return await getConferenceScanFlags(userId, confId, msgBaseId);
  } catch (error) {
console.error('[CF] Error getting scan flags:', error);
    return 0;
  }
}

/**
 * Toggle scan flag for a conference/base, in the caller's Conf.DB record.
 * @param mode - true=OR (set), false=AND NOT (clear), null=XOR (toggle)
 */
async function toggleScanFlag(
  userId: string,
  confId: number,
  msgBaseId: number,
  mask: number,
  mode: boolean | null
): Promise<void> {
  const { setConferenceScanFlags } = require('../../utils/message-pointers.util');
  try {
    await setConferenceScanFlags(userId, confId, msgBaseId, (flags: number) =>
      mode === true ? flags | mask : mode === false ? flags & ~mask : flags ^ mask);
  } catch (error) {
console.error('[CF] Error toggling scan flag:', error);
  }
}
