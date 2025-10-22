/**
 * Message Scan Handler - Conference message scanning system
 *
 * 1:1 port from express.e:28066-28120 confScan()
 */

import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { AnsiUtil } from '../utils/ansi.util';
import { LoggedOnSubState } from '../constants/bbs-states';

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
 * Check if user has access to a conference
 * 1:1 port from express.e:8499-8514 checkConfAccess()
 *
 * @param user - User object
 * @param conferenceId - Conference ID (1-based)
 * @returns True if user has access
 */
export function checkConfAccess(user: any, conferenceId: number): boolean {
  if (!user) return false;

  // express.e:8506-8511 - Check confAccess string
  // confAccess is a string where each character represents access to a conference
  // 'X' = has access, '_' = no access
  // Conference IDs are 1-based, so conferenceId=1 checks position [0]
  if (user.confAccess && user.confAccess.length >= conferenceId) {
    return user.confAccess[conferenceId - 1] === 'X';
  }

  // Default: no access if confAccess not set or too short
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
function checkMailConfScan(conferenceId: number, messageBaseId: number): boolean {
  // express.e:572-591 - Checks FORCE_NEWSCAN, NO_NEWSCAN tooltypes
  // For web version, we'll always scan (simplified)
  return true;
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
  messageBaseId: number
): Promise<{ newPublic: number; newPrivate: number }> {
  if (!_db) {
    return { newPublic: 0, newPrivate: 0 };
  }

  try {
    // Get all messages in this message base
    const messages = await _db.getMessages(conferenceId, messageBaseId, { limit: 1000 });

    let newPublic = 0;
    let newPrivate = 0;

    // For now, we'll consider all messages as "new" if the user hasn't read them
    // In a full implementation, we would track read message pointers per user
    for (const msg of messages) {
      if (msg.isPrivate && (msg.toUser === userId || msg.author === userId)) {
        newPrivate++;
      } else if (!msg.isPrivate) {
        newPublic++;
      }
    }

    return { newPublic, newPrivate };
  } catch (error) {
    console.error(`Error counting messages in conf ${conferenceId} msgbase ${messageBaseId}:`, error);
    return { newPublic: 0, newPrivate: 0 };
  }
}

/**
 * Scan all conferences for new mail
 * 1:1 port from express.e:28066-28120 confScan()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function performConferenceScan(socket: any, session: any): Promise<void> {
  if (!session.user) {
    console.warn('confScan: No user in session');
    return;
  }

  // express.e:28071 - setEnvStat(ENV_SCANNING)
  console.log('[ENV] Scanning conferences for mail');

  // express.e:28073 - displayScreen(SCREEN_MAILSCAN)
  // But don't display yet - we'll build a custom scan report

  // express.e:28076-28079 - Check MAILSCAN_PROMPT tooltype
  // For web version, we skip the prompt and always scan

  // express.e:28082 - "Scanning conferences for mail..."
  socket.emit('ansi-output', '\r\n' + AnsiUtil.header('Scanning Conferences for Mail') + '\r\n');
  socket.emit('ansi-output', '\r\n');

  let totalNewPublic = 0;
  let totalNewPrivate = 0;
  let scannedConferences = 0;

  // express.e:28085-28093 - Loop through all conferences
  for (let confNum = 1; confNum <= _conferences.length; confNum++) {
    const conference = _conferences[confNum - 1];

    if (!conference) continue;

    // express.e:28086 - Check conference access
    if (!checkConfAccess(session.user, confNum)) {
      console.log(`  Skip conference ${confNum} (${conference.name}) - no access`);
      continue;
    }

    scannedConferences++;
    socket.emit('ansi-output', `  ${AnsiUtil.colorize('●', 'cyan')} Scanning ${AnsiUtil.colorize(conference.name, 'white')}...`);

    // express.e:28091-28096 - Loop through message bases in conference
    const confMessageBases = _messageBases.filter(mb => mb.conferenceId === conference.id);
    let confNewPublic = 0;
    let confNewPrivate = 0;

    for (const msgBase of confMessageBases) {
      // express.e:28093-28094 - Check if should scan this msgbase
      if (!checkMailConfScan(confNum, msgBase.id)) {
        continue;
      }

      // Count new messages
      const counts = await countNewMessages(session.user.id, conference.id, msgBase.id);
      confNewPublic += counts.newPublic;
      confNewPrivate += counts.newPrivate;
    }

    totalNewPublic += confNewPublic;
    totalNewPrivate += confNewPrivate;

    // Show result for this conference
    const totalNew = confNewPublic + confNewPrivate;
    if (totalNew > 0) {
      socket.emit('ansi-output', ` ${AnsiUtil.colorize(`${totalNew} new`, 'green')}\r\n`);
    } else {
      socket.emit('ansi-output', ` ${AnsiUtil.colorize('no new mail', 'yellow')}\r\n`);
    }
  }

  // express.e:28105-28115 - Display summary
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.line('────────────────────────────────────────'));
  socket.emit('ansi-output', AnsiUtil.successLine(`Mail scan complete!`));
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('• Conferences scanned:', 'white')} ${AnsiUtil.colorize(scannedConferences.toString(), 'cyan')}\r\n`);
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('• New public messages:', 'white')} ${AnsiUtil.colorize(totalNewPublic.toString(), 'green')}\r\n`);
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('• New private messages:', 'white')} ${AnsiUtil.colorize(totalNewPrivate.toString(), 'green')}\r\n`);
  socket.emit('ansi-output', `  ${AnsiUtil.colorize('• Total unread:', 'white')} ${AnsiUtil.colorize((totalNewPublic + totalNewPrivate).toString(), 'cyan')}\r\n`);
  socket.emit('ansi-output', '\r\n');
  socket.emit('ansi-output', AnsiUtil.line('────────────────────────────────────────'));

  // Store scan results in session for display in other screens
  session.lastScanNewPublic = totalNewPublic;
  session.lastScanNewPrivate = totalNewPrivate;
  session.lastScanTotal = totalNewPublic + totalNewPrivate;
}

/**
 * Display the MailScan screen and perform conference scan
 * Called during login flow (express.e:28566-28648)
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function displayMailScanScreen(socket: any, session: any): Promise<void> {
  // express.e:28073 - displayScreen(SCREEN_MAILSCAN)
  if (_loadScreenFile) {
    const content = _loadScreenFile('MailScan', session.currentConf);

    if (content) {
      // Parse MCI codes with scan results
      let parsed = content;

      if (_parseMciCodes) {
        parsed = _parseMciCodes(parsed, session);
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

  // Now perform the actual scan
  await performConferenceScan(socket, session);

  // Press any key to continue
  socket.emit('ansi-output', '\r\n' + AnsiUtil.pressKeyPrompt());
}
