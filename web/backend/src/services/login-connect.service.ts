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

export interface PreLoginConnectContext {
  /** Caller-provided socket id; used by AREXX login trigger. */
  socketId: string;
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

const ANSI_GRAPHICS_PROMPT =
  "\r\nANSI, RIP, PETSCII or No graphics (A/r/p/n) [add Q to skip bulletins]?";

export async function runPreLoginConnect(
  emitter: LoginEmitter,
  session: BBSSession,
  ctx: PreLoginConnectContext,
): Promise<PreLoginConnectResult> {
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

  // 3. FRONTEND syscmd — express.e:29524. Optional; missing syscmd
  // is not an error.
  try {
    const { runSysCommand } = await import(
      "../handlers/command-execution.handler"
    );
    await runSysCommand(emitter as any, session, "FRONTEND", "");
  } catch {
    console.log("[PreLoginConnect] FRONTEND syscmd not found, continuing");
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
