/**
 * A token minted before the sysop deleted or locked an account stops working.
 *
 * The socket.io handshake (server/socket-auth.ts, `io.use(authenticateSocket)`
 * in index.ts) verified the JWT and looked the account up - and never asked
 * the board's account gates. A token handed out at a good logon kept opening
 * sessions for hours after the sysop DELETED the account (slotNumber 0 on the
 * record, express.e:21365), LOCKED it (user.misc accountLocked,
 * express.e:29775) or set it to level 0 (express.e:29768). The admin API's
 * bearer check (`db.verifyAccessToken`) had the same gap.
 *
 * Driven over a real socket.io server and client with a real signed token,
 * against a real user.data / user.misc on this run's temp board. Only the
 * SQL row lookup is stubbed.
 */
process.env.SKIP_DB_INIT = '1';

import * as http from 'http';
import * as jwt from 'jsonwebtoken';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { authenticateSocket } from '../../src/server/socket-auth';
import { db, Database } from '../../src/database';
import { jwtSecret } from '../../src/utils/jwt-secrets';
import { userFileManager } from '../../src/services/UserFileManager';
import { userDatabaseManager } from '../../src/services/UserDatabaseManager';

jest.setTimeout(30000);

// The SQL mirror's row lookup is the one stub; everything after it is real.
const rows = new Map<string, any>();
jest.spyOn(Database.prototype, 'getUserById').mockImplementation(
  async (id: string) => rows.get(String(id)) ?? null);

function row(username: string, slotNumber: number): any {
  const when = new Date(Date.now() - 86400 * 1000);
  return {
    id: `tok-${username}`, username, slotNumber, passwordHash: 'hash',
    realname: 'Token Caller', location: 'Here', phone: '', email: '',
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
}

/** An account on disk and in the mirror, and the token its logon was given. */
function account(username: string, slot: number, extra: Record<string, unknown> = {}): string {
  const r = row(username, slot);
  rows.set(r.id, r);
  userFileManager.writeUserFiles({ ...r, ...extra } as any, slot);
  return jwt.sign({ userId: r.id, username, secLevel: 20 }, jwtSecret(), { expiresIn: '1h' });
}

describe('a token whose account was deleted or locked', () => {
  let server: http.Server;
  let io: SocketIOServer;
  let port: number;
  /** The sentinel: sockets the handshake let through. */
  const admitted: string[] = [];
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    server = http.createServer();
    io = new SocketIOServer(server);
    io.use(authenticateSocket);
    io.on('connection', (socket) => {
      admitted.push(String((socket as any).session?.user?.username));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const c of clients) c.close();
    io.close();
    await new Promise<void>((r) => server.close(() => r()));
  });

  /** Connect with a token: 'connected', or the handshake's refusal. */
  function connect(token: string): Promise<string> {
    return new Promise((resolve) => {
      const client = ioClient(`http://127.0.0.1:${port}`, {
        auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true,
      });
      clients.push(client);
      client.on('connect', () => resolve('connected'));
      client.on('connect_error', (err) => resolve(`refused: ${err.message}`));
    });
  }

  it('a good account connects (the sentinel: the handshake admitted it)', async () => {
    const token = account('tokgood', 921);
    expect(await connect(token)).toBe('connected');
    expect(admitted).toContain('tokgood');
  });

  it('refuses the token of an account deleted after the token was minted', async () => {
    const token = account('tokdeleted', 922);
    userFileManager.writeUserFiles({ ...row('tokdeleted', 922), accountDeleted: true } as any, 922);

    expect(await connect(token)).toMatch(/^refused/);
    expect(admitted).not.toContain('tokdeleted');
  });

  it('refuses the token of an account locked by password failures', async () => {
    const token = account('toklocked', 923);
    userDatabaseManager.recordPasswordFailure(923, 1);

    expect(await connect(token)).toMatch(/^refused/);
    expect(admitted).not.toContain('toklocked');
  });

  it('refuses the same tokens at the admin API, and gives the record\'s level, not the token\'s', async () => {
    const good = account('tokapi', 924, { secLevel: 30 });
    expect(await db.verifyAccessToken(good)).toEqual({ userId: 'tok-tokapi', username: 'tokapi', secLevel: 30 });

    const level0 = account('toklevel0', 925, { secLevel: 0 });
    await expect(db.verifyAccessToken(level0)).rejects.toThrow('Invalid or expired access token');
  });
});
