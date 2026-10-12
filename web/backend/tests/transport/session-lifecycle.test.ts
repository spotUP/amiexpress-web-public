/**
 * A TELNET CALLER'S SESSION ENDS THE WAY A BROWSER'S DOES.
 *
 * TP-13b. The web disconnect path ran `finalizeDisconnectCleanup`: the
 * `Logged off` CallersLog line, the SAmiLog store, the logout event, the
 * logoff batches, EXECUTE_ON_LOGOFF, MAIL_ON_LOGOFF, the command history,
 * the user's disk files and the node files. The telnet/SSH close handler
 * ran none of it. It did two things, and one of them did nothing at all:
 *
 *   sessions.delete(connection.sessionId)
 *
 * The map is keyed by `nodeId.toString()` (session-manager's setSession) and
 * the id is `telnet-<node>-<ts>`, so that line could never match. A telnet
 * caller simply evaporated: no logoff record, no batches, nothing written.
 *
 * These drive the REAL close handler, through `setupTelnetSSHHandler`.
 */
process.env.SKIP_DB_INIT = '1';

const finalizeDisconnectCleanup = jest.fn(async (..._args: unknown[]) => undefined);
const releaseSessionResources = jest.fn(async (..._args: unknown[]) => undefined);
const endTransportSession = jest.fn(async (emitter: any, session: any, key: string) => {
  await releaseSessionResources(emitter, session);
  await finalizeDisconnectCleanup(emitter, session, key);
});
jest.mock('../../src/server/socket-handlers', () => ({
  endTransportSession: (...args: any[]) => (endTransportSession as any)(...args),
  releaseSessionResources: (...args: any[]) => (releaseSessionResources as any)(...args),
  finalizeDisconnectCleanup: (...args: any[]) => (finalizeDisconnectCleanup as any)(...args),
  registerSocketHandlers: jest.fn(),
}));

import { EventEmitter } from 'events';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { setupTelnetSSHHandler, type TransportSessionDeps } from '../../src/server/transport-session';
import type { TelnetConnection } from '../../src/server/telnet-server';
import type { BBSSession } from '../../src/index';
import { getAnsiBuffer, ansiBufferCount, releaseAnsiBuffer } from '../../src/utils/ansi-buffer.util';
import { emitterForSession } from '../../src/server/session-emitter-registry';

class FakeTransportConnection extends EventEmitter {
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  public written: Buffer[] = [];

  constructor(nodeId: number) {
    super();
    this.nodeId = nodeId;
    this.sessionId = `telnet-${nodeId}-lifecycle-test`;
  }

  write(data: Buffer | string): void {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
  }

  close(): void { /* the close EVENT is what this file drives */ }
  getRemoteAddress(): string { return '10.0.0.7'; }
}

const loggedOnSession = (nodeId: number): BBSSession => ({
  state: BBSState.LOGGEDON,
  subState: LoggedOnSubState.READ_COMMAND,
  user: { id: nodeId, username: `NODE${nodeId}`, secLevel: 100 },
  nodeId,
  socketId: `telnet-${nodeId}-lifecycle-test`,
  tempData: {},
} as unknown as BBSSession);

function telnetCaller(nodeId: number) {
  const connection = new FakeTransportConnection(nodeId);
  connection.session = loggedOnSession(nodeId);
  const releaseSession = jest.fn(async () => undefined);
  const deps: TransportSessionDeps = {
    io: {} as never,
    sessions: new Map<string, BBSSession>(),
    nodeManager: { releaseSession },
    handleCommand: jest.fn(),
  } as unknown as TransportSessionDeps;
  setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
  return { connection, session: connection.session!, deps, releaseSession };
}

/** The close handler finalises on a promise; let it settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  finalizeDisconnectCleanup.mockClear();
  releaseSessionResources.mockClear();
  endTransportSession.mockClear();
});

describe('a telnet caller who drops', () => {
  it('reaches the same finalize a browser does', async () => {
    const caller = telnetCaller(11);

    caller.connection.emit('close');
    await settle();

    expect(endTransportSession).toHaveBeenCalledTimes(1);
    // The session it finalises is the caller's own, keyed by the id the
    // node manager and deleteSession both resolve through.
    expect(endTransportSession.mock.calls[0][1]).toBe(caller.session);
    expect(endTransportSession.mock.calls[0][2]).toBe(caller.connection.sessionId);
    expect(finalizeDisconnectCleanup).toHaveBeenCalledTimes(1);
  });

  it('releases the chat rooms and the node before it finalises', async () => {
    const caller = telnetCaller(12);

    caller.connection.emit('close');
    await settle();

    expect(releaseSessionResources).toHaveBeenCalledTimes(1);
    expect(caller.releaseSession).toHaveBeenCalledWith(caller.connection.sessionId);
  });

  it('is no longer reachable through the emitter registry', async () => {
    const caller = telnetCaller(13);
    expect(emitterForSession(caller.session)).not.toBeNull();

    caller.connection.emit('close');
    await settle();

    expect(emitterForSession(caller.session)).toBeNull();
  });
});

describe("the connection's AnsiBuffer", () => {
  it('is released, and what it held goes out first', () => {
    const socketId = 'telnet-99-buffer-test';
    const sent: string[] = [];
    const fakeSocket: any = {
      id: socketId,
      emit: (_event: string, payload: unknown) => sent.push(String(payload)),
      on: () => undefined,
    };

    const before = ansiBufferCount();
    const buffer = getAnsiBuffer(fakeSocket);
    buffer.append('half a screen');
    expect(ansiBufferCount()).toBe(before + 1);
    expect(sent).toEqual([]);

    // Divergence 30: the buffer's own cleanup listens for 'disconnect',
    // which no byte transport ever emits, so every telnet and SSH caller
    // used to leave this behind for the life of the process.
    expect(releaseAnsiBuffer(socketId)).toBe(true);

    expect(sent.join('')).toContain('half a screen');
    expect(ansiBufferCount()).toBe(before);
    // Releasing twice is not an error - a close can race a disconnect.
    expect(releaseAnsiBuffer(socketId)).toBe(false);
  });
});
