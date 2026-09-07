/**
 * SP3 (backend half) - what the ACHIEVE door may ask, through the board.
 * Against a stub http server: the key goes out, the door never sees it, and
 * every refusal comes back as a code, never a throw.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { doorAchievementsApi } from '../../src/achievements/door-api';
import { createBBSApi } from '../../src/doors/BBSApi';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

let db: any;
let server: http.Server;
let port = 0;
let requests: { method: string; url: string; auth: string | null; body: unknown }[] = [];
let answer: (req: { method: string; url: string }) => { status: number; body?: unknown; raw?: string } = () => ({ status: 200, body: {} });

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      requests.push({ method: req.method ?? '', url: req.url ?? '', auth: req.headers.authorization ?? null, body: data ? JSON.parse(data) : null });
      const a = answer({ method: req.method ?? '', url: req.url ?? '' });
      res.writeHead(a.status, { 'Content-Type': a.raw !== undefined ? 'text/html' : 'application/json' });
      res.end(a.raw !== undefined ? a.raw : JSON.stringify(a.body ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
}, 30000);

afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => { requests = []; });

const settings = () => ({ serverUrl: `http://127.0.0.1:${port}`, boardKey: 'uprough.secret', boardId: 'uprough', enabled: true });

describe('the door-facing API', () => {
  it('carries the board key on every call and maps each endpoint', async () => {
    answer = ({ url }) => (url.startsWith('/achievements/v1/players/') ? { status: 200, body: { handle: 'Spot', verified: true, private: false, points: 5, linkedBoards: ['uprough'], unlocks: [], progress: [] } } : { status: 200, body: { accepted: 0 } });
    const api = doorAchievementsApi(settings, (u, i) => fetch(u, i));
    expect(api.enabled()).toBe(true);
    await api.register('a@example.com', 'Spot');
    await api.verify('a@example.com', 'ABCDEF');
    await api.link('a@example.com', 'ABCDEF');
    await api.unlink('a@example.com');
    await api.rotate('a@example.com', 'ABCDEF');
    const profile = await api.profile('A@Example.com');
    await api.setPrivate('a@example.com', true);
    await api.catalog();
    await api.leaderboard('board', 'season', 20);
    await api.leaderboard('global', 'all');
    expect(profile.status).toBe(200);
    expect(profile.body?.handle).toBe('Spot');
    expect(requests.every((r) => r.auth === 'Board uprough.secret')).toBe(true);
    expect(requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'POST /achievements/v1/players', 'POST /achievements/v1/players/verify', 'POST /achievements/v1/links', 'DELETE /achievements/v1/links',
      'POST /achievements/v1/links/rotate', 'GET /achievements/v1/players/A%40Example.com', 'PATCH /achievements/v1/players/a%40example.com',
      'GET /achievements/v1/catalog', 'GET /achievements/v1/leaderboard?scope=board%3Auprough&period=season&limit=20',
      'GET /achievements/v1/leaderboard?scope=global&period=all&limit=50',
    ]);
    expect(requests[6].body).toEqual({ private: true });
  });

  it('a refusal comes back as its code, an unreachable server as status 0, and a board without a server as not_configured', async () => {
    answer = () => ({ status: 403, body: { error: 'not_linked', detail: 'this board is not linked to that address' } });
    const api = doorAchievementsApi(settings, (u, i) => fetch(u, i));
    const refused = await api.profile('a@example.com');
    expect(refused).toEqual({ status: 403, body: null, error: 'not_linked', detail: 'this board is not linked to that address' });
    answer = () => ({ status: 200, raw: '<!doctype html>' });
    expect((await api.catalog()).error).toBe('not_json');
    const dead = doorAchievementsApi(() => ({ ...settings(), serverUrl: 'http://127.0.0.1:1' }), (u, i) => fetch(u, i));
    expect((await dead.catalog()).status).toBe(0);
    const off = doorAchievementsApi(() => ({ serverUrl: '', boardKey: '', boardId: '', enabled: false }));
    expect(off.enabled()).toBe(false);
    expect((await off.profile('a@example.com')).error).toBe('not_configured');
  });

  it('setUserEmail stores a real address on the user record and the live session, and refuses anything else', async () => {
    db.prepare(`INSERT OR IGNORE INTO users (id, username, passwordhash, realname) VALUES ('u-mail', 'mailer', 'x', 'M')`).run();
    const session: any = { user: { id: 'u-mail', username: 'mailer' }, nodeId: 1 };
    const api = createBBSApi({ id: 's', emit: () => {}, on: () => {} } as any, session);
    expect(await api.setUserEmail('not an address')).toBe(false);
    expect(await api.setUserEmail('')).toBe(false);
    expect(session.user.email).toBeUndefined();
    expect(await api.setUserEmail('  Mailer@Example.com ')).toBe(true);
    expect(session.user.email).toBe('Mailer@Example.com');
    expect(db.prepare(`SELECT email FROM users WHERE id = 'u-mail'`).get()).toEqual({ email: 'Mailer@Example.com' });
    expect(typeof api.achievements().enabled).toBe('function');
  });
});
