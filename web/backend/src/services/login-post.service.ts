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
 * The forced-password-change flow currently still returns
 * `terminated: 'pwd-change-pending'` on both transports and lets the
 * web `forced-pwd-change-input` socket handler take over (legacy
 * behaviour for web; commit 4 will route both transports through
 * `services/login-prompt.service.ts` `promptForcedPwdChange` for true
 * parity).
 */

import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { BBSState, LoggedOnSubState } from "../constants/bbs-states";
import { db } from "../database";
import { nodeFileManager } from "../services/NodeFileManager";
import { userDatabaseManager } from "../services/UserDatabaseManager";
import { callersLogManager } from "./CallersLogManager";
import { initializeSecurity, setEnvStat } from "../utils/security.util";
import { EnvStat } from "../constants/env-codes";
import { AnsiUtil } from "../utils/ansi.util";
import {
  sessions,
  userSessions,
  socketToUser,
} from "../server/session-manager";
import { callersLog } from "../server/database-helpers";
import { triggerSamiLogRefresh } from "../services/SamiLogService";
import { displayScreen, doPause } from "../handlers/screen.handler";
import { runLoginBatches, runExecuteOn } from "./batch-scheduler";
import { mailOnLogon } from "./mail-notification.service";
import { SysopDebugUtil, DebugSeverity } from "../utils/sysop-debug.util";
import { sessionLogManager } from "./SessionLogManager";
import { emitUserLogin } from "./bbs-event-emitter";
import { getSystemTime } from "../utils/date-time.util";
import { beginLogoff } from "../server/logoff";

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
}

export type PostAuthResult =
  | { ok: true }
  | {
      ok: false;
      terminated:
        | "lockout"
        | "account-locked"
        | "pwd-change-denied"
        | "pwd-change-pending"
        | "quick-logon-handled"
        | "chat-only-handled";
    };

/**
 * Install an emit() wrapper that strips ANSI codes when the session
 * user has disabled ANSI. Idempotent per socket (guarded by
 * `_ansiFilterInstalled`). Works against both real socket.io sockets
 * and the telnet/SSH wrapper because both expose `emit` as a writable
 * property and structurally satisfy `LoginEmitter`.
 *
 * Ported from `auth-socket-handlers.ts:80-93`.
 */
function installAnsiFilter(emitter: LoginEmitter, sess: BBSSession): void {
  if ((emitter as any)._ansiFilterInstalled) return;
  const originalEmit = emitter.emit.bind(emitter);
  (emitter as any).emit = ((event: string, ...args: unknown[]) => {
    if (
      event === "ansi-output" &&
      (sess.ansiMode === false || (sess.user as any)?.ansi === false)
    ) {
      const filtered = args.map((arg) =>
        typeof arg === "string" ? AnsiUtil.stripAnsiForPlainText(arg) : arg,
      );
      return originalEmit(event, ...filtered);
    }
    return originalEmit(event, ...args);
  }) as any;
  (emitter as any)._ansiFilterInstalled = true;
}

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
  const isWeb = session.connectionType === "web";

  // Update last login (preserve previous via ctx for new-since scans).
  await db.updateUser(user.id, {
    lastLogin: getSystemTime(),
    calls: user.calls + 1,
    callsToday: user.callsToday + 1,
  });

  // Set session user data
  session.state = BBSState.LOGGEDON;
  session.subState = LoggedOnSubState.EXEC_QUICKNEW;
  session.user = { ...user, lastLoginBeforeUpdate: ctx.lastLoginBeforeUpdate };
  session.ansiMode = user.ansi;
  installAnsiFilter(emitter, session);

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

  // Web frontend uses client-side emulation; telnet/SSH ignore.
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

  // Login batches (non-blocking).
  runLoginBatches(session.nodeId || 0).catch((err) => {
    console.error("[LOGIN] Batch scheduler failed:", err);
  });

  // EXECUTE_ON_LOGON from bbsConfig.info (express.e:6715).
  runExecuteOn("LOGON", session.nodeId || 1, {
    username: user.username,
    location: user.location,
  }).catch((err: any) => {
    console.error("[LOGIN] EXECUTE_ON_LOGON failed:", err);
  });

  // MAIL_ON_LOGON (express.e:6716-6720).
  mailOnLogon(user.username, user.location || "").catch((err: any) => {
    console.error("[LOGIN] MAIL_ON_LOGON failed:", err);
  });

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
    userSessions.set(user.id, session);
    socketToUser.set(emitter.id, user.id);
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
    callersLogManager.logLogin(
      nodeId,
      user.username,
      1,
      user.location || "Unknown",
    );
  } catch (error) {
    console.error(`[LOGIN] Error writing node files:`, error);
  }

  // Initialize security and env stat.
  initializeSecurity(session);
  setEnvStat(session, EnvStat.IDLE);

  // express.e:29768-29773 — secStatus <= 1 lockout.
  if (user.secLevel <= 1) {
    const lockScreen = user.secLevel === 0 ? "LOCKOUT0" : "LOCKOUT1";
    await displayScreen(emitter as any, session, lockScreen, false);
    beginLogoff(emitter as any, session, {
      finalState: BBSState.AWAIT,
      readDelayMs: 1500,
    });
    return { ok: false, terminated: "lockout" };
  }

  // Read disk-backed user.misc (accountLocked / forcePwdReset / pwdLastUpdated).
  let diskMisc: ReturnType<typeof userDatabaseManager.readUserFromDisk> = null;
  if (user.slotNumber && user.slotNumber > 0) {
    try {
      diskMisc = userDatabaseManager.readUserFromDisk(user.slotNumber);
    } catch (err) {
      console.warn(
        `[LOGIN] Could not read user.misc for slot ${user.slotNumber}:`,
        err,
      );
    }
  }
  const miscAccountLocked = diskMisc ? diskMisc.misc.accountLocked : 0;
  const miscForcePwdReset = diskMisc ? diskMisc.misc.forcePwdReset : 0;
  const miscPwdLastUpdated = diskMisc ? diskMisc.misc.pwdLastUpdated : 0;

  // express.e:29775-29782 — accountLocked.
  if (miscAccountLocked) {
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
    beginLogoff(emitter as any, session, {
      message: "\r\nThanks you will now be disconnected...\r\n\r\n",
      finalState: BBSState.AWAIT,
      readDelayMs: 1500,
    });
    return { ok: false, terminated: "account-locked" };
  }

  // express.e:29785-29845 — PASSWORD_EXPIRY_DAYS + forcePwdReset.
  {
    let pwdExpiryDays = 0;
    try {
      const sysConf = db.getConfigRepository().getSystemConfig();
      if (sysConf && typeof sysConf.password_expiry_days === "number") {
        pwdExpiryDays = sysConf.password_expiry_days;
      }
    } catch {
      /* non-fatal */
    }

    let forcedByExpiry = false;
    if (pwdExpiryDays > 0 && miscPwdLastUpdated > 0) {
      const nowSecs = Math.floor(Date.now() / 1000);
      if (miscPwdLastUpdated + pwdExpiryDays * 86400 < nowSecs) {
        forcedByExpiry = true;
      }
    }

    const needsPwdChange = forcedByExpiry || miscForcePwdReset !== 0;

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
        const sysConf = db.getConfigRepository().getSystemConfig();
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

      if (isWeb) {
        // Web frontend modal: emit the prompts and return; the existing
        // `forced-pwd-change-input` socket handler in
        // auth-socket-handlers.ts drives the rest asynchronously.
        emitter.emit("prompt-forced-pwd-change");
        emitter.emit(
          "ansi-output",
          "\r\nYour account requires your password to be changed.\r\n\r\n",
        );
        emitter.emit("ansi-output", "Enter New Password: ");
        emitter.emit("mask-input", true);
        return { ok: false, terminated: "pwd-change-pending" };
      }

      // Telnet/SSH: drive the prompt loop synchronously via the
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
        const refreshed = await db.getUserById(user.id);
        if (refreshed) user = refreshed;
      } catch {
        /* non-fatal */
      }
      // Fall through to the standard callersLog → systemStats → webhook
      // → preferences → LOGON → bulletin flow below.
    }
  }

  // Log successful login (express.e:9493 callersLog).
  await callersLog(user.id, user.username, "Logged on");

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
        calls: user.calls + 1,
      });
    } catch (error) {
      console.error("[Webhook] Error sending user login webhook:", error);
    }
  }

  // Conference / preference defaults.
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

  // QuickLogon ('Q' at ANSI prompt) → straight to menu.
  if (session.tempData?.quickLogon) {
    session.tempData.quickLogon = false;
    session.menuPause = true;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    try {
      const { displayMainMenu } = require("../handlers/command-handler/menu");
      await displayMainMenu(emitter as any, session);
    } catch (err) {
      console.error("[LOGIN] quick-logon displayMainMenu failed:", err);
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

  // Begin bulletin flow.
  session.subState = LoggedOnSubState.DISPLAY_BULL;
  triggerSamiLogRefresh();

  // GDPR consent gate (express.e: no equivalent; web-specific feature).
  // Telnet/SSH parity for this is wired in commit 4 via login-prompt
  // service; until then telnet/SSH skip the gate.
  if (isWeb && !(session.user as any)?.gdprConsentAt) {
    try {
      const { promptGdprBackfill } = require("../handlers/user/gdpr.handler");
      await promptGdprBackfill(emitter as any, session);
      return { ok: false, terminated: "pwd-change-pending" }; // reuse "pending" to mean "caller should not advance"
    } catch (err) {
      console.error("[LOGIN] promptGdprBackfill failed:", err);
    }
  }

  if (logonDisplayed) {
    if (!session.paginatedScreen) {
      doPause(emitter as any, session);
    }
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
