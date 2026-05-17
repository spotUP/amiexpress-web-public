/**
 * login-post.service.ts
 *
 * Single source of truth for the post-authentication pipeline.
 * Web, telnet, and SSH all call `runPostAuthLogin` after their
 * respective auth-collection layer has produced a verified user.
 *
 * Stage 1 (this commit): type signatures + `runPwfailAndLogoff` only.
 * The body of `runPostAuthLogin` is wired in commit 2; until then web
 * keeps its inline post-auth in `auth-socket-handlers.ts` and telnet/
 * SSH keep theirs in `command.handler.ts`. Pre-existing TODO(unify)
 * markers in both files cross-reference this service.
 */

import type { BBSSession } from "../index";
import type { LoginEmitter } from "../types/login-emitter";
import { callersLogManager } from "./CallersLogManager";
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
        | "pwd-change-failed"
        | "pwd-change-pending"
        | "quick-logon-handled"
        | "chat-only-handled";
    };

/**
 * Stage 1 placeholder. Web (`auth-socket-handlers.ts`) and telnet/SSH
 * (`command.handler.ts`) still inline their own copies of this body.
 * Commit 2 will fill this in by moving auth-socket-handlers:588-1052
 * here, commit 3 will route command.handler:1723-1893 through the same
 * function, deleting both inline blocks.
 */
export async function runPostAuthLogin(
  _emitter: LoginEmitter,
  _session: BBSSession,
  _user: any,
  _ctx: PostAuthContext,
): Promise<PostAuthResult> {
  throw new Error(
    "runPostAuthLogin is not yet implemented (commit 2 wires the web path; commit 3 wires telnet/SSH). Call sites should be migrated as part of those commits.",
  );
}

/**
 * express.e:29193-29195 / 29263-29264 — when a password-failure flow
 * terminates (excessive failure, declined reset, wrong code, mail-send
 * failure, missing email), express.e runs the PWFAIL syscmd then jumps
 * to logoffErr which writes "\t* Password Failure *" to CallersLog.
 *
 * Same helper used by every rejection branch on every transport.
 * Currently mirrored at `auth-socket-handlers.ts:1203-1212` — that copy
 * will be removed in commit 2 in favour of this one.
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
