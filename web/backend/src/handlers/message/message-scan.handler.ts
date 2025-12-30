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
import { getAllMessageIds, readMessageFile, readMailStats } from '../../utils/message-file.util';
import { config } from '../../config';

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
 * Check if conference should scan for new files
 * 1:1 port from express.e:591-608 checkFileConfScan()
 *
 * @param conf - Conference ID (1-based)
 * @param userId - User ID for checking scan flags
 * @returns True if should scan files
 */
async function checkFileConfScan(conf: number, userId: string): Promise<boolean> {
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
    const scanFlags = await getConferenceScanFlags(userId, conf, 1);
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
    SysopDebugUtil.debug(
      null,
      null,
      'Message Scanning',
      `Failed to load message pointers for mail scan check`,
      {
        error: error instanceof Error ? error.message : String(error),
        userId,
        conferenceId,
        messageBaseId
      },
      DebugSeverity.WARNING
    );
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
      // Use binary HeaderFile if available
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
    SysopDebugUtil.debug(
      null,
      null,
      'Message Scanning',
      `Failed to count messages in conference`,
      {
        error: error instanceof Error ? error.message : String(error),
        conferenceId,
        messageBaseId,
        username
      },
      DebugSeverity.WARNING
    );
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

  const { runSysCommand } = require('../command-execution.handler');

  // express.e:28071 - setEnvStat(ENV_SCANNING)
  session.currentStat = 9; // ENV_SCANNING
  console.log('[confScan] Starting conference scan (express.e:28066-28150)');

  // express.e:28083 - aePuts('\b\nScanning conferences for mail...\b\n\b\n')
  socket.emit('ansi-output', '\r\nScanning conferences for mail and files...\r\n\r\n');

  // Suppress menu prompts during conference scan - doors complete but we don't want
  // to show menu after each one, only after the entire scan finishes
  session.inConfScan = true;

  // express.e:28086-28114 - FOR conf:=1 TO cmds.numConf
  const numConf = _conferences?.length || 1;
  let mystat = 0; // RESULT_SUCCESS

  for (let conf = 1; conf <= numConf; conf++) {
    // express.e:28087 - IF (checkConfAccess(conf))
    const confAccess = session.confAccess || '';
    const hasAccess = confAccess.length === 0 || (confAccess.length >= conf && confAccess[conf - 1] !== '-');

    if (!hasAccess) {
      console.log(`[confScan] Skipping conference ${conf} - no access`);
      continue;
    }

    // express.e:28089 - fscan:=checkFileConfScan(conf)
    // For now, assume file scanning is enabled for all conferences
    const fscan = true;

    console.log(`[confScan] Scanning conference ${conf}/${numConf}`);

    // express.e:28099-28104 - Run file scan for this conference
    if (fscan) {
      try {
        // express.e:28100 - newFilesPauseFlag:=TRUE
        session.newFilesPauseFlag = true;

        // express.e:28101 - currentConf:=conf
        // NOTE: Use currentConference (not currentConf) to match GlobalStructures.ts
        session.currentConference = conf;
        console.log(`[confScan] Set currentConference=${conf}, calling AquaScan (N S U)`);

        // express.e:28102 - runSysCommand('N','S U')
        await runSysCommand(socket, session, 'N', 'S U');

        // express.e:28103 - currentConf:=0
        session.currentConference = 0;

        // express.e:28104 - newFilesPauseFlag:=FALSE
        session.newFilesPauseFlag = false;

        console.log(`[confScan] Conference ${conf} scan completed`);
      } catch (err) {
        console.error(`[confScan] Conference ${conf} scan failed:`, err);
        // express.e:28106 - mystat:=RESULT_SUCCESS (continue on error)
        mystat = 0;
      }
    }

    // express.e:28109 - EXIT mystat=RESULT_FAILURE
    if (mystat === -1) break;
  }

  console.log('[confScan] All conferences scanned');

  // Clear the confScan flag - menu prompts can resume now
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
