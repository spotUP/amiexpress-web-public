/**
 * login-post.service.ts
 *
 * Single source of truth for the post-authentication pipeline.
 * Web, telnet, and SSH all call `runPostAuthLogin` after their
 * respective auth-collection layer has produced a verified user.
 *
 * Web-only side-effects (JWT room join, frontend-only socket events)
 * are guarded internally on `session.connectionType === 'web'` so
 * telnet/SSH safely run the same code.
 *
 * The forced-password-change flow routes EVERY transport through
 * `services/login-prompt.service.ts` `promptForcedPwdChange` (TP-9b). It used
 * to hand web to a socket handler of its own, which was the second
 * implementation this plan exists to remove.
 */

import type { BBSSession } from "../index";
import { resolveCallerTheme } from '../screens/caller-theme';
import { config } from '../config';
import { issueResumeTokenForLogin } from "../server/resume-tokens";
import type { LoginEmitter } from "../types/login-emitter";
import { BBSState, LoggedOnSubState } from "../constants/bbs-states";
import { db } from "../database";
import { nodeFileManager } from "../services/NodeFileManager";
import { loadAccount, rowFieldsFromAccount } from "./load-account";
import { callersLogManager, SOCKET_CONNECT_STRING } from "./CallersLogManager";
import { initializeSecurity, setEnvStat } from "../utils/security.util";
import { EnvStat } from "../constants/env-codes";
import {
  sessions,
  userSessions,
  socketToUser,
} from "../server/session-manager";
import { parkedSessionOf, liveSessionOf, isParked } from "../server/session-parking";
import { askParkedChoice, resumeParkedHere, endParkedHere } from "./parked-session-choice";
import { callersLog } from "../server/database-helpers";
import { triggerSamiLogRefresh } from "../services/SamiLogService";
import { displayScreen, doPause } from "../handlers/screen.handler";
import { runExecuteOn } from "./batch-scheduler";
import { mailOnLogon } from "./mail-notification.service";
import { SysopDebugUtil, DebugSeverity } from "../utils/sysop-debug.util";
import { sessionLogManager } from "./SessionLogManager";
import { emitUserLogin } from "./bbs-event-emitter";
import { getSystemTime } from "../utils/date-time.util";
import { applyLogonDayReset, isNewLogonDay } from '../utils/time-tracking.util';
import { applyLogonBaud } from './account.service';
import { beginLogoff } from "../server/logoff";
import { getBoardConfig } from './bbs-config-file.service';
import {
  accountOnlineElsewhere,
  isAccountDeleted,
  nodeReservedForAnother,
  passwordChangeRequired,
  passwordExpiryDays,
  readLogonMisc,
  securityLockoutScreen,
} from './logon-gates';
import { config as appConfig } from '../config';
import { reportPresence } from "../achievements/sites";

export interface PostAuthContext {
  /**
   * Socket.io server (for cross-socket broadcasts). Web has it; telnet/SSH
   * forward `undefined` because they cannot multi-tab broadcast anyway.
   */
  io?: any;
  /**
   * The user's lastLogin BEFORE this connection's update — used by the
   * conference "new since" scan. Captured by the caller so the shared
   * pipeline doesn't need to read+write the same DB row in two places.
   */
  lastLoginBeforeUpdate: Date;
  /**
   * S15: the caller typed the account's password on this connection (not a
   * token). Only such a login may take over a session still open in
   * another window; a token belongs to one window (S12 refuses `in-use`).
   */
  typedPassword?: boolean;
}

export type PostAuthResult =
  | { ok: true }
  | {
      ok: false;
      terminated:
        | "reserved-node"
        | "lockout"
        | "deleted-account"
        | "already-on-another-node"
        | "account-locked"
        | "pwd-change-denied"
        | "pwd-change-pending"
        | "quick-logon-handled"
        | "chat-only-handled"
        | "parked-session-quit"
        | "parked-session-resumed"
        | "parked-session-lost";
    };

/**
 * The unified post-authentication pipeline.
 *
 * After the caller has authenticated a user and is ready to transition
 * the session to LOGGEDON, call this and inspect the result:
 *   - `{ ok: true }` — login fully wired up; caller can return.
 *   - `{ ok: false, terminated: '…' }` — caller should return without
 *     further work; the pipeline has already begun logoff or queued the
 *     next state machine step.
 *
 * 1:1 port of the body that used to live inline in
 * `auth-socket-handlers.ts:588-1052`. Telnet/SSH duplicate at
 * `command.handler.ts:1723-1893` is removed in commit 3.
 */
export async function runPostAuthLogin(
  emitter: LoginEmitter,
  session: BBSSession,
  userArg: any,
  ctx: PostAuthContext,
): Promise<PostAuthResult> {
  // Reassignable so the forced-pwd-change adapter can refresh the
  // hash after the password is updated mid-flow.
  let user = userArg;
  // Unset means web: session-manager defaults an unset connectionType to
  // 'web', and every other reader in the tree (`session.connectionType ??
  // 'web'` in the achievements reporter, `|| 'web'` in BBSApi) says the same.
  // A strict `=== "web"` here was the odd one out, and a session built
  // anywhere that leaves the field unset would silently get no session token.
  const isWeb = (session.connectionType ?? "web") === "web";

  /**
   * THE RESERVED-NODE BUMP (express.e:28734-28738 / 29129-29135).
   *
   * A sysop reserves a node, and a caller whose name does not match it is
   * told so and disconnected. It used to live inside the web `login`
   * handler's credential arm - which its own comment said guarded "both auth
   * paths" - so retiring that arm (TP-9b) would have taken the check with it
   * for token logins AND for telnet, which never had it at all. It belongs in
   * the ONE pipeline every transport's successful login runs through, which
   * is here. Case-insensitive, as StriCmp is at express.e:29131.
   */
  if (typeof session.nodeId === "number") {
    if (nodeReservedForAnother(session.nodeId, user.username)) {
      const { beginLogoff } = require("../server/logoff");
      beginLogoff(emitter as any, session, {
        message: "\r\n420 Node is currently reserved for another user.\r\n",
      });
      return { ok: false, terminated: "reserved-node" };
    }
  }

  /**
   * LOADACCOUNT (express.e:29664, 7977-8022): the session runs on the record
   * in user.data / user.keys / user.misc, not on the database row.
   *
   * This wrote the ROW over the record instead, on every login of every
   * transport: the post count went to 0 (the table has no column for it), the
   * time used today went back to the row's morning value, and whatever a door,
   * AREXX or the sysop had written into the record was reverted. express.e
   * writes nothing to user.data at a successful logon - the record goes back
   * at logoff (8207) - so nothing is written here either; the row is brought
   * up to date FROM the record below.
   */
  const loaded = loadAccount(user);
  user = loaded.user;
  // The day the caller was last on, for the new-day reset (express.e:28508
  // reads `loggedOnUser.timeLastOn` off the loaded record). The transports
  // captured the row's lastLogin; the record's is the one express.e uses.
  const lastLoginBeforeUpdate: Date = loaded.fromDisk
    ? (user.lastLogin ?? new Date(0))
    : ctx.lastLoginBeforeUpdate;

  /*
   * THE GATES BEFORE ANY LOGON PAPERWORK (express.e:29701-29727).
   *
   * processLogon (express.e:29456) refuses a deleted account (29701) and an
   * account already on another node (29715) right after loading it, and
   * only later writes the logon line and counts the call
   * (displayUserToCallersLog(0) at 29752 -> 16045). They ran after the
   * call bump, the node files, the login event and the CallersLog logon
   * line, so a refused caller left a ghost logon and one call too many.
   */
  // Who this socket held BEFORE this login (ghostlogoff 2026-09-10): the
  // already-on check below must know whether the user is re-authenticating
  // on a socket that never let them go (reload -> restore -> submit),
  // because the session.user assignment below overwrites the evidence. Snapshot first.
  session.entryUserId = (session.user as any)?.id;
  /**
   * express.e:29701-29711 - a deleted account.
   *
   * Deleting a user does not remove the record: the sysop's DELETE sets
   * `slotNumber := 0` (express.e:21365) and leaves the row where it was. So
   * the account still authenticates, still has a password, and express refuses
   * it at exactly this point in the logon - after the credentials are
   * accepted, before anything is loaded - with one line and a disconnect.
   *
   * This port had the guard nowhere. A deleted user could log in.
   *
   * It comes BEFORE the lockout check because that is express's order: 29701
   * then 29775.
   */
  // The record's own slotNumber field is what express.e tests (29701); the
  // position stays the account's, so a deleted account can be re-activated.
  if (isAccountDeleted(user)) {
    emitter.emit("ansi-output", "\r\nThat account has been deleted.\r\n");
    beginLogoff(emitter as any, session, { message: "" });
    return { ok: false, terminated: "deleted-account" };
  }

  /**
   * express.e:29715-29727 - the same account on two nodes at once.
   *
   *     stat := checkUserOnLine(1)
   *     IF stat = FALSE
   *       callersLog('User <name> already on another node!')
   *       IF displayScreen(SCREEN_ONENODE) = FALSE
   *         aePuts('You are already logged into another node!')
   *       state := STATE_LOGGING_OFF
   *
   * `userAlreadyOnNode` has been sitting imported at the top of this file,
   * fully written and documented, and never called - so on a 24-node board one
   * account could hold every node it could open a connection to.
   *
   * Between the deleted-account gate (29701) and the lockout (29775), which is
   * express's order.
   */
  /**
   * PARKED SESSION: a re-login while the account's previous web session is
   * parked (its phone dropped; session-parking.ts) would meet that session
   * in the already-on check below and be refused. The caller is asked first
   * (services/parked-session-choice.ts): a web caller can resume it on this
   * socket or end it; telnet/SSH can end it or quit. An ended parked session
   * goes through the normal finalize, so the check reads the board as it is.
   * A live tab is never touched: only a parked session is offered.
   */
  // The caller's own namespace, which is where every OTHER web socket lives
  // too - so it answers "is that node's caller still reachable" for the
  // duplicate-login guard further down.
  const nspSockets = (emitter as any)?.nsp?.sockets as
    | { has?: (id: string) => boolean }
    | undefined;
  {
    const userKey = String((user as any)?.id ?? '');
    // S15: a typed password also offers a session still open in another
    // window. R needs a web session on both sides; telnet/SSH get E or Q.
    const parked = userKey === '' ? null
      : parkedSessionOf(userKey) ?? (ctx.typedPassword ? liveSessionOf(userKey, session) : null);
    if (parked) {
      const heldIsWeb = isParked(parked) || (!!parked.webLink && !parked.connectionEmitter);
      const choice = await askParkedChoice(emitter, session, parked, isWeb && heldIsWeb);
      if (choice === "quit") {
        beginLogoff(emitter as any, session, { message: "" });
        return { ok: false, terminated: "parked-session-quit" };
      }
      if (choice === "resume") {
        const moved = await resumeParkedHere(session, parked, user);
        if (moved === "moved") return { ok: false, terminated: "parked-session-resumed" };
        if (moved === "lost") return { ok: false, terminated: "parked-session-lost" };
        // "gone": it ended while the question was up - log in as usual.
      } else {
        await endParkedHere(parked);
      }
    }
  }

  // Same socket re-authenticating as the user it already held on entry
  // (reload -> restore -> login form -> submit): the session never left,
  // so there is nothing to refuse - fall through and re-register over it.
  // A socket that held nobody takes the check as before, so a genuine
  // second tab is still refused per express.e:29715-29727 (ghostlogoff).
  const reauthenticating =
    (session.entryUserId as any) !== undefined &&
    String(session.entryUserId) === String((user as any)?.id);

  /*
   * RAPID TESTS ONLY. The scripted telnet suite logs the same account in and
   * out many times a minute, and a call it had to drop leaves a session in
   * its reconnect grace - so the next call met "already logged in" and the
   * rest of the run failed on that, not on what it was testing (the sysop,
   * 2026-09-27: "if you are going to do rapid tests i think you need a flag
   * to disable that"). Never in production: the live container runs with
   * NODE_ENV=production, and the check is express.e:29715-29727 parity.
   */
  const devAllowsTwice = process.env.BBS_DEV_ALLOW_SAME_USER_TWICE === '1'
    && process.env.NODE_ENV !== 'production';

  if (!reauthenticating && !devAllowsTwice) {
    // The one already-online rule, asked by FTP's logon too
    // (services/logon-gates). It also sees this account on an FTP node.
    const alreadyOn = accountOnlineElsewhere(
      user.username,
      session.nodeId ?? 0,
      // Liveness: REACHABILITY, not map membership.
      //
      // This asked `sessions.has(nodeId)`, and a session object outlives its
      // transport - so a caller whose connection had gone still held the node
      // and their own next login was refused against their own corpse. That
      // is the reported bug: `infant` refused on the live board, `spot` and
      // `sysop` repeatedly, 28 refusals in the node CallersLogs with the most
      // recent AFTER the three previous attempts at this.
      //
      // `nodeHasReachableCaller` asks whether anything can still be SENT to
      // that node: a registered emitter for telnet/SSH (both teardown and the
      // admin's kick unregister it), or a socket still in the namespace for
      // web. A stale node file with nobody behind it is cleaned up by
      // userAlreadyOnNode's onStale, exactly as before.
      (id) => nspSockets?.has?.(id) === true,
      appConfig.get('dataDir'),
    );
    if (alreadyOn !== null) {
      try {
        const { callersLogManager } = require("./CallersLogManager");
        callersLogManager.logActivity(
          session.nodeId || 1,
          `User ${user.username} already on another node!`,
        );
      } catch (err) {
        console.warn("[LOGIN] could not log already-on-another-node:", err);
      }

      // express falls back to a line of its own when the board has no ONENODE
      // screen, rather than showing nothing.
      const shown = await displayScreen(emitter as any, session, "ONENODE", false);
      if (!shown) {
        emitter.emit(
          "ansi-output",
          "\r\nYou are already logged into another node!\r\n",
        );
      }

      beginLogoff(emitter as any, session, { message: "" });
      return { ok: false, terminated: "already-on-another-node" };
    }
  }

  /**
   * THE BROWSER'S SESSION TOKEN.
   *
   * A web caller who types his name and password used to get a freshly
   * minted JWT with `login-success`, from the credential arm of the `login`
   * socket handler. That arm is retired (TP-9b), and without this the only
   * `login-success` carrying a token would be the one a caller who ALREADY
   * had a token gets - so a first login would never store one and auto-login
   * would quietly stop working after this task.
   *
   * Telnet and SSH have no use for it: there is no browser to store it, and
   * `login-success` is a frontend event.
   */
  if (isWeb) {
    try {
      const accessToken = await db.generateAccessToken(user);
      const refreshToken = await db.generateRefreshToken(user);
      // Opens THIS session again after a dropped socket (server/resume-tokens.ts).
      const resumeToken = issueResumeTokenForLogin(session, String(user.id));
      emitter.emit("login-success", {
        user: {
          id: user.id,
          username: user.username,
          realname: user.realname,
          secLevel: user.secLevel,
          expert: user.expert,
          ansi: user.ansi,
        },
        token: accessToken,
        refreshToken,
        resumeToken,
        /*
         * THE THEME THIS CALLER WEARS, so the browser can remember it.
         *
         * The screens before login are drawn with no user to ask, so the
         * terminal keeps the slug in a cookie and the handshake hands it back
         * at the next connect (`screens/remembered-theme.ts`). Sent from here
         * because this is the moment the board KNOWS - and it is the resolved
         * slug, not the raw preference, so a theme the caller may no longer
         * wear is not the one their browser remembers.
         */
        screenTheme: resolveCallerTheme(config.get('dataDir'), {
          username: user.username,
          secLevel: user.secLevel,
          screenTheme: (user as { screenTheme?: string }).screenTheme,
        }),
      });
    } catch (err) {
      // A token is a convenience, not the login: the caller is authenticated
      // either way and must not be thrown out because minting failed.
      console.error("[LOGIN] could not mint a session token:", err);
    }
  }

  /*
   * A NEW DAY GIVES THE ALLOWANCES BACK AT LOGON (express.e:28506-28528).
   *
   *   currDay := Div(currTime-21600,86400)
   *   lastDay := Div(loggedOnUser.timeLastOn-21600,86400)
   *   IF (lastDay<>currDay)
   *     timesOnToday:=0; timeUsed:=0; chatRemain:=chatLimit
   *     dailyBytesDld:=0; timeTotal:=timeLimit
   *   ELSE
   *     timesOnToday:=timesOnToday+1
   *
   * updateTimeUsed() has the same reset for a session that is ONLINE when the
   * day turns, but that one cannot help a caller who hit their limit
   * yesterday and dials in today: nothing had run since. So the daily
   * download limit was permanent for exactly the people it had already
   * stopped. express.e resets in BOTH places, and the comparison here is
   * against the user's LAST-ON day rather than this session's - which
   * `lastLoginBeforeUpdate` is, captured before the write below overwrites it.
   *
   * `todaysBytesLimit` is reset here too (express.e:28518-28523): it lives in
   * user.data and carries the sysop's and the uploads' extra bytes, so
   * without this a credit given yesterday stood for ever.
   */
  const newDay = isNewLogonDay(lastLoginBeforeUpdate, getSystemTime());

  /*
   * What express.e's logon changes in the loaded record, IN MEMORY: one more
   * call (displayUserToCallersLog, express.e:16045), and today's counters
   * (28512-28528). They reach user.data with the rest of the session at
   * logoff (8207), so they go on the object the session runs on.
   */
  const callsBeforeLogon = user.calls || 0;
  user.calls = callsBeforeLogon + 1;
  // express.e:28509-28528: today's counters and todaysBytesLimit, the
  // same block the FTP logon runs (28906-28925).
  applyLogonDayReset(user, newDay);
  // express.e:29759 userKeys.baud:=onlineBaud.
  applyLogonBaud(user);

  /*
   * The ROW follows the record, never the other way round: the fields the
   * session took off the disk, the logon's changes, and the web's own
   * lastLogin (the time of this call, which the admin and the web read).
   * `syncDisk: false` because writing the row back over the record is the
   * very copy this replaces.
   */
  await db.updateUser(user.id, {
    ...(loaded.fromDisk ? rowFieldsFromAccount(user) : {}),
    lastLogin: getSystemTime(),
    calls: user.calls,
    callsToday: user.callsToday,
    ...(newDay ? {
      timeUsed: 0,
      chatUsed: 0,
      dailyBytesDld: 0,
      timeTotal: user.timeLimit,
    } : {}),
  }, { syncDisk: false });

  // Set session user data
  session.state = BBSState.LOGGEDON;
  session.subState = LoggedOnSubState.EXEC_QUICKNEW;
  // Without the record's deleted state: the gate below reads it off `user`,
  // and a session that carries `false` would write it back at logoff over a
  // DELETE the sysop made while the caller was on.
  const { accountDeleted: _deletedOnDisk, ...sessionUser } = user;
  session.user = { ...sessionUser, lastLoginBeforeUpdate };
  // express.e:28504 newSinceFlag:=0 - a new call has not run N yet - and
  // this call's account is not saved yet (account.service).
  session.newSinceFlag = false;
  session.accountSavedAtLogoff = false;
  // express.e:29072 ansiColour:=TRUE - every call starts in colour. M and a
  // door's DT_ANSICOLOR switch this call only; the stored flag never seeds it.
  session.ansiMode = true;

  // Modem emulation (user.baud=0 → full speed). Works on web and
  // telnet/SSH alike — the emitter wrapper has its own `emit` we wrap.
  const userBaud = user.baud || 0;
  session.modemBps = userBaud;
  session.modemEmulationEnabled = userBaud > 0;
  try {
    const { getModemEmulator } = require("../utils/modem-emulator.util");
    const modemEmulator = getModemEmulator(emitter);
    modemEmulator.install();
    if (userBaud > 0) {
      modemEmulator.enable(userBaud);
      console.log(
        `[LOGIN] Modem emulation enabled at ${userBaud} bps for ${user.username}`,
      );
    }
  } catch (err) {
    console.error("[LOGIN] modem emulator install failed:", err);
  }

  // The browser stands aside at a speed above 0 (this pacer meters it)
  // and soft-caps MAX itself; telnet/SSH ignore the event.
  (session as any).modemSpeed = userBaud;
  emitter.emit("modem-speed", userBaud);

  // AnsiBuffer batching: off when modem emulation is on (smooth out),
  // 16ms otherwise. Wrap-via-emit works for both transports.
  try {
    const { getAnsiBuffer } = require("../utils/ansi-buffer.util");
    const ansiBuffer = getAnsiBuffer(emitter);
    ansiBuffer.setFlushDelay(userBaud > 0 ? 0 : 16);
  } catch (err) {
    console.error("[LOGIN] ansi-buffer install failed:", err);
  }

  // Register node with MULTICOM manager (WHO doors). Now runs on all
  // transports — previously web-only.
  try {
    const { multicomManager, ENV_MENU } = await import(
      "../nodes/MulticomManager.js"
    );
    multicomManager.updateNode(
      session.nodeId,
      user.username,
      user.location || "Unknown",
      ENV_MENU,
    );
  } catch (error) {
    console.error("[LOGIN] Failed to register node with MULTICOM:", error);
  }

  // Load command history.
  try {
    const { loadHistory } = require("../utils/command-history.util");
    loadHistory(session, user.id).catch((err: any) => {
      console.error("[LOGIN] Failed to load command history:", err);
    });
  } catch (err) {
    console.error("[LOGIN] command-history util load failed:", err);
  }

  SysopDebugUtil.debug(
    emitter as any,
    session,
    "AUTH",
    "Login successful",
    { username: user.username, secLevel: user.secLevel },
    DebugSeverity.INFO,
  );

  // Update session log with user info (web uses socket.id; telnet/SSH
  // pass the wrapper's id which is the connection sessionId).
  sessionLogManager.updateSession(
    emitter.id,
    user.id,
    user.username,
    session.nodeId,
  );

  /**
   * NO BATCH FILE HERE. `BBS:Batch<weekday>` is a LOGOFF path.
   *
   * express.e reaches it in exactly one place: `processSysCommand('LOGOFF')`
   * and `LOGOFF<node>` (express.e:8222, 8230-8231), and on this board
   * `Commands/SysCmd/LOGOFF0..6.info` are `LOCATION=BBS:Batch<n>`. At logon it
   * runs `runExecuteOn('LOGON')` (express.e:6715) and nothing else.
   *
   * This port also ran the same file on the way IN, which is why a caller
   * watched MultiTop-II paint five screens while logging in (sysop,
   * 2026-09-14): today's `batch1` invokes `doors:multitop/mtop` once per
   * design, writing bull1..bull5. Five 68K emulator spawns per login, plus
   * QuickNew, ByteKillHandler, GLCUpdater and SAmiLog - all of it work the
   * logoff already does, done twice.
   *
   * `screens/quicknew.txt`, which `logon20.txt` displays, is written by that
   * same batch. It is now the copy written at the PREVIOUS logoff, which is
   * what the Amiga board showed.
   */

  // LOGON / LOGON{n} syscmds (express.e:8222, 8231).
  try {
    const { runSysCommand } = require("../handlers/command-execution.handler");
    await runSysCommand(emitter as any, session, "LOGON", "");
    await runSysCommand(
      emitter as any,
      session,
      `LOGON${session.nodeId || 0}`,
      "",
    );
  } catch (err) {
    console.error("[LOGIN] LOGON syscmd failed:", err);
  }

  // Session migration (web only — moves the socket-keyed pre-login
  // session to user-keyed storage so multi-tab fanout works).
  if (isWeb) {
    console.log(
      `[SESSION-MIGRATION] User ${user.id} logged in on socket ${emitter.id}`,
    );
    sessions.delete(emitter.id);
    // String keys: Map distinguishes 5 from "5", and every lookup
    // and delete below uses the string form (ghost sessions, 2026-09-10).
    userSessions.set(String(user.id), session);
    socketToUser.set(emitter.id, String(user.id));
    try {
      (emitter as any).join?.("user:" + String(user.id));
    } catch {
      /* ignore */
    }
  }

  // Emit BBS event for LiveChat integration (works on all transports;
  // the event bus is in-process).
  try {
    emitUserLogin({
      username: user.username,
      nodeId: session.nodeId || 1,
      location: user.location || "Unknown",
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error("[BBSEvent] Error emitting login event:", error);
  }

  // Write node{n}.user / node{n}.userkeys + log to CallersLog.
  const nodeId = session.nodeId || 0;
  try {
    nodeFileManager.writeNodeUserFile(nodeId, user);
    nodeFileManager.writeNodeUserKeysFile(nodeId, user);
    // express.e:16034-16046 - the logon line carries the account's slot,
    // its name, the connect string and its location, marked NEW when this
    // is the account's first call (timesCalled=0 before the increment).
    callersLogManager.logLogin(nodeId, {
      slotNumber: user.slotNumber ?? 0,
      name: user.username,
      connectString: SOCKET_CONNECT_STRING,
      location: user.location ?? "",
      isNew: callsBeforeLogon === 0,
    });

    /**
     * express.e:16048 - LOG_HOST on the node's icon adds the caller's address
     * to the CallersLog, right after the logon line:
     *
     *     '\tTelnet login address: <hostName> (<hostIP>)'
     *
     * It is off by default because it writes where a caller connects from into
     * a log a sysop may share, and on when a sysop is chasing someone. Nothing
     * in this port read the tooltype, so it could be set and do nothing.
     */
    const { nodeFlag } = require("../utils/node-tooltypes.util");
    if (nodeFlag(nodeId, "LOG_HOST")) {
      const hostIp = (session as any).remoteAddress || "unknown";
      const hostName = (session as any).connectionHostname || hostIp;
      callersLogManager.logActivity(
        nodeId,
        `\tTelnet login address: ${hostName} (${hostIp})`,
      );
    }
  } catch (error) {
    console.error(`[LOGIN] Error writing node files:`, error);
  }

  // Initialize security and env stat.
  initializeSecurity(session);
  setEnvStat(session, EnvStat.IDLE);

  // express.e:29768-29773 — secStatus <= 1 lockout. The gates are shared
  // with FTP's login (services/logon-gates.ts), so the two cannot disagree.
  const lockScreen = securityLockoutScreen(user.secLevel);
  if (lockScreen !== null) {
    await displayScreen(emitter as any, session, lockScreen, false);
    beginLogoff(emitter as any, session, {
      finalState: BBSState.AWAIT,
      readDelayMs: 1500,
    });
    return { ok: false, terminated: "lockout" };
  }

  // Read disk-backed user.misc (accountLocked / forcePwdReset / pwdLastUpdated).
  const logonMisc = readLogonMisc(user.slotNumber);

  // express.e:29775-29782 — accountLocked.
  if (logonMisc.accountLocked) {
    emitter.emit(
      "ansi-output",
      "\r\nYour account is locked out (possibly due to repeated password failures)\r\n\r\n",
    );
    emitter.emit("ansi-output", "Leave a comment for the sysop...\r\n\r\n");
    try {
      const { processCommand } = require("../handlers/command.handler");
      await processCommand(emitter as any, session, "C", "");
    } catch (err) {
      console.error("[LOGIN] account-locked comment-door failed:", err);
    }
    if ((session.subState as LoggedOnSubState) === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
      // The comment form is interactive - its Subject/body arrive over
      // later keystrokes. Logging off here would guillotine it mid-fill
      // (live: caller lost the form at Subject:). Defer: the
      // message-entry funnel fires Thanks + logoff when the flow lands
      // back on DISPLAY_MENU, matching express.e's run-to-completion.
      session.logoffAfterComment = true;
      return { ok: false, terminated: "account-locked" };
    }
    beginLogoff(emitter as any, session, {
      message: "\r\nThanks you will now be disconnected...\r\n\r\n",
      finalState: BBSState.AWAIT,
      readDelayMs: 1500,
    });
    return { ok: false, terminated: "account-locked" };
  }

  // express.e:29785-29845 — PASSWORD_EXPIRY_DAYS + forcePwdReset.
  {
    const needsPwdChange = passwordChangeRequired(
      logonMisc,
      passwordExpiryDays(appConfig.get('dataDir')),
    );

    if (needsPwdChange) {
      const { checkSecurity } = require("../utils/acs.util");
      const { ACSPermission } = require("../constants/acs-permissions");
      const canEditPassword = checkSecurity(user, ACSPermission.EDIT_PASSWORD);

      if (!canEditPassword) {
        emitter.emit(
          "ansi-output",
          "\r\nYour account requires your password to be changed, however you do not have permission to do so.\r\n",
        );
        emitter.emit("ansi-output", "Leave a comment for the sysop...\r\n\r\n");
        try {
          const { processCommand } = require("../handlers/command.handler");
          await processCommand(emitter as any, session, "C", "");
        } catch (err) {
          console.error("[LOGIN] pwd-change-denied comment-door failed:", err);
        }
        if ((session.subState as LoggedOnSubState) === LoggedOnSubState.POST_MESSAGE_SUBJECT) {
          // Same deferral as the account-locked form above: let the caller
          // finish the comment before Thanks + logoff.
          session.logoffAfterComment = true;
          return { ok: false, terminated: "pwd-change-denied" };
        }
        beginLogoff(emitter as any, session, {
          message: "\r\nThanks you will now be disconnected...\r\n\r\n",
          finalState: BBSState.AWAIT,
          readDelayMs: 1500,
        });
        return { ok: false, terminated: "pwd-change-denied" };
      }

      // Set up forced-pwd-change state, then hand off.
      // Web: emits prompt events; the existing forced-pwd-change-input
      // socket handler at auth-socket-handlers.ts:1316+ drives the rest.
      // Telnet/SSH: commit 4 will route through
      // services/login-prompt.service.ts; until then, telnet/SSH
      // disconnects with a "use web client" notice so we don't silently
      // strand the user.
      let minPasswordLength = 0;
      let minPasswordStrength = 0;
      try {
        const sysConf = getBoardConfig(appConfig.get('dataDir'));
        if (sysConf) {
          minPasswordLength = sysConf.min_password_length ?? 0;
          minPasswordStrength = sysConf.min_password_strength ?? 0;
        }
      } catch {
        /* non-fatal */
      }

      session.forcedPwdChangeState = "await_new";
      session.forcedPwdChangeUsername = user.username;
      session.forcedPwdChangeUserId = user.id;
      session.forcedPwdChangeSlot = user.slotNumber ?? 0;
      session.forcedPwdChangeRetry = 0;
      session.forcedPwdChangePwdHash = user.passwordHash ?? "";
      session.forcedPwdChangeMinLen = minPasswordLength;
      session.forcedPwdChangeMinStrength = minPasswordStrength;

      // EVERY TRANSPORT drives the same prompt loop (TP-9b). The web branch
      // that stood here emitted `prompt-forced-pwd-change` and handed the
      // flow to a `forced-pwd-change-input` socket handler - the browser's
      // login line editor under another name, and a second implementation of
      // the loop below. That handler is gone and the adapter no longer steps
      // aside for web, so one flow serves all three transports and a web
      // caller's keystrokes reach it as ordinary `command` input.
      //
      // Drive the prompt loop synchronously via the
      // line-buffered adapter in services/login-prompt.service.ts. On
      // success the adapter has already applied the new password +
      // cleared session.forcedPwdChange* state; fall through to finish
      // the post-auth flow. On failure the adapter has already called
      // beginLogoff so we just return.
      const { promptForcedPwdChange } = await import("./login-prompt.service");
      const pwdResult = await promptForcedPwdChange(emitter, session, user);
      if (!pwdResult.ok) {
        return { ok: false, terminated: "pwd-change-denied" };
      }
      // Refresh the local `user` reference so the rest of the pipeline
      // (callersLog, webhook payload, etc.) sees the updated hash. The
      // adapter already wrote it; just reload.
      try {
        // Only the hash: the rest of `user` is the record loaded off the
        // disk, which the row does not wholly hold (messagesPosted).
        const refreshed = await db.getUserById(user.id);
        if (refreshed) user = { ...user, passwordHash: refreshed.passwordHash };
      } catch {
        /* non-fatal */
      }
      // Fall through to the standard callersLog → systemStats → webhook
      // → preferences → LOGON → bulletin flow below.
    }
  }

  // Log successful login (express.e:9493 callersLog).
  await callersLog(user.id, user.username, "Logged on");

  // EXECUTE_ON_LOGON (express.e:6715) and MAIL_ON_LOGON (6716-6720), called
  // at 29847-29849 - AFTER every gate. They ran before the lockout, deleted-
  // account, already-online, account-locked and password-expiry checks, so
  // the sysop got logon mail and the logon hook ran for callers the board then
  // threw out (express.e parity survey, 2026-09-29).
  runExecuteOn("LOGON", session.nodeId || 1, {
    username: user.username,
    location: user.location,
  }).catch((err: any) => {
    console.error("[LOGIN] EXECUTE_ON_LOGON failed:", err);
  });
  mailOnLogon(user.username, user.location || "").catch((err: any) => {
    console.error("[LOGIN] MAIL_ON_LOGON failed:", err);
  });

  // SystemStats for ~SC MCI.
  try {
    const { systemStats } = await import("./SystemStatsService");
    await systemStats.incrementCalls(user.id);
  } catch (error) {
    console.error("[SystemStats] Error tracking login:", error);
  }

  // Webhook USER_LOGIN (skip sysops to reduce noise).
  if (user.secLevel < 255) {
    try {
      const { webhookService, WebhookTrigger } = await import(
        "./webhook.service"
      );
      await webhookService.sendWebhook(WebhookTrigger.USER_LOGIN, {
        username: user.username,
        userId: user.id,
        gdprConsented: !!user.gdprConsentAt,
        secLevel: user.secLevel,
        calls: user.calls,
      });
    } catch (error) {
      console.error("[Webhook] Error sending user login webhook:", error);
    }
  }

  // Conference / preference defaults.
  // Achievements (SP2): the presence facts and the snapshots, beside the
  // webhook and never inside its try. Non-throwing.
  // The achievements count the call themselves (`calls + 1`), from the
  // number before this logon.
  reportPresence(session as any, { ...user, calls: callsBeforeLogon, lastLoginBeforeUpdate });

  session.confRJoin = user.autoRejoin || 1;
  (session as any).msgBaseRJoin = 1;
  (session as any).currentConf = user.autoRejoin || 1;
  (session as any).currentConference = user.autoRejoin || 1;
  (session as any).conferenceId = user.autoRejoin || 1;
  session.cmdShortcuts = false;
  session.inDoorManager = false;
  (session as any).mouseEventsEnabled = false;
  session.doorInputHandler = undefined;
  if ((session as any).shortcuts) (session as any).shortcuts.clear();

  // QuickLogon ('Q' at the graphics prompt, "[Q=SKIP BULLS]"): no bulletins
  // and no logon mail scan, but the caller still rejoins their conference -
  // express.e's rejoin (28574), the AUTO_REJOIN step of the display flow.
  // Going straight to the menu left the session on its start-up placeholder,
  // conference 0 "General" (sysop, 2026-09-30: "[0:General] Menu"). The
  // quickLogon flag stays set until that rejoin, which skips CONF_BULL for it.
  if (session.tempData?.quickLogon) {
    session.menuPause = true;
    session.subState = LoggedOnSubState.AUTO_REJOIN;
    try {
      const { handleCommand } = require("../handlers/command.handler");
      await handleCommand(emitter as any, session, "", ctx.io);
    } catch (err) {
      console.error("[LOGIN] quick-logon rejoin failed:", err);
    }
    return { ok: false, terminated: "quick-logon-handled" };
  }

  // Chat-only mode (web frontend SSO via ?chatOnly=true). Telnet has no
  // handshake; the optional chain returns undefined and we skip.
  const chatOnlyQuery = emitter.handshake?.query?.chatOnly === "true";
  const chatOnly = chatOnlyQuery || session.tempData?.chatOnly;
  if (chatOnly) {
    console.log("[AUTH] Chat-only mode detected - auto-launching LiveChat door");
    session.menuPause = false;
    session.subState = LoggedOnSubState.DOOR_RUNNING;
    try {
      const { executeDoor } = require("../handlers/door.handler");
      const liveChatDoor = {
        name: "livechat",
        path: "Doors/livechat",
        location: "Doors/livechat",
        executable: "livechat",
        type: "typescript",
        category: "Chat",
        args: [],
      };
      await executeDoor(emitter as any, session, liveChatDoor, []);
    } catch (error) {
      console.error("[AUTH] Failed to launch LiveChat door:", error);
      // WEB_: the chat-only sign-in (?chatOnly) has no express.e counterpart.
      emitter.emit(
        "ansi-output",
        "\r\n\x1b[31mFailed to launch LiveChat. Please try again.\x1b[0m\r\n",
      );
    }
    triggerSamiLogRefresh();
    return { ok: false, terminated: "chat-only-handled" };
  }

  // express.e:29853-29855 — show LOGON screen unless quickFlag.
  let logonDisplayed = false;
  if (!(session as any).quickFlag) {
    logonDisplayed = await displayScreen(
      emitter as any,
      session,
      "LOGON",
      false,
    );
  }

  /**
   * express.e:28540 - `pagesAllowed := readToolTypeInt(TOOLTYPE_ACCESS,
   * acsLevel, 'ACS.MAX_PAGES')`, set once per logon, immediately before the
   * bulletin flow this line begins.
   *
   * Nothing in this port ever read ACS.MAX_PAGES, so `session.pagesAllowed`
   * was permanently undefined: the O command could not enforce a page budget,
   * and the "Sysop Pages Remaining" line on the stats screen
   * (user-commands.handler.ts, express.e:25599) had nothing to show.
   *
   * -1 means unlimited and is what an absent tooltype yields, so a board that
   * has never heard of MAX_PAGES keeps behaving exactly as it does today.
   */
  try {
    const { getAcsValueInt, findAcsLevel } = require("../utils/acs-access-loader");
    const acsLevel = findAcsLevel(session.user?.securityLevel ?? 0);
    session.pagesAllowed = getAcsValueInt(acsLevel, "ACS.MAX_PAGES");
  } catch (err) {
    console.warn("[LOGIN] could not read ACS.MAX_PAGES:", err);
    session.pagesAllowed = -1;
  }

  // Begin bulletin flow.
  session.subState = LoggedOnSubState.DISPLAY_BULL;
  triggerSamiLogRefresh();

  // GDPR consent gate — applies to every transport. The web isWeb-only
  // gate was a parity stopgap; the underlying flow (promptGdprBackfill
  // sets subState=GDPR_BACKFILL, then handleGdprBackfillInput at
  // command.handler.ts:1217 line-buffers Y/n) is dispatch-agnostic and
  // works for telnet/SSH unchanged.
  if (!(session.user as any)?.gdprConsentAt) {
    try {
      const { promptGdprBackfill } = require("../handlers/user/gdpr.handler");
      await promptGdprBackfill(emitter as any, session);
      return { ok: false, terminated: "pwd-change-pending" }; // reuse "pending" to mean "caller should not advance"
    } catch (err) {
      console.error("[LOGIN] promptGdprBackfill failed:", err);
    }
  }

  if (logonDisplayed) {
    pauseAfterLogon(emitter, session);
    // Caller (or handleCommand on the next input) will advance the flow.
    return { ok: true };
  }

  // No LOGON screen — drive the bulletin display flow immediately.
  try {
    const { handleCommand } = require("../handlers/command.handler");
    await handleCommand(emitter as any, session, "", ctx.io);
  } catch (err) {
    console.error("[LOGIN] post-auth handleCommand failed:", err);
  }
  return { ok: true };
}

/**
 * express.e shows LOGON and then pauses before the bulletins. When LOGON is
 * split by `~SP`, the pause after the whole screen is still owed after its
 * last piece.
 */
export function pauseAfterLogon(emitter: LoginEmitter, session: BBSSession): void {
  if (!session.paginatedScreen) {
    doPause(emitter as any, session);
  }
  /*
   * A LOGON SPLIT BY `~SP` IS NOT FINISHED YET, so this pause is not the one
   * after it.
   *
   * The live LOGON is `~CC_gl ~SP / uprough ~SP / quicknew`: displayScreen
   * draws the first piece and parks the rest on the session, and the prompt
   * above stands at the first `~SP`, not at the end of the file. Treating it
   * as the pause after LOGON left the last piece - quicknew - to be drawn and
   * wiped by BULL's clear in the same breath: "there is no pause after
   * quicknew" (the sysop, 2026-09-24). NODE_BULL had exactly this debt; it is
   * booked the same way and paid when the last segment is drawn
   * (command.handler, handleCommand).
   */
  const { rememberTheDebtIfSegmentsRemain } = require("../handlers/command.handler");
  rememberTheDebtIfSegmentsRemain(session, "logon");
}

/**
 * express.e:29193-29195 / 29263-29264 — when a password-failure flow
 * terminates (excessive failure, declined reset, wrong code, mail-send
 * failure, missing email), express.e runs the PWFAIL syscmd then jumps
 * to logoffErr which writes "\t* Password Failure *" to CallersLog.
 *
 * Same helper used by every rejection branch on every transport.
 * Replaces the local copy at auth-socket-handlers.ts:1203-1212.
 */
export async function runPwfailAndLogoff(
  emitter: LoginEmitter,
  session: BBSSession,
  message: string,
): Promise<void> {
  try {
    const { runSysCommand } = require("../handlers/command-execution.handler");
    await runSysCommand(emitter as any, session, "PWFAIL", "");
  } catch (err) {
    console.error("[LOGIN] PWFAIL syscmd failed:", err);
  }
  callersLogManager.logActivity(
    session.nodeId || 1,
    "\t* Password Failure *",
  );
  beginLogoff(emitter as any, session, { message });
}
