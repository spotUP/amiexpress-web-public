/**
 * door-repo API mount gating — the door-repo router only mounts when a
 * door server is configured. The catalog, archive corpus and curation API
 * moved to the standalone door server (github.com/spotUP/amiexpress-doorserver);
 * this BBS now proxies to it (door-repo.routes.ts) instead of serving its
 * own sqlite catalog, and the mount gate follows: isDoorRepoProxyEnabled()
 * is true iff DOOR_SERVER_URL is a non-empty string.
 *
 * DOOR_REPO_ROLE no longer gates this API at all — the former
 * DOOR_REPO_ROLE=owner/consumer distinction belonged to the sqlite-backed
 * router this replaces. There is nothing left for a role value to gate, so
 * the old "404s when DOOR_REPO_ROLE=consumer" case is gone rather than
 * ported; DOOR_SERVER_URL unset/empty is now the only "disabled" case.
 *
 * When no door server is configured, the paths must simply not exist —
 * Express's default "no route matched" 404, not a custom error response —
 * so a disabled feature isn't advertised.
 *
 * Requires a fresh require() of src/server/app.ts per scenario (the mount
 * decision runs once at module-load time), via jest.resetModules() +
 * process.env manipulation.
 */
import request from 'supertest';
import type { Express } from 'express';

describe('door-repo API mount gating', () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function freshApp(): Express {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('../../src/server/app') as { app: Express };
    return app;
  }

  it('mounts and serves the path when DOOR_SERVER_URL is set', async () => {
    // An unreachable upstream is fine here — this proves MOUNTING, not a
    // successful proxied response (door-repo-proxy.test.ts already covers
    // the full proxied round trip against a real stub upstream). A 502
    // from the router's own "upstream unreachable" handler still proves
    // the request reached the router at all, which a 404 would disprove.
    process.env.DOOR_SERVER_URL = 'http://127.0.0.1:1';
    const app = freshApp();

    const res = await request(app).get('/api/door-repo/health');

    expect(res.status).not.toBe(404);
    expect(res.status).toBe(502);
  });

  it('404s (Express default, not a custom response) when DOOR_SERVER_URL is unset', async () => {
    delete process.env.DOOR_SERVER_URL;
    const app = freshApp();

    const res = await request(app).get('/api/door-repo/health');

    expect(res.status).toBe(404);
    // Express's default 404 body, not door-repo.routes.ts's own plaintext
    // handlers (its 404 for an unknown archive, or its 502 for an
    // unreachable upstream) — proving the ROUTER never got mounted at all,
    // so a disabled feature isn't advertised.
    expect(res.text).not.toContain('NOT FOUND:');
    expect(res.text).not.toContain('DOOR REPO UNAVAILABLE');
  });

  it('404s when DOOR_SERVER_URL is the empty string', async () => {
    process.env.DOOR_SERVER_URL = '';
    const app = freshApp();

    const res = await request(app).get('/api/door-repo/health');

    expect(res.status).toBe(404);
  });

  it('also gates /api/door-repo/manifest and /list.txt, not just /health', async () => {
    delete process.env.DOOR_SERVER_URL;
    const app = freshApp();

    const manifestRes = await request(app).get('/api/door-repo/manifest');
    const listRes = await request(app).get('/api/door-repo/list.txt');

    expect(manifestRes.status).toBe(404);
    expect(listRes.status).toBe(404);
  });
});
