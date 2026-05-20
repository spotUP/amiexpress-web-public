/**
 * Conference Handler - Conference management and bulletins
 *
 * Handles conference joining, bulletin display, and conference scanning.
 * Based on express.e conference functions.
 */

import { displayScreen } from '../screen.handler';
import { displayMainMenu } from '../command-handler/menu';
import { getMailStatFile, loadMsgPointers, saveMsgPointers, validatePointers } from '../../utils/message-pointers.util';
import { finalizeCommand } from '../../utils/command-response.util';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { checkConfAccess, checkMailConfScan } from '../message/message-scan.handler';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
import { callersLogManager } from '../../services/CallersLogManager';

import type { BBSSession } from '../../index';

// express.e forceMailScan constants
export const FORCE_MAILSCAN_NONE = 0;   // Normal - check checkMailConfScan()
export const FORCE_MAILSCAN_SKIP = 1;   // Skip mail scan entirely
export const FORCE_MAILSCAN_ALL = 2;    // Force mail scan (MS command)

interface Conference {
  id: number;
  name: string;
}

interface MessageBase {
  id: number;
  name: string;
  conferenceId: number;
}

interface Database {
  query: (sql: string, params: any[]) => Promise<{ rows: any[] }>;
  updateUser: (id: string, updates: any) => Promise<void>;
}

// Injected dependencies
let conferences: Conference[] = [];
let messageBases: MessageBase[] = [];
let db: Database;
let callersLog: (userId: string | null, username: string, action: string, details?: string, nodeId?: number) => Promise<void>;
let loadFlagged: (socket: any, session: BBSSession) => Promise<void>;
let loadHistory: (session: BBSSession) => Promise<void>;
let SCREEN_BULL: string;
let SCREEN_NODE_BULL: string;
let SCREEN_CONF_BULL: string;
let LoggedOnSubState: any;

function getConfScreenName(): string {
  return typeof SCREEN_CONF_BULL !== 'undefined' ? SCREEN_CONF_BULL : 'CONF_BULL';
}

// Injection functions
export function setConferences(confs: Conference[]) {
  conferences = confs;
}

export function setMessageBases(bases: MessageBase[]) {
  messageBases = bases;
}

export function setDatabase(database: Database) {
  db = database;
}

export function setHelpers(helpers: {
  callersLog: typeof callersLog;
  loadFlagged: typeof loadFlagged;
  loadHistory: typeof loadHistory;
}) {
  callersLog = helpers.callersLog;
  loadFlagged = helpers.loadFlagged;
  loadHistory = helpers.loadHistory;
}

export function setConstants(constants: {
  SCREEN_BULL: string;
  SCREEN_NODE_BULL: string;
  SCREEN_CONF_BULL: string;
  LoggedOnSubState: any;
}) {
  SCREEN_BULL = constants.SCREEN_BULL;
  SCREEN_NODE_BULL = constants.SCREEN_NODE_BULL;
  SCREEN_CONF_BULL = constants.SCREEN_CONF_BULL;
  LoggedOnSubState = constants.LoggedOnSubState;
}

/**
 * Display conference bulletins (CONF_BULL)
 * Like express.e:28566-28577 - final bulletin after confScan
 */
export async function displayConferenceBulletins(socket: any, session: BBSSession): Promise<boolean> {
  // Express.e:28565 - IF (displayScreen(SCREEN_CONF_BULL)) THEN doPause()
  const displayed = await displayScreen(socket, session, getConfScreenName());
  return displayed;
}

/**
 * Join conference function (joinConf equivalent)
 * @param auto - If true, this is an auto-rejoin during login (express.e:5066-5088)
 *               Auto-rejoin displays user stats (S command) and "Auto-ReJoined" message
 * @param forceMailScan - Mail scan mode (express.e:5119-5124)
 *               FORCE_MAILSCAN_NONE (0) = check checkMailConfScan()
 *               FORCE_MAILSCAN_SKIP (1) = skip mail scan
 *               FORCE_MAILSCAN_ALL (2) = force mail scan (MS command)
 */
export async function joinConference(socket: any, session: BBSSession, confId: number, msgBaseId: number, silent: boolean = false, auto: boolean = false, forceMailScan: number = FORCE_MAILSCAN_NONE, confScan: boolean = false) {
  // express.e:4982-4993 - ACS forward-walk fallback
  // If user cannot access requested conf, start from 1 and walk forward to first accessible conf.
  // If no accessible conf found at all, display error and disconnect.
  const numConf = conferences.length;
  if (!session.user || !checkConfAccess(session.user, confId)) {
    confId = 1;
  }
  if (confId < 1 || confId > numConf) {
    confId = 1;
  }
  while (confId <= numConf && !checkConfAccess(session.user, confId)) {
    confId++;
  }
  if (confId > numConf) {
    // express.e:4989-4992 - no accessible conference: display error and logoff
    socket.emit('ansi-output', '\r\nYou do not have access to any conferences on this BBS\r\n');
    socket.emit('ansi-output', 'Disconnecting..\r\n');
    const { LoggedOnSubState: SubState } = require('../../constants/bbs-states');
    session.subState = SubState.DISCONNECTING;
    return false;
  }

  const conference = conferences.find(c => c.id === confId);
  if (!conference) {
    // Should not happen after forward-walk, but guard anyway
    if (!silent) socket.emit('ansi-output', '\r\n\x1b[31mInvalid conference!\x1b[0m\r\n');
    return false;
  }

  // express.e:4995 - IF (msgBaseNum<1) OR (msgBaseNum>getConfMsgBaseCount(conf)) THEN msgBaseNum:=1
  // msgBaseId here is a database ID; resolve relative number from it, then re-resolve to DB ID after clamping
  const confMsgBasesAll = messageBases.filter(mb => mb.conferenceId === confId);
  const msgBaseIndexCheck = confMsgBasesAll.findIndex(mb => mb.id === msgBaseId);
  let msgBaseNumResolved = msgBaseIndexCheck >= 0 ? msgBaseIndexCheck + 1 : 1; // 1-indexed
  if (msgBaseNumResolved < 1 || msgBaseNumResolved > confMsgBasesAll.length) {
    msgBaseNumResolved = 1;
  }
  msgBaseId = confMsgBasesAll.length > 0 ? (confMsgBasesAll[msgBaseNumResolved - 1]?.id ?? confMsgBasesAll[0].id) : msgBaseId;

  const messageBase = messageBases.find(mb => mb.id === msgBaseId && mb.conferenceId === confId);
  if (!messageBase) {
    if (!silent) socket.emit('ansi-output', '\r\n\x1b[31mInvalid message base for this conference!\x1b[0m\r\n');
    return false;
  }

  // express.e:11750-11754 — during scans, save oldcn / restore after.
  // Silent or confScan joins are background iterations; they must not leak into
  // user-facing session state (currentConfName / relConfNum drive the menu prompt).
  // Without this gate the partial-upload-check loop in confScan ends in the LAST
  // accessible conf (e.g. 14 for sysop) and the menu briefly shows that conf
  // before AUTO_REJOIN switches back to confRJoin.
  const isBackgroundScan = silent || confScan;
  if (!isBackgroundScan) {
    session.currentConf = confId;
    session.conferenceId = confId; // XIM doors read this
    session.currentConference = confId; // GlobalStructures reads this
    session.currentMsgBase = msgBaseId; // Database ID for internal queries
    session.currentConfName = conference.name;
    session.relConfNum = confId; // For simplicity, use absolute conf number as relative
  }
  // express.e:5130 - IF (auto=FALSE) AND (confScan=FALSE): save confRJoin
  // During confScan or auto-rejoin, confRJoin must NOT be overwritten.
  if (!auto && !confScan) {
    session.confRJoin = confId;
  }

  // express.e:5136 - loggedOnUser.msgBaseRJoin:=msgBaseNum
  // msgBaseRJoin is stored as RELATIVE number (1-indexed), NOT database ID
  // confMsgBasesAll was computed during the ACS forward-walk above (reuse it)
  const confMsgBases = confMsgBasesAll;
  const msgBaseIndex = confMsgBases.findIndex(mb => mb.id === msgBaseId);
  const msgBaseNum = msgBaseIndex >= 0 ? msgBaseIndex + 1 : 1; // 1-indexed

  session.msgBaseRJoin = msgBaseNum;
  if (session.user) {
    // express.e:5130 - only persist confRJoin on explicit user join
    if (!auto && !confScan) {
      session.user.confRJoin = confId;
      session.user.autoRejoin = confId;
      session.user.msgBaseRJoin = msgBaseNum;
      try {
        const { db } = require('../../database');
        await db.updateUser(session.user.id, { autoRejoin: confId, confRJoin: confId });
      } catch (err) {
console.warn('[joinConference] Failed to persist autoRejoin/confRJoin:', err);
      }
    } else {
      session.user.msgBaseRJoin = msgBaseNum;
    }
  }

  // express.e:5028 — IF checkToolTypeExists(TOOLTYPE_CONF,conf,'CUSTOM')=FALSE
  // The CUSTOM tooltype routes the conference through customMsgbaseCmd
  // (a non-standard message-base implementation) instead of the
  // MailStats/HeaderFile pipeline. When set, skip the standard
  // mail-stat lookup, message-range display, and mail scan. Audit F-2.
  const confFlags = getConferenceToolFlags(confId);
  const isCustom = confFlags.custom;

  // Load message pointers for this conference/msg base (express.e joinConf sets lastMsgReadConf/lastNewReadConf)
  let mailStat: any = null;
  if (session.user && !isCustom) {
    try {
      mailStat = await getMailStatFile(confId, msgBaseId);
      const confBase = await loadMsgPointers(session.user.id, confId, msgBaseId);
      const validated = mailStat ? validatePointers(confBase, mailStat) : confBase;
      let lastMsgReadConf = validated.lastMsgReadConf || 0;
      let lastNewReadConf = validated.lastNewReadConf || 0;
      // express.e:5037-5038 - clamp read pointers up to lowestNotDel
      // IF(lastMsgReadConf<mailStat.lowestNotDel) THEN lastMsgReadConf:=mailStat.lowestNotDel
      // IF(lastNewReadConf<mailStat.lowestNotDel) THEN lastNewReadConf:=mailStat.lowestNotDel
      if (mailStat && mailStat.lowestNotDel > 0) {
        if (lastMsgReadConf < mailStat.lowestNotDel) lastMsgReadConf = mailStat.lowestNotDel;
        if (lastNewReadConf < mailStat.lowestNotDel) lastNewReadConf = mailStat.lowestNotDel;
      }
      session.lastMsgReadConf = lastMsgReadConf;
      session.lastNewReadConf = lastNewReadConf;
    } catch (err) {
console.error('[joinConference] Failed to load/validate message pointers:', err);
      session.lastMsgReadConf = 0;
      session.lastNewReadConf = 0;
    }
  } else if (isCustom) {
    // CUSTOM conference — read pointers don't apply. express.e leaves
    // them unchanged; we just clear so downstream consumers don't see
    // stale values from the previous conference.
    session.lastMsgReadConf = 0;
    session.lastNewReadConf = 0;
  }

  // express.e:5130-5138 - createNodeUserFiles() only runs when !auto AND !confScan
  // (interactive conference joins only, not auto-rejoin at login or confScan passes)
  if (!auto && !confScan && session.user && session.nodeId !== undefined) {
    try {
      const { nodeFileManager } = require('../../services/NodeFileManager');
      nodeFileManager.writeNodeUserFile(session.nodeId, session.user);
    } catch (err) {
console.warn('[joinConference] Failed to sync node user file:', err);
    }
  }

  // express.e:5119-5128 - Mail scan logic
  // Runs when: auto=FALSE AND forceMailScan != FORCE_MAILSCAN_SKIP
  // Then scans if: FORCE_MAILSCAN_ALL OR checkMailConfScan() returns true
  // After scan: saveMsgPointers() persists updated read pointers to disk
  //
  // WEB_: when called from confScan (advanceConferenceScan), skip the
  // per-conf mail scan here. advanceConferenceScan iterates the same
  // conferences and runs the scan + "Would you like to read it now" prompt
  // itself (express.e:11737-11765 — the prompt lives in searchNewMail). If
  // we ran it here too, performSingleConfMailScan would advance the read
  // pointer first and the outer loop's getMessagesForConfScan would find
  // nothing, suppressing the prompt.
  if (!auto && !confScan && forceMailScan !== FORCE_MAILSCAN_SKIP && session.user) {
    let shouldScan = forceMailScan === FORCE_MAILSCAN_ALL;
    if (!shouldScan) {
      // express.e:5120 - checkMailConfScan(conf, msgBaseNum)
      try {
        shouldScan = await checkMailConfScan(confId, msgBaseId, session.user.id);
      } catch (err) {
console.warn('[joinConference] checkMailConfScan error:', err);
      }
    }
    if (shouldScan) {
      // express.e:5121-5125 — IF checkToolTypeExists CUSTOM=FALSE THEN
      //   callMsgFuncs(MAIL_SCAN, conf, msgBaseNum)
      // ELSE
      //   customMsgbaseCmd(MAIL_SCAN, conf, 0)
      // ENDIF
      // We don't have customMsgbaseCmd (no in-tree CUSTOM message base
      // implementation), so the CUSTOM branch is a no-op — the standard
      // scan would dump zeroes / scan empty data and confuse the user.
      if (!isCustom) {
        try {
          // express.e:5122 - callMsgFuncs(MAIL_SCAN, conf, msgBaseNum)
          // In our implementation this is the per-conference mail scan (display new message list)
          const { performSingleConfMailScan } = require('../message/message-scan.handler');
          if (performSingleConfMailScan) {
            await performSingleConfMailScan(socket, session, confId, msgBaseId);
          }
        } catch (err) {
console.warn('[joinConference] Mail scan error:', err);
        }
        // express.e:5126 - saveMsgPointers(conf, msgBaseNum)
        try {
          const confBase = await loadMsgPointers(session.user.id, confId, msgBaseId);
          confBase.lastNewReadConf = session.lastNewReadConf || confBase.lastNewReadConf;
          confBase.lastMsgReadConf = session.lastMsgReadConf || confBase.lastMsgReadConf;
          await saveMsgPointers(confBase);
        } catch (err) {
console.warn('[joinConference] saveMsgPointers error:', err);
        }
      }
    }
  }

  // Log conference join — SQL (web activity widget) + disk (express.e
  // parity, express.e:9493 callersLog). Was SQL-only per audit
  // 2026-05-18_sqlite-disk-parity-audit.md.
  if (session.user) {
    await callersLog(session.user.id, session.user.username, 'Joined conference', conference.name);
    callersLogManager.logActivity(session.nodeId || 1, `\tJoined conference: ${conference.name}`);
  }

  if (!silent) {
    // express.e:5056-5061 — when confScan=FALSE, joinConf displays
    // SCREEN_CONF_BULL and pauses BEFORE the "Joining Conference"
    // line. doPause in express.e BLOCKS until keypress; in our async
    // model it yields and the rest of the join must resume on
    // dismissal. We split into two parts: showCONF_BULL+pause, then
    // continueJoin on pause-dismissal (or immediately if no pause).
    //
    // A previous version moved CONF_BULL out to the caller; only the
    // AUTO_REJOIN display-flow branch put it back, so manual `j N`
    // via handleJoinConferenceCommand → joinConference skipped the
    // BULL entirely. Putting it back inline matches express.e 1:1.
    if (!confScan) {
      // currentMenuName must be cleared so MCI codes inside CONF_BULL
      // that reference the menu name don't render the prior conf's
      // stale value (express.e:5057 StrCopy(currentMenuName,'')).
      (session as any).currentMenuName = '';
      const shown = await displayScreen(socket, session, getConfScreenName(), true, /* silent */ true);
      if (shown) {
        const { doPause } = require('../screen.handler');
        // If displayScreen installed its own pagination/segment pause
        // (~SP inside the bull), don't stack another doPause. Either
        // way, schedule continueJoinAfterBull as the dismissal
        // continuation so the rest of the join runs on user input.
        const continuation = () =>
          continueJoinAfterBull(socket, session, conference, messageBase, messageBases, confId, auto, mailStat, isCustom).catch((err) =>
            console.error('[joinConference] continueJoinAfterBull failed:', err),
          );
        if (session.paginatedScreen) {
          // Reuse the screen's existing paginatedScreen pause; just
          // attach our continuation so it fires on dismissal.
          (session.paginatedScreen as any).onComplete = continuation;
        } else if (session.screenSegments) {
          // Segments will doPause between each; attach continuation
          // to the LAST segment's dismissal via a guarded callback.
          (session.screenSegments as any).onComplete = continuation;
        } else {
          doPause(socket, session, continuation);
        }
        // CRITICAL: park subState OUTSIDE the display-flow loop so
        // the outer `while (isDisplayFlowState(subState))` in
        // advanceDisplayFlow exits cleanly and doesn't re-enter
        // AUTO_REJOIN, which would re-invoke joinConference and
        // reinstall a fresh BULL pause + onComplete — looping
        // forever as the user dismisses each pause.
        // continueJoinAfterBull restores DISPLAY_MENU on dismissal.
        session.subState = LoggedOnSubState.READ_COMMAND;
        return true; // yield until the user dismisses the pause
      }
    }

    // No CONF_BULL to show (or confScan=TRUE) — run the tail inline.
    await continueJoinAfterBull(socket, session, conference, messageBase, messageBases, confId, auto, mailStat, isCustom);
  }

  return true;
}

/**
 * Post-CONF_BULL continuation for joinConference — emits the
 * "Joining Conference:" line, runs auto-rejoin stats, loads flagged
 * files, sets menuPause + DISPLAY_MENU. Extracted so doPause's
 * onComplete callback can resume the flow after CONF_BULL is
 * dismissed (express.e:5056-5061 blocks at doPause; our async model
 * yields and resumes via the pagination dismissal path).
 */
async function continueJoinAfterBull(
  socket: any,
  session: BBSSession,
  conference: any,
  messageBase: any,
  messageBases: any[],
  confId: number,
  auto: boolean,
  mailStat: any,
  isCustom: boolean,
): Promise<void> {
    // express.e:5008 - QUIET_JOIN suppresses join output (bbsConfig tooltype).
    // When set, the leading \r\n, "Joining Conference:" / "Auto-ReJoined"
    // message, and the message-stats block are all skipped.
    let quietJoin = false;
    try {
      const { db: dbRef } = require('../../database');
      const cfg = dbRef?.getConfigRepository?.()?.getSystemConfig?.();
      quietJoin = !!cfg?.quiet_join;
    } catch { /* config unreadable — fall through to noisy default */ }

    // express.e:5065 - IF quietJoin=FALSE THEN aePuts('\b\n')
    if (!quietJoin) socket.emit('ansi-output', '\r\n');

    // express.e:5066-5088 - auto-rejoin shows user stats and different message
    if (auto) {
      console.log(`[JOIN] Auto-rejoining conference ${confId} for ${session.user?.username}`);
      // express.e:5067 - scanHoldDesc() — WEB_: not applicable
      // express.e:5068 - processSysCommand('S') - Display user stats
      // processSysCommand always allows SYSCMD (express.e:28249).
      // Note: stats display runs unconditionally — express.e doesn't gate
      // S command output on QUIET_JOIN; only the verbose strings around it.
      const { processCommand } = require('../command.handler');
      await processCommand(socket, session, 'S', '', true);

      // express.e:5071-5075,5080,5084,5088 — "Auto-ReJoined" / "Joining
      // Conference" lines all gated on quietJoin=FALSE.
      if (!quietJoin) {
        const autoReJoinMsg = messageBases.filter(mb => mb.conferenceId === confId).length > 1
          ? `Conference ${confId}: ${conference.name} [${messageBase.name}] Auto-ReJoined`
          : `Conference ${confId}: ${conference.name} Auto-ReJoined`;
        socket.emit('ansi-output', autoReJoinMsg + '\r\n');

        // express.e:5092-5113 — message-stats block.
        //   IF (quietJoin=FALSE)
        //     IF checkToolTypeExists CUSTOM=FALSE → standard range/total
        //     ELSE → customMsgbaseCmd(MAIL_STATS, conf, 0)
        //   ENDIF
        // We don't have customMsgbaseCmd, so the CUSTOM branch is silent
        // here too. (Audit F-2.)
        if (!isCustom) {
          // express.e:5094 - IF(mailStat.lowestKey>1): show range; ELSE: show total
          const lowestKey = mailStat?.lowestKey || 0;
          const highMsgNum = mailStat?.highMsgNum || 1;
          const totalMessages = highMsgNum - 1;
          if (lowestKey > 1) {
            socket.emit('ansi-output', `\r\n\x1b[32mMessages range from \x1b[33m( \x1b[0m${lowestKey} \x1b[32m- \x1b[0m${totalMessages} \x1b[33m)\x1b[0m\r\n`);
          } else {
            socket.emit('ansi-output', `\r\n\x1b[32mTotal messages           \x1b[33m:\x1b[0m ${totalMessages}\r\n`);
          }
          const lastScanned = Math.max((session.lastNewReadConf || 1) - 1, 1);
          const lastRead = session.lastMsgReadConf || 0;
          socket.emit('ansi-output', `\r\n\x1b[32mLast message auto scanned\x1b[33m:\x1b[0m ${lastScanned}\r\n`);
          socket.emit('ansi-output', `\x1b[32mLast message read        \x1b[33m:\x1b[0m ${lastRead}\r\n`);
        }
      }
      // express.e:5115 - IF (auto) THEN displaySysopULStats() — WEB_: not applicable
    } else {
      // Normal join - express.e:5079-5086 (leading \r\n already emitted above at 5065)
      if (!quietJoin) {
        const joinMsg = messageBases.filter(mb => mb.conferenceId === confId).length > 1
          ? `\x1b[32mJoining Conference\x1b[33m:\x1b[0m ${conference.name} [${messageBase.name}]`
          : `\x1b[32mJoining Conference\x1b[33m:\x1b[0m ${conference.name}`;
        socket.emit('ansi-output', `${joinMsg}\r\n`);
      }
    }

    console.log(`[JOIN] Loading flagged files and history`);
    // Like express.e:28576-28577 - load flagged files and command history
    await loadFlagged(socket, session);
    await loadHistory(session);

    // Express.e:28579 - Set menuPause flag (pause before next menu display)
    session.menuPause = true;

    // Move to menu display
    console.log(`[JOIN] Setting subState to DISPLAY_MENU`);
    session.subState = LoggedOnSubState.DISPLAY_MENU;

    // After the continuation runs (from a pause-dismissal callback),
    // the BBS sits in DISPLAY_MENU with menuPause=true. Kick the
    // display-flow loop so the menu pause + render fires now instead
    // of waiting for the next user input.
    try {
      const { advanceDisplayFlow } = require('../command.handler');
      await advanceDisplayFlow(socket, session);
    } catch (err) {
      console.error('[continueJoinAfterBull] advanceDisplayFlow failed:', err);
    }
}
