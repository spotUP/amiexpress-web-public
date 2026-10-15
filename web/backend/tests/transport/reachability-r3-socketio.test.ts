/**
 * R3 - a real socket.io client reaches the board through registerSocketHandlers.
 *
 * The web caller's entry point. `setupTelnetSSHHandler` is the byte
 * transports'; this is the browser's, and until TP-2 neither could be driven
 * from a test at all because index.ts started real servers on import.
 *
 * Nothing here is faked: a real `socket.io` server on an ephemeral port, a real
 * `socket.io-client` connecting over TCP, and the product's own
 * `registerSocketHandlers` wired to it. The client's `command` emit crosses the
 * wire and lands in `handleCommand`.
 *
 * SENTINELS. `handleCommand` is counted at the module boundary - socket-handlers
 * imports it statically (socket-handlers.ts:46), so a module mock records the
 * crossing, and SWC's non-configurable export getters refuse jest.spyOn
 * (recorded on R2). The socket's own `emit` is counted by what ARRIVES at the
 * client, which is the honest measure: an emit the client never receives is not
 * a delivery.
 *
 * socket.io-client is not a dependency of web/backend. It is declared at the
 * repository root and resolves from the root node_modules, so this needs no new
 * dependency - but if it ever stops resolving, that is why.
 */
process.env.SKIP_DB_INIT = '1';

/*
 * A BARE factory, deliberately: spreading `jest.requireActual` here pulls the
 * whole command-handler module graph, which reaches index.ts, and the circular
 * initialisation throws "Cannot access 'displayMainMenu' before
 * initialization" before a single test runs. socket-handlers imports exactly
 * one name from this module (socket-handlers.ts:46), so one name is what the
 * mock provides.
 */
jest.mock('../../src/handlers/command.handler', () => ({
  // The stub ANSWERS, the way the board does. A no-op stub makes the round
  // trip unmeasurable: nothing would ever reach the socket, so "the socket's
  // emit" could not be counted and the assertion would be unsatisfiable by
  // construction rather than by defect. Standing in for command PROCESSING is
  // legitimate here - the row is about the transport either side of it.
  handleCommand: jest.fn(async (socket: { emit: (e: string, d: string) => void }, _s: unknown, piece: string) => {
    socket.emit('ansi-output', `ECHO:${piece}`);
  }),
}));

import * as http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { registerSocketHandlers } from '../../src/server/socket-handlers';
import { setSession } from '../../src/server/session-manager';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

const { handleCommand: mockHandleCommand } =
  jest.requireMock('../../src/handlers/command.handler') as { handleCommand: jest.Mock };

jest.setTimeout(60000);

describe('R3 - a real socket.io client through registerSocketHandlers', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;
  const sockets = new Set<{ destroy: () => void }>();
  /** Every emit the SERVER made on a connected socket, counted at the source. */
  let serverEmits: string[] = [];

  beforeAll(async () => {
    server = http.createServer();
    server.on('connection', (s) => {
      sockets.add(s as never);
      s.on('close', () => sockets.delete(s as never));
    });
    io = new SocketIOServer(server, { cors: { origin: '*' } });
    io.on('connection', (socket) => {
      // The row's other sentinel is "the socket's emit". Counting it at the
      // SOURCE rather than by what the client happens to receive: an event the
      // board sends is a crossing whether or not this client subscribes to it.
      const realEmit: (e: string, ...a: unknown[]) => boolean = socket.emit.bind(socket);
      (socket as unknown as { emit: (e: string, ...a: unknown[]) => boolean }).emit =
        (event: string, ...args: unknown[]) => { serverEmits.push(event); return realEmit(event, ...args); };
      /*
       * A SESSION, because the `command` listener returns early without one
       * (socket-handlers.ts:591-595) - it logs "No session found for socket"
       * and drops the keystroke. The product creates this at connect; a test
       * that skips it measures the early return, not the path.
       */
      setSession(socket.id, {
        state: BBSState.LOGGEDON,
        subState: LoggedOnSubState.READ_COMMAND,
        nodeId: 71,
        socketId: socket.id,
        connectionType: 'web',
        user: { id: 71, username: 'R3', secLevel: 100 },
        tempData: {},
      } as never);
      registerSocketHandlers(io, socket);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    io.close();
    for (const s of sockets) { try { s.destroy(); } catch { /* gone */ } }
    sockets.clear();
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, 2000);
      server.close(() => { clearTimeout(done); resolve(); });
    });
  });

  beforeEach(() => { mockHandleCommand.mockClear(); serverEmits = []; });

  it("a client's command crosses a real socket and reaches handleCommand", async () => {
    const client: ClientSocket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });

    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('client never connected')), 15000);
        client.on('connect', () => { clearTimeout(timer); resolve(); });
        client.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
      });

      // The round trip: the client's byte in, the board's answer back out,
      // over one real socket.
      const echoed = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no answer came back')), 10000);
        client.on('ansi-output', (data: string) => { clearTimeout(timer); resolve(String(data)); });
        client.emit('command', 'A');
      });

      expect(echoed).toBe('ECHO:A');
      expect(mockHandleCommand.mock.calls.length).toBeGreaterThanOrEqual(1);
      // ...with the byte the CLIENT sent, over a real socket, not a synthesised one.
      const delivered = mockHandleCommand.mock.calls.map((c) => c[2]);
      expect(delivered).toContain('A');

      // ...and the answer left through the SOCKET's own emit, counted at the
      // source, not merely observed at the client.
      expect(serverEmits).toContain('ansi-output');
    } finally {
      client.close();
    }
  });

  it('a client that sends nothing reaches handleCommand not at all', async () => {
    // The DEAD direction: connecting is not commanding. Without this a handler
    // that called handleCommand on connect would pass the test above.
    const client: ClientSocket = ioClient(`http://127.0.0.1:${port}`, {
      transports: ['websocket'], forceNew: true, reconnection: false,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('client never connected')), 15000);
        client.on('connect', () => { clearTimeout(timer); resolve(); });
        client.on('connect_error', (e) => { clearTimeout(timer); reject(e); });
      });
      await new Promise((r) => setTimeout(r, 1500));
      expect(mockHandleCommand).toHaveBeenCalledTimes(0);
    } finally {
      client.close();
    }
  });
});
