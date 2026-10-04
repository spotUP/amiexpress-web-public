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
import { YES_NO_PROMPT } from "../utils/await-input";
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
/**
   * EVERY TRANSPORT, since TP-9b. This used to return immediately for
   * `connectionType === 'web'` and leave the flow to a socket handler in
   * auth-socket-handlers.ts, which was the browser's login editor under
   * another name. That handler is gone; this loop drives web, telnet and SSH
   * alike, and the caller's keystrokes reach it as ordinary `command` input
   * through `session.loginInputHandler`.
   */
export async function promptForcedPwdChange(
  emitter: LoginEmitter,
  session: BBSSession,
  user: any,
): Promise<ForcedPwdChangeResult> {
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
      /**
       * The browser's cue that the forced change is done and the BBS session
       * is continuing (its listener leaves the login view). Its only emit site
       * used to be the web-only `forced-pwd-change-input` socket handler; that
       * handler is retired and this loop drives every transport now (TP-9b),
       * so the event is emitted from the one place the change actually
       * completes. A byte transport ignores it, as it ignores every other
       * frontend event.
       */
      emitter.emit("forced-pwd-change-complete");
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
 * The email password reset after Excessive Password Failure - express.e
 * checkPassword, 29152-29190:
 *
 *   await_confirm  ->  "Do you want to send a reset code to your email
 *                       address " + yesNo(1), one key, Enter is yes
 *   await_code     ->  "Reset code: " (ten A-Z a-z 0-9, emailed, exact match)
 *   await_new_pwd  ->  "Password: " (empty keeps the old one)
 *
 * No, or a wrong code, is PWFAIL and logoffErr (29191-29193, 29263). On
 * success the new password is written to the DB and the caller re-prompts
 * for name and password - express.e instead carries straight on into the
 * logon (stat:=RESULT_SUCCESS, 29196-29198).
 *
 * Preconditions:
 *   session.passwordResetUsername = the username that failed login
 *   session.user must be undefined (we're pre-login)
 */
/**
   * EVERY TRANSPORT, since TP-9b. This used to return immediately for
   * `connectionType === 'web'` and leave the flow to a socket handler in
   * auth-socket-handlers.ts, which was the browser's login editor under
   * another name. That handler is gone; this loop drives web, telnet and SSH
   * alike, and the caller's keystrokes reach it as ordinary `command` input
   * through `session.loginInputHandler`.
   */
export async function promptPasswordReset(
  emitter: LoginEmitter,
  session: BBSSession,
): Promise<PasswordResetResult> {
  const username = session.passwordResetUsername || "";
  if (!username) return { ok: false, reason: "no-email" };

  // express.e:29152-29155, plain text.
  emitText(emitter as any, "\r\nExcessive Password Failure\r\n");
  emitPrompt(
    emitter as any,
    `\r\nDo you want to send a reset code to your email address ${YES_NO_PROMPT[1]}`,
  );
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

    /**
     * No reset code: express.e:29191-29193 `runSysCommand('PWFAIL','')`,
     * `JUMP logoffErr` - which writes `\t* Password Failure *` (29263) and
     * prints nothing. The board's one implementation of that is
     * runPwfailAndLogoff.
     */
    const pwfail = async (reason: PasswordResetResult["reason"]) => {
      teardown();
      const { runPwfailAndLogoff } = await import("./login-post.service");
      await runPwfailAndLogoff(emitter, session, "");
      resolve({ ok: false, reason });
    };

    /** WEB_: a failure express.e never checks for; the caller is told and dropped. */
    const bail = (reason: PasswordResetResult["reason"], message: string) => {
      teardown();
      beginLogoff(emitter as any, session, {
        message,
        finalState: BBSState.AWAIT,
        readDelayMs: 1500,
      });
      resolve({ ok: false, reason });
    };

    /** yesNo(1) - express.e:29156: Enter is yes; only Y, N and Enter end it. */
    const answerYesNo = async (key: string) => {
      const ch = key === "\r" ? "y" : key;
      if (ch === "n" || ch === "N") {
        emitText(emitter as any, "No\r\n");
        await pwfail("user-declined");
        return;
      }
      if (ch !== "y" && ch !== "Y") return;
      emitText(emitter as any, "Yes\r\n");
      phase = "await_code";
      session.passwordResetState = "await_code";

      const user = await db.getUserByUsername(username);
      if (!user?.email) {
        // WEB_: isPasswordResetAvailable already required an email
        // (express.e:29154); this is the account changing under us.
        bail("no-email", "\r\nNo email address on file.\r\n");
        return;
      }

      const resetCode = makeResetCode();
      session.passwordResetCode = resetCode;
      const emailSent = await mailOnPwdFail(user.email, resetCode);
      if (!emailSent) {
        // WEB_: express.e:29170 sendMail's result is not looked at - the
        // caller would wait for a code that never comes.
        bail("smtp-failed", "\r\nFailed to send reset code. Please contact the sysop.\r\n");
        return;
      }

      // express.e:29172-29173 - "yuour" is express.e's own spelling.
      emitText(
        emitter as any,
        "\r\nA reset code has been sent to yuour email address. Please enter it exactly below\r\n\r\n",
      );
      emitPrompt(emitter as any, "Reset code: ");
    };

    const processLine = async (line: string) => {
      if (phase === "await_code") {
        // express.e:29176 StrCmp - exact, case and all.
        if (line !== (session.passwordResetCode || "")) {
          emitText(emitter as any, "\r\nThe reset code was not correct.\r\n");
          await pwfail("wrong-code");
          return;
        }
        emitText(
          emitter as any,
          "\r\nThe reset code was correct, please now update your password.\r\n\r\n",
        );
        emitPrompt(emitter as any, "Password: ");
        phase = "await_new_password";
        session.passwordResetState = "await_new_password";
        return;
      }

      // express.e:29182-29187: an empty answer keeps the old password; there
      // is no length rule.
      const newPassword = line; // do not trim — passwords may have leading/trailing spaces
      if (newPassword.length > 0) {
        const user = await db.getUserByUsername(username);
        if (!user) {
          bail("db-error", "\r\nUser not found.\r\n"); // WEB_: no express.e counterpart
          return;
        }
        try {
          await db.updateUserPassword(user.id, newPassword);
        } catch (err) {
          console.error("[promptPasswordReset] updateUserPassword failed:", err);
          // WEB_: no express.e counterpart - its setNewPassword cannot fail.
          bail("db-error", "\r\nFailed to update password. Please try again later.\r\n");
          return;
        }
      }

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
      if (phase === "await_confirm") {
        // One key, not a line (express.e yesNo reads readChar).
        for (const ch of cleanData) {
          if (ch === "\r" || ch === "y" || ch === "Y" || ch === "n" || ch === "N") {
            lastCharWasCR = ch === "\r";
            answerYesNo(ch).catch((err) => {
              console.error("[promptPasswordReset] yesNo failed:", err);
            });
            return;
          }
        }
        return;
      }
      // WEB_: express.e:29182 reads the new password with lineInput, which
      // echoes it; masked here so it never shows on the caller's screen.
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
          // lineInput's own line break after Enter (express.e:2378).
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

/**
 * express.e:29159-29163: ten characters, each drawn from
 * A-Z a-z 0-9. crypto rather than E's Rnd, so a code cannot be predicted.
 */
const RESET_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
function makeResetCode(): string {
  let code = "";
  for (let i = 0; i < 10; i++) code += RESET_CODE_CHARS[crypto.randomInt(RESET_CODE_CHARS.length)];
  return code;
}
