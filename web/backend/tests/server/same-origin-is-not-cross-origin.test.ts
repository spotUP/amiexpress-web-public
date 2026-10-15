/**
 * A page this server served may load its own assets, whatever the port.
 *
 * The global CORS policy refused any Origin outside its allowlist with a JSON
 * 403 - including the server's OWN origin when it ran on a port the list did
 * not name. Browsers send `Origin` on stylesheet and script loads, so the
 * sysop's test server on 3011 answered its admin bundle with
 * `{"error":"Not allowed by CORS"}` and the page never rendered. Same-origin
 * is not cross-origin; the allowlist still decides everything else.
 */
import request from 'supertest';
import { app } from '../../src/server/app';

test('an Origin equal to the request\'s own host is allowed, on any port', async () => {
  const res = await request(app).get('/health')
    .set('Host', 'localhost:3011')
    .set('Origin', 'http://localhost:3011');

  expect(res.status).not.toBe(403);
  expect(JSON.stringify(res.body)).not.toContain('Not allowed by CORS');
});

/**
 * THE ALLOWLIST IS A PRODUCTION RULE, and this test has to say so.
 *
 * `app.ts:127` allows EVERY origin when `NODE_ENV === 'development'`, and the
 * decision is made per request, from `process.env`. A developer whose `.env`
 * sets `NODE_ENV=development` therefore ran this test against the
 * allow-everything branch and watched it fail with 200 - which says nothing
 * about the board. The live container runs `NODE_ENV=production` and answers
 * a foreign origin 403, verified against bbs.uprough.net on 2026-09-08.
 *
 * So the mode is pinned here rather than inherited, and the development
 * behaviour gets its own test instead of hiding as a flake in this one.
 */
describe('a foreign origin', () => {
  const realNodeEnv = process.env.NODE_ENV;
  afterEach(() => {
    if (realNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = realNodeEnv;
  });

  it('is refused in production, which is what the live board runs', async () => {
    process.env.NODE_ENV = 'production';

    const res = await request(app).get('/health')
      .set('Host', 'localhost:3011')
      .set('Origin', 'http://evil.example');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Not allowed by CORS');
  });

  it('is allowed in development, deliberately - app.ts:127', async () => {
    // Not an accident and not a hole in the board: it is what lets a
    // developer point a Vite dev server on any port at this backend. Pinned
    // so that "the CORS test fails on my machine" has an answer in the file.
    process.env.NODE_ENV = 'development';

    const res = await request(app).get('/health')
      .set('Host', 'localhost:3011')
      .set('Origin', 'http://evil.example');

    expect(res.status).not.toBe(403);
  });
});
