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
 * From express.e:24672-24750:
 * PROC internalCommandCF()
 *   - Check ACS_CONFFLAGS permission
 *   - Display list of conferences with M/A/F/Z flags
 *   - Allow user to toggle flags for individual conferences
 *   - Parse patterns like "1,3-5,7" for bulk changes
 *   - Save conference flag preferences per user
 * ENDPROC
 *
 * Manages which conferences are flagged for automatic scanning.
 * M = Mail scan, A = Auto-join, F = File scan, Z = Auto-read
 */
export function handleConferenceFlagsCommand(socket: any, session: BBSSession): void {
  if (!checkSecurity(session.user, ACSPermission.CONFFLAGS)) {
    ErrorHandler.permissionDenied(socket, 'manage conference flags', {
      nextState: LoggedOnSubState.DISPLAY_MENU
    });
    return;
  }

  // TODO: Implement full conference flag management - express.e:24685-24750
  // This requires:
  // - Display list of conferences with current flag status
  // - Allow toggle of individual conference flags
  // - Parse flag patterns like "1,3-5,7" for bulk changes
  // - Save conference flag preferences per user
  // - Database table for user conference flags

  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.headerBox('Conference Flags'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.warningLine('Conference flag management not yet implemented'));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', 'This allows you to select which conferences to scan for new messages.\r\n');
  socket.emit('ansi-output', 'Flags: M=Mail A=Auto-join F=File Z=Auto-read\r\n');
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.pressKeyPrompt());

  session.menuPause = false;
  session.subState = LoggedOnSubState.DISPLAY_CONF_BULL;
}
