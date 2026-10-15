/**
 * TP-9a of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`: ONE login
 * state machine, and the server owns it.
 *
 * TWO IMPLEMENTATIONS EXISTED. The server's line-buffered loop in
 * `command.handler.ts` served telnet and SSH; the browser ran its own line
 * editor (`packages/terminal/src/utils/login-key-machine.ts`) and drove the
 * server through `check-username` / `new-user-response` socket events. The
 * server's is the one that keeps: its success path already calls the same
 * `runPostAuthLogin` the web handler calls, and its failure path the same
 * `promptPasswordReset` and `runPwfailAndLogoff`, so nothing had to be ported
 * into it.
 *
 * THE DEFECT THIS CLOSES, which the research never named:
 * `startNewUserRegistration` had exactly ONE caller in the whole backend, and
 * it was the web-only `new-user-response` handler. A telnet or SSH caller who
 * typed a name this board does not know was answered `Invalid PassWord` after
 * the password prompt and could NEVER create an account - while the entire
 * NEW_USER_* substate machine he needed already existed and is dispatched from
 * the same handler. Only the door into it was web-only.
 *
 * These drive `handleCommand`, which is where the login loop lives and what
 * every transport's input pipeline calls. That the web `command` event and a
 * telnet `data` chunk both REACH it is the other half of the chain, and it is
 * pinned by `tests/transport/terminal-input.test.ts` (TP-8).
 */
process.env.SKIP_DB_INIT = '1';

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

/** The account the board knows, and the one it does not. */
const KNOWN = { id: 7, username: 'sysop', secLevel: 255, email: 'sysop@example.com' };

const getUserByUsername = jest.fn(async (name: string) =>
  name.toLowerCase() === KNOWN.username ? KNOWN : null,
);

/**
 * The board's database, registered in the DI container the login loop resolves
 * from (`handlers/command-handler/dependency-injection.ts`) rather than by
 * mocking the database module. Mocking the module pulls index.ts's whole boot
 * wiring in behind it and it starts asking for methods this suite has no
 * opinion about; registering an instance replaces exactly the one collaborator
 * the loop uses.
 */
beforeAll(() => {
  const { container, DI_TOKENS } = require('../../src/container');
  container.registerInstance(DI_TOKENS.Database, { getUserByUsername });
});

/** Registration is a whole substate machine; this suite only proves the DOOR into it. */
const startNewUserRegistration = jest.fn(async (_socket: unknown, session: any, _username?: string) => {
  session.state = BBSState.REGISTERING;
  session.subState = LoggedOnSubState.NEW_USER_GDPR_CONSENT;
});
jest.mock('../../src/handlers/user/new-user.handler', () => ({
  // The real module is imported by index.ts's boot wiring, so the mock must
  // answer every name that wiring reaches for, not only the one under test.
  ...jest.requireActual('../../src/handlers/user/new-user.handler'),
  startNewUserRegistration,
}));

/**
 * R8's sentinel. The pipeline itself is another suite's subject
 * (login-refuses-deleted-and-double-login.test.ts drives the real one); what
 * this file has to prove is that the LOGIN LOOP reaches it, exactly once, on a
 * successful password. Counting it at the module boundary is the only way -
 * the loop reaches it through `await import(...)` inside the branch.
 */
const runPostAuthLogin = jest.fn(async (_socket: unknown, session: any, _user?: unknown) => {
  session.state = BBSState.LOGGEDON;
  session.subState = LoggedOnSubState.DISPLAY_BULL;
  return { ok: true };
});
jest.mock('../../src/services/login-post.service', () => ({
  ...jest.requireActual('../../src/services/login-post.service'),
  runPostAuthLogin,
}));

/**
 * The email reset after Excessive Password Failure. The dialog itself is
 * login-prompt-parity.test.ts's subject; here it only has to be OFFERED (mail
 * set up, an address on file) and to SUCCEED, so the loop's next step can be
 * seen. Unavailable by default, as on a board with no SMTP.
 */
const resetAvailable = jest.fn(async (_email?: string | null) => false);
const passwordReset = jest.fn(async (_socket: unknown, _session: any) => ({ ok: true }));
jest.mock('../../src/services/login-prompt.service', () => ({
  ...jest.requireActual('../../src/services/login-prompt.service'),
  isPasswordResetAvailable: (email?: string | null) => resetAvailable(email),
  promptPasswordReset: (socket: unknown, session: any) => passwordReset(socket, session),
}));

const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff,
}));

interface Emitted { event: string; data: unknown }

/**
 * A UNIQUE id per socket, because the output buffer is a registry keyed by it
 * (`utils/ansi-buffer.util.ts`). Two sockets sharing an id share a buffer, and
 * the second test in a file reads the first one's flushed output - or none at
 * all.
 */
let socketSeq = 0;

function makeSocket() {
  const emitted: Emitted[] = [];
  const socket: any = {
    id: `login-machine-socket-${(socketSeq += 1)}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    once() { return this; },
    removeAllListeners() { return this; },
    listenerCount() { return 0; },
  };
  return socket;
}

function loginSession(connectionType: 'web' | 'telnet' | 'ssh') {
  return {
    state: BBSState.LOGON,
    subState: undefined,
    connectionType,
    nodeId: 1,
    tempData: {},
    inputBuffer: '',
    timeRemaining: 60,
    screenWidth: 80,
    screenHeight: 24,
    terminalType: connectionType === 'web' ? 'modern' : 'ansi',
  } as any;
}

/**
 * Everything the caller's terminal was sent, as one string.
 *
 * Flushed first: `emitText` BUFFERS and only `emitPrompt` flushes, so a test
 * that reads the wire after keystrokes with no prompt behind them reads
 * nothing at all - which is exactly what a caller would see if the buffer were
 * never flushed, and not what this suite is asking about.
 */
function wire(socket: any): string {
  const { flushAllBuffers } = require('../../src/utils/ansi-buffer.util');
  flushAllBuffers();
  return socket.emitted
    .filter((e: Emitted) => e.event === 'ansi-output')
    .map((e: Emitted) => (typeof e.data === 'string' ? e.data : ''))
    .join('');
}

async function type(socket: any, session: any, text: string): Promise<void> {
  const { handleCommand } = require('../../src/handlers/command.handler');
  for (const ch of text) {
    await handleCommand(socket, session, ch);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('TP-9a - the server drives the login prompt for every transport', () => {
  it('typing at the WEB Username prompt reaches the server and is echoed by it', async () => {
    const socket = makeSocket();
    const session = loginSession('web');

    await type(socket, session, 'sysop\r');

    // RED before this task: the loop returned at the top for
    // `connectionType === 'web'`, so a web caller's keystrokes produced
    // nothing at all after `Username: `.
    expect(wire(socket)).toContain('sysop');
    expect(wire(socket)).toContain('Password: ');
    expect(session.tempData.loginPhase).toBe('password');
  });

  it('the password is masked by the SERVER, one star per character, on every transport', async () => {
    for (const transport of ['web', 'telnet', 'ssh'] as const) {
      const socket = makeSocket();
      const session = loginSession(transport);

      await type(socket, session, 'sysop\r');
      const beforePassword = wire(socket).length;
      await type(socket, session, 'abcd');

      const echoed = wire(socket).slice(beforePassword);
      expect({ transport, echoed }).toEqual({ transport, echoed: '****' });
      // The mask is the board's ONE field, not a phase name, so the browser's
      // local echo and the transport adapter read the same fact.
      expect({ transport, mask: session.maskInput }).toEqual({ transport, mask: true });
    }
  });

  it('a TELNET caller who types an unknown name is offered an account', async () => {
    const socket = makeSocket();
    const session = loginSession('telnet');

    await type(socket, session, 'newcomer\r');

    // RED before this task: the loop asked for a password and then answered
    // `Invalid PassWord`, for ever.
    expect(wire(socket)).toContain('is not used on this BBS');
    expect(wire(socket)).toContain('[R]etry your name or [C]ontinue as a new user?');
    // lineInput's break (express.e:2378), then '\b\nThe name ...' (29608).
    expect(wire(socket)).toContain('newcomer\r\n\r\nThe name newcomer is not used on this BBS.\r\n');
    expect(session.tempData.loginPhase).toBe('new-user-confirm');
    expect(wire(socket)).not.toContain('Password: ');
  });

  it("and C creates it, through the same function the web path calls", async () => {
    const socket = makeSocket();
    const session = loginSession('telnet');

    await type(socket, session, 'newcomer\r');
    await type(socket, session, 'C\r');

    expect(startNewUserRegistration).toHaveBeenCalledTimes(1);
    expect(startNewUserRegistration.mock.calls[0][2]).toBe('newcomer');
    expect(session.state).toBe(BBSState.REGISTERING);
    expect(session.subState).toBe(LoggedOnSubState.NEW_USER_GDPR_CONSENT);
  });

  it('Enter alone is a retry, not an account - express.e:29619', async () => {
    // `IF StrCmp(tempStr,'C') THEN newUser:=TRUE ELSE retryCount++`: only C
    // makes an account. Enter used to (parity survey, 2026-09-29).
    const socket = makeSocket();
    const session = loginSession('telnet');
    await type(socket, session, 'newcomer\r');
    await type(socket, session, '\r');
    expect(startNewUserRegistration).not.toHaveBeenCalled();
    expect(session.tempData.loginPhase).toBe('username');
  });

  it('an empty name asks for the name again, not the password', async () => {
    const socket = makeSocket();
    const session = loginSession('telnet');
    await type(socket, session, '\r');
    expect(session.tempData.loginPhase ?? 'username').toBe('username');
    expect(session.maskInput).toBeFalsy();
    expect(wire(socket)).not.toContain('Password:');
  });

  it('a wrong password asks for the password again, and the third is the last', async () => {
    // express.e:29140-29211: "Invalid PassWord", the password prompt again
    // for the same name, three tries per call whatever MAX_PASSWORD_FAILS says
    // (this file mocks it to 1 - the old code logged off on the FIRST miss).
    const { container } = require('../../src/container');
    const { AuthenticationUseCase } = require('../../src/services/use-cases/authentication.use-case');
    container.registerInstance(AuthenticationUseCase, { authenticate: jest.fn(async () => ({ success: false, error: 'bad' })) });
    try {
      const socket = makeSocket();
      const session = loginSession('telnet');
      await type(socket, session, 'sysop\r');
      await type(socket, session, 'wrong1\r');
      expect(session.tempData.loginPhase).toBe('password');
      expect(session.tempData.loginUsername).toBe('sysop');
      // getPass2's two breaks (express.e:1599, 1603), then 29207's line, then
      // the prompt - "Invalid PassWord" on a line of its own, below the ****.
      expect(wire(socket)).toMatch(/\*+\r\n\r\nInvalid PassWord\r\nPassword: $/);
      await type(socket, session, 'wrong2\r');
      expect(session.tempData.loginPhase).toBe('password');
      expect(wire(socket)).not.toContain('Excessive Password Failure');
      // The third miss ends the tries: the reset offer (when mail is set up)
      // or PWFAIL - either way no fourth Password: prompt. Not awaited: the
      // reset offer waits for an answer.
      const before = (wire(socket).match(/Password: /g) || []).length;
      void type(socket, session, 'wrong3\r');
      await new Promise((r) => setTimeout(r, 200));
      expect((wire(socket).match(/Password: /g) || []).length).toBe(before);
    } finally {
      container.registerInstance(AuthenticationUseCase, new AuthenticationUseCase());
    }
  });

  it('a correct reset code after Excessive Password Failure goes straight into the logon - express.e:29196-29198', async () => {
    // `stat:=RESULT_SUCCESS` ends the password loop and the logon carries on
    // for the account that failed. The caller used to be sent back to the
    // name prompt, to type his name and new password again.
    const { container } = require('../../src/container');
    const { AuthenticationUseCase } = require('../../src/services/use-cases/authentication.use-case');
    container.registerInstance(AuthenticationUseCase, { authenticate: jest.fn(async () => ({ success: false, error: 'bad' })) });
    resetAvailable.mockResolvedValueOnce(true);
    try {
      const socket = makeSocket();
      const session = loginSession('telnet');
      await type(socket, session, 'sysop\r');
      await type(socket, session, 'wrong1\r');
      await type(socket, session, 'wrong2\r');
      expect(runPostAuthLogin).not.toHaveBeenCalled();
      await type(socket, session, 'wrong3\r');

      expect(resetAvailable).toHaveBeenCalledWith(KNOWN.email);
      expect(passwordReset).toHaveBeenCalledTimes(1);
      // The sentinel: the shared post-auth pipeline ran, once, for the
      // account whose reset succeeded - not a name prompt.
      expect(runPostAuthLogin).toHaveBeenCalledTimes(1);
      expect(runPostAuthLogin.mock.calls[0][2]).toBe(KNOWN);
      expect(session.state).toBe(BBSState.LOGGEDON);
      expect(session.tempData.loginPhase).not.toBe('username');
      expect(session.maskInput).toBeFalsy();
    } finally {
      container.registerInstance(AuthenticationUseCase, new AuthenticationUseCase());
    }
  });

  it('R goes back to the name prompt, and five refusals are a disconnect', async () => {
    const socket = makeSocket();
    const session = loginSession('telnet');

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await type(socket, session, 'newcomer\r');
      await type(socket, session, 'R\r');
      expect({ attempt, phase: session.tempData.loginPhase }).toEqual({ attempt, phase: 'username' });
      expect(beginLogoff).not.toHaveBeenCalled();
    }

    await type(socket, session, 'newcomer\r');
    await type(socket, session, 'R\r');
    expect(beginLogoff).toHaveBeenCalledTimes(1);
    expect(startNewUserRegistration).not.toHaveBeenCalled();
  });

  it('a name the board DOES know still goes straight to the password prompt', async () => {
    const socket = makeSocket();
    const session = loginSession('telnet');

    await type(socket, session, 'sysop\r');

    expect(wire(socket)).toContain('Password: ');
    expect(wire(socket)).not.toContain('not used on this BBS');
    expect(startNewUserRegistration).not.toHaveBeenCalled();
  });

  /**
   * R8 of the TP-16 reachability ledger - the login loop reaches the shared
   * post-auth pipeline, exactly once.
   *
   * `runPostAuthLogin` is what makes a login a login: MULTICOM, the webhook,
   * the forced password change, GDPR, the LOGON screen and the bulletin flow.
   * Before TP-9a the three transports each had their own idea of what
   * happened after a correct password, which is how a telnet caller could log
   * in and never see a bulletin.
   *
   * Counted at the module boundary because the loop reaches it through
   * `await import(...)` inside the branch - there is no prototype to spy and
   * SWC's export getters refuse jest.spyOn (recorded on R2).
   *
   * The NEGATIVE arm is on the same path and matters as much: a WRONG password
   * must not reach it. Without that, a loop that called the pipeline
   * unconditionally would pass the first assertion.
   */
  it('R8: a correct password reaches runPostAuthLogin exactly once, a wrong one never', async () => {
    const { container } = require('../../src/container');
    const { AuthenticationUseCase } = require('../../src/services/use-cases/authentication.use-case');
    const authenticate = jest.fn(async (_u: string, password: string) =>
      password === 'letmein'
        ? { success: true, user: KNOWN }
        : { success: false, error: 'bad password' },
    );
    container.registerInstance(AuthenticationUseCase, { authenticate });

    try {
      // --- the correct password -------------------------------------------
      const socket = makeSocket();
      const session = loginSession('telnet');
      await type(socket, session, 'sysop\r');
      await type(socket, session, 'letmein\r');

      expect(runPostAuthLogin).toHaveBeenCalledTimes(1);
      // ...with the user the board looked up, not a re-read or a stub.
      expect(runPostAuthLogin.mock.calls[0][2]).toEqual(KNOWN);

      // --- a wrong one, on the same path ----------------------------------
      runPostAuthLogin.mockClear();
      const socket2 = makeSocket();
      const session2 = loginSession('telnet');
      await type(socket2, session2, 'sysop\r');
      await type(socket2, session2, 'wrongpw\r');

      expect(runPostAuthLogin).toHaveBeenCalledTimes(0);
      expect(wire(socket2)).toContain('Invalid PassWord');
    } finally {
      container.registerInstance(AuthenticationUseCase, new AuthenticationUseCase());
    }
  });

  /**
   * The property the whole task risks: a telnet caller's login is the one that
   * WORKED, and it must be unchanged. The baseline is built by this test from
   * its own inputs rather than stored, so it cannot rot into agreement with a
   * regression.
   */
  it('a telnet login is byte-identical to a web one, now that both are the server\'s', async () => {
    const bytesFor = async (transport: 'web' | 'telnet') => {
      const socket = makeSocket();
      const session = loginSession(transport);
      await type(socket, session, 'sysop\rsecret');
      return wire(socket);
    };

    expect(await bytesFor('telnet')).toBe(await bytesFor('web'));
  });
});

describe('the system password', () => {
  // express.e doSystemPassword (29329-29356): a wrong answer is getPass2's
  // two breaks (1599, 1603) and then "Invalid PassWord" (29343).
  it('a wrong one: two line breaks, then "Invalid PassWord"', async () => {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    const { applyTooltypes } = require('../../src/utils/info-file.util');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'syspw-'));
    applyTooltypes(path.join(root, 'bbsConfig.info'), [['SYSTEM_PASSWORD', 'secret']]);
    const saved = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = root;
    try {
      const socket = makeSocket();
      const session = { ...loginSession('telnet'), state: BBSState.AWAIT, subState: LoggedOnSubState.SYSTEM_PASSWORD_INPUT, tempData: { inputBuffer: 'nope' } };
      await require('../../src/handlers/command.handler').handleCommand(socket, session, '\r');
      expect(wire(socket)).toContain('\r\n\r\nInvalid PassWord\r\n');
    } finally {
      if (saved === undefined) delete process.env.BBS_DATA_DIR; else process.env.BBS_DATA_DIR = saved;
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
