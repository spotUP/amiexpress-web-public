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

  it('Enter alone means the same as C - express.e:29646', async () => {
    const socket = makeSocket();
    const session = loginSession('telnet');
    await type(socket, session, 'newcomer\r');
    await type(socket, session, '\r');
    expect(startNewUserRegistration).toHaveBeenCalledTimes(1);
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
