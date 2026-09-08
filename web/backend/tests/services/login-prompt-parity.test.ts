/**
 * Regression tests for telnet/SSH parity with web on the
 * pre-login multi-step UX flows (email-based password reset, GDPR
 * consent backfill).
 *
 * Before today's parity-close commit, both flows were silently web-
 * only. On telnet/SSH:
 *   - Excessive password failure went straight to PWFAIL + disconnect
 *     even if MAIL_ON_PWD_FAIL was enabled and the user had an email.
 *   - GDPR-pre-existing users never saw the backfill consent prompt
 *     (gated by `if (isWeb && !gdprConsentAt)` in runPostAuthLogin).
 *
 * These tests are structural assertions on the source — same approach
 * as login-connect.service.test.ts. Behavioural tests for the input
 * state machines themselves would need a heavy telnet/SSH connection
 * harness; we cover the wiring instead, which is where drift happens.
 */

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve(__dirname, "../../src");

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), "utf8");
}

describe("telnet/SSH parity — multi-step pre-login flows", () => {
  describe("email-based password reset", () => {
    const adapterSrc = read("services/login-prompt.service.ts");

    it("exports promptPasswordReset adapter + isPasswordResetAvailable predicate", () => {
      expect(adapterSrc).toMatch(/export\s+(async\s+)?function\s+promptPasswordReset/);
      expect(adapterSrc).toMatch(/export\s+(async\s+)?function\s+isPasswordResetAvailable/);
    });

    it("drives the await_confirm → await_code → await_new_password state machine", () => {
      const body = adapterSrc.match(/function\s+promptPasswordReset[\s\S]*?\n\}/)?.[0];
      expect(body).toBeDefined();
      expect(body).toMatch(/await_confirm/);
      expect(body).toMatch(/await_code/);
      expect(body).toMatch(/await_new_password/);
      // Hands off to mailOnPwdFail for the actual email send and uses
      // crypto.randomBytes for the reset code — matches express.e:29168.
      expect(body).toMatch(/mailOnPwdFail/);
      expect(body).toMatch(/crypto\.randomBytes/);
    });

    it("drives WEB too - TP-9b deleted the browser's own reset handler", async () => {
      // This asserted the opposite, by reading the function's source for
      // `session.connectionType === 'web'`. That early return existed while
      // auth-socket-handlers.ts had a `password-reset-input` handler of its
      // own - the browser's login editor under another name - and TP-9b
      // deleted it. One loop drives web, telnet and SSH now, so a pin on the
      // old spelling was pinning a bug: a web caller who hit the excessive
      // failure would have been answered by nothing at all.
      const { promptPasswordReset } = require("../../src/services/login-prompt.service");
      const said: string[] = [];
      // The ansi buffer attaches a disconnect listener to whatever it is
      // given, so the fake needs `on` as well as `emit`.
      const emitter: any = {
        id: 'web-caller',
        emit: (_event: string, payload: unknown) => said.push(String(payload)),
        on: () => undefined,
        once: () => undefined,
        removeListener: () => undefined,
      };
      const session: any = { connectionType: "web", passwordResetUsername: "spot" };

      const flow = promptPasswordReset(emitter, session);
      await Promise.resolve();

      expect(said.join("")).toContain("Excessive Password Failure");
      expect(said.join("")).toContain("send a reset code");
      expect(session.passwordResetState).toBe("await_confirm");
      expect(typeof session.loginInputHandler).toBe("function");

      // Decline, so the flow finishes rather than being left open.
      session.loginInputHandler("n");
      session.loginInputHandler("\r");
      await flow;
    });

    it("telnet/SSH failure path calls promptPasswordReset before PWFAIL", () => {
      const cmd = read("handlers/command.handler.ts");
      // Find the excessive-failure block by anchoring on the loop-budget
      // check, then assert that promptPasswordReset is invoked *before*
      // runPwfailAndLogoff in the same branch.
      const block = cmd.match(/if\s*\(\s*maxFails[\s\S]*?runPwfailAndLogoff[\s\S]*?\}/)?.[0];
      expect(block).toBeDefined();
      const promptIdx = block!.indexOf("promptPasswordReset");
      const pwfailIdx = block!.indexOf("runPwfailAndLogoff");
      expect(promptIdx).toBeGreaterThanOrEqual(0);
      expect(pwfailIdx).toBeGreaterThanOrEqual(0);
      expect(promptIdx).toBeLessThan(pwfailIdx);
    });
  });

  describe("GDPR consent backfill", () => {
    const postAuthSrc = read("services/login-post.service.ts");

    it("GDPR gate is no longer guarded by `isWeb &&`", () => {
      // Locate the if-line that mentions gdprConsentAt. The condition
      // text spans nested parens — match the whole physical line.
      const lineMatch = postAuthSrc
        .split("\n")
        .find((l) => /if\s*\(.*gdprConsentAt/.test(l));
      expect(lineMatch).toBeDefined();
      expect(lineMatch).not.toMatch(/\bisWeb\b/);
    });

    it("still calls promptGdprBackfill from the gate", () => {
      // Source-order check: promptGdprBackfill must appear after the
      // gdprConsentAt gate keyword.
      const gateIdx = postAuthSrc.indexOf("gdprConsentAt");
      const callIdx = postAuthSrc.indexOf("promptGdprBackfill", gateIdx);
      expect(gateIdx).toBeGreaterThan(0);
      expect(callIdx).toBeGreaterThan(gateIdx);
    });

    it("input dispatch for GDPR_BACKFILL state is wired in command.handler.ts (telnet/SSH path)", () => {
      const cmd = read("handlers/command.handler.ts");
      expect(cmd).toMatch(
        /session\.subState\s*===\s*LoggedOnSubState\.GDPR_BACKFILL[\s\S]*?handleGdprBackfillInput/,
      );
    });
  });
});
