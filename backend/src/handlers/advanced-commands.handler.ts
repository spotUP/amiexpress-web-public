/**
 * Advanced Commands Handler
 *
 * Implements advanced BBS commands as 1:1 ports from express.e:
 * - GR (Greetings) - Amiga scene tribute - express.e:24411-24423
 * - MS (Mail Scan) - Scan all conferences for new mail - express.e:25250-25279
 * - CF (Conference Flags) - Manage conference scanning flags - express.e:24672-24750
 */

import { LoggedOnSubState } from '../constants/bbs-states';
import { ACSPermission } from '../constants/acs-permissions';
import { checkSecurity } from '../utils/acs.util';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';

// Types
interface BBSSession {
  user?: any;
  subState?: string;
  menuPause?: boolean;
  [key: string]: any;
}

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

// Dependencies injected from index.ts
let _conferences: Conference[] = [];
let _messages: Message[] = [];
let _checkConfAccess: (user: any, conferenceId: number) => boolean;

/**
 * Set dependencies for advanced commands (called from index.ts)
 */
export function setAdvancedCommandsDependencies(deps: {
  conferences: Conference[];
  messages: Message[];
  checkConfAccess: typeof _checkConfAccess;
}) {
  _conferences = deps.conferences;
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
export function handleGreetingsCommand(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('In memory of those who came before us...', 'cyan'));
  socket.emit('ansi-output', '\r\n\r\n');

  // Amiga demo scene groups (exactly as in express.e)
  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'scoopex');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'lsd');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'skid row');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'alpha flight');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'trsi');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'bamiga sector one');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'fairlight');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'defjam');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'paradox');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'legend');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'anthrox');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'crystal');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'angels');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'vision factory');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'zenith');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'slipstream');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'dual crew');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'delight');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'shining');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'quartex');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'global overdose');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'paranoimia');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'supplex');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'classic');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'hoodlum');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'accumulators');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'hellfire');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'oracle');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'endless piracy');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'hqc');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'setrox');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'prodigy');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'prestige');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'nemesis');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'genesis');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'loonies');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'horizon');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'agile');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'crack inc');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'valhalla');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'sunflex inc');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'ministry');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'the band');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'razor1911');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', AnsiUtil.colorize('[', 'blue'));
  socket.emit('ansi-output', 'conqueror and zike');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'mad');
  socket.emit('ansi-output', AnsiUtil.colorize('] [', 'blue'));
  socket.emit('ansi-output', 'the company');
  socket.emit('ansi-output', AnsiUtil.colorize(']', 'blue'));
  socket.emit('ansi-output', '\r\n\r\n');

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
export function handleMailScanCommand(socket: any, session: BBSSession): void {
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Mailscan'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'Scanning all conferences for new messages...\r\n\r\n');

  // Get all conferences user has access to
  const accessibleConferences = _conferences.filter(conf => _checkConfAccess(session.user, conf.id));

  let totalNewMessages = 0;
  let scannedConferences = 0;

  accessibleConferences.forEach(conf => {
    const confMessages = _messages.filter(msg =>
      msg.conferenceId === conf.id &&
      msg.timestamp > (session.user?.lastLogin || new Date(0)) &&
      (!msg.isPrivate || msg.toUser === session.user?.username || msg.author === session.user?.username)
    );

    if (confMessages.length > 0) {
      socket.emit('ansi-output', AnsiUtil.colorize(`${conf.name}:`, 'yellow'));
      socket.emit('ansi-output', ` ${confMessages.length} new message(s)\r\n`);
      totalNewMessages += confMessages.length;
    }
    scannedConferences++;
  });

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `Total new messages: ${totalNewMessages}\r\n`);
  socket.emit('ansi-output', `Conferences scanned: ${scannedConferences}\r\n`);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
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
  // express.e:24688 - Clear screen
  socket.emit('ansi-output', '\x1b[2J\x1b[H');
  socket.emit('ansi-output', '\r\n');

  // express.e:24689-24690 - Header
  socket.emit('ansi-output', AnsiUtil.colorize('        M A F Z Conference                      M A F Z Conference', 'green'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.colorize('        ~ ~ ~ ~ ~~~~~~~~~~~~~~~~~~~~~~~         ~ ~ ~ ~ ~~~~~~~~~~~~~~~~~~~~~~~', 'yellow'));
  socket.emit('ansi-output', '\r\n\r\n');

  // express.e:24692-24731 - List all accessible conferences with flags
  const { db } = require('../database');
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

      // express.e:24695-24726 - Determine flag status (*, F, D, or space)
      const mailFlag = (scanFlags & MAIL_SCAN_MASK) ? '*' : ' ';
      const fileFlag = (scanFlags & FILE_SCAN_MASK) ? '*' : ' ';
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

  // express.e:24735-24737 - Prompt for flag type to edit
  socket.emit('ansi-output', '\r\n\r\nEdit which flags ');
  socket.emit('ansi-output', AnsiUtil.colorize('[M]', 'green') + 'ailScan, ');
  socket.emit('ansi-output', AnsiUtil.colorize('[A]', 'green') + 'll Messages, ');
  socket.emit('ansi-output', AnsiUtil.colorize('[F]', 'green') + 'ileScan, ');
  socket.emit('ansi-output', AnsiUtil.colorize('[Z]', 'green') + 'oom >: ');

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

  // express.e:24753-24754 - Prompt for conference numbers
  socket.emit('ansi-output', "Enter Conference Numbers, ");
  socket.emit('ansi-output', AnsiUtil.colorize('*', 'yellow') + " toggle all, ");
  socket.emit('ansi-output', AnsiUtil.colorize('-', 'yellow') + " All off, ");
  socket.emit('ansi-output', AnsiUtil.colorize('+', 'yellow') + " All on >: ");

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
  const { db } = require('../database');

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
const MAIL_SCAN_MASK = 4;   // Bit 2 - Mail scanning enabled
const FILE_SCAN_MASK = 8;   // Bit 3 - File scanning enabled
const ZOOM_SCAN_MASK = 16;  // Bit 4 - Zoom scanning enabled
const MAILSCAN_ALL = 32;    // Bit 5 - Scan all messages (not just new)

/**
 * Get user's scan flags for a conference/base
 */
async function getUserScanFlags(userId: string, confId: number, msgBaseId: number): Promise<number> {
  const { db } = require('../database');

  try {
    const result = await db.query(
      'SELECT scan_flags FROM conf_base WHERE user_id = $1 AND conference_id = $2 AND message_base_id = $3',
      [userId, confId, msgBaseId]
    );

    if (result.rows.length > 0) {
      return result.rows[0].scan_flags || 12; // Default: MAIL_SCAN_MASK | FILE_SCAN_MASK
    }

    // No entry yet, return default
    return 12; // MAIL_SCAN_MASK | FILE_SCAN_MASK
  } catch (error) {
    console.error('[CF] Error getting scan flags:', error);
    return 12;
  }
}

/**
 * Toggle scan flag for a conference/base
 * @param mode - true=OR (set), false=AND NOT (clear), null=XOR (toggle)
 */
async function toggleScanFlag(
  userId: string,
  confId: number,
  msgBaseId: number,
  mask: number,
  mode: boolean | null
): Promise<void> {
  const { db } = require('../database');

  try {
    // Get current flags
    const currentFlags = await getUserScanFlags(userId, confId, msgBaseId);

    // Calculate new flags
    let newFlags: number;
    if (mode === true) {
      newFlags = currentFlags | mask; // OR - set bit
    } else if (mode === false) {
      newFlags = currentFlags & ~mask; // AND NOT - clear bit
    } else {
      newFlags = currentFlags ^ mask; // XOR - toggle bit
    }

    // Upsert to database
    await db.query(
      `INSERT INTO conf_base (user_id, conference_id, message_base_id, scan_flags)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, conference_id, message_base_id)
       DO UPDATE SET scan_flags = $4`,
      [userId, confId, msgBaseId, newFlags]
    );
  } catch (error) {
    console.error('[CF] Error toggling scan flag:', error);
  }
}
