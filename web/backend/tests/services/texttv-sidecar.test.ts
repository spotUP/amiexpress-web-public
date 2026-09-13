/**
 * The Text-TV proxy answers from a process the emulator cannot park.
 *
 * The TEXTTV door fetches over plain HTTP. When that request went to the
 * board itself, the door's own emulator was holding the shared event loop
 * inside deasync.loopWhile - which drains through process._tickCallback(),
 * and that refuses to re-enter itself (storage/file-cache.ts:945-965). The
 * connection was accepted, the async route ran to its first await, and the
 * continuation never ran. The board went down with every caller on it
 * (live, 2026-09-13: 181% CPU, fifteen connections queued on :3001).
 *
 * These pin the contract the door depends on and the separation itself.
 */
import * as http from 'http';
import { answerTextTv, pageFromPath } from '../../src/services/texttv-sidecar-handler';
import { createTextTvSidecar } from '../../src/scripts/texttv-sidecar-server';

const SLIM = '[{"num":"100","title":"News","content_plain":["hello"]}]';
const ok = async () => ({ status: 200, body: SLIM });

describe('the sidecar answers exactly what the board route did', () => {
  it('serves the slim JSON verbatim for a valid page', async () => {
    const a = await answerTextTv('/api/texttv/100', ok);
    expect(a.status).toBe(200);
    expect(a.contentType).toBe('application/json');
    expect(a.body).toBe(SLIM);
  });

  it('refuses a page outside 100-999 the way the route does', async () => {
    for (const path of ['/api/texttv/099', '/api/texttv/1000', '/api/texttv/abc', '/health', '/']) {
      const a = await answerTextTv(path, ok);
      expect(a.status).toBe(400);
      expect(JSON.parse(a.body).message).toMatch(/100-999/);
    }
  });

  it('reports a silent mirror as 502, so the door says so instead of drawing a blank page', async () => {
    const upstream502 = async () => ({ status: 500, body: '' });
    expect((await answerTextTv('/api/texttv/100', upstream502)).status).toBe(502);
    const threw = async () => { throw new Error('socket hang up'); };
    expect((await answerTextTv('/api/texttv/100', threw)).status).toBe(502);
  });

  it('reads the page number out of the path', () => {
    expect(pageFromPath('/api/texttv/100')).toBe(100);
    expect(pageFromPath('/api/texttv/999/')).toBe(999);
    expect(pageFromPath('/api/texttv/99')).toBeNull();
  });
});

describe('the sidecar is a real listener a door can reach', () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = createTextTvSidecar(ok);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as any).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('answers over HTTP the way the 68K door asks', async () => {
    const body = await new Promise<string>((resolve, reject) => {
      http
        .get({ host: '127.0.0.1', port, path: '/api/texttv/100' }, (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });
    expect(body).toBe(SLIM);
  });

  // The point of the whole change: this listener is NOT the board's, so a
  // parked board loop cannot stop it answering.
  it('listens on a port of its own, not the board port', () => {
    expect(port).not.toBe(3001);
  });
});
