/**
 * SP2-4 - the flusher, against a real http server standing in for the
 * achievements server. Each verdict in the table gets a scripted answer;
 * what is asserted is the outbox afterwards, and the notices.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import { flushOnce, FLUSH_BATCH, userIdForEmail } from '../../src/achievements/flusher';
import type { FlusherDeps } from '../../src/achievements/flusher';
import { enqueue, due, noticeCount, takeNotices, pendingCount } from '../../src/achievements/outbox.repository';
import type { EventIn } from '../../src/achievements/contract';

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

interface Scripted { status: number; body?: unknown; headers?: Record<string, string>; raw?: string }

let db: any;
let server: http.Server;
let port = 0;
let script: Scripted[] = [];
let requests: { auth: string | null; body: any }[] = [];
let logs: string[] = [];
let NOW = 1800000000000;

beforeAll(async () => {
  db = (await waitForTestDb()).db;
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      requests.push({ auth: req.headers.authorization ?? null, body: data ? JSON.parse(data) : null });
      const s = script.shift() ?? { status: 500, body: { error: 'internal_error' } };
      res.writeHead(s.status, { 'Content-Type': s.raw !== undefined ? 'text/html' : 'application/json', ...(s.headers ?? {}) });
      res.end(s.raw !== undefined ? s.raw : JSON.stringify(s.body ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
  db.prepare(`INSERT OR IGNORE INTO users (id, username, passwordhash, realname, email, seclevel) VALUES ('u-alice', 'alice', 'x', 'Alice', 'alice@example.com', 10)`).run();
  db.prepare(`INSERT OR IGNORE INTO users (id, username, passwordhash, realname, email, seclevel) VALUES ('u-bob', 'bob', 'x', 'Bob', 'Bob@Example.com', 10)`).run();
}, 30000);

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

beforeEach(() => {
  db.exec('DELETE FROM achievement_outbox; DELETE FROM achievement_pending_notices;');
  script = [];
  requests = [];
  logs = [];
  NOW = 1800000000000;
});

const deps = (over: Partial<FlusherDeps> = {}): FlusherDeps => ({
  rawDb: () => db,
  settings: () => ({ serverUrl: `http://127.0.0.1:${port}`, boardKey: 'uprough.secret', boardId: 'uprough', enabled: true }),
  fetch: (url, init) => fetch(url, init),
  now: () => NOW,
  log: (l) => logs.push(l),
  onUnlock: (rawDb, email, unlock, now) => {
    const { addUnlockNotice } = require('../../src/achievements/outbox.repository');
    const id = userIdForEmail(rawDb, email);
    if (id) addUnlockNotice(rawDb, id, unlock, Math.floor(now / 1000));
  },
  // The doors' own manifests are a suite of their own (door-catalog.test.ts);
  // here they would eat the scripted answer for the events request.
  publishDoorCatalogs: async () => ({ pushed: [], unchanged: [], refused: [] }),
  onNotLinked: (rawDb, email, now) => {
    const { addLinkNotice } = require('../../src/achievements/outbox.repository');
    const id = userIdForEmail(rawDb, email);
    if (id) addLinkNotice(rawDb, id, Math.floor(now / 1000));
  },
  ...over,
});

let seq = 0;
const put = (email = 'alice@example.com', type = 'msg.post'): string => {
  const ref = `uprough:R${++seq}`;
  const e: EventIn = { ref, email, type, at: new Date(NOW).toISOString() };
  enqueue(db, e, Math.floor(NOW / 1000) - 10);
  return ref;
};
const ok = (over: Partial<Record<string, unknown>> = {}) => ({ accepted: 1, duplicates: 0, rejected: [], notLinked: [], unlocks: [], progress: [], ...over });
const refsLeft = (): string[] => due(db, NOW / 1000 + 100000, 1000).map((r) => r.ref);

describe('the flusher', () => {
  it('a 200 clears the rows it sent and leaves the rest, with the board key on the request', async () => {
    const a = put(); const b = put(); const other = put('bob@example.com');
    script = [{ status: 200, body: ok({ accepted: 2 }) }];

    const out = await flushOnce(deps());

    expect(out).toMatchObject({ sent: 2, accepted: 2, status: 200 });
    expect(requests[0].auth).toBe('Board uprough.secret');
    expect(requests[0].body.events.map((e: EventIn) => e.ref)).toEqual([a, b]);
    // One address per batch: bob waits for the next tick.
    expect(refsLeft()).toEqual([other]);
  });

  it('a rejected ref is deleted and never retried; its address gets one link notice', async () => {
    const a = put(); const b = put();
    script = [{ status: 200, body: ok({ accepted: 1, rejected: [{ ref: b, reason: 'not_linked' }], notLinked: ['alice@example.com'] }) }];

    await flushOnce(deps());

    expect(refsLeft()).toEqual([]);
    expect(noticeCount(db, 'u-alice')).toBe(1);
    expect(takeNotices(db, 'u-alice')[0].kind).toBe('link');
    expect(a).not.toBe(b);
  });

  it('a 403 not_linked deletes the batch and arms the link notice', async () => {
    put(); put();
    script = [{ status: 403, body: { error: 'not_linked' } }];

    const out = await flushOnce(deps());

    expect(out.status).toBe(403);
    expect(pendingCount(db)).toBe(0);
    expect(noticeCount(db, 'u-alice')).toBe(1);
    expect(logs.some((l) => l.startsWith('[INFO]') && l.includes('unlinked'))).toBe(true);
  });

  it('a 500 keeps the rows and backs off; the next window sends them again', async () => {
    const a = put();
    script = [{ status: 500, body: { error: 'internal_error' } }, { status: 200, body: ok() }];

    await flushOnce(deps());
    expect(refsLeft()).toEqual([a]);
    expect(due(db, NOW / 1000, 10)).toEqual([]);            // not due yet
    expect(due(db, NOW / 1000 + 5, 10).map((r) => r.ref)).toEqual([a]);
    expect(logs[0]).toMatch(/^\[WARN\] achievements: 1 events kept, HTTP 500/);

    NOW += 5000;
    await flushOnce(deps());
    expect(refsLeft()).toEqual([]);
    expect(requests).toHaveLength(2);
  });

  it('a 429 waits exactly Retry-After, and a non-JSON 200 is a server fault', async () => {
    const a = put();
    script = [{ status: 429, body: { error: 'rate_limited', retryAfter: 42 }, headers: { 'Retry-After': '42' } }, { status: 200, raw: '<!doctype html><div id="root"></div>' }];

    await flushOnce(deps());
    expect(due(db, NOW / 1000 + 41, 10)).toEqual([]);
    expect(due(db, NOW / 1000 + 42, 10).map((r) => r.ref)).toEqual([a]);

    NOW += 42000;
    const out = await flushOnce(deps());
    expect(out.status).toBe(502);
    expect(refsLeft()).toEqual([a]);
    expect(logs[0]).toContain('the surface is off');
  });

  it('an unlock in the response becomes a notice for that player', async () => {
    put('Bob@Example.com');
    const unlock = { id: 'msg.post.1', name: 'First Words', tier: 'bronze', points: 5, hidden: false, rarityPctTenths: 1000, at: '2026-09-07T10:00:00Z' };
    script = [{ status: 200, body: ok({ unlocks: [unlock] }) }];

    const out = await flushOnce(deps());

    expect(out.unlocks).toBe(1);
    const notices = takeNotices(db, 'u-bob');
    expect(notices).toHaveLength(1);
    expect(notices[0].unlock).toEqual(unlock);
  });

  it('a duplicate ref is accepted quietly, and a 401 drops the batch with one ERROR', async () => {
    put();
    script = [{ status: 200, body: ok({ accepted: 0, duplicates: 1 }) }];
    const out = await flushOnce(deps());
    expect(out.duplicates).toBe(1);
    expect(logs).toEqual([]);
    expect(pendingCount(db)).toBe(0);

    put();
    script = [{ status: 401, body: { error: 'unauthenticated' } }];
    await flushOnce(deps());
    expect(pendingCount(db)).toBe(0);
    expect(logs[0]).toMatch(/^\[ERROR\] achievements: server refused 1 events with 401 unauthenticated/);
  });

  it('the flusher never sends more than a hundred events in one request, and no network keeps everything', async () => {
    for (let i = 0; i < 130; i += 1) put();
    script = [{ status: 200, body: ok({ accepted: 100 }) }];
    const out = await flushOnce(deps());
    expect(out.sent).toBe(FLUSH_BATCH);
    expect(requests[0].body.events).toHaveLength(100);
    expect(pendingCount(db)).toBe(30);

    const dead = await flushOnce(deps({ settings: () => ({ serverUrl: 'http://127.0.0.1:1', boardKey: 'uprough.k', boardId: 'uprough', enabled: true }) }));
    expect(dead.status).toBe(0);
    expect(pendingCount(db)).toBe(30);
    expect(logs[0]).toContain('kept');
    // And nothing at all leaves the box while achievements are off.
    const off = await flushOnce(deps({ settings: () => ({ serverUrl: '', boardKey: '', boardId: '', enabled: false }) }));
    expect(off.sent).toBe(0);
  });
});
