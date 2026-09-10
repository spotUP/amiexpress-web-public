/**
 * login-connect.service.ts
 *
 * Unified pre-login connect-time pipeline. Every transport (web,
 * telnet, SSH) runs the same sequence right after a new connection
 * is established and the BBSSession exists:
 *
 *   1. Attach operator chat listeners.
 *   2. Refresh the SamiLog (system call log) buffer.
 *   3. Run the FRONTEND syscmd if registered (Who's-Online door etc).
 *   4. If passwordResetState is already set, return without emitting
 *      the graphics prompt — the password-reset flow takes over.
 *   5. Emit the ANSI/RIP/PETSCII graphics prompt and park the session
 *      in ANSI_PROMPT state.
 *   6. Fire the AREXX 'login' trigger.
 *
 * Web previously did all of this inline in `io.on('connection')`;
 * telnet/SSH skipped most of it. The class of bug this prevents is
 * the same as the post-auth duplication that `runPostAuthLogin`
 * solved — three near-identical transport flows that drifted apart
 * silently.
 *
 * Transport-specific connect-time work that does NOT belong here:
 *   - The "/X Native Telnet: searching for free node…" web banner
 *     (deliberate web-only emulation).
 *   - Connection rate-limiting and node assignment (each transport
 *     has different policies).
 *   - registerSocketHandlers (web socket.io concept; telnet/SSH use
 *     their own input dispatch).
 *
 * Operator chat listeners attach to events that only socket.io
 * naturally emits. On telnet/SSH the listeners install via
 * connection.on(...) and simply never fire — harmless no-op.
 */

import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { LoggedOnSubState } from "../constants/bbs-states";
import { triggerSamiLogRefresh } from "./SamiLogService";
import { arexxEngine } from "./arexx.service";
import { config } from "../config";
import { getSystemTime } from "../utils/date-time.util";

export interface PreLoginConnectContext {
  /** Caller-provided socket id; used by AREXX login trigger. */
  socketId: string;
  /**
   * How long to hold after the connect banner, so a caller can read it
   * before the screen clears. 3000 on web, which has no dial-up
   * negotiation to fill; 0 everywhere else, where a stall would be a
   * regression rather than parity.
   */
  postBannerDelayMs?: number;
}

export interface PreLoginConnectResult {
  ok: boolean;
  /**
   * True when session.passwordResetState was set on entry. The caller
   * should NOT emit the graphics prompt — the password-reset state
   * machine drives the flow from here.
   */
  passwordResetActive?: boolean;
}

// Task 6 / audit F1-F3: uppercase-only ASCII. A power-on/reset real C64
// renders unshifted PETSCII $41-$5A as uppercase in its default up/gfx
// charset; lowercase ASCII bytes land on PETSCII graphics glyphs instead
// of letters there, so this string must stay all-caps to be legible on an
// undetected C64 sitting at this prompt. The DEL invite doubles as the
// probe: PETSCII DEL is $14 (vs ASCII BS $08 / DEL $7F) - see
// c64-detect.util.ts's classifyFirstKeypress, which the raw-byte
// classification hook in index.ts's connection.on('data') runs on this
// very keypress (both at DISPLAY_CONNECT and, for slower typers, at
// ANSI_PROMPT — see command.handler.ts). The A/R/P/N graphics question
// itself is unchanged; only its casing and the DEL invite are new.
//
// Two lines (sysop addendum, 2026-09-02): the C64 DEL invite stays on its
// own line, but the graphics question and the A/R/P/N prompt are merged
// onto one line. The question comes last with a trailing space so the
// input cursor sits right after it.
/**
 * P8 (2026-09-07) is PETSCII on this board's WIDE screen - 80 columns of
 * Commodore glyphs on the web terminal's canvas. It is offered to everyone
 * because there is one prompt and one board; a caller on a byte transport
 * who types it gets the C64's 40-column screen, which is the honest answer:
 * their terminal IS the screen, and no byte on the wire could make it 80
 * columns wide.
 *
 * T (2026-09-10, WEB_) is TELETEXT session mode: TDAText face + teletext
 * palette in the web terminal, plain ANSI on byte transports (with a
 * fallback notice, same shape as R). No express.e counterpart.
 */
export const ANSI_GRAPHICS_PROMPT =
  "\r\nCOMMODORE 64: PRESS <DEL>\r\nANSI, RIP, PETSCII, TELETEXT OR NO GRAPHICS (A/R/P/P8/T/N) [Q=SKIP BULLETINS]? ";

/**
 * The connect banner - express.e:29507-29522 - for EVERY transport.
 *
 * These eight lines were printed by `index.ts`'s web connection handler and
 * by nothing else, so a telnet, SSH or /ws/terminal caller connected
 * straight into the graphics prompt with no "Searching for free node", no
 * CONNECT, no Welcome and no Connection-occurred line. The board looked
 * like a different board depending on how you reached it.
 *
 * The three-second pause is the ONE thing that stays transport-specific:
 * a browser has no dial-up negotiation to fill, and the pause is what makes
 * the banner readable before the screen clears - while three seconds added
 * to a telnet connect would be a regression, not parity. It is passed as
 * `postBannerDelayMs`, 3000 from web and 0 from everything else.
 *
 * A real C64 never reaches here: telnet-server short-circuits to
 * `handleC64Detected` without calling `runPreLoginConnect` at all.
 */
export async function emitConnectBanner(
  emitter: LoginEmitter,
  session: BBSSession,
  postBannerDelayMs = 0,
): Promise<void> {
  const bbsConfig = config.getConfig();
  const { loadBBSConfig } = await import("./bbs-config-file.service");
  const diskConfig = loadBBSConfig(bbsConfig.dataDir);

  // The AmiExpress version this board reports, kept in sync with
  // xim/bbs-info.ts's EXPRESS_VERSION fallback.
  const amiExpressVersion = "v5.6";
  const webPortVersion = require("../../package.json").version || "1.0.0";

  const nodeId = session.nodeId;
  const bbsName = diskConfig.bbs_name || bbsConfig.bbsName;
  const location = diskConfig.location || bbsConfig.location;
  const registeredTo = diskConfig.sysop_name || "NONE";
  const currentYear = getSystemTime().getFullYear();
  const dateStr = getSystemTime().toLocaleString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true,
  });

  const say = (text: string) => emitter.emit("ansi-output", text);

  say("\r\n/X Native Telnet:  Searching for free node...\r\n");
  say(`/X Native Telnet:  Successful connection to node ${nodeId}\r\n`);
  say("\r\nCONNECT 19200\r\n");
  say("**EMSI_IRQ8E08\r\n");
  say("\r\n");
  // express.e:29507-29512
  say(location && location.length > 0
    ? `\x1b[0mWelcome to ${bbsName}, located in ${location}`
    : `\x1b[0mWelcome to ${bbsName}.`);
  // express.e:29514-29515
  say(`\r\n\r\nRunning AmiExpress ${amiExpressVersion} Copyright (c) 2018-${currentYear} Darren Coles,\r\n`);
  say(`Web port ${webPortVersion} by Spot/Up Rough\r\n`);
  // express.e:29516-29517. The line used to end "via web connection" on the
  // one transport that prints it; naming the transport here would be the
  // only byte that differed between them, so the node is what it names.
  say(`\r\nRegistered to ${registeredTo}. You are connected to Node ${nodeId}`);
  // express.e:29518-29522
  say(`\r\nConnection occurred at ${dateStr}.`);
  say("\r\n");

  if (postBannerDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, postBannerDelayMs));
  }
}

export async function runPreLoginConnect(
  emitter: LoginEmitter,
  session: BBSSession,
  ctx: PreLoginConnectContext,
): Promise<PreLoginConnectResult> {
  // 0. The connect banner, for every transport that reaches this service.
  try {
    await emitConnectBanner(emitter, session, ctx.postBannerDelayMs ?? 0);
  } catch (err) {
    console.error("[PreLoginConnect] connect banner failed:", err);
  }

  // 1. Operator chat listeners — dynamic import to avoid a load-order
  // cycle with handlers that themselves import services from here.
  try {
    const { setupOperatorChatListeners } = await import(
      "../handlers/operator-chat.handler"
    );
    setupOperatorChatListeners(emitter as any, session);
  } catch (err) {
    console.error("[PreLoginConnect] operator chat setup failed:", err);
  }

  // 2. SamiLog refresh — non-fatal if the service hasn't initialised.
  try {
    await triggerSamiLogRefresh();
  } catch (err) {
    console.error("[SamiLog] Initial refresh failed:", err);
  }

  // 3. FRONTEND syscmd — express.e:29524. Optional; a board with no
  // FRONTEND registration is normal.
  //
  // This used to swallow every outcome: a throw printed "syscmd not found"
  // whatever had actually gone wrong, and a non-zero RESULT was not reported
  // at all. A sysop whose Who's-Online screen stopped appearing had nothing
  // to look at - the connect flow simply carried on to the ANSI prompt, which
  // is exactly what a board with no FRONTEND does. Say which of the two it
  // was.
  try {
    // require, NOT await import. The backend compiles to CommonJS, and a
    // dynamic import of a TS module under tsx yields a SECOND instance with
    // its own module state: this call read a syscmd cache holding 0 entries
    // while the board's startup had loaded 16 into the copy that
    // initialization.ts populates through a static import. Every syscmd
    // failed as "not registered" here and nowhere else, so the Who's-Online
    // screen vanished from the connect flow while typed commands kept
    // working. Same registry, same cache.
    //
    // Static import would be tidier still, but command-execution.handler
    // imports BBSSession from ../index, and index.ts loads this service - a
    // cycle at module-evaluation time. Lazy require inside the function
    // avoids it, and is the pattern door-list.ts already uses for
    // door.handler.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const handler = require("../handlers/command-execution.handler");
    const result = await handler.runSysCommand(emitter as any, session, "FRONTEND", "");
    if (result !== 0) {
      // The cache size comes from THIS module instance. A dynamic import that
      // resolves to a second copy of the handler has its own empty cache, and
      // every syscmd then fails as "not registered" while the board's own
      // startup log says sixteen were loaded.
      console.log(
        `[PreLoginConnect] FRONTEND syscmd returned ${result} - not registered, ` +
        `or refused (access level, or a door type this board cannot run). ` +
        `syscmd cache holds ${handler.commandCache.syscmd.size}: ` +
        `${[...handler.commandCache.syscmd.keys()].slice(0, 20).join(", ") || "nothing"}`
      );
    }
  } catch (err) {
    console.error("[PreLoginConnect] FRONTEND syscmd failed:", err);
  }

  // 4. Password-reset short-circuit — express.e:29152-29213. The
  // password-reset state machine owns input from here; do NOT print
  // the graphics prompt or change subState.
  if (session.passwordResetState) {
    console.log(
      `[PreLoginConnect] Skipping ANSI prompt - in password reset mode for node ${session.nodeId}`,
    );
    return { ok: true, passwordResetActive: true };
  }

  // 5. Graphics prompt + parked state — express.e:29527-29528.
  emitter.emit("ansi-output", ANSI_GRAPHICS_PROMPT);
  session.subState = LoggedOnSubState.ANSI_PROMPT;
  session.tempData = { inputBuffer: "" };

  // 6. AREXX 'login' trigger — fires on every connect, regardless of
  // transport. Sysop AREXX scripts use this to log connections or
  // trigger custom welcome screens.
  try {
    await arexxEngine.executeTrigger("login", {
      userId: undefined,
      sessionId: ctx.socketId,
      environment: { nodeId: session.nodeId },
    });
  } catch (err) {
    console.error("[AREXX] login trigger failed:", err);
  }

  return { ok: true };
}
