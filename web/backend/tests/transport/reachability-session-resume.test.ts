/**
 * S13 - THE ONE REACHABILITY TEST for session persistence.
 *
 * A real socket.io client logs in, sits more than two minutes, drops its
 * transport, comes back thirty seconds later and is restored on the same node
 * with its door still running - all through the production web entry point,
 * `acceptWebConnection` (server/web-connection.ts), over a real `http.Server`
 * + socket.io `Server` and a real `socket.io-client` on an ephemeral port.
 * Same harness shape as reachability-r3-socketio.test.ts.
 *
 * The client builds its options with the terminal's own `connectOptions`
 * (packages/terminal/src/utils/session-resume.ts), so the token is offered the
 * way the browser offers it: through the `auth` callback, evaluated afresh on
 * every (re)connect, as `handshake.auth.resume`.
 *
 * The login is the real `login` event with a token (auth-socket-handlers ->
 * runPostAuthLogin); only `db` is wrapped in a Proxy (verifyAccessToken,
 * getUserById, token minting), so no account row is needed, and `src/index.ts`
 * is mocked away because it starts servers on import.
 *
 * DATABASE: the import chain (web-connection -> socket-handlers ->
 * command.handler -> login-connect.service -> SamiLogService) creates the
 * board's `db` singleton at import time, BEFORE tests/setup.ts's beforeAll
 * points DATABASE_DIR at its scratch board. Left alone it would open
 * process.cwd()/data/amiexpress.db, the developer's real database. The
 * `src/database` mock factory below runs first in that chain, so it points
 * DATABASE_DIR at a fresh mkdtemp directory before the actual module is
 * loaded; afterAll closes the db and removes the directory.
 *
 * Time: "sits > 2 min" and "returns after 30 s" move `Date.now` (the old
 * gates compared `Date.now()` with `savedAt`); the test itself takes seconds.
 *
 * SENTINEL: `frames`, incremented inside the door stand-in's loop, which
 * writes through the real `createBBSApi(link, session)`. It must keep
 * counting while the caller is away (the door RAN while parked), and a frame
 * written after the resume must reach the NEW socket.
 *
 * The resume token is a credential: nothing here prints it.
 */
// No SKIP_DB_INIT: the logon pipeline reads the message bases, so beforeAll gives the temp database a schema.

// Numeric, as the board's SQL ids are: the resume looks the account up by Number(userId).
const S13_USER_ID = '9131';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/database', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const path = require('path') as typeof import('path');
  /* eslint-enable @typescript-eslint/no-require-imports */
  // Before requireActual: the singleton reads DATABASE_DIR when it is first touched.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aew-s13-db-'));
  process.env.DATABASE_DIR = dir;
  process.env.DATABASE_FILE = 's13.db';
  process.env.S13_DB_DIR = dir;
  const actual = jest.requireActual('../../src/database') as { db: object };
  const when = new Date(Date.now() - 86400 * 1000);
  const user = {
    id: 9131, username: 'S13Caller', slotNumber: 931, passwordHash: 'hash',
    realname: 'Resume Caller', location: 'Here', phone: '', email: '',
    secLevel: 20, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
    ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
    chatLimit: 600, chatUsed: 0, lastLogin: when, firstLogin: when,
    calls: 3, callsToday: 0, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 23, computer: '', screenType: '', protocol: '/X Zmodem',
    editor: 'Prompt', zoomType: 'QWK', availableForChat: true, quietNode: false,
    autoRejoin: 1, confAccess: 'XXXXXXXXXX', areaName: '', uuCP: false,
    topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, userFlags: 0, baud: 0,
    created: when, updated: when,
  };
  const overrides: Record<string, unknown> = {
    getUserById: async (id: string) => (String(id) === String(user.id) ? { ...user } : null),
    verifyAccessToken: async () => ({ userId: user.id, username: user.username, secLevel: 20 }),
    generateAccessToken: async () => 'access-s13',
    generateRefreshToken: async () => 'refresh-s13',
  };
  return {
    ...actual,
    s13User: user,
    db: new Proxy(actual.db, {
      get(target: object, prop: string | symbol) {
        if (typeof prop === 'string' && prop in overrides) return overrides[prop];
        return (target as Record<string | symbol, unknown>)[prop];
      },
    }),
  };
});
// The session log keeps an un-unref'd retention timer per ended session.
jest.mock('../../src/server/session-observers', () => ({
  ...jest.requireActual('../../src/server/session-observers'),
  startObserving: jest.fn(), stopObserving: jest.fn(),
}));

import * as http from 'http';
import { Server as SocketIOServer, type Socket as ServerSocket } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { acceptWebConnection, type WebConnectionDeps } from '../../src/server/web-connection';
import { getSession, sessions } from '../../src/server/session-manager';
import { BBSState } from '../../src/constants/bbs-states';
import { createBBSApi } from '../../src/doors/BBSApi';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { userFileManager } from '../../src/services/UserFileManager';
import { db } from '../../src/database';
import { disarmIdleTimeout } from '../../src/services/idle-timeout.service';
import { startObserving, stopObserving } from '../../src/server/session-observers';
import { ANSI_GRAPHICS_PROMPT } from '../../src/services/login-connect.service';
import * as fs from 'fs';
import * as path from 'path';
import { connectOptions, type ResumeOffer } from '../../../../packages/terminal/src/utils/session-resume';

jest.setTimeout(60000);

const S13_NODE = 9;

interface Restored { nodeId?: number; resumeToken?: string }
interface LoginSuccess { resumeToken?: string }
interface LinkView { parked: boolean; ended: boolean; end: (reason: string) => void }
interface SessionView {
  nodeId: number; state: string; user?: { id: string | number };
  webLink?: LinkView; bbsApi?: unknown;
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r));
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function until(what: string, ok: () => boolean, ms = 2000): Promise<void> {
  const end = performance.now() + ms;
  while (!ok()) {
    if (performance.now() > end) throw new Error(`timed out waiting for ${what}`);
    await tick();
    await wait(5);
  }
}

function once<T>(client: ClientSocket, event: string, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${event} within ${ms} ms`)), ms);
    client.once(event, (data: T) => { clearTimeout(t); resolve(data); });
  });
}

describe('S13 - a real socket.io caller is restored to the same node through acceptWebConnection', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;
  const tcp = new Set<{ destroy: () => void }>();
  const realNow = Date.now.bind(Date);
  let offset = 0;

  beforeAll(async () => {
    const { s13User } = jest.requireMock('../../src/database') as { s13User: { slotNumber: number } };
    // The singleton opened the temp file the database mock chose (see header); give it a schema.
    const dbDir = process.env.S13_DB_DIR as string;
    expect(fs.existsSync(path.join(dbDir, 's13.db'))).toBe(true);
    await db.init();
    userFileManager.writeUserFiles(s13User as never, s13User.slotNumber);

    server = http.createServer();
    server.on('connection', (s) => { tcp.add(s); s.on('close', () => tcp.delete(s)); });
    io = new SocketIOServer(server, { cors: { origin: '*' } });
    const deps: WebConnectionDeps = {
      nodeManager: { assignSessionToNode: async () => ({ nodeId: S13_NODE }) } as never,
      chatState: { sessions: [], messages: [] } as never,
    };
    io.on('connection', (raw: ServerSocket) => { void acceptWebConnection(io, raw, deps); });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as { port: number }).port;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + offset);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    for (const s of sessions.values()) {
      const v = s as unknown as SessionView;
      disarmIdleTimeout(s as never);
      if (v.webLink && !v.webLink.ended) v.webLink.end('server namespace disconnect');
    }
    await wait(100);
    io.close();
    for (const s of tcp) { try { s.destroy(); } catch { /* gone */ } }
    await new Promise<void>((resolve) => {
      const done = setTimeout(resolve, 2000);
      server.close(() => { clearTimeout(done); resolve(); });
    });
    try { await db.close(); } catch { /* already closed */ }
    const dbDir = process.env.S13_DB_DIR;
    if (dbDir) fs.rmSync(dbDir, { recursive: true, force: true });
  });

  it('logs in, sits 150 s, drops, comes back 30 s later: same node, same session, the door ran throughout', async () => {
    const logLogoff = jest.spyOn(callersLogManager, 'logLogoff');
    let offered: string | undefined;
    const client: ClientSocket = ioClient(`http://127.0.0.1:${port}`, {
      ...connectOptions(true, (): ResumeOffer | undefined => (offered ? { resume: offered } : undefined)),
      forceNew: true,
    });
    const output: string[] = [];
    client.on('ansi-output', (d: unknown) => { output.push(String(d)); });
    let door: NodeJS.Timeout | undefined;

    try {
      // 1. Connect, let the pre-login sequence finish, log in with a token.
      await once<void>(client, 'connect', 15000);
      const firstId = client.id as string;
      // runPreLoginConnect sends the graphics prompt after the banner's delay.
      await until('the pre-login graphics prompt', () => {
        const s = getSession(firstId) as unknown as SessionView | undefined;
        return s !== undefined && output.join('').includes(ANSI_GRAPHICS_PROMPT);
      }, 15000);
      const loggedIn = once<LoginSuccess>(client, 'login-success', 15000);
      client.emit('login', { token: 'jwt-s13' });
      const login = await loggedIn;
      expect(typeof login.resumeToken).toBe('string');
      offered = login.resumeToken;
      const session = getSession(firstId) as unknown as SessionView;
      // The logon screens pause for RETURN; the caller answers them as a person
      // would: only once the board has answered the previous key (new output),
      // and never once LOGGEDON, so no stray RETURN reaches the menu.
      let seenAtEnter = -1;
      const enter = setInterval(() => {
        if (session.state === BBSState.LOGGEDON || output.length === seenAtEnter) return;
        seenAtEnter = output.length;
        client.emit('command', '\r');
      }, 250);
      try {
        await until(`LOGGEDON (state ${session.state})`, () => session.state === BBSState.LOGGEDON, 20000);
      } finally { clearInterval(enter); }
      expect(session.nodeId).toBe(S13_NODE);
      expect(startObserving).toHaveBeenCalledWith(firstId);
      (startObserving as jest.Mock).mockClear();
      (stopObserving as jest.Mock).mockClear();

      // 2. A TypeScript door stand-in on the session's link, through the real BBSApi.
      const link = session.webLink as LinkView;
      const api = createBBSApi(link as never, session as never);
      let frames = 0;
      door = setInterval(() => { frames += 1; api.write(`S13FRAME ${frames}\r\n`); }, 100);
      await until('the first door frames', () => frames >= 2, 2000);

      // 3. Sit more than two minutes.
      offset += 150_000;

      // 4. Drop the TRANSPORT (not a hang-up). The client's own reconnection
      // is held so the 30 s gap can be measured first.
      client.io.reconnection(false);
      client.io.engine.close();
      await until('the server-side link to park', () => link.parked === true, 2000);
      const framesAtPark = frames;

      // 5. Thirty seconds away; the door keeps running.
      offset += 30_000;
      await wait(400);
      expect(frames).toBeGreaterThan(framesAtPark);
      const framesBeforeResume = frames;

      // 6. Come back: the client reconnects and its auth callback offers the token.
      // A refusal is the board saying why it would not resume; it fails the test with that reason.
      const refused = new Promise<never>((_, reject) => {
        client.once('session-restore-failed', (r: { reason?: unknown }) => {
          reject(new Error(`resume refused: ${String(r?.reason)}`));
        });
      });
      const restoredP = Promise.race([once<Restored>(client, 'session-restored', 10000), refused]);
      client.io.reconnection(true);
      client.connect();
      const restored = await restoredP;

      // 7. The same node, the same session object, no logoff, one session for the user.
      expect(restored.nodeId).toBe(S13_NODE);
      expect(client.id).not.toBe(firstId);
      expect(getSession(client.id as string)).toBe(session as never);
      expect(link.parked).toBe(false);
      // The session log is re-keyed from the old socket id to the new one (session-parking).
      expect(stopObserving).toHaveBeenCalledWith(firstId);
      expect(startObserving).toHaveBeenCalledWith(client.id);
      expect(startObserving).not.toHaveBeenCalledWith(firstId);
      expect(logLogoff).not.toHaveBeenCalled();
      const mine = [...sessions.values()].filter(
        (s) => String((s as unknown as SessionView).user?.id) === S13_USER_ID);
      expect(mine).toHaveLength(1);
      expect(mine[0]).toBe(session as never);
      // The token rotated on the resume.
      expect(typeof restored.resumeToken).toBe('string');
      expect(restored.resumeToken).not.toBe(login.resumeToken);
      // The sentinel: the door ran across the whole gap...
      expect(framesBeforeResume).toBeGreaterThan(framesAtPark);
      // ...and a frame written AFTER the resume reaches the NEW socket.
      const after = frames + 1;
      await until('a post-resume frame at the client',
        () => output.some((o) => o.includes(`S13FRAME ${after}\r\n`) || o.includes(`S13FRAME ${after + 1}\r\n`)), 3000);
    } finally {
      if (door) clearInterval(door);
      client.io.reconnection(false);
      client.close();
    }
  });
});
