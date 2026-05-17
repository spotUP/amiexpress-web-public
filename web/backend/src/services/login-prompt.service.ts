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

import * as crypto from "crypto";
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
import {
  isMailEventEnabled,
  isSmtpConfigured,
  mailOnPwdFail,
} from "./mail-notification.service";

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

// ============================================================================
// Email-based password reset (telnet/SSH parity with web)
// ============================================================================

export interface PasswordResetResult {
  ok: boolean;
  reason?:
    | "user-declined"
    | "no-email"
    | "smtp-failed"
    | "wrong-code"
    | "weak-password"
    | "db-error";
}

/**
 * Returns true if email-based password reset is configured AND the user has
 * an email on file. Used by the failure-path to decide whether to offer
 * the reset or fall straight through to PWFAIL.
 */
export async function isPasswordResetAvailable(userEmail: string | null | undefined): Promise<boolean> {
  if (!userEmail) return false;
  const mailEnabled = await isMailEventEnabled("PWD_FAIL");
  if (!mailEnabled) return false;
  const smtpConfigured = await isSmtpConfigured();
  return smtpConfigured;
}

/**
 * Drive the email-based password reset flow on telnet/SSH using a
 * line-buffered prompt loop. Mirrors the web socket-event flow in
 * auth-socket-handlers.ts ("password-reset-input" handler) one-for-one:
 *
 *   await_confirm  →  "Do you want to send a reset code…? (Y/n)"
 *   await_code     →  "Enter reset code: " (10-char alnum, emailed)
 *   await_new_pwd  →  "Enter new password: " (min 4 chars, masked)
 *
 * On success, the new password is written to the DB and the caller can
 * re-prompt for username/password. On any rejection or hard failure the
 * adapter calls `beginLogoff` itself, the caller should return.
 *
 * Web is a no-op here — its existing "password-reset-input" socket
 * handler in auth-socket-handlers.ts:748+ owns the flow asynchronously
 * after the failure-path emits `prompt-password-reset`.
 *
 * Preconditions:
 *   session.passwordResetUsername = the username that failed login
 *   session.user must be undefined (we're pre-login)
 */
export async function promptPasswordReset(
  emitter: LoginEmitter,
  session: BBSSession,
): Promise<PasswordResetResult> {
  if (session.connectionType === "web") {
    // Web is driven by the existing socket handler; nothing to do here.
    return { ok: true };
  }

  const username = session.passwordResetUsername || "";
  if (!username) return { ok: false, reason: "no-email" };

  emitText(emitter as any, "\r\n\x1b[33mExcessive Password Failure\x1b[0m\r\n\r\n");
  emitPrompt(emitter as any, "Do you want to send a reset code to your email address? (Y/n): ");
  session.passwordResetState = "await_confirm";

  return new Promise<PasswordResetResult>((resolve) => {
    let phase: "await_confirm" | "await_code" | "await_new_password" = "await_confirm";
    let buf = "";
    let lastCharWasCR = false;

    const teardown = () => {
      session.loginInputHandler = undefined;
      session.passwordResetState = undefined;
      session.passwordResetCode = undefined;
      session.passwordResetUsername = undefined;
    };

    const bail = (reason: PasswordResetResult["reason"], message: string) => {
      teardown();
      beginLogoff(emitter as any, session, {
        message,
        finalState: BBSState.AWAIT,
        readDelayMs: 1500,
      });
      resolve({ ok: false, reason });
    };

    const processLine = async (line: string) => {
      if (phase === "await_confirm") {
        const answer = line.trim().toUpperCase();
        // express.e:29160-29167 — blank Enter defaults to Y
        if (answer !== "" && answer !== "Y" && answer !== "YES") {
          // express.e:29193-29195 — user declined → PWFAIL + logoffErr.
          bail("user-declined", "\r\n\x1b[31mGoodbye!\x1b[0m\r\n");
          return;
        }

        const user = await db.getUserByUsername(username);
        if (!user?.email) {
          bail("no-email", "\r\n\x1b[31mNo email address on file.\x1b[0m\r\n");
          return;
        }

        const resetCode = crypto.randomBytes(5).toString("hex").toUpperCase();
        session.passwordResetCode = resetCode;
        const emailSent = await mailOnPwdFail(user.email, resetCode);
        if (!emailSent) {
          bail("smtp-failed", "\r\n\x1b[31mFailed to send reset code. Please contact the sysop.\x1b[0m\r\n");
          return;
        }

        emitText(emitter as any, "\r\n\x1b[32mReset code sent to your email address.\x1b[0m\r\n");
        emitPrompt(emitter as any, "\r\nEnter reset code: ");
        phase = "await_code";
        session.passwordResetState = "await_code";
        return;
      }

      if (phase === "await_code") {
        // express.e:29173-29188 — verify reset code (case-insensitive match).
        if (line.trim().toUpperCase() !== (session.passwordResetCode || "")) {
          // express.e:29189-29195 — wrong code → PWFAIL + logoffErr.
          bail("wrong-code", "\r\n\x1b[31mInvalid reset code.\x1b[0m\r\n");
          return;
        }
        emitText(emitter as any, "\r\n\x1b[32mCode verified!\x1b[0m\r\n");
        emitPrompt(emitter as any, "\r\nEnter new password: ");
        phase = "await_new_password";
        session.passwordResetState = "await_new_password";
        return;
      }

      // await_new_password — express.e:29196-29213.
      const newPassword = line; // do not trim — passwords may have leading/trailing spaces
      if (newPassword.length < 4) {
        emitText(emitter as any, "\r\n\x1b[33mPassword must be at least 4 characters.\x1b[0m\r\n");
        emitPrompt(emitter as any, "Enter new password: ");
        return;
      }

      const user = await db.getUserByUsername(username);
      if (!user) {
        bail("db-error", "\r\n\x1b[31mUser not found.\x1b[0m\r\n");
        return;
      }
      try {
        await db.updateUserPassword(user.id, newPassword);
      } catch (err) {
        console.error("[promptPasswordReset] updateUserPassword failed:", err);
        bail("db-error", "\r\n\x1b[31mFailed to update password. Please try again later.\x1b[0m\r\n");
        return;
      }

      emitText(emitter as any, "\r\n\x1b[32mPassword updated successfully!\x1b[0m\r\n");
      emitText(emitter as any, "\r\nPlease login with your new password.\r\n\r\n");
      session.loginRetryCount = 0;
      teardown();
      resolve({ ok: true });
    };

    session.loginInputHandler = (chunk: string) => {
      const cleanData =
        typeof chunk === "string" ? chunk.replace(/\0/g, "") : chunk;
      if (cleanData === "\n" && lastCharWasCR) {
        lastCharWasCR = false;
        return;
      }
      // Mask the new-password phase; echo plaintext for Y/n and code.
      const mask = phase === "await_new_password";
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
          processLine(line).catch((err) => {
            console.error("[promptPasswordReset] processLine failed:", err);
          });
          return;
        }
        if (ch >= " " && ch <= "~") {
          buf += ch;
          emitText(emitter as any, mask ? "*" : ch);
          lastCharWasCR = false;
        }
      }
    };
  });
}
