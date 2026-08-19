/**
 * Cross-origin access to the public door-repo API.
 *
 * Asked for by the AmiExpress author so he can fetch the catalog from a
 * browser and build searching on it. The endpoints were already public,
 * read-only and unauthenticated - the browser was simply refusing to let
 * script read replies it had already received.
 *
 * Three separate mechanisms have to agree, and each one alone still reads as
 * "CORS is broken" from the client side, so each is pinned here:
 *   - the allow header,
 *   - the ABSENCE of Allow-Credentials (a wildcard origin plus credentials
 *     is invalid per the Fetch spec and browsers reject the whole response),
 *   - Cross-Origin-Resource-Policy, which helmet sets to same-origin by
 *     default and which blocks the read at a different layer than CORS.
 */
import express from 'express';
import request from 'supertest';
import {
  doorRepoCors,
  isDoorRepoPath,
  DOOR_REPO_EXPOSED_HEADERS,
} from '../../src/server/door-repo-cors';

function appWithCors() {
  const app = express();
  app.use('/api/door-repo', doorRepoCors);
  app.get('/api/door-repo/list.txt', (_req, res) => {
    res.setHeader('X-Door-Repo-Revision', 'c3300-t1');
    res.type('text/plain').send('DOORREPO|1|c3300-t1|0\r\n');
  });
  return app;
}

describe('door-repo cross-origin policy', () => {
  test('a catalog fetch may be read by any origin', async () => {
    const res = await request(appWithCors())
      .get('/api/door-repo/list.txt')
      .set('Origin', 'https://someones-tool.example');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });

  test('credentials are never advertised alongside the wildcard', async () => {
    // '*' plus Allow-Credentials is rejected outright by browsers, so this
    // being present would break the very thing the wildcard is for.
    const res = await request(appWithCors())
      .get('/api/door-repo/list.txt')
      .set('Origin', 'https://someones-tool.example');

    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
  });

  test('the resource policy permits a cross-origin read', async () => {
    // helmet's default is same-origin, which blocks the read even when every
    // CORS header is correct - a failure that looks like nothing is wrong.
    const res = await request(appWithCors()).get('/api/door-repo/list.txt');

    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  test('the digest headers a client verifies against are readable', async () => {
    const res = await request(appWithCors()).get('/api/door-repo/list.txt');
    const exposed = String(res.headers['access-control-expose-headers']);

    // Without these, script can download an archive and be unable to see the
    // digest it is meant to check it against.
    for (const header of ['X-Archive-MD5', 'X-Archive-SHA256', 'X-Door-Repo-Revision', 'Content-Length']) {
      expect(exposed).toContain(header);
    }
    expect(DOOR_REPO_EXPOSED_HEADERS).toContain('X-Archive-SHA256');
  });

  test('a preflight is answered without reaching the route', async () => {
    const res = await request(appWithCors())
      .options('/api/door-repo/list.txt')
      .set('Origin', 'https://someones-tool.example')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'If-None-Match');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    // If-None-Match is not CORS-safelisted, so a conditional revalidation -
    // the polite way to poll a catalog - preflights and must be allowed.
    expect(res.headers['access-control-allow-headers']).toContain('If-None-Match');
  });

  test('only the door-repo paths are claimed by this policy', () => {
    expect(isDoorRepoPath('/api/door-repo')).toBe(true);
    expect(isDoorRepoPath('/api/door-repo/list.txt')).toBe(true);
    expect(isDoorRepoPath('/api/door-repo/archive/-D-CALC.LHA')).toBe(true);
    // The BBS's own API keeps the allowlist-with-credentials policy.
    expect(isDoorRepoPath('/api/config/doors')).toBe(false);
    expect(isDoorRepoPath('/api/auth/login')).toBe(false);
    // Not a prefix match on a different route that merely starts the same.
    expect(isDoorRepoPath('/api/door-repository-admin')).toBe(false);
  });
});

describe('the global allowlist no longer blocks the public catalog', () => {
  /**
   * The ordering bug this pins: the global CORS policy rejects an unknown
   * origin with 403 BEFORE any router runs, so putting the right headers on
   * the door-repo router alone would have changed nothing a browser could
   * see. The door-repo policy has to be installed ahead of it, and the
   * global one has to skip those paths.
   */
  function appWithBothPolicies() {
    const app = express();
    app.use('/api/door-repo', doorRepoCors);

    const rejectUnknownOrigins = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (isDoorRepoPath(req.path)) return next();
      if (req.headers.origin && req.headers.origin !== 'https://bbs.uprough.net') {
        res.status(403).send('Not allowed by CORS');
        return;
      }
      next();
    };
    app.use(rejectUnknownOrigins);

    app.get('/api/door-repo/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/api/config/doors', (_req, res) => res.json({ doors: [] }));
    return app;
  }

  test('an unknown origin reaches the catalog', async () => {
    const res = await request(appWithBothPolicies())
      .get('/api/door-repo/health')
      .set('Origin', 'https://someones-tool.example');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('the same origin is still refused the BBS API', async () => {
    const res = await request(appWithBothPolicies())
      .get('/api/config/doors')
      .set('Origin', 'https://someones-tool.example');

    expect(res.status).toBe(403);
  });
});
