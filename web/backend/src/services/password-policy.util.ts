/**
 * password-policy.util.ts
 *
 * Shared password-validation rules so web (socket.io) and telnet/SSH
 * (line-buffered) forced-password-change / email-reset flows can both
 * enforce identical policy without copy-pasted logic.
 *
 * Extracted from the inline rules previously living in
 * `auth-socket-handlers.ts:1316-1382`. The actual `checkPasswordStrength`
 * primitive (`utils/password-strength.util.ts`) is reused as-is; this
 * module is the thin policy-application layer that returns an `Outcome`
 * the caller can render to the user.
 */

import { db } from "../database";
import { checkPasswordStrength } from "../utils/password-strength.util";

export type ValidateOutcome =
  | { ok: true }
  | { ok: false; reason: "empty"; message: string }
  | { ok: false; reason: "same-as-old"; message: string }
  | { ok: false; reason: "too-short"; message: string }
  | { ok: false; reason: "too-weak"; message: string };

export interface PasswordPolicy {
  minLength: number;
  minStrength: number;
  /** Optional bcrypt hash of the user's current password — when set, the
   *  new password is rejected if it matches the existing one.
   *  express.e:29812 checkUserPassword equivalent. */
  currentHash?: string;
}

/**
 * Validate a candidate new password against policy.
 * Use this for forced-password-change AND email-reset flows.
 *
 * Returns a `ValidateOutcome` the caller maps to its transport-specific
 * I/O (socket.emit on web, line-buffered echo on telnet/SSH).
 */
export async function validateNewPassword(
  candidate: string,
  policy: PasswordPolicy,
): Promise<ValidateOutcome> {
  if (candidate.length === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "Password cannot be empty.",
    };
  }

  if (policy.currentHash) {
    const sameAsOld = await db.verifyPassword(candidate, policy.currentHash);
    if (sameAsOld) {
      return {
        ok: false,
        reason: "same-as-old",
        message:
          "\r\nYour new password must be different from your old password...\r\n\r\n",
      };
    }
  }

  const strengthResult = checkPasswordStrength(
    candidate,
    policy.minLength,
    policy.minStrength,
  );
  if (strengthResult === true) {
    return { ok: true };
  }

  if (strengthResult === 1) {
    return {
      ok: false,
      reason: "too-short",
      message: `\r\nPassword length must be at least ${policy.minLength} chars, try again..\r\n\r\n`,
    };
  }

  return {
    ok: false,
    reason: "too-weak",
    message: `\r\nPassword must have at least ${policy.minStrength} of these:\r\n  upper case,lower case, numeric and symbols, try again..\r\n\r\n`,
  };
}

/**
 * Read the system_config `max_password_fails` value. -1 means "no cap";
 * any positive integer is the per-session ceiling of failed password
 * attempts before the connection is dropped via runPwfailAndLogoff.
 *
 * Extracted from the duplicate inline implementations in
 * auth-socket-handlers.ts:77 and command.handler.ts (telnet/SSH path)
 * so both transports honour the same cap.
 */
export function getMaxPasswordFails(): number {
  try {
    if (db && typeof db.getConfigRepository === "function") {
      const repo = db.getConfigRepository();
      if (repo && typeof repo.getSystemConfig === "function") {
        const sys = repo.getSystemConfig();
        if (typeof sys?.max_password_fails === "number") {
          return sys.max_password_fails;
        }
      }
    }
  } catch (error) {
    console.warn(
      "[AUTH] Unable to load max_password_fails from config:",
      error,
    );
  }
  return -1;
}

/**
 * Load the current system password policy from the DB. The values come
 * from system_config (kept in sync with bbsConfig.info on save). Either
 * caller (forced-change or email-reset) reads via this helper to avoid
 * duplicating the try/catch boilerplate.
 */
export function loadPasswordPolicy(currentHash?: string): PasswordPolicy {
  let minLength = 0;
  let minStrength = 0;
  try {
    const sysConf = db.getConfigRepository().getSystemConfig();
    if (sysConf) {
      minLength = sysConf.min_password_length ?? 0;
      minStrength = sysConf.min_password_strength ?? 0;
    }
  } catch {
    /* non-fatal — config read failure leaves both at 0 (no minimum) */
  }
  return { minLength, minStrength, currentHash };
}
