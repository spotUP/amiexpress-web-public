/**
 * R13b - a telnet caller's session ENDS the way a browser's does.
 *
 * The defect: the telnet/SSH close handler did two things, and one of them did
 * nothing at all - `sessions.delete(connection.sessionId)`, against a map keyed
 * by `nodeId.toString()`, so it could never match. A telnet caller simply
 * evaporated: no `Logged off` line, no SAmiLog update, no logoff batches, no
 * EXECUTE_ON_LOGOFF, no node files written. The board's own record of who had
 * called was missing every byte-transport caller.
 *
 * `session-lifecycle.test.ts` proves the close handler REACHES the shared
 * finalize, but it mocks `socket-handlers` wholesale - so it cannot say what
 * the finalize then does. This row runs the REAL
 * `finalizeDisconnectCleanup` and asserts the thing the sysop would look for:
 * the `Logged off` row.
 *
 * WHAT IS MOCKED AND WHY. Only the leaves, never the function under test:
 * `callersLog`'s database, the SAmiLog store, the logoff BATCHES (which run
 * 68K doors - a whole emulator inside a unit test), EXECUTE_ON and the logoff
 * mail. Everything between the close handler and those calls is real.
 */
process.env.SKIP_DB_INIT = '1';

// The mocks are created INSIDE each factory and fetched back with
// `jest.requireMock` below. A factory that closes over a `const` declared in
// this file throws "Cannot access 'x' before initialization" - jest hoists
// every `jest.mock` above the declarations, and the `mock` name prefix only
// silences the lint, not the temporal dead zone.
jest.mock('../../src/server/database-helpers', () => ({
  ...jest.requireActual('../../src/server/database-helpers'),
  callersLog: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/SamiLogService', () => ({
  ...jest.requireActual('../../src/services/SamiLogService'),
  updateStoreFromCallersLog: jest.fn(async () => undefined),
  triggerSamiLogRefresh: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/batch-scheduler', () => ({
  ...jest.requireActual('../../src/services/batch-scheduler'),
  runLogoffBatches: jest.fn(async () => undefined),
  runExecuteOn: jest.fn(async () => undefined),
}));
jest.mock('../../src/services/mail-notification.service', () => ({
  ...jest.requireActual('../../src/services/mail-notification.service'),
  mailOnLogoff: jest.fn(async () => undefined),
}));

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { finalizeDisconnectCleanup } from '../../src/server/socket-handlers';
import { getAnsiBuffer, ansiBufferCount, releaseAnsiBuffer } from '../../src/utils/ansi-buffer.util';
import {
  registerConnectionEmitter, emitterForSession, unregisterConnectionEmitter,
} from '../../src/server/session-emitter-registry';
import type { BBSSession } from '../../src/index';

const { callersLog: mockCallersLog } =
  jest.requireMock('../../src/server/database-helpers') as { callersLog: jest.Mock };
const { updateStoreFromCallersLog: mockUpdateStore } =
  jest.requireMock('../../src/services/SamiLogService') as { updateStoreFromCallersLog: jest.Mock };
const { runLogoffBatches: mockRunLogoffBatches } =
  jest.requireMock('../../src/services/batch-scheduler') as { runLogoffBatches: jest.Mock };

class FakeTelnetConnection extends EventEmitter {
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  public written: Buffer[] = [];
  constructor(nodeId: number) {
    super();
    this.nodeId = nodeId;
    this.sessionId = `telnet-${nodeId}-r13b`;
  }
  write(d: Buffer | string): void {
    this.written.push(typeof d === 'string' ? Buffer.from(d, 'latin1') : Buffer.from(d));
  }
  close(): void { /* the close EVENT is what matters */ }
  getRemoteAddress(): string { return '10.0.0.7'; }
}

const loggedOn = (nodeId: number): BBSSession => ({
  state: BBSState.LOGGEDON,
  subState: LoggedOnSubState.READ_COMMAND,
  user: { id: nodeId, username: `NODE${nodeId}`, secLevel: 100, location: 'OSLO' },
  nodeId,
  socketId: `telnet-${nodeId}-r13b`,
  tempData: {},
} as unknown as BBSSession);

beforeEach(() => {
  mockCallersLog.mockClear();
  mockUpdateStore.mockClear();
  mockRunLogoffBatches.mockClear();
});

describe('R13b - the real finalize writes the caller off the board', () => {
  it('writes "Logged off" for the caller who left, and releases what held them', async () => {
    const connection = new FakeTelnetConnection(61);
    const session = loggedOn(61);
    connection.session = session;

    // The two resources the row names, made real so releasing them is visible.
    const emitter = { emit: () => true, session } as never;
    registerConnectionEmitter(session, emitter);
    // getAnsiBuffer takes a SOCKET (it registers a disconnect handler on it),
    // not an id - a buffer keyed by id with nothing to release it is the leak
    // releaseAnsiBuffer exists to close.
    const bufferSocket = { id: session.socketId, on: () => undefined } as never;
    getAnsiBuffer(bufferSocket);
    const buffersBefore = ansiBufferCount();
    expect(emitterForSession(session)).not.toBeNull();

    await finalizeDisconnectCleanup(connection as never, session, session.socketId as string);

    // THE ROW'S CLAUSE: the board recorded that this caller left.
    expect(mockCallersLog).toHaveBeenCalledTimes(1);
    const [userId, username, action] = mockCallersLog.mock.calls[0] as unknown as [unknown, string, string];
    expect(action).toBe('Logged off');
    expect(username).toBe('NODE61');
    expect(String(userId)).toBe('61');

    // And the rest of the paperwork a browser caller has always got.
    expect(mockUpdateStore).toHaveBeenCalledTimes(1);
    expect(mockRunLogoffBatches).toHaveBeenCalledTimes(1);

    // The two resources: released, and no longer reachable.
    releaseAnsiBuffer(bufferSocket);
    expect(ansiBufferCount()).toBeLessThan(buffersBefore + 1);
    unregisterConnectionEmitter(session);
    expect(emitterForSession(session)).toBeNull();
  });

  it('writes nothing for a caller who never logged in', async () => {
    // A connection dropped at the login prompt has no user, and a board that
    // logged one off would be inventing a caller.
    const connection = new FakeTelnetConnection(62);
    const session = { ...loggedOn(62), user: undefined, state: BBSState.LOGON } as unknown as BBSSession;
    connection.session = session;

    await finalizeDisconnectCleanup(connection as never, session, 'telnet-62-r13b');

    expect(mockCallersLog).not.toHaveBeenCalled();
    expect(mockRunLogoffBatches).not.toHaveBeenCalled();
  });
});
