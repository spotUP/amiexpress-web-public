/**
 * SP3 - a door's own achievements, published from its manifest.
 *
 * The manifests read here are the REAL ones under Doors/, so a door that
 * declares an id outside its own namespace fails this suite rather than a
 * 400 on a live board.
 */
import * as http from 'http';
import type { AddressInfo } from 'net';
import {
  doorManifests, doorsRoot, manifestDigest, manifestOf, registerDoorCatalogs, _resetDoorCatalogCacheForTests,
} from '../../src/achievements/door-catalog';

let server: http.Server;
let port = 0;
let requests: { url: string; body: any }[] = [];
let reply: { status: number; body?: unknown } = { status: 200, body: { added: 1, unchanged: 0, total: 1 } };
let logs: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let data = '';
    req.on('data', (c) => { data += c; });
    req.on('end', () => {
      requests.push({ url: req.url ?? '', body: data ? JSON.parse(data) : null });
      res.writeHead(reply.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(reply.body ?? {}));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});
afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });
beforeEach(() => { requests = []; logs = []; _resetDoorCatalogCacheForTests(); reply = { status: 200, body: { added: 1, unchanged: 0, total: 1 } }; });

const settings = () => ({ serverUrl: `http://127.0.0.1:${port}`, boardKey: 'uprough.secret', boardId: 'uprough', enabled: true });
const manifests = () => [{ command: 'gmaster', dir: '/x', achievements: [{ id: 'door.gmaster.first_game', name: 'First Drop', description: 'd', tier: 'bronze', points: 5, rule: { op: 'first', type: 'door.gmaster.game' } }] }];

describe('door achievement manifests', () => {
  it('every real door manifest declares ids inside its own namespace, with a known operator', () => {
    const found = doorManifests(doorsRoot());
    expect(found.length).toBeGreaterThan(0);
    const OPS = ['count', 'first', 'sum', 'distinct', 'streak', 'within', 'all'];
    for (const m of found) {
      expect(m.command).toMatch(/^[a-z0-9][a-z0-9-]{1,31}$/);
      for (const a of m.achievements) {
        expect(a.id).toMatch(new RegExp(`^door\\.${m.command}\\.[a-z0-9_]+$`));
        expect(['bronze', 'silver', 'gold', 'platinum']).toContain(a.tier);
        expect(a.points).toBeGreaterThan(0);
        expect(a.points).toBeLessThanOrEqual(100);
        expect(a.name.length).toBeGreaterThan(0);
        expect(a.description.length).toBeGreaterThan(0);
        const rule = a.rule as { op: string; type?: string };
        expect(OPS).toContain(rule.op);
        if (rule.op !== 'all') expect(String(rule.type)).toMatch(new RegExp(`^door\\.${m.command}\\.`));
      }
    }
    // GRANDMASTER is the first door to declare any (SP3).
    expect(found.map((m) => m.command)).toContain('gmaster');
  });

  it('a manifest with no achievements is not a manifest here', () => {
    const read = (): string => JSON.stringify({ bbsCommand: 'THEME' });
    expect(manifestOf('/x', read)).toBeNull();
    expect(manifestOf('/x', () => 'not json')).toBeNull();
    expect(manifestOf('/x', () => JSON.stringify({ amiexpress: { command: 'x', achievements: [] } }))).toBeNull();
    // Either key, and the command may come from bbsCommand.
    const viaAmiexpress = manifestOf('/x', () => JSON.stringify({ bbsCommand: 'ACHIEVE', amiexpress: { achievements: [{ id: 'door.achieve.x' }] } }));
    expect(viaAmiexpress?.command).toBe('achieve');
  });

  it('publishes once, then not again; a refusal is said once and never retried', async () => {
    const first = await registerDoorCatalogs(settings(), manifests(), (u, i) => fetch(u, i), (l) => logs.push(l));
    expect(first.pushed).toEqual(['gmaster']);
    expect(requests[0].url).toBe('/achievements/v1/catalog/doors/gmaster');
    expect(requests[0].body.digest).toBe(manifestDigest(manifests()[0].achievements));
    expect(logs[0]).toContain('gmaster published 1');

    const second = await registerDoorCatalogs(settings(), manifests(), (u, i) => fetch(u, i), (l) => logs.push(l));
    expect(second.unchanged).toEqual(['gmaster']);
    expect(requests).toHaveLength(1);

    _resetDoorCatalogCacheForTests();
    reply = { status: 409, body: { error: 'definition_changed', detail: 'door.gmaster.first_game is published with a different definition' } };
    const refused = await registerDoorCatalogs(settings(), manifests(), (u, i) => fetch(u, i), (l) => logs.push(l));
    expect(refused.refused[0].error).toBe('definition_changed');
    expect(logs.pop()).toContain('were refused (definition_changed');
    const again = await registerDoorCatalogs(settings(), manifests(), (u, i) => fetch(u, i), (l) => logs.push(l));
    expect(again.unchanged).toEqual(['gmaster']);
  });

  it('a server that is down is tried again next time, and an unconfigured board pushes nothing', async () => {
    const dead = { ...settings(), serverUrl: 'http://127.0.0.1:1' };
    const out = await registerDoorCatalogs(dead, manifests(), (u, i) => fetch(u, i), (l) => logs.push(l));
    expect(out.pushed).toEqual([]);
    expect(out.refused).toHaveLength(1);
    const retry = await registerDoorCatalogs(settings(), manifests(), (u, i) => fetch(u, i), (l) => logs.push(l));
    expect(retry.pushed).toEqual(['gmaster']);

    const off = await registerDoorCatalogs({ serverUrl: '', boardKey: '', boardId: '', enabled: false }, manifests(), (u, i) => fetch(u, i));
    expect(off).toEqual({ pushed: [], unchanged: [], refused: [] });
  });
});
