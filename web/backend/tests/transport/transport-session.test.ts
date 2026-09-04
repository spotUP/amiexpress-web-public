/**
 * Task TP-2 of `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`:
 * THE TELNET / SSH ENTRY POINT IS NOW IMPORTABLE.
 *
 * `setupTelnetSSHHandler` is the top-level entry point a telnet caller's every
 * keystroke passes through, and until this task it lived in `src/index.ts`,
 * which starts the HTTP, telnet and SSH servers from a top-level IIFE on
 * import. The research's coverage table records the consequence: the `data`
 * handler was executed by NONE of the backend's tests, and every suite that
 * needed anything near it mocked index.ts away
 * (`tests/petscii/render-ctx-disposal.test.ts:22`,
 * `tests/server/eighty-col-choke-identity.test.ts:42`, and the extraction
 * comment at `src/server/connection-emitter.ts:5-10`).
 *
 * Gate 3a of `~/.claude/REACHABILITY_PROTOCOL.md` requires every later task in
 * that plan to drive the product's top-level entry point. For a telnet caller
 * that entry point is this function, so this suite is the proof it can now be
 * reached at all: cases 1-3 drive the `data`, emitter-attach and `close` paths
 * that no test executed before, and case 4 asserts the property the whole task
 * exists to create - importing the module starts nothing.
 *
 * The move itself is a PURE MOVE. Its byte-for-byte guard is
 * `tests/server/eighty-col-choke-identity.test.ts`, which passes unedited.
 *
 * NOTE the deliberate absence of `jest.mock('../../src/index', ...)`. Every
 * other suite that comes near this code needs it. This one must not have it:
 * if `server/transport-session.ts` ever grows a runtime import of index.ts,
 * case 4 is what fails.
 */
process.env.SKIP_DB_INIT = '1';

import { EventEmitter } from 'events';
import * as net from 'net';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  setupTelnetSSHHandler,
  type TransportEmitter,
  type TransportSessionDeps,
} from '../../src/server/transport-session';
import type { TelnetConnection } from '../../src/server/telnet-server';
import type { BBSSession } from '../../src/index';

/**
 * The connection shape `setupTelnetSSHHandler` is handed. An EventEmitter plus
 * the four members the handler reads: `write`, `sessionId`, `nodeId` and
 * `session`. Real `TelnetConnection`s are driven by the byte cases in
 * `parity-symptoms.test.ts`; here the point is the handler's own wiring.
 */
class FakeTransportConnection extends EventEmitter {
  public sessionId: string;
  public nodeId: number;
  public session: BBSSession | null = null;
  public written: Buffer[] = [];
  public closed = 0;

  constructor(nodeId: number) {
    super();
    this.nodeId = nodeId;
    this.sessionId = `telnet-${nodeId}-transport-session-test`;
  }

  write(data: Buffer | string): void {
    this.written.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
  }

  close(): void {
    this.closed += 1;
  }

  getRemoteAddress(): string {
    return '127.0.0.1';
  }
}

function loggedOnSession(nodeId: number): BBSSession {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.READ_COMMAND,
    user: { id: nodeId, username: `NODE${nodeId}`, secLevel: 100 },
    nodeId,
    currentConf: 1,
    conferenceId: 1,
    currentMsgBase: 1,
    timeRemaining: 3600,
    lastActivity: Date.now(),
    confRJoin: 1,
    msgBaseRJoin: 1,
    commandBuffer: '',
    menuPause: false,
    inputBuffer: '',
    relConfNum: 1,
    currentConfName: 'Main',
    cmdShortcuts: false,
    doorExpertMode: false,
    terminalType: 'modern',
    screenWidth: 80,
    screenHeight: 24,
    tempData: {},
  } as unknown as BBSSession;
}

function makeDeps(overrides: Partial<TransportSessionDeps> = {}) {
  const handleCommand = jest.fn();
  const releaseSession = jest.fn(async () => undefined);
  const sessions = new Map<string, BBSSession>();
  const deps: TransportSessionDeps = {
    io: {} as never,
    sessions,
    nodeManager: { releaseSession },
    handleCommand,
    ...overrides,
  };
  return { deps, handleCommand, releaseSession, sessions };
}

describe('TP-2 - the telnet/SSH entry point, driven directly', () => {
  it('a telnet keystroke reaches the command handler', () => {
    const connection = new FakeTransportConnection(11);
    connection.session = loggedOnSession(11);
    const { deps, handleCommand } = makeDeps();

    setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
    connection.emit('data', Buffer.from('M'));

    expect(handleCommand).toHaveBeenCalledTimes(1);
    const [emitter, session, input, io] = handleCommand.mock.calls[0];
    expect(input).toBe('M');
    expect(session).toBe(connection.session);
    expect(io).toBe(deps.io);
    // The FIRST argument is the socket-shaped emitter every BBS handler is
    // written against, not the raw connection.
    expect(emitter).toBeDefined();
    expect(typeof (emitter as TransportEmitter).emit).toBe('function');
    expect((emitter as TransportEmitter).id).toBe(connection.sessionId);
  });

  it('the emitter is attached before the first byte can be written', () => {
    const connection = new FakeTransportConnection(12);
    connection.session = loggedOnSession(12);
    const { deps } = makeDeps();

    setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);

    // telnet-server.ts:763 and ssh-server.ts:303 both read this property from
    // code that runs BEFORE the handler returns control to the event loop, so
    // it has to be set synchronously.
    const attached = (connection as unknown as { emitter?: TransportEmitter }).emitter;
    expect(attached).toBeDefined();
    expect(attached?.id).toBe(connection.sessionId);
    expect(connection.session?.connectionType).toBe('telnet');
    expect(typeof connection.session?.transferRawSend).toBe('function');
  });

  it('a telnet close releases the node', () => {
    const connection = new FakeTransportConnection(13);
    const session = loggedOnSession(13);
    connection.session = session;
    const { deps, releaseSession, sessions } = makeDeps();
    sessions.set(connection.sessionId, session);

    setupTelnetSSHHandler(connection as unknown as TelnetConnection, 'telnet', deps);
    connection.emit('close');

    expect(sessions.has(connection.sessionId)).toBe(false);
    expect(releaseSession).toHaveBeenCalledTimes(1);
    expect(releaseSession).toHaveBeenCalledWith(connection.sessionId);
  });

  it('nothing new runs on import', () => {
    // The property the whole task exists to create, asserted rather than
    // assumed: importing the entry point must not start a server the way
    // importing index.ts does.
    const createServer = jest.spyOn(net, 'createServer');
    try {
      jest.isolateModules(() => {
        const mod = require('../../src/server/transport-session');
        expect(typeof mod.setupTelnetSSHHandler).toBe('function');
      });
      expect(createServer).toHaveBeenCalledTimes(0);
    } finally {
      createServer.mockRestore();
    }
  });
});
