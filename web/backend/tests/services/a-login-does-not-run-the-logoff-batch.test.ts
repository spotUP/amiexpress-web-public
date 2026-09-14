/**
 * A caller logging IN does not run the logoff batch.
 *
 * `BBS:Batch<weekday>` is a LOGOFF path in express.e - `processSysCommand('LOGOFF')`
 * and `LOGOFF<node>` (express.e:8222, 8230-8231), which on this board resolve
 * to `Commands/SysCmd/LOGOFF0..6.info` -> `LOCATION=BBS:Batch<n>`. At logon
 * express.e runs `runExecuteOn('LOGON')` (express.e:6715) and nothing else.
 *
 * This port ran the same file on the way in as well, and it was visible from
 * the caller's chair: today's `batch1` invokes `doors:multitop/mtop` once per
 * design, so logging in meant watching MultiTop-II paint five screens (sysop,
 * 2026-09-14) - five 68K emulator spawns, plus QuickNew, ByteKillHandler,
 * GLCUpdater and SAmiLog, repeating what the logoff had already done.
 *
 * The pin drives the real login pipeline - `runPostAuthLogin`, which every
 * transport's successful login goes through - against a scratch board whose
 * batch files name a program that cannot resolve. The batch runner announces
 * that by name, so the question "was the batch file read?" has a direct
 * answer, and the logoff case beside it proves the scratch file IS reachable:
 * without that control, a login that threw early would pass this test for the
 * wrong reason.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { config } from '../../src/config';

/** The one thing in `batch<n>` - a program name nothing can resolve. */
const SENTINEL = 'nosuchprogram-login-batch-pin';

const isReservationMatch = jest.fn(() => true);
jest.mock('../../src/services/node-reservation.service', () => ({
  ...jest.requireActual('../../src/services/node-reservation.service'),
  isReservationMatch,
}));

const beginLogoff = jest.fn();
jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff,
}));

const userAlreadyOnNode = jest.fn(() => null as number | null);
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode,
}));

jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));

/**
 * `runExecuteOn` is the LOGON hook that sits immediately after the call this
 * change removed. Spying on it is what makes the assertion non-vacuous: if it
 * fired, the pipeline reached the place the batch used to run from.
 */
const runExecuteOn = jest.fn(async () => undefined);
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runExecuteOn,
}));

jest.mock('../../src/database', () => ({
  db: {
    updateUser: jest.fn(async () => undefined),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({
    updateUser: jest.fn(async () => undefined),
    getUserByUsername: jest.fn(async () => null),
  }),
}));

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function emitter(): any {
  return {
    id: 'batch-pin-socket',
    emit() { return true; },
    on() { return this; },
    join() { return this; },
  };
}

function session(): any {
  return {
    state: BBSState.LOGON,
    subState: LoggedOnSubState.READ_COMMAND,
    connectionType: 'telnet',
    nodeId: 4,
    tempData: {},
  };
}

const USER = {
  id: 'u-1', username: 'spot', slotNumber: 7,
  calls: 0, callsToday: 0, ansi: true,
};

let warnSpy: jest.SpyInstance;
let getConfigSpy: jest.SpyInstance;
let scratch: string;
let originalCwd: string;

/** Did the batch runner read a `batch<n>` file and try to run its line? */
const batchRan = () => warnSpy.mock.calls.some((call) =>
  call.map(String).join(' ').includes(SENTINEL));

beforeEach(() => {
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  jest.spyOn(console, 'error').mockImplementation(() => undefined);

  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'login-batch-pin-'));
  // Every weekday plus the fallback, so the pin does not depend on the day
  // the suite happens to run.
  for (const name of ['batch0', 'batch1', 'batch2', 'batch3', 'batch4', 'batch5', 'batch6', 'batch000']) {
    fs.writeFileSync(path.join(scratch, name), `${SENTINEL}\n`, 'utf8');
  }

  originalCwd = process.cwd();
  process.chdir(scratch);
  // The runner reads `getConfig()` fresh on every call, so the spy holds.
  getConfigSpy = jest.spyOn(config, 'getConfig').mockReturnValue({
    ...config.getConfig(),
    dataDir: scratch,
  } as never);

  runExecuteOn.mockClear();
});

afterEach(() => {
  process.chdir(originalCwd);
  getConfigSpy.mockRestore();
  jest.restoreAllMocks();
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe('the batch file belongs to the logoff', () => {
  it('is not run when a caller logs in, though the LOGON hook is', async () => {
    const { runPostAuthLogin } = require('../../src/services/login-post.service');

    await runPostAuthLogin(emitter(), session(), USER, {
      lastLoginBeforeUpdate: new Date(0),
    });

    // The pipeline reached the point the batch used to run from...
    expect(runExecuteOn).toHaveBeenCalled();
    expect(runExecuteOn.mock.calls[0][0]).toBe('LOGON');
    // ...and ran no batch file on the way past it.
    expect(batchRan()).toBe(false);
  });

  it('IS run when the caller leaves - the control that makes the above mean something', async () => {
    const { runLogoffBatches } = jest.requireActual('../../src/services/batch-scheduler');

    await runLogoffBatches(4);

    expect(batchRan()).toBe(true);
  });

  it('offers no login-side batch runner at all', () => {
    // The export is gone, not merely uncalled: a future caller cannot
    // reintroduce the login run by importing it.
    const scheduler = jest.requireActual('../../src/services/batch-scheduler');

    expect(scheduler.runLogoffBatches).toBeInstanceOf(Function);
    expect(scheduler.runLoginBatches).toBeUndefined();
  });
});
