/**
 * R13a - a real /ws/terminal client gets the same pre-login as everyone else.
 *
 * The defect this row holds down, from the parity research: `/ws/terminal`
 * callers "dropped straight into the graphics prompt" - the endpoint ran NO
 * pre-login at all. No connect banner, no FRONTEND screen. A browser caller on
 * the raw terminal endpoint met a different board from a telnet caller.
 *
 * `tests/transport/entry-parity.test.ts` pins the banner's CONTENT, but it
 * calls `emitConnectBanner` directly. That proves the eight lines are right;
 * it cannot prove a ws caller ever reaches them. This drives the actual
 * endpoint: a real `http.Server`, `attachWSTerminalServer` mounted on it, a
 * real `ws` client performing a real upgrade to `/ws/terminal`, and the same
 * `setupTelnetSSHHandler` that telnet and SSH are given.
 *
 * WHERE THE PRE-LOGIN ACTUALLY LIVES, which this row had to discover: NOT in
 * `attachWSTerminalServer` and NOT in `setupTelnetSSHHandler`. It is in the
 * connection handler index.ts hands to the server. A first version of this
 * test mounted the ws server and wired the shared handler itself, and got
 * SILENCE - zero bytes - because neither of those runs it. Wiring it by hand
 * here would have re-stated product code and kept passing if the real handler
 * were deleted, so the handler was extracted to
 * `server/ws-terminal-session.ts` (same move TP-2 made for
 * `setupTelnetSSHHandler`) and this drives that.
 *
 * Both symbols are counted by effect rather than by `jest.spyOn` - SWC emits
 * module exports as non-configurable getters and spying on a cross-module
 * function throws (recorded on R2):
 *
 *   emitConnectBanner  -> its eight lines on the wire, the first exactly once
 *   runPreLoginConnect -> the graphics prompt, which only it reaches
 *
 * The path check is asserted too: a client connecting to a DIFFERENT path must
 * not be served by this server, or the endpoint would be answering upgrades
 * that belong to Socket.IO.
 */
import * as http from 'http';
import { WebSocket } from 'ws';
import { attachWSTerminalServer, WSTerminalConnection } from '../../src/server/ws-terminal-server';
import { buildWsTerminalConnectionHandler } from '../../src/server/ws-terminal-session';
import type { TransportSessionDeps } from '../../src/server/transport-session';

jest.setTimeout(60000);

const STEP_01_SENTINEL = 'A/R/P/P8/T/N';

const deps = (): TransportSessionDeps => ({
  io: {} as never,
  sessions: new Map(),
  nodeManager: { releaseSession: jest.fn(async () => undefined) },
  handleCommand: jest.fn(),
} as unknown as TransportSessionDeps);

describe('R13a - the /ws/terminal endpoint runs the pre-login', () => {
  let server: http.Server;
  let wss: { clients: Set<{ terminate: () => void }> };
  let port: number;
  /** Every raw socket the server accepted, so teardown can destroy them. */
  const sockets = new Set<{ destroy: () => void }>();

  beforeAll(async () => {
    server = http.createServer((_req, res) => { res.writeHead(404); res.end(); });
    server.on('connection', (sock) => {
      sockets.add(sock as never);
      sock.on('close', () => sockets.delete(sock as never));
    });
    // The PRODUCT'S handler, with index.ts's dependencies passed in.
    wss = attachWSTerminalServer(server, buildWsTerminalConnectionHandler({
      createSession: ((nodeId: number, init: Record<string, unknown>) => ({
        nodeId, socketId: `ws-${nodeId}`, tempData: {}, ...init,
      })) as never,
      setSession: () => undefined,
      transportDeps: deps(),
      hostname: 'localhost',
      port: 0,
    }));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    /*
     * `server.close()` waits for every live socket, and an upgraded WebSocket
     * holds one open indefinitely. Without this the hook runs to jest's 60s
     * limit and the SUITE fails while every test in it passed - a failure that
     * points at nothing, because the tests are all green.
     *
     * Terminating the ws clients is not enough on its own: the stray-path
     * client never completes an upgrade, so it is not in `wss.clients` at all,
     * and its raw socket is the one that keeps the server open. Hence the
     * socket set - every connection the server accepted, destroyed by hand.
     */
    for (const client of wss.clients) client.terminate();
    for (const sock of sockets) { try { sock.destroy(); } catch { /* already gone */ } }
    sockets.clear();
    (server as unknown as { closeAllConnections?: () => void }).closeAllConnections?.();
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, 2000);   // never hang the suite on teardown
      server.close(() => { clearTimeout(done); resolve(); });
    });
  });

  it('serves the connect banner and the graphics prompt to a real ws client', async () => {
    const client = new WebSocket(`ws://127.0.0.1:${port}/ws/terminal`);
    const chunks: string[] = [];

    try {
      const painted: string = await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(
            `never reached "${STEP_01_SENTINEL}" - got ${chunks.join('').length} bytes: ` +
            JSON.stringify(chunks.join('').slice(-200)))),
          20000);
        client.on('error', reject);
        client.on('message', (data: Buffer | string) => {
          chunks.push(typeof data === 'string' ? data : data.toString('latin1'));
          const all = chunks.join('');
          if (all.includes(STEP_01_SENTINEL)) { clearTimeout(timer); resolve(all); }
        });
      });

      // runPreLoginConnect ran: the graphics prompt is the end of its work,
      // and nothing else on this path produces it.
      expect(painted).toContain(STEP_01_SENTINEL);

      // emitConnectBanner ran: its own lines, and the connection line ONCE.
      // Before this fix a /ws/terminal caller saw none of them.
      expect(painted).toContain('You are connected to Node');
      expect(painted.split('You are connected to Node').length - 1).toBe(1);
      expect(painted).toMatch(/Connection occurred at/);
    } finally {
      client.close();
    }
  });

  it('leaves every other upgrade path alone, so Socket.IO keeps its own', async () => {
    // `attachWSTerminalServer` returns early for any path but /ws/terminal.
    // If it did not, it would abort Socket.IO's handshakes - which surfaced in
    // the browser as "Invalid frame header".
    const stray = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4`);
    const outcome = await new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve('no-answer'), 3000);
      stray.on('open', () => { clearTimeout(timer); resolve('opened'); });
      stray.on('error', () => { clearTimeout(timer); resolve('refused'); });
    });
    stray.close();
    // Never 'opened': this server must not answer that path.
    expect(outcome).not.toBe('opened');
  });
});
