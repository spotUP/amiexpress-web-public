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
import { initSysopPasswordReset, sysopResetPending } from '../../src/utils/first-user-sysop.util';
import { handleCommand } from '../../src/handlers/command.handler';
import { flushOutput } from '../../src/utils/output.util';

/** Everything a line was sent, with the board's 16ms output buffer drained. */
const wireOf = (line: any): string => { flushOutput(line); return line.said.join(''); };
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

      session.loginInputHandler('y');          // one key: yesNo, not a line
      await settle();
      expect(mailOnPwdFail).toHaveBeenCalledTimes(1);
      const [email, code] = mailOnPwdFail.mock.calls[0];
      expect(email).toBe('spot@example.test');
      // express.e:29159-29163: ten of A-Z a-z 0-9.
      expect(code).toMatch(/^[A-Za-z0-9]{10}$/);
      expect(session.passwordResetState).toBe('await_code');

      session.loginInputHandler(`${code}\r`);
      await settle();
      expect(session.passwordResetState).toBe('await_new_password');

      session.loginInputHandler('n3wpass\r');
      await expect(flow).resolves.toEqual({ ok: true });
      expect(updateUserPassword).toHaveBeenCalledWith('u-7', 'n3wpass', 0);

      // express.e:29152-29181, byte for byte (the code and password are
      // echoed as typed - the password masked, a WEB_ choice).
      expect(wireOf(line)).toBe(
        '\r\nExcessive Password Failure\r\n'
        + '\r\nDo you want to send a reset code to your email address '
        + '\x1b[32m(\x1b[33mY\x1b[32m/\x1b[33mn\x1b[32m)\x1b[32m?\x1b[0m '
        + 'Yes\r\n'
        + '\r\nA reset code has been sent to yuour email address. Please enter it exactly below\r\n\r\n'
        + 'Reset code: ' + code + '\r\n'
        + '\r\nThe reset code was correct, please now update your password.\r\n\r\n'
        + 'Password: *******\r\n',
      );
    });

    it('a wrong code says so and is PWFAIL (express.e:29176-29178, 29191-29193)', async () => {
      const line = aTelnetLine();
      const session: any = { connectionType: 'telnet', passwordResetUsername: 'spot' };
      const flow = promptPasswordReset(line, session);
      session.loginInputHandler('\r');         // Enter is yes
      await settle();
      const code: string = mailOnPwdFail.mock.calls[0][1];

      // StrCmp is exact: the same code in the other case is wrong.
      const swapped = [...code].map((c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase())).join('');
      session.loginInputHandler(`${swapped === code ? `${code}x` : swapped}\r`);
      await expect(flow).resolves.toEqual({ ok: false, reason: 'wrong-code' });

      expect(wireOf(line)).toContain('\r\nThe reset code was not correct.\r\n');
      expect(runPwfailAndLogoff).toHaveBeenCalledWith(line, session, '');
      expect(updateUserPassword).not.toHaveBeenCalled();
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
      await flow;
      expect(wireOf(emitter)).toContain('No\r\n');
      expect(runPwfailAndLogoff).toHaveBeenCalledTimes(1);
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

      session.loginInputHandler('n');            // decline, so the branch finishes
      await typed;
    });

    it('with no email on file, the same caller goes straight to PWFAIL', async () => {
      // The control: the budget IS spent on this one keystroke.
      account = { ...account, email: null };
      const session = atThePasswordPrompt();

      await handleCommand(aTelnetLine(), session, '\r');

      expect(session.passwordResetState).toBeUndefined();
      expect(runPwfailAndLogoff).toHaveBeenCalledTimes(1);
      // express.e:29152-29153 then logoffErr (29262-29263), which prints
      // nothing: plain "Excessive Password Failure", no goodbye line.
      const line = (runPwfailAndLogoff.mock.calls[0] as any[])[0];
      expect(wireOf(line)).toMatch(/\r\nExcessive Password Failure\r\n$/);
      expect((runPwfailAndLogoff.mock.calls[0] as any[])[2]).toBe('');
    });
  });

  describe('sysop password reset from the server log (SYSOP_PASSWORD_RESET)', () => {
    /** Start the board with the setting and read the code off its log. */
    const startWithTheResetSetting = (): string => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      initSysopPasswordReset({ SYSOP_PASSWORD_RESET: '1' } as NodeJS.ProcessEnv);
      const printed = warn.mock.calls.map((c) => String(c[0])).join('\n');
      warn.mockRestore();
      const code = /Sysop password reset code: ([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(printed)?.[1];
      if (!code) throw new Error(`no reset code in the log: ${printed}`);
      return code;
    };

    const outOfAttempts = (): any => ({
      state: BBSState.LOGON,
      connectionType: 'telnet',
      nodeId: 1,
      loginRetryCount: 2,
      tempData: { loginPhase: 'password', loginUsername: 'spot', inputBuffer: 'wrong' },
    });

    afterEach(() => initSysopPasswordReset({} as NodeJS.ProcessEnv));

    it('a sysop with no mail, out of password attempts, sets a new password with the logged code', async () => {
      account = { ...account, email: null, secLevel: 255, slotNumber: 1 };
      const code = startWithTheResetSetting();
      const line = aTelnetLine();
      const session = outOfAttempts();

      void handleCommand(line, session, '\r');
      await settle();
      expect(session.passwordResetState).toBe('await_code');

      session.loginInputHandler(`${code.toLowerCase()}\r`);   // case does not matter
      await settle();
      expect(session.passwordResetState).toBe('await_new_password');
      session.loginInputHandler('n3wpass\r');
      await settle();

      expect(updateUserPassword).toHaveBeenCalledWith('u-7', 'n3wpass', 1);
      expect(runPwfailAndLogoff).not.toHaveBeenCalled();
      expect(wireOf(line)).toContain('Sysop password reset. Enter the reset code from the server log.');
      // The code works once.
      expect(sysopResetPending()).toBe(false);
    });

    it('a wrong code is PWFAIL and changes nothing', async () => {
      account = { ...account, email: null, secLevel: 255 };
      startWithTheResetSetting();
      const session = outOfAttempts();

      void handleCommand(aTelnetLine(), session, '\r');
      await settle();
      session.loginInputHandler('AAAA-AAAA\r');
      await settle();

      expect(runPwfailAndLogoff).toHaveBeenCalledTimes(1);
      expect(updateUserPassword).not.toHaveBeenCalled();
    });

    it('an ordinary account is never offered the sysop reset', async () => {
      account = { ...account, email: null, secLevel: 10 };
      startWithTheResetSetting();
      const session = outOfAttempts();

      await handleCommand(aTelnetLine(), session, '\r');

      expect(session.passwordResetState).toBeUndefined();
      expect(runPwfailAndLogoff).toHaveBeenCalledTimes(1);
      expect(sysopResetPending()).toBe(true);
    });

    it('without the setting, a sysop with no mail goes straight to PWFAIL', async () => {
      account = { ...account, email: null, secLevel: 255 };
      const session = outOfAttempts();

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
