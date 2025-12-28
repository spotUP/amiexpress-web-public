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
 * Scan all conferences for new mail
 * 1:1 port from express.e:28066-28150 confScan()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 */
export async function performConferenceScan(socket: any, session: any): Promise<number> {
  if (!session.user) {
    console.warn('confScan: No user in session');
    return 0; // RESULT_SUCCESS
  }

  // express.e:28067-28070 - DEF mystat,conf,n,msgbase / DEF prompt=FALSE / DEF mscan=TRUE / DEF fscan=TRUE
  let mscan = true;

  // express.e:28071 - setEnvStat(ENV_SCANNING)
  console.log('[ENV] Scanning conferences for mail');

  // express.e:28073 - displayScreen(SCREEN_MAILSCAN)
  // SKIP: Displaying MAILSCAN screen causes confusion when file scan (AquaScan) takes 5+ minutes
  // User sees static "Scanning..." message while AquaScan runs, thinks it's frozen
  // Better to let AquaScan output its own progress directly

  // express.e:28075-28080 - Check MAILSCAN_PROMPT tooltype (skip for now, always scan)
  // const prompt = checkToolTypeExists(TOOLTYPE_NODE, node, 'MAILSCAN_PROMPT');
  // if (prompt) { ... yesNo() ... }

  // express.e:28082-28084 - IF (prompt=FALSE) OR (mscan=TRUE)
  if (mscan) {
    // express.e:28083 - aePuts('\b\nScanning conferences for mail...\b\n\b\n')
    // Clear pause prompt line and emit scanning message
    socket.emit('ansi-output', '\r' + ' '.repeat(80) + '\r\r\n' + AnsiUtil.colorize('Scanning conferences for mail and files...', 'cyan') + '\r\n\r\n');

    // express.e:28084-28085 - lineCount:=2 / mciViewSafe:=FALSE
    // (lineCount and mciViewSafe are UI-specific, not needed for web)

    // express.e:28086 - FOR conf:=1 TO cmds.numConf
    for (let conf = 1; conf <= _conferences.length; conf++) {
      const conference = _conferences[conf - 1];
      if (!conference) continue;

      // express.e:28087 - IF (checkConfAccess(conf))
      if (!checkConfAccess(session.user, conf)) {
        console.log(`[confScan] Skip conference ${conf} (${conference.name}) - no access`);
        continue;
      }

      // express.e:28089 - fscan:=checkFileConfScan(conf)
      const fscan = await checkFileConfScan(conf, session.user.id);

      // express.e:28092-28093 - n:=getConfMsgBaseCount(conf) / FOR msgbase:=1 TO n
      const confMessageBases = _messageBases.filter(mb => mb.conferenceId === conference.id);
      const n = confMessageBases.length;

      for (let msgbaseIdx = 0; msgbaseIdx < n; msgbaseIdx++) {
        const msgbase = confMessageBases[msgbaseIdx];
        console.log(`[confScan] Checking msgbase ${msgbase.id} in conf ${conf}`);

        // express.e:28094-28096 - IF prompt=FALSE THEN mscan:=checkMailConfScan(conf,msgbase)
        const shouldScanMail = await checkMailConfScan(conf, msgbase.id, session.user.id);
        console.log(`[confScan] shouldScanMail=${shouldScanMail} for conf ${conf} msgbase ${msgbase.id}`);

        // express.e:28097 - mystat:=joinConf(conf,msgbase,TRUE,FALSE,IF mscan=FALSE THEN FORCE_MAILSCAN_SKIP ELSE FORCE_MAILSCAN_NOFORCE)
        // When confScan=TRUE, joinConf: loads pointers, gets mail stats, calls MAIL_SCAN if mscan=TRUE, saves pointers
        // We implement this inline since our joinConference doesn't have confScan parameter
        try {
          console.log(`[confScan] Loading pointers for conf ${conf} msgbase ${msgbase.id}`);
          // Load message pointers (express.e:5026 loadMsgPointers)
          const pointers = await loadMsgPointers(session.user.id, conf, msgbase.id);

          console.log(`[confScan] Getting mail stats for conf ${conf} msgbase ${msgbase.id}`);
          // Get mail stats (express.e:5029 getMailStatFile)
          const mailStat = await getMailStatFile(conf, msgbase.id);

          // Validate pointers (express.e:5037-5049)
          const validated = mailStat ? validatePointers(pointers, mailStat) : pointers;

          // express.e:5119-5127 - IF (auto=FALSE) AND (forceMailScan<>FORCE_MAILSCAN_SKIP)
          // During confScan, auto=FALSE, so if shouldScanMail=TRUE, call MAIL_SCAN
          if (shouldScanMail) {
            console.log(`[confScan] Counting new messages for conf ${conf} msgbase ${msgbase.id}`);
            // express.e:5122 - mystat:=callMsgFuncs(MAIL_SCAN,conf,msgBaseNum)
            // MAIL_SCAN counts new messages and returns them
            const counts = await countNewMessages(session.user.id, conf, msgbase.id, session.user.username || session.user.name || '');
            console.log(`[confScan] Found ${counts.newPublic} public, ${counts.newPrivate} private for conf ${conf} msgbase ${msgbase.id}`);

            // express.e:5126 - saveMsgPointers(conf,msgBaseNum)
            // Update scan pointer to mark messages as scanned
            const newPointer = counts.mailStatHigh || counts.lastScanned;
            if (newPointer > 0) {
              console.log(`[confScan] Updating scan pointer to ${newPointer} for conf ${conf} msgbase ${msgbase.id}`);
              await updateScanPointer(session.user.id, conf, msgbase.id, newPointer);
            }
          }
          console.log(`[confScan] Done with msgbase ${msgbase.id} in conf ${conf}`);
        } catch (err) {
          console.error(`[confScan] Failed to scan conf ${conf} msgbase ${msgbase.id}:`, err);
          // Express.e doesn't abort on error, continue with next msgbase
        }
      }

      // express.e:28099-28104 - IF (mystat=RESULT_SUCCESS) AND (fscan)
      console.log(`[confScan] fscan=${fscan} for conf ${conf}`);
      if (fscan) {
        try {
          console.log(`[confScan] Running new files scan for conf ${conf}`);
          // express.e:28100 - newFilesPauseFlag:=TRUE
          // (UI flag, not needed for web)

          // express.e:28101-28102 - currentConf:=conf / runSysCommand('N','S U')
          const currentConfBackup = session.currentConf;
          session.currentConf = conf;
          const { runSysCommand } = require('../command-execution.handler');

          // File scan doors don't exit cleanly in batch mode - add 30s timeout
          const FILE_SCAN_TIMEOUT = 30000;
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('File scan timeout')), FILE_SCAN_TIMEOUT)
          );

          try {
            await Promise.race([
              runSysCommand(socket, session, 'N', 'S U'),
              timeoutPromise
            ]);
          } catch (err) {
            if (err instanceof Error && err.message === 'File scan timeout') {
              console.log(`[confScan] File scan timed out after ${FILE_SCAN_TIMEOUT}ms for conf ${conf} - continuing`);
              // Force kill the door session if it's still running
              if ((session as any).inDoorManager) {
                (session as any).inDoorManager = false;
              }
            } else {
              throw err;
            }
          }

          // express.e:28103 - currentConf:=0
          session.currentConf = currentConfBackup;
          console.log(`[confScan] New files scan complete for conf ${conf}`);

          // express.e:28104 - newFilesPauseFlag:=FALSE
        } catch (err) {
          console.error(`[confScan] Failed to run new-files scan for conf ${conf}:`, err);
          // Continue with next conference
        }
      }

      console.log(`[confScan] Finished conf ${conf} (${conference.name})`);

      // express.e:28109-28113 - EXIT mystat=RESULT_FAILURE / check timeout/no carrier
      // (For web, we don't need carrier checks)
    }

    // express.e:28115 - mciViewSafe:=TRUE
  }

  // express.e:28117-28147 - Part upload check (TODO: implement if needed)
  // For now, skip this section

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
