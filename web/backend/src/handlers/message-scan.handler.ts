/**
 * Message Scan Handler - Conference message scanning system
 *
 * 1:1 port from express.e:28066-28120 confScan()
 */

import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { AnsiUtil } from '../utils/ansi.util';
import { LoggedOnSubState } from '../constants/bbs-states';
import { getConferenceToolFlags } from '../utils/conference-tooltypes.util';
import {
  loadMsgPointers,
  updateScanPointer,
  validatePointers,
  getConferenceScanFlags
} from '../utils/message-pointers.util';
import { messageIndexManager, MsgStatus } from '../services/MessageIndexManager';

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
const MAIL_SCAN_MASK = 4; // Bit flag for mail scan (matches AmiExpress MAIL_SCAN_MASK)

async function checkMailConfScan(conferenceId: number, messageBaseId: number, userId: string): Promise<boolean> {
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
  username: string
): Promise<{ newPublic: number; newPrivate: number; lastScanned: number; mailStatHigh: number }> {
  const safeName = (username || '').toLowerCase();
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
      for (const header of headers) {
        if (header.msgNumb <= pointer) {
          continue;
        }
        if (header.status & MsgStatus.DELETED) {
          continue;
        }

        lastScanned = Math.max(lastScanned, header.msgNumb);

        const toLower = (header.toName || '').trim().toLowerCase();
        const fromLower = (header.fromName || '').trim().toLowerCase();
        const isPrivate = (header.status & MsgStatus.PRIVATE) === MsgStatus.PRIVATE;

        if (isPrivate) {
          if (safeName && (toLower === safeName || fromLower === safeName)) {
            newPrivate++;
          }
        } else {
          newPublic++;
        }
      }
    } else if (_db) {
      // Fallback to DB rows when legacy header files are missing
      const messages = await _db.getMessages(conferenceId, messageBaseId, { limit: 1000 });
      let msgNum = 0;
      for (const msg of messages.reverse()) {
        msgNum++;
        if (msgNum <= pointer) {
          continue;
        }
        lastScanned = Math.max(lastScanned, msgNum);
        if (msg.isPrivate && safeName && (msg.toUser?.toLowerCase?.() === safeName || msg.author?.toLowerCase?.() === safeName)) {
          newPrivate++;
        } else if (!msg.isPrivate) {
          newPublic++;
        }
      }
      mailStatHigh = Math.max(mailStatHigh, msgNum);
    }
  } catch (error) {
    console.error(`Error counting messages in conf ${conferenceId} msgbase ${messageBaseId}:`, error);
  }

  return { newPublic, newPrivate, lastScanned, mailStatHigh };
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

  // express.e:28073 - await displayScreen(SCREEN_MAILSCAN)
  // But don't display yet - we'll build a custom scan report

  // express.e:28076-28079 - Check MAILSCAN_PROMPT tooltype
  // For now we always scan; prompt behavior can be added when frontend supports it

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
    let fileScanForConf = false;

    for (const msgBase of confMessageBases) {
      // express.e:28093-28094 - Check if should scan this msgbase
      const scanMail = await checkMailConfScan(confNum, msgBase.id, session.user.id);
      if (!scanMail) {
        continue;
      }

      // Count new messages
      const counts = await countNewMessages(session.user.id, conference.id, msgBase.id, session.user.username || session.user.name || '');
      confNewPublic += counts.newPublic;
      confNewPrivate += counts.newPrivate;

      // Update the user's auto-scan pointer (express.e saveMsgPointers after MAIL_SCAN)
      const newPointer = counts.mailStatHigh || counts.lastScanned;
      if (newPointer > 0) {
        try {
          await updateScanPointer(session.user.id, conference.id, msgBase.id, newPointer);
        } catch (err) {
          console.error(`[confScan] Failed to update scan pointer for conf ${conference.id} msgBase ${msgBase.id}:`, err);
        }
      }

      // Track if any base has file-scan enabled to decide N-files scan (express.e checkFileConfScan)
      try {
        const scanFlags = await getConferenceScanFlags(session.user.id, conference.id, msgBase.id);
        const FILE_SCAN_MASK = 8; // matches advanced-commands handler
        if ((scanFlags & FILE_SCAN_MASK) !== 0) {
          fileScanForConf = true;
        }
      } catch (err) {
        console.error(`[confScan] Failed to read scan flags for conf ${conference.id} msgBase ${msgBase.id}:`, err);
      }
    }

    // Mirror express.e checkFileConfScan: if tooltype SHOW_NEW_FILES or per-base FILE_SCAN_MASK, run new files scan
    const fileFlags = getConferenceToolFlags(confNum);
    const shouldScanFiles =
      fileFlags.showNewFiles ||
      (!fileFlags.noNewFiles && fileScanForConf);

    if (shouldScanFiles) {
      try {
        const { runSysCommand } = require('./command-execution.handler');
        const currentConfBackup = session.currentConf;
        session.currentConf = conference.id;
        // "N" with params "S U" (express.e: runSysCommand('N','S U'))
        await runSysCommand(socket, session, 'N', 'S U');
        session.currentConf = currentConfBackup;
      } catch (err) {
        console.error(`[confScan] Failed to run new-files scan for conf ${conference.id}:`, err);
      }
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
  // express.e:28073 - await displayScreen(SCREEN_MAILSCAN)
  if (_loadScreenFile) {
    const screenData = _loadScreenFile('MailScan', session.currentConf);

    if (screenData) {
      // Parse MCI codes with scan results
      let parsed = screenData.content;

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
