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
 * Driven at runtime, on a TELNET session wherever the transport matters: the
 * real `handleCommand` login branch, the real reset state machine, the real
 * `runPostAuthLogin` pipeline. Mail, the database, the logoff and the
 * callers log are stood in for; the GDPR prompt and PWFAIL are recorded.
 */
process.env.SKIP_DB_INIT = '1';

/** index.ts wires its services against the database at import; the stub browser-door-gate uses. */
jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});

const mailOnPwdFail = jest.fn(async (_email: string, _code: string) => true);
let mailEnabled = true;
jest.mock('../../src/services/mail-notification.service', () => ({
  ...jest.requireActual('../../src/services/mail-notification.service'),
  isMailEventEnabled: async () => mailEnabled,
  isSmtpConfigured: async () => true,
  mailOnPwdFail: (email: string, code: string) => mailOnPwdFail(email, code),
}));

/** The account the caller is trying to reach. */
let account: any = { id: 'u-7', username: 'spot', email: 'spot@example.test', slotNumber: 0 };
const updateUserPassword = jest.fn(async (..._a: any[]) => undefined);
/** Built inside the factory: jest runs it before this file's own consts exist. */
jest.mock('../../src/database', () => {
  const fake = {
    getUserByUsername: async () => account,
    updateUserPassword: (...a: any[]) => updateUserPassword(...a),
    updateUser: async () => undefined,
    generateAccessToken: async () => 'token',
    generateRefreshToken: async () => 'refresh',
  };
  return { ...jest.requireActual('../../src/database'), db: fake, getDatabase: () => fake };
});

jest.mock('../../src/services/password-policy.util', () => ({
  ...jest.requireActual('../../src/services/password-policy.util'),
  getMaxPasswordFails: () => 1,
}));
jest.mock('../../src/services/CallersLogManager');

const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff: (...a: any[]) => beginLogoff(...a),
}));

const runPwfailAndLogoff = jest.fn(async () => undefined);
jest.mock('../../src/services/login-post.service', () => ({
  ...jest.requireActual('../../src/services/login-post.service'),
  runPwfailAndLogoff: (...a: any[]) => (runPwfailAndLogoff as any)(...a),
}));

const promptGdprBackfill = jest.fn(async () => undefined);
const handleGdprBackfillInput = jest.fn(async () => undefined);
jest.mock('../../src/handlers/user/gdpr.handler', () => ({
  ...jest.requireActual('../../src/handlers/user/gdpr.handler'),
  promptGdprBackfill: (...a: any[]) => (promptGdprBackfill as any)(...a),
  handleGdprBackfillInput: (...a: any[]) => (handleGdprBackfillInput as any)(...a),
}));

/* The rest of the login pipeline, stood in for as a-login-does-not-run-the-logoff-batch does. */
jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch: () => true,
}));
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode: () => null,
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn: jest.fn(async () => undefined),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { setDatabase } from '../../src/handlers/command-handler/dependency-injection';
import { isPasswordResetAvailable, promptPasswordReset } from '../../src/services/login-prompt.service';
import { handleCommand } from '../../src/handlers/command.handler';
import { runPostAuthLogin } from '../../src/services/login-post.service';
import { db as fakeDb } from '../../src/database';
import { container } from '../../src/container';
import { AuthenticationUseCase } from '../../src/services/use-cases/authentication.use-case';

/** Every password the login branch checks is wrong. */
container.registerInstance(AuthenticationUseCase, { authenticate: async () => ({ success: false }) } as any);

let n = 0;
function aTelnetLine(): any {
  const said: string[] = [];
  return {
    said,
    id: `parity-${++n}`,
    emit: (_event: string, payload: unknown) => { said.push(String(payload)); return true; },
    on: () => undefined,
    once: () => undefined,
    join() { return this; },
    removeListener: () => undefined,
  };
}

const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

beforeEach(() => {
  jest.clearAllMocks();
  mailEnabled = true;
  account = { id: 'u-7', username: 'spot', email: 'spot@example.test', slotNumber: 0 };
  setDatabase(fakeDb);
});

describe('telnet/SSH parity — multi-step pre-login flows', () => {
  describe('email-based password reset', () => {
    it('is offered only when mail is on and the caller has an email', async () => {
      expect(await isPasswordResetAvailable('spot@example.test')).toBe(true);
      expect(await isPasswordResetAvailable(null)).toBe(false);
      mailEnabled = false;
      expect(await isPasswordResetAvailable('spot@example.test')).toBe(false);
    });

    it('drives await_confirm -> await_code -> await_new_password, mailing a random code (express.e:29168)', async () => {
      const line = aTelnetLine();
      const session: any = { connectionType: 'telnet', passwordResetUsername: 'spot' };

      const flow = promptPasswordReset(line, session);
      expect(session.passwordResetState).toBe('await_confirm');

      session.loginInputHandler('y\r');
      await settle();
      expect(mailOnPwdFail).toHaveBeenCalledTimes(1);
      const [email, code] = mailOnPwdFail.mock.calls[0];
      expect(email).toBe('spot@example.test');
      expect(code).toMatch(/^[0-9A-F]{10}$/);
      expect(session.passwordResetState).toBe('await_code');

      session.loginInputHandler(`${code}\r`);
      await settle();
      expect(session.passwordResetState).toBe('await_new_password');

      session.loginInputHandler('n3wpass\r');
      await expect(flow).resolves.toEqual({ ok: true });
      expect(updateUserPassword).toHaveBeenCalledWith('u-7', 'n3wpass');
    });

    it('mails a different code each time', async () => {
      const codes: string[] = [];
      for (let i = 0; i < 2; i++) {
        const session: any = { connectionType: 'telnet', passwordResetUsername: 'spot' };
        const flow = promptPasswordReset(aTelnetLine(), session);
        session.loginInputHandler('\r');       // blank Enter is Y (express.e:29160-29167)
        await settle();
        codes.push(mailOnPwdFail.mock.calls[i][1]);
        session.loginInputHandler('wrong\r');  // end the flow
        await flow;
      }
      expect(codes[0]).not.toBe(codes[1]);
    });

    it('drives WEB too - TP-9b deleted the browser\'s own reset handler', async () => {
      // This asserted the opposite, by reading the function's source for
      // `session.connectionType === 'web'`. That early return existed while
      // auth-socket-handlers.ts had a `password-reset-input` handler of its
      // own - the browser's login editor under another name - and TP-9b
      // deleted it. One loop drives web, telnet and SSH now, so a pin on the
      // old spelling was pinning a bug: a web caller who hit the excessive
      // failure would have been answered by nothing at all.
      const emitter = aTelnetLine();
      const session: any = { connectionType: 'web', passwordResetUsername: 'spot' };

      const flow = promptPasswordReset(emitter, session);
      await Promise.resolve();

      expect(emitter.said.join('')).toContain('Excessive Password Failure');
      expect(emitter.said.join('')).toContain('send a reset code');
      expect(session.passwordResetState).toBe('await_confirm');
      expect(typeof session.loginInputHandler).toBe('function');

      // Decline, so the flow finishes rather than being left open.
      session.loginInputHandler('n');
      session.loginInputHandler('\r');
      await flow;
    });

    /**
     * A telnet caller at the Password: prompt, one wrong answer from the limit:
     * two tries spent of express.e's three per call (express.e:29156).
     */
    const atThePasswordPrompt = (): any => ({
      state: BBSState.LOGON,
      connectionType: 'telnet',
      nodeId: 1,
      loginRetryCount: 2,
      tempData: { loginPhase: 'password', loginUsername: 'spot', inputBuffer: 'wrong' },
    });

    it('a telnet caller out of password attempts is offered the reset before PWFAIL', async () => {
      const line = aTelnetLine();
      const session = atThePasswordPrompt();

      const typed = handleCommand(line, session, '\r');
      await settle();

      expect(session.passwordResetState).toBe('await_confirm');
      expect(runPwfailAndLogoff).not.toHaveBeenCalled();

      session.loginInputHandler('n\r');          // decline, so the branch finishes
      await typed;
    });

    it('with no email on file, the same caller goes straight to PWFAIL', async () => {
      // The control: the budget IS spent on this one keystroke.
      account = { ...account, email: null };
      const session = atThePasswordPrompt();

      await handleCommand(aTelnetLine(), session, '\r');

      expect(session.passwordResetState).toBeUndefined();
      expect(runPwfailAndLogoff).toHaveBeenCalledTimes(1);
    });
  });

  describe('GDPR consent backfill', () => {
    const aTelnetLogin = (): any => ({
      state: BBSState.LOGON,
      subState: LoggedOnSubState.READ_COMMAND,
      connectionType: 'telnet',
      nodeId: 4,
      tempData: {},
    });
    const LEGACY = { id: 'u-1', username: 'spot', slotNumber: 7, calls: 0, callsToday: 0, ansi: true };

    it('a telnet caller with no recorded consent is asked for it', async () => {
      await runPostAuthLogin(aTelnetLine(), aTelnetLogin(), { ...LEGACY }, { lastLoginBeforeUpdate: new Date(0) });

      expect(promptGdprBackfill).toHaveBeenCalledTimes(1);
    });

    it('a caller who already consented is not asked again', async () => {
      await runPostAuthLogin(aTelnetLine(), aTelnetLogin(), { ...LEGACY, gdprConsentAt: new Date() }, { lastLoginBeforeUpdate: new Date(0) });

      expect(promptGdprBackfill).not.toHaveBeenCalled();
    });

    it('the answer a telnet caller types at the prompt reaches the backfill handler', async () => {
      const session: any = {
        state: BBSState.LOGGEDON,
        subState: LoggedOnSubState.GDPR_BACKFILL,
        connectionType: 'telnet',
        nodeId: 1,
        inputBuffer: '',
        user: { id: 1, username: 'spot' },
        tempData: {},
      };

      await handleCommand(aTelnetLine(), session, 'y');
      await handleCommand(aTelnetLine(), session, '\r');

      expect(handleGdprBackfillInput).toHaveBeenCalledTimes(1);
      expect((handleGdprBackfillInput.mock.calls[0] as any[])[2]).toBe('y');
    });
  });
});
