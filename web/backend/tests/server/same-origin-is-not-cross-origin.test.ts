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

test('a foreign origin is still refused', async () => {
  const res = await request(app).get('/health')
    .set('Host', 'localhost:3011')
    .set('Origin', 'http://evil.example');

  expect(res.status).toBe(403);
  expect(res.body.error).toBe('Not allowed by CORS');
});
