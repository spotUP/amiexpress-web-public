/**
 * login-prompt.service.ts
 *
 * Per-transport prompt adapters for the three multi-step pre-login UI
 * flows that don't fit a single-shot socket event:
 *
 *   - Forced password change (`prompt-forced-pwd-change` on web).
 *   - Email-based password reset (`prompt-password-reset` on web).
 *   - GDPR consent backfill (`promptGdprBackfill` on web).
 *
 * On web, each `prompt*` function emits the socket events the frontend
 * expects and resolves when the corresponding `*-input` socket handler
 * (already in `auth-socket-handlers.ts`) reports completion.
 *
 * On telnet/SSH, each function installs a temporary
 * `session.loginInputHandler` and drives a line-buffered prompt loop,
 * resolving when the flow completes (success/cancel/timeout).
 *
 * Stage 1 (this commit): type signatures only — implementations land in
 * commit 4 alongside the BBSSession field additions
 * (`loginInputHandler` + `loginPromptResolver`).
 */

import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";

export interface ForcedPwdChangeResult {
  ok: boolean;
  /** New password (plaintext, never logged). Caller hashes + stores. */
  newPassword?: string;
  /** Why we ended up here when ok=false. */
  reason?: "denied" | "exceeded-retries" | "transport-closed";
}

export interface PasswordResetResult {
  ok: boolean;
  /** Database user id whose password was reset (if ok). */
  verifiedUserId?: string;
  reason?: "declined" | "wrong-code" | "no-email" | "mail-failed" | "transport-closed";
}

/**
 * Drive the forced-password-change flow to completion.
 * Web: emits `prompt-forced-pwd-change` + `mask-input` + the prompt
 * text via `ansi-output`, then resolves when the existing
 * `forced-pwd-change-input` socket handler reports done.
 * Telnet/SSH: installs `session.loginInputHandler` and drives a
 * line-buffered prompt loop using `emitText`/`emitPrompt`.
 */
export async function promptForcedPwdChange(
  _emitter: LoginEmitter,
  _session: BBSSession,
  _user: any,
  _opts: { reason: "expired" | "forced" },
): Promise<ForcedPwdChangeResult> {
  throw new Error(
    "promptForcedPwdChange not implemented yet (commit 4 wires both web and telnet/SSH branches).",
  );
}

/**
 * Drive the email-based password-reset flow to completion.
 * Web: emits `prompt-password-reset` and resolves on `password-reset-input`
 * completion.
 * Telnet/SSH: line-buffered prompt loop.
 */
export async function promptPasswordReset(
  _emitter: LoginEmitter,
  _session: BBSSession,
  _ctx: { username: string },
): Promise<PasswordResetResult> {
  throw new Error(
    "promptPasswordReset not implemented yet (commit 4 wires both web and telnet/SSH branches).",
  );
}
