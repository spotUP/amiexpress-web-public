/**
 * Conference Handler - Conference management and bulletins
 *
 * Handles conference joining, bulletin display, and conference scanning.
 * Based on express.e conference functions.
 */

import { displayScreen } from '../screen.handler';
import { getBoardConfig } from '../../services/bbs-config-file.service';
import { config as appConfig } from '../../config';
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

  /*
   * THE MAIL SCAN USED TO RUN HERE, and here is before the conference
   * bulletin is drawn. express.e runs it at 5119-5128, AFTER CONF_BULL
   * (5058), after its doPause (5059) and after the "Joining Conference"
   * line (5079-5088). Ours ran it first, and this board's bulletins open
   * with `~f` - so on a CUSTOM conference the door printed the new-topic
   * listing and the bulletin's clear wiped it a moment later. The sysop,
   * 2026-09-14, joining conference 2: "i see no subs though".
   *
   * It lives in `runJoinMailScan` now and is called from
   * `continueJoinAfterBull`, which is the code that runs after the bulletin
   * and its pause. See express.e:5119.
   */

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
    // A quick logon ("[Q=SKIP BULLS]") rejoins without the conference
    // bulletin; login-post.service sets the flag and AUTO_REJOIN clears it.
    if (!confScan && !session.tempData?.quickLogon) {
      // currentMenuName must be cleared so MCI codes inside CONF_BULL
      // that reference the menu name don't render the prior conf's
      // stale value (express.e:5057 StrCopy(currentMenuName,'')).
      (session as any).currentMenuName = '';
      const shown = await displayScreen(socket, session, getConfScreenName(), true, /* silent */ true);
      /*
       * A DOOR THE BULLETIN LAUNCHED IS STILL RUNNING.
       *
       * `displayScreen` does not wait for the commands it found in the art:
       * `executeScreenCommands` schedules them on `setImmediate` and hands
       * back `session.pendingScreenCommand` for whoever needs them finished.
       * Nothing on the join path ever did, so the pause below was emitted
       * while a `~XI` door was mid-flight - and the prompt landed inside the
       * art, above rows the screen had not finished putting on the wire.
       *
       * This board's conference bulletins end with `~XISUBSCAN`, so it is
       * every conference except 2. The sysop, 2026-09-14, with a screenshot
       * of `(Pause)...Space To Resume:` sitting between the logo and its
       * bottom rule: "issue, prompt in the ascii". Conference 2 - the one
       * whose art carries no door - rendered correctly, which is what
       * identified the door as the difference.
       *
       * door.handler.ts:2551 already waits on this promise before starting a
       * door of its own, for the same reason.
       */
      if (session.pendingScreenCommand) {
        try {
          await session.pendingScreenCommand;
        } catch (err) {
          console.warn('[joinConference] screen command failed before pause:', err);
        }
      }
      if (shown) {
        const { doPause } = require('../screen.handler');
        // If displayScreen installed its own pagination/segment pause
        // (~SP inside the bull), don't stack another doPause. Either
        // way, schedule continueJoinAfterBull as the dismissal
        // continuation so the rest of the join runs on user input.
        const continuation = () =>
          continueJoinAfterBull(socket, session, conference, messageBase, messageBases, confId, auto, mailStat, isCustom, msgBaseId, confScan, forceMailScan).catch((err) =>
            console.error('[joinConference] continueJoinAfterBull failed:', err),
          );
        if (session.paginatedScreen) {
          // Reuse the screen's existing paginatedScreen pause; just
          // attach our continuation so it fires on dismissal.
          (session.paginatedScreen as any).onComplete = continuation;
        } else if (session.screenSegments) {
          /*
           * THE JOIN STILL OWES A PAUSE AFTER THE WHOLE BULLETIN.
           *
           * express.e:5058-5061 is `IF displayScreen(SCREEN_CONF_BULL) THEN
           * doPause()`, and displayScreen returns only once the WHOLE file has
           * been shown - the `~SP` pauses inside it are the screen's own, not
           * this one. So a segmented bulletin owes the same single pause at
           * the end that an unsegmented one does, and the "Joining
           * Conference" line (5079-5088) comes after it.
           *
           * Attaching the continuation straight to the last segment skipped
           * that pause, so the join's own output ran on from the bulletin's
           * final rows and the pause the caller did see was a later one from
           * the display flow - arriving AFTER "Joining Conference" instead of
           * before it (sysop, 2026-09-14, on a bulletin whose last segment is
           * `~f` + `~CC_ctop`: the top-uploaders table and the join's lines
           * arrived as one screenful).
           *
           * The pause COUNT is unchanged - it is the same one doPause would
           * have installed had the bulletin carried no `~SP` - only its
           * position is.
           */
          (session.screenSegments as any).onComplete = () =>
            doPause(socket, session, continuation);
          /*
           * AND SOMEBODY HAS TO STOP AT THE FIRST `~SP`.
           *
           * The flow's own screens get that prompt from pauseDisplayFlow; the
           * join calls displayScreen directly, so when the first segment put
           * no prompt up of its own, the rest of the bulletin sat parked
           * with nothing on screen asking for a key - the caller was left
           * at the bulletin art, waiting on a prompt that never came. h7's
           * conference 2 bulletin does it: the board's `~f ~SP ~f ~CC_ctop`
           * program spliced around the theme's art leaves a first segment
           * that is only the clear (found driving the login over telnet,
           * 2026-09-27). The boundary pause is the one every other segment
           * boundary uses.
           */
          if (!session.paginatedScreen) {
            const { armSegmentBoundaryPause } = require('../screen.handler');
            if (!armSegmentBoundaryPause(socket, session, 'join-bull')) {
              // Nothing left worth a key: the bulletin is over.
              session.screenSegments = undefined;
              doPause(socket, session, continuation);
            }
          }
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
    await continueJoinAfterBull(socket, session, conference, messageBase, messageBases, confId, auto, mailStat, isCustom, msgBaseId, confScan, forceMailScan);
  }

  /*
   * THE MAIL SCAN IS NOT PART OF THE DISPLAY.
   *
   * express.e:5056 opens `IF(confScan=FALSE)` around the display block -
   * CONF_BULL, the "Joining Conference" line, the message stats - and closes
   * it at 5117. The mail scan at 5119-5128 sits OUTSIDE that block, gated
   * only by `auto=FALSE` and `forceMailScan<>FORCE_MAILSCAN_SKIP`.
   *
   * This port nested the scan inside its own display gate instead:
   * `runJoinMailScan` is reached only through `continueJoinAfterBull`, which
   * is called at two places, both inside `if (!silent)`. `MS` joins every
   * conference with `silent=true` (advanced-commands.handler.ts:239,
   * mirroring express.e:25264), so the scan was unreachable from MS - the
   * board scanned nothing, and a CUSTOM conference never reached its door.
   * The command printed "Conferences scanned: N" over an empty walk.
   *
   * The silent path therefore runs the scan on its own, which is what
   * express.e does. `!silent` keeps reaching it through the bulletin
   * continuation, so nothing scans twice.
   */
  if (silent) {
    await runJoinMailScan(socket, session, confId, msgBaseId, auto, confScan, forceMailScan, isCustom);
  }

  return true;
}

/**
 * The join's mail scan, at the point in the join where express.e runs it.
 *
 * express.e:5119-5128 - after CONF_BULL and its pause, after the "Joining
 * Conference" line, after the message stats. NOT before the bulletin: this
 * board's bulletins begin with `~f`, so anything printed earlier is erased
 * by the clear before the caller can read it.
 *
 * For a CUSTOM conference that scan IS a door - the conference's message
 * base is `MSGBASE.DEF` - and its whole output is the new-topic listing, so
 * running it a moment too early lost the entire thing.
 */
async function runJoinMailScan(
  socket: any,
  session: BBSSession,
  confId: number,
  msgBaseId: number,
  auto: boolean,
  confScan: boolean,
  forceMailScan: number,
  isCustom: boolean,
): Promise<void> {
    // express.e:5119-5128 - Mail scan logic
    // Runs when: auto=FALSE AND forceMailScan != FORCE_MAILSCAN_SKIP
    // Then scans if: FORCE_MAILSCAN_ALL OR checkMailConfScan() returns true
    // After scan: saveMsgPointers() persists updated read pointers to disk

    // express.e:5119 - IF (auto=FALSE) AND (forceMailScan<>FORCE_MAILSCAN_SKIP): a
    // scan of every conference (confScan, MS) comes through here too.
    if (!auto && forceMailScan !== FORCE_MAILSCAN_SKIP && session.user) {
      let shouldScan = forceMailScan === FORCE_MAILSCAN_ALL;
      if (!shouldScan) {
        // express.e:5120 - checkMailConfScan(conf, msgBaseNum)
        try {
          shouldScan = await checkMailConfScan(confId, msgBaseId, session.user.id);
        } catch (err) {
  console.warn('[joinConference] checkMailConfScan error:', err);
        }
      }
      let scannedByDoor = false;
      if (shouldScan) {
        // express.e:5121-5125 — IF checkToolTypeExists CUSTOM=FALSE THEN
        //   callMsgFuncs(MAIL_SCAN, conf, msgBaseNum)
        // ELSE
        //   customMsgbaseCmd(MAIL_SCAN, conf, 0)
        // ENDIF
        if (isCustom) {
          /*
           * The conference's own message base is a door, and THIS is the call
           * that runs at every join: MAIL_SCAN, with `passCmdLine` 0 because
           * nobody typed anything. A door answering it prints what is new and
           * exits - it must not hold the caller, who is mid-join and did not ask
           * for a door.
           *
           * `false` means the conference claims CUSTOM but ships no usable
           * MSGBASE.DEF, and then the board's own scan is better than silence.
           */
          try {
            const { runCustomMsgbaseCommand, MailFunction } = require('../../services/custom-msgbase');
            const ran = await runCustomMsgbaseCommand(
              socket, session, MailFunction.SCAN, confId, '',
            );
            // express.e:5126 - saveMsgPointers(conf, msgBaseNum) is NOT skipped
            // by the CUSTOM branch, but a custom base owns its own pointers and
            // the board holds none for it, so there is nothing to write.
            scannedByDoor = ran;
          } catch (err) {
  console.warn('[joinConference] custom message base scan failed:', err);
          }
        }
        if (!scannedByDoor) {
          try {
            // express.e:5122 - callMsgFuncs(MAIL_SCAN, conf, msgBaseNum) -> searchNewMail.
            // A join is currentConf<>0: "Found Mail!", "Would you like to read it
            // now" and replyPrompt per message - no table (11667-11760).
            const { searchNewMail } = require('../message/read-msg');
            // confScan / MS run with currentConf=0: the conference line and the
            // table (11667-11735). A join is currentConf<>0.
            let scanning: { confName: string; msgBaseName: string; msgBaseNum: number } | null = null;
            if (confScan) {
              const bases = messageBases.filter(mb => mb.conferenceId === confId);
              const idx = bases.findIndex(mb => mb.id === msgBaseId);
              scanning = {
                confName: conferences.find(c => c.id === confId)?.name ?? '',
                msgBaseName: (bases[idx] as any)?.declaredName ?? '',
                msgBaseNum: idx >= 0 ? idx + 1 : 1,
              };
            }
            await searchNewMail(socket, session, confId, msgBaseId, scanning);
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
  msgBaseId: number,
  confScan: boolean,
  forceMailScan: number,
): Promise<void> {
    // express.e:5008 - QUIET_JOIN suppresses join output (bbsConfig tooltype).
    // When set, the leading \r\n, "Joining Conference:" / "Auto-ReJoined"
    // message, and the message-stats block are all skipped.
    let quietJoin = false;
    try {
      const cfg = getBoardConfig(appConfig.get('dataDir'));
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
        let statsByDoor = false;
        if (isCustom) {
          // The door says what its own base holds; the board's range and
          // totals are about a HeaderFile a custom base may not even have.
          try {
            const { runCustomMsgbaseCommand, MailFunction } = require('../../services/custom-msgbase');
            statsByDoor = await runCustomMsgbaseCommand(
              socket, session, MailFunction.STATS, confId, '',
            );
          } catch (err) {
console.warn('[joinConference] custom message base stats failed:', err);
          }
        }
        if (!isCustom || !statsByDoor) {
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

    /*
     * THE MAIL SCAN, express.e:5119-5128 - here, and not before the bulletin.
     *
     * Everything above this point is what express.e prints first: CONF_BULL
     * and its pause, the "Joining Conference" line, the message stats. Only
     * then does it scan. On a CUSTOM conference the scan is a door and its
     * output IS the new-topic listing, so running it any earlier meant the
     * bulletin's `~f` erased the whole thing.
     */
    await runJoinMailScan(socket, session, confId, msgBaseId, auto, confScan, forceMailScan, isCustom);

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
