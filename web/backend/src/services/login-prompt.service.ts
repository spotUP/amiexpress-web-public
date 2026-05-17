/**
 * login-prompt.service.ts
 *
 * Per-transport prompt adapters for the multi-step pre-login UI flows
 * that don't fit a single-shot socket event:
 *
 *   - Forced password change (`prompt-forced-pwd-change` on web).
 *   - Email-based password reset (`prompt-password-reset` on web).
 *
 * On web these are driven by socket events handled in
 * auth-socket-handlers.ts. On telnet/SSH the adapter here installs a
 * temporary `session.loginInputHandler` and line-buffers the multi-step
 * prompt loop.
 *
 * Commit 4b lands `promptForcedPwdChange` (telnet/SSH branch) — the web
 * branch returns immediately because the existing
 * `forced-pwd-change-input` socket handler in auth-socket-handlers.ts
 * already drives that flow asynchronously. (Future work: collapse both
 * branches into a single shared post-pwd-change flow.)
 */

import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { BBSState } from "../constants/bbs-states";
import { db } from "../database";
import { beginLogoff } from "../server/logoff";
import { emitText, emitPrompt } from "../utils/output.util";
import {
  loadPasswordPolicy,
  validateNewPassword,
} from "./password-policy.util";

export interface ForcedPwdChangeResult {
  ok: boolean;
  /** New password (plaintext, never logged). Already applied to DB. */
  newPassword?: string;
  reason?: "denied" | "exceeded-retries" | "transport-closed";
}

/**
 * Drive a forced-password-change flow on telnet/SSH using a line-buffered
 * prompt loop. Returns when the user completes the flow successfully
 * (password updated, session state cleared) OR after the 3-retry budget
 * is exhausted (`beginLogoff` already called, caller should return).
 *
 * Web is a no-op here — its existing socket handler at
 * auth-socket-handlers.ts:1316+ owns the flow asynchronously after
 * runPostAuthLogin emits `prompt-forced-pwd-change`.
 *
 * Preconditions (set by runPostAuthLogin before calling):
 *   session.forcedPwdChangeState = 'await_new'
 *   session.forcedPwdChangeUsername / UserId / Slot / PwdHash
 *   session.forcedPwdChangeMinLen / MinStrength
 */
export async function promptForcedPwdChange(
  emitter: LoginEmitter,
  session: BBSSession,
  user: any,
): Promise<ForcedPwdChangeResult> {
  if (session.connectionType === "web") {
    // Web is driven by the existing socket handler; nothing to do here.
    return { ok: true };
  }

  emitText(
    emitter as any,
    "\r\nYour account requires your password to be changed.\r\n\r\n",
  );
  emitPrompt(emitter as any, "Enter New Password: ");

  const policy = loadPasswordPolicy(user.passwordHash ?? "");

  return new Promise<ForcedPwdChangeResult>((resolve) => {
    let phase: "await_new" | "await_confirm" = "await_new";
    let firstPassword = "";
    let buf = "";
    let retries = 0;
    let lastCharWasCR = false;

    const teardown = () => {
      session.loginInputHandler = undefined;
      session.forcedPwdChangeState = undefined;
      session.forcedPwdChangeUsername = undefined;
      session.forcedPwdChangeUserId = undefined;
      session.forcedPwdChangeSlot = undefined;
      session.forcedPwdChangeRetry = undefined;
      session.forcedPwdChangePwdHash = undefined;
      session.forcedPwdChangeNewPass = undefined;
      session.forcedPwdChangeMinLen = undefined;
      session.forcedPwdChangeMinStrength = undefined;
    };

    const bail = (reason: ForcedPwdChangeResult["reason"]) => {
      teardown();
      beginLogoff(emitter as any, session, {
        message:
          "\r\nYou have not updated your password so you will now be disconnected...\r\n\r\n",
        finalState: BBSState.AWAIT,
        readDelayMs: 1500,
      });
      resolve({ ok: false, reason });
    };

    const bumpRetry = (msg: string): boolean => {
      retries++;
      if (retries > 3) {
        bail("exceeded-retries");
        return true;
      }
      emitText(emitter as any, msg);
      emitPrompt(emitter as any, "Enter New Password: ");
      phase = "await_new";
      firstPassword = "";
      return false;
    };

    const processLine = async (line: string) => {
      const newPass = line; // do not trim — leading/trailing spaces are valid

      if (phase === "await_new") {
        if (newPass.length === 0) {
          if (bumpRetry("")) return;
          return;
        }
        const outcome = await validateNewPassword(newPass, policy);
        if (!outcome.ok) {
          if (bumpRetry(outcome.message)) return;
          return;
        }
        firstPassword = newPass;
        phase = "await_confirm";
        emitPrompt(emitter as any, "Reenter New Password: ");
        return;
      }

      // await_confirm
      if (newPass !== firstPassword) {
        if (
          bumpRetry(
            "\r\nPasswords do not match, please try again.\r\n\r\n",
          )
        ) {
          return;
        }
        return;
      }

      // Match — apply.
      try {
        await db.updateUserPassword(
          session.forcedPwdChangeUserId ?? user.id,
          firstPassword,
          session.forcedPwdChangeSlot ?? user.slotNumber ?? 0,
        );
      } catch (err) {
        console.error("[promptForcedPwdChange] updateUserPassword failed:", err);
        teardown();
        beginLogoff(emitter as any, session, {
          message:
            "\r\n\x1b[31mPassword change error. Goodbye!\x1b[0m\r\n",
          finalState: BBSState.AWAIT,
          readDelayMs: 1500,
        });
        resolve({ ok: false, reason: "denied" });
        return;
      }

      // Reload user so session.user has the new hash.
      try {
        const updated = await db.getUserById(
          session.forcedPwdChangeUserId ?? user.id,
        );
        if (updated && session.user) {
          (session.user as any).passwordHash = updated.passwordHash;
        }
      } catch {
        /* non-fatal */
      }

      teardown();
      emitText(
        emitter as any,
        "\r\n\x1b[32mPassword updated successfully.\x1b[0m\r\n",
      );
      resolve({ ok: true, newPassword: firstPassword });
    };

    // Line-buffered input handler.
    session.loginInputHandler = (chunk: string) => {
      const cleanData =
        typeof chunk === "string" ? chunk.replace(/\0/g, "") : chunk;

      // Skip LF following a CR (CR+LF split across calls).
      if (cleanData === "\n" && lastCharWasCR) {
        lastCharWasCR = false;
        return;
      }

      for (const ch of cleanData) {
        if (ch === "\b" || ch === "\x7f") {
          if (buf.length > 0) {
            buf = buf.slice(0, -1);
            emitText(emitter as any, "\b \b");
          }
          continue;
        }
        if (ch === "\r" || ch === "\n") {
          const line = buf;
          buf = "";
          lastCharWasCR = ch === "\r";
          emitText(emitter as any, "\r\n");
          // processLine is async; fire-and-forget but errors logged.
          processLine(line).catch((err) => {
            console.error("[promptForcedPwdChange] processLine failed:", err);
          });
          return;
        }
        if (ch >= " " && ch <= "~") {
          buf += ch;
          emitText(emitter as any, "*");
          lastCharWasCR = false;
        }
      }
    };
  });
}
