/**
 * A WEB caller's login gives him a session token, so his next visit is
 * automatic.
 *
 * WHY THIS EXISTS. The token used to be minted inside the `login` socket
 * handler's username/password arm, and TP-9b retired that arm - the browser
 * does not post credentials any more, it types at the server's prompt like
 * every other transport. The mint moved into `runPostAuthLogin`, the one
 * pipeline every successful login runs through, and NOTHING pinned it there:
 * the symptom of getting it wrong is not a failed login, it is a login that
 * works and then never auto-logs in again, which no login test would notice.
 *
 * The sysop reported exactly that on the live board, which is why the pin is
 * here now rather than in the commit that moved it.
 */
process.env.SKIP_DB_INIT = '1';

const generateAccessToken = jest.fn(async () => 'access-token');
const generateRefreshToken = jest.fn(async () => 'refresh-token');
// The first write after the mint: the row brought up to date from the record.
const updateUser = jest.fn(async (..._args: unknown[]) => { throw new Stop('past the mint'); });

/**
 * The real database module with three methods replaced. A wholesale mock is
 * not enough here: `login-post.service` imports `{ db }` directly, and the
 * module graph behind it (the config services, the DI container) asks the
 * same object for a dozen other things during boot.
 */
jest.mock('../../src/database', () => {
  const actual = jest.requireActual('../../src/database');
  const overrides: Record<string, unknown> = {
    generateAccessToken,
    generateRefreshToken,
    updateUser,
  };
  return {
    ...actual,
    db: new Proxy(actual.db, {
      get: (target, prop: string) =>
        prop in overrides ? overrides[prop] : (target as any)[prop],
    }),
  };
});

jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch: () => true,
}));

/** The pipeline runs a long way past the mint; stop it once the token is out. */
class Stop extends Error {}
// No record on disk: the login runs on the row (load-account.ts falls back).
jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: {
    readUserBySlot: () => null,
  },
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { lookupResumeToken, tokenFingerprint } from '../../src/server/resume-tokens';

function emitter() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    emitted,
    id: 'token-socket',
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
    join() { return this; },
  } as any;
}

function session(connectionType?: 'web' | 'telnet') {
  return {
    state: BBSState.LOGON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType,
    nodeId: 1,
    tempData: {},
  } as any;
}

const USER = {
  id: 'u-1', username: 'sysop', realname: 'Sysop', secLevel: 255,
  expert: false, ansi: true, slotNumber: 3, calls: 1, callsToday: 1,
};

/** Run the pipeline far enough to see the mint, and no further. */
async function loginOn(connectionType?: 'web' | 'telnet', sess = session(connectionType)) {
  const { runPostAuthLogin } = require('../../src/services/login-post.service');
  const socket = emitter();
  await runPostAuthLogin(socket, sess, USER, {
    lastLoginBeforeUpdate: new Date(0),
  }).catch((err: Error) => {
    if (!(err instanceof Error) || !/past the mint/.test(err.message)) throw err;
  });
  return socket;
}

beforeEach(() => jest.clearAllMocks());

describe('the session token a web caller needs for auto-login', () => {
  it('login-success carries a freshly minted token', async () => {
    const socket = await loginOn('web');
    const success = socket.emitted.find((e: any) => e.event === 'login-success');
    expect(success).toBeDefined();
    expect(success.data).toMatchObject({
      token: 'access-token',
      refreshToken: 'refresh-token',
      user: { id: 'u-1', username: 'sysop' },
    });
  });

  it('a telnet caller is not sent one - there is no browser to store it', async () => {
    const socket = await loginOn('telnet');
    expect(socket.emitted.some((e: any) => e.event === 'login-success')).toBe(false);
    expect(generateAccessToken).not.toHaveBeenCalled();
  });

  /**
   * `session-manager.ts` defaults an unset `connectionType` to 'web', but a
   * session built anywhere else may leave it undefined - and a browser that
   * silently stops getting a token is the failure this file is about.
   */
  it('a session with no connectionType at all is treated as a browser', async () => {
    const socket = await loginOn(undefined);
    const success = socket.emitted.find((e: any) => e.event === 'login-success');
    expect(success?.data).toMatchObject({ token: 'access-token' });
  });
});

describe('the resume token a web caller needs to get a dropped session back', () => {
  it('login-success carries a resumeToken that opens THIS session and nothing else', async () => {
    const sess = session('web');
    const socket = await loginOn('web', sess);
    const success = socket.emitted.find((e: any) => e.event === 'login-success');
    const token = success?.data?.resumeToken;
    expect(typeof token).toBe('string');
    const found = lookupResumeToken(token);
    expect(found.ok && found.bound.session).toBe(sess);
    expect(found.ok && found.bound.userId).toBe('u-1');
    expect(found.ok && found.bound.nodeId).toBe(1);
  });

  it('a session with no node gets no resume token, and the login still succeeds', async () => {
    const sess = session('web'); sess.nodeId = 0;
    const socket = await loginOn('web', sess);
    const success = socket.emitted.find((e: any) => e.event === 'login-success');
    expect(success).toBeDefined();
    expect(success.data.resumeToken).toBeUndefined();
  });

  it('a telnet caller gets no resume token (it has no reconnect path)', async () => {
    const socket = await loginOn('telnet');
    expect(JSON.stringify(socket.emitted)).not.toContain('resumeToken');
  });

  it('the token reaches no console sink during the login', async () => {
    const lines: string[] = [];
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      jest.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        lines.push(a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '));
      }));
    let token = '';
    try {
      const socket = await loginOn('web');
      token = socket.emitted.find((e: any) => e.event === 'login-success').data.resumeToken;
    } finally {
      spies.forEach((s) => s.mockRestore());
    }
    // The sink was live and carried other text...
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.includes(tokenFingerprint(token)))).toBe(true);
    // ...and the token (and the raw secret form of it) is in none of it.
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(lines.filter((l) => l.includes(token))).toEqual([]);
  });
});
