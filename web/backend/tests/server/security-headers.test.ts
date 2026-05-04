/**
 * Security headers tests — pin the helmet middleware shape on the
 * Express app from `src/server/app.ts`.
 *
 * Why pin specific headers: helmet is configured early in the middleware
 * chain, before any of our routers. A regression that disables helmet
 * (or moves it after the response-emitting routes) would silently drop
 * these headers in production. The test exercises a real request path
 * (GET /health) so we know the headers actually land on responses.
 *
 * What we deliberately do NOT enable yet:
 * - Content-Security-Policy: deferred to a separate hardening pass.
 *   The BBS frontend uses xterm.js, socket.io, possibly inline styles,
 *   and a CSP regression could blackbox-break the terminal. CSP needs
 *   its own audit + per-directive list before it ships.
 * - Cross-Origin-Embedder-Policy: same reason; `require-corp` blocks
 *   subresources without CORP headers and would need every static asset
 *   to be re-served with CORP, which is a separate piece of work.
 */

import request from 'supertest';
import { app } from '../../src/server/app';

describe('Security headers (helmet)', () => {
  let res: any;

  beforeAll(async () => {
    // /health is a public no-auth route in app.ts — perfect surface to
    // exercise the global middleware chain without dragging in routers
    // that mount later in routes-setup.ts.
    res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });

  it('sets X-Frame-Options to SAMEORIGIN (clickjacking protection)', () => {
    // helmet 8.x default. SAMEORIGIN is the right setting for this project:
    // admin app, SDK, and BBS frontend all live under one origin and may
    // iframe each other (e.g. admin previews of BBS screens). DENY would
    // break that. Cross-origin embeds are still blocked.
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('sets X-Content-Type-Options to nosniff (MIME-sniffing protection)', () => {
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('sets Strict-Transport-Security with reasonable max-age (HSTS)', () => {
    const hsts = res.headers['strict-transport-security'];
    expect(hsts).toBeDefined();
    // helmet default: max-age=15552000; includeSubDomains
    expect(hsts).toMatch(/max-age=\d+/);
  });

  it('sets Referrer-Policy', () => {
    expect(res.headers['referrer-policy']).toBeDefined();
  });

  it('removes X-Powered-By header (information leak)', () => {
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('sets X-DNS-Prefetch-Control to off', () => {
    expect(res.headers['x-dns-prefetch-control']).toBe('off');
  });

  it('does NOT set Content-Security-Policy (deferred to separate hardening pass)', () => {
    // CSP needs an audit of every inline script/style/asset the frontend
    // pulls before we can ship a non-broken policy. Pinning its absence
    // so a future helmet upgrade doesn't silently enable defaults that
    // blackbox-break the BBS terminal.
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  it('does NOT set Cross-Origin-Embedder-Policy (xterm/socket.io compat)', () => {
    // require-corp blocks subresources without CORP headers; would need
    // every static asset re-served with CORP. Separate hardening pass.
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });
});
