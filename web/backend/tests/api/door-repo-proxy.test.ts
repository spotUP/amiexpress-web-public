import express from 'express';
import request from 'supertest';
import * as http from 'http';
import type { AddressInfo } from 'net';
import type { Server } from 'http';

describe('door-repo proxy', () => {
  let upstream: Server;
  let upstreamUrl: string;
  let seen: { method: string; url: string; headers: Record<string, unknown> }[] = [];

  beforeAll((done) => {
    const app = express();
    app.use((req, res) => {
      seen.push({ method: req.method, url: req.url, headers: req.headers });
      if (req.url.startsWith('/api/door-repo/health')) {
        res.set('X-Door-Repo-Revision', 'c3300-t1');
        res.json({ status: 'ok', revision: 'c3300-t1', doors: 3300 });
        return;
      }
      if (req.url.startsWith('/api/door-repo/list.txt')) {
        if (req.headers['if-none-match'] === '"c3300-t1"') { res.status(304).end(); return; }
        res.set('Content-Type', 'text/plain; charset=ISO-8859-1');
        res.set('X-Door-Repo-Revision', 'c3300-t1');
        res.send(Buffer.from('DOORREPO|1|c3300-t1|1\r\n', 'latin1'));
        return;
      }
      if (req.url.startsWith('/api/door-repo/archive/ACC-V103.LHA')) {
        res.set('X-Archive-MD5', 'deadbeef');
        res.set('Content-Type', 'application/octet-stream');
        res.send(Buffer.from([0x00, 0xa1, 0xff]));
        return;
      }
      if (req.url.startsWith('/api/door-repo/manifest')) {
        // Matches the REAL door server's actual freshness logic
        // (amiexpress-doorserver/src/routes.ts) -- Express's req.fresh, not
        // a bare string compare. The bare-compare mock above (list.txt) let
        // a real production bug (proxy's fetch() call auto-injects
        // Cache-Control: no-cache, which req.fresh treats as "never fresh")
        // pass every test while 304 was silently broken end to end.
        res.set('ETag', '"c3300-t1"');
        if (req.fresh) { res.status(304).end(); return; }
        res.json({ doors: [], revision: 'c3300-t1' });
        return;
      }
      res.status(404).set('Content-Type', 'text/plain').send('NOT FOUND: x\r\n');
    });
    upstream = app.listen(0, () => {
      upstreamUrl = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll((done) => { upstream.close(() => done()); });
  beforeEach(() => { seen = []; jest.resetModules(); });

  function bbs() {
    process.env.DOOR_SERVER_URL = upstreamUrl;
    const { doorRepoRouter } = require('../../src/server/door-repo.routes');
    const app = express();
    app.use('/api/door-repo', doorRepoRouter);
    return app;
  }

  it('passes a JSON response through with its revision header', async () => {
    const res = await request(bbs()).get('/api/door-repo/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-door-repo-revision']).toBe('c3300-t1');
    expect(res.body.doors).toBe(3300);
  });

  it('preserves Latin-1 bytes and the content type', async () => {
    const res = await request(bbs()).get('/api/door-repo/list.txt');
    expect(res.headers['content-type']).toContain('ISO-8859-1');
    expect(res.text).toContain('DOORREPO|1|c3300-t1|1');
  });

  it('forwards If-None-Match and returns the upstream 304', async () => {
    const res = await request(bbs())
      .get('/api/door-repo/list.txt')
      .set('If-None-Match', '"c3300-t1"');
    expect(res.status).toBe(304);
    expect(seen.some((r) => r.headers['if-none-match'] === '"c3300-t1"')).toBe(true);
  });

  it('gets a real 304 from an upstream that checks req.fresh, not just the header value', async () => {
    // Regression test for a live production bug (2026-08-24): the proxy's
    // upstream call used the global fetch() API, which per the WHATWG spec
    // auto-injects Cache-Control: no-cache / Pragma: no-cache onto any
    // request that already carries a manual conditional header. Express's
    // req.fresh (via the `fresh` package) treats Cache-Control: no-cache as
    // "never fresh" regardless of ETag match, so the real door server never
    // returned 304 through the proxy -- confirmed live: a raw http.request
    // to the identical URL with the identical header got 304, fetch() got
    // 200. The list.txt mock above never caught this because it does a bare
    // string compare instead of exercising req.fresh.
    const res = await request(bbs())
      .get('/api/door-repo/manifest')
      .set('If-None-Match', '"c3300-t1"');
    expect(res.status).toBe(304);
  });

  it('never sends a caller-defeating Cache-Control/Pragma header upstream', async () => {
    await request(bbs()).get('/api/door-repo/manifest').set('If-None-Match', '"c3300-t1"');
    const seenReq = seen.find((r) => r.url.startsWith('/api/door-repo/manifest'));
    expect(seenReq?.headers['cache-control']).toBeUndefined();
    expect(seenReq?.headers['pragma']).toBeUndefined();
  });

  it('preserves the archive checksum header and the exact bytes', async () => {
    const res = await request(bbs())
      .get('/api/door-repo/archive/ACC-V103.LHA')
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (d: Buffer) => chunks.push(d));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.headers['x-archive-md5']).toBe('deadbeef');
    expect(Buffer.compare(res.body as Buffer, Buffer.from([0x00, 0xa1, 0xff]))).toBe(0);
  });

  it('passes the upstream 404 body through unchanged, for C clients that parse it', async () => {
    const res = await request(bbs()).get('/api/door-repo/archive/NOPE.LHA');
    expect(res.status).toBe(404);
    expect(res.text).toBe('NOT FOUND: x\r\n');
  });

  it('forwards the request method, so HEAD stays HEAD', async () => {
    await request(bbs()).head('/api/door-repo/files/ACC-V103.LHA');
    expect(seen.some((r) => r.method === 'HEAD')).toBe(true);
  });

  it('forwards Range untouched', async () => {
    await request(bbs()).get('/api/door-repo/archive/ACC-V103.LHA').set('Range', 'bytes=0-99');
    expect(seen.some((r) => r.headers.range === 'bytes=0-99')).toBe(true);
  });

  it('never asks upstream for a compressed body, which would break Content-Length', async () => {
    await request(bbs()).get('/api/door-repo/list.txt').set('Accept-Encoding', 'gzip, deflate');
    expect(seen.every((r) => !r.headers['accept-encoding'] ||
      String(r.headers['accept-encoding']).includes('identity'))).toBe(true);
  });

  it('rejects a non-GET/HEAD method with 405, never reaching the door server admin routes', async () => {
    const res = await request(bbs()).post('/api/door-repo/manifest');
    expect(res.status).toBe(405);
    expect(res.text).toContain('METHOD NOT ALLOWED');
    expect(seen).toHaveLength(0);
  });

  // Raw requests below bypass supertest/superagent's own URL handling
  // (which would silently normalize the very bytes/segments under test),
  // by listening the app on a real port and sending a hand-built request
  // line with Node's http.request.
  function rawRequest(app: express.Express, rawPath: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        const req = http.request(
          { host: '127.0.0.1', port, path: rawPath, method: 'GET' },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (d) => chunks.push(d));
            res.on('end', () => {
              server.close();
              resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('latin1') });
            });
          },
        );
        req.on('error', (err) => { server.close(); reject(err); });
        req.end();
      });
    });
  }

  it('does not resolve ".." segments, so a request cannot escape this proxy namespace', async () => {
    // Regression test: new URL() resolves dot-segments before the request
    // ever reaches the upstream socket, so "/api/door-repo/../admin/hidden"
    // silently became "/api/admin/hidden" -- outside the door-repo contract
    // this proxy exists to serve. A plain string path sends the literal
    // ".." segment on the wire, which matches no real upstream route.
    await rawRequest(bbs(), '/api/door-repo/../admin/hidden');
    expect(seen.some((r) => r.url.includes('..'))).toBe(true);
    expect(seen.some((r) => r.url.includes('/admin/hidden') && !r.url.includes('..'))).toBe(false);
  });

  it('times out and abandons a door server that never responds', async () => {
    const hangingServer = http.createServer(() => { /* never responds */ });
    await new Promise<void>((resolve) => hangingServer.listen(0, resolve));
    process.env.DOOR_SERVER_URL = `http://127.0.0.1:${(hangingServer.address() as AddressInfo).port}`;
    jest.resetModules();
    const routesModule = require('../../src/server/door-repo.routes');
    routesModule._setUpstreamTimeoutForTests(50);
    const app = express();
    app.use('/api/door-repo', routesModule.doorRepoRouter);
    const res = await request(app).get('/api/door-repo/health');
    expect(res.status).toBe(502);
    await new Promise<void>((resolve) => hangingServer.close(() => resolve()));
  }, 10_000);

  it('answers 502 in plain text when the door server is unreachable', async () => {
    process.env.DOOR_SERVER_URL = 'http://127.0.0.1:1';
    jest.resetModules();
    const { doorRepoRouter } = require('../../src/server/door-repo.routes');
    const app = express();
    app.use('/api/door-repo', doorRepoRouter);
    const res = await request(app).get('/api/door-repo/health');
    expect(res.status).toBe(502);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('DOOR REPO UNAVAILABLE');
  });
});

describe('isDoorRepoProxyEnabled', () => {
  it('is false when DOOR_SERVER_URL is unset, so the path 404s like a disabled feature', () => {
    const { isDoorRepoProxyEnabled } = require('../../src/server/door-repo.routes');
    expect(isDoorRepoProxyEnabled({})).toBe(false);
    expect(isDoorRepoProxyEnabled({ DOOR_SERVER_URL: '' })).toBe(false);
    expect(isDoorRepoProxyEnabled({ DOOR_SERVER_URL: 'https://doors.uprough.net' })).toBe(true);
  });
});
