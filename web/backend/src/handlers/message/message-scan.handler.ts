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
import { handleNewFilesCommand } from '../commands/navigation-commands.handler';

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
async function checkFileConfScan(conf: number, userId: string, msgBaseId: number = 1): Promise<boolean> {
  const flags = getConferenceToolFlags(conf);

  // express.e:595-596 - IF((checkToolTypeExists(TOOLTYPE_CONF,conf,'SHOW_NEW_FILES')))
  if (flags.showNewFiles) {
    return true;
  }

  // express.e:597-598 - ELSEIF (checkToolTypeExists(TOOLTYPE_CONF,conf,'NO_NEW_FILES'))
  if (flags.noNewFiles) {
    return false;
  }

  // express.e:601-607 - cb:=confBases.item(getConfIndex(conf,1))
  // Get first message base for this conference and check FILE_SCAN_MASK
  try {
    const scanFlags = await getConferenceScanFlags(userId, conf, msgBaseId);
    const FILE_SCAN_MASK = 8; // express.e FILE_SCAN_MASK
    // express.e:604 - IF (cb.handle[0] AND FILE_SCAN_MASK)<>0 THEN res:=TRUE ELSE res:=FALSE
    return (scanFlags & FILE_SCAN_MASK) !== 0;
  } catch (err) {
    // express.e:606 - ELSE res:=TRUE (default to TRUE if no confBase)
    return true;
  }
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
      // Use binary HeaderFile if available, but only count entries that have
      // a readable .msg file in Messages/. HeaderFile may contain entries from
      // an old import that were never written as Messages/*.msg files, causing
      // a false new-message count when the reader finds nothing to show.
      const bbsDataPath = config.get('dataDir');
      for (const header of headers) {
        if (header.msgNumb <= pointer) {
          continue;
        }
        if (header.status & MsgStatus.DELETED) {
          continue;
        }
        if (!messageFileExists(conferenceId, header.msgNumb, bbsDataPath)) {
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
 * Scan all conferences for new mail and files
 * 1:1 port from express.e:28066-28150 confScan()
 *
 * express.e loops through each conference, joins it, then calls runSysCommand('N','S U')
 * for file scanning. AquaScan scans only the CURRENT conference, so we must set
 * currentConf before each call.
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function performConferenceScan(socket: any, session: any): Promise<number> {
  if (!session.user) {
console.warn('confScan: No user in session');
    return 0; // RESULT_SUCCESS
  }

  // NOTE: We use internal handler directly instead of runSysCommand('N')
  // because n.info points to AquaScan which writes to files, not terminal
  const { joinConference } = require('../operations/conference.handler');
  const { checkForPause } = require('../../utils/flag-pause.util');

  // express.e:28071 - setEnvStat(ENV_SCANNING)
  session.currentStat = 9; // ENV_SCANNING
console.log('[confScan] Starting conference scan (express.e:28066-28150)');

  // Initialize line count for pause tracking during scan
  if (!session.tempData) session.tempData = {};
  session.tempData.lineCount = 0;

  // express.e:28083 - aePuts('\b\nScanning conferences for mail...\b\n\b\n')
  socket.emit('ansi-output', '\r\nScanning conferences for mail and files...\r\n\r\n');
  // Count the lines we just output for pause tracking
  session.tempData.lineCount = (session.tempData.lineCount || 0) + 3;

  // Suppress menu prompts during conference scan
  session.inConfScan = true;

  // express.e:28086-28114 - FOR conf:=1 TO cmds.numConf
  const numConf = _conferences?.length || 0;
  let mystat = 0; // RESULT_SUCCESS

  const user = session.user;
  const username = user?.username || 'Unknown';
console.log(`[confScan] Starting scan for ${username}. Total conferences: ${numConf}`);

  // Cache original newSinceDate to restore after scan
  const originalNewSinceDate = user?.newSinceDate;
  
  // Use previous login date for 'New Since' logic during scan
  if (user?.lastLoginBeforeUpdate) {
    user.newSinceDate = user.lastLoginBeforeUpdate;
console.log(`[confScan] Using previous login date for scan: ${user.newSinceDate.toISOString()}`);
  } else {
console.log(`[confScan] WARNING: No previous login date found for ${username}`);
  }

  // Get conference access string
  const confAccess = user?.confAccess || user?.conferenceAccess || '';
console.log(`[confScan] Access string: "${confAccess}" (len=${confAccess.length})`);

  for (let conf = 1; conf <= numConf; conf++) {
    const confName = _conferences[conf - 1]?.name || `Conf ${conf}`;
    
    // express.e:28087 - IF (checkConfAccess(conf))
    // AmiExpress uses 'X' for access, '_' for no access
    const accessChar = confAccess.length >= conf ? confAccess[conf - 1].toUpperCase() : '_';
    const hasAccess = accessChar === 'X';

    if (!hasAccess) {
      if (conf <= 14) { 
console.log(`[confScan] Skipping ${confName} (index ${conf-1}) - char is "${accessChar}"`);
      }
      continue;
    }

console.log(`[confScan] -> Scanning ${confName} (${conf}/${numConf})`);

    try {
      const { runSysCommand } = require('../command-execution.handler');
      const hasAquaScan = await checkCommandExists('N');

      // express.e:28092-28098 — Mail scan ALWAYS runs, regardless of file scanner.
      // Previous code skipped mail scanning entirely when AquaScan was installed,
      // which meant mail notifications (including "eall" from ctop) never appeared.
      const confMsgBases = _messageBases.filter(mb => mb.conferenceId === conf);

      for (const msgBase of confMsgBases) {
        const msgBaseId = msgBase.id;

        // express.e:28095 - mscan:=checkMailConfScan(conf,msgbase)
        const mscan = await checkMailConfScan(conf, msgBaseId, user.id);

        // express.e:28097 - joinConf(conf,msgbase,TRUE,FALSE,...)
        await joinConference(socket, session, conf, msgBaseId, true);

        if (mscan) {
console.log(`[confScan] Mail scan: ${confName} / msgBase ${msgBaseId}`);

          const { newPublic, newPrivate, lastScanned } = await countNewMessages(
            user.id,
            conf,
            msgBaseId,
            username
          );

          session.lastScanNewPublic = (session.lastScanNewPublic || 0) + newPublic;
          session.lastScanNewPrivate = (session.lastScanNewPrivate || 0) + newPrivate;
          session.lastScanTotal = (session.lastScanTotal || 0) + newPublic + newPrivate;

          if (lastScanned > 0) {
            await updateScanPointer(user.id, conf, msgBaseId, lastScanned);
          }

          if (newPublic > 0 || newPrivate > 0) {
            const total = newPublic + newPrivate;
            socket.emit('ansi-output', `\x1b[32m${confName}\x1b[0m: ${total} new message${total !== 1 ? 's' : ''}\r\n`);
            session.tempData.lineCount = (session.tempData.lineCount || 0) + 1;
          }
        }
      }

      // express.e:28089 - fscan:=checkFileConfScan(conf) — only scan files when enabled
      // express.e uses msgbase=1 meaning "first base in this conf", which maps to
      // _messageBases[0].id for this conference (not the global ID 1).
      const firstMsgBase = _messageBases.find(mb => mb.conferenceId === conf);
      const firstMsgBaseId = firstMsgBase ? firstMsgBase.id : 1;
      const fscan = await checkFileConfScan(conf, user.id, firstMsgBaseId);
      if (fscan) {
        if (hasAquaScan) {
console.log(`[confScan] File scan via AquaScan (N S U): ${confName}`);
          await joinConference(socket, session, conf, firstMsgBaseId, true);
          session.newFilesPauseFlag = true;
          await runSysCommand(socket, session, 'N', 'S U');
          session.newFilesPauseFlag = false;
        } else {
console.log(`[confScan] Internal file scan: ${confName}`);
          session.newFilesPauseFlag = true;
          await runSysCommand(socket, session, 'N', 'S U');
          session.newFilesPauseFlag = false;
        }
      }

      const shouldContinue = await checkForPause(socket, session);
      if (!shouldContinue) {
console.log(`[confScan] User stopped scan at conference ${conf}`);
        mystat = -1;
      }
    } catch (err) {
console.error(`[confScan] Conference ${conf} scan failed:`, err);
      mystat = 0; // Continue to next conference
    }

    // express.e:28109 - EXIT mystat=RESULT_FAILURE
    if (mystat === -1) break;
  }

  // express.e:28103 - currentConf:=0
  session.currentConference = 0;
  session.currentConf = 0;
  
  // express.e:28574 - Join default conference after scan finishes
  // This restores currentConf so subsequent screens (CONF_BULL, MENU) can be found.
  const confToJoin = user?.confRJoin || 1;
  const msgToJoin = user?.msgBaseRJoin || 1;
console.log(`[confScan] Scan complete. Joining default conference ${confToJoin} (base ${msgToJoin})`);
  await joinConference(socket, session, confToJoin, msgToJoin, true);

  // Restore current login date
  if (user) {
    user.newSinceDate = originalNewSinceDate;
  }

console.log('[confScan] All conferences scanned');

  // Clear the confScan flag
  session.inConfScan = false;

  // express.e:28149 - ENDPROC RESULT_SUCCESS
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
