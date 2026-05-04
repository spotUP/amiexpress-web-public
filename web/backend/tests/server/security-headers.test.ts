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
 * Content-Security-Policy ships in REPORT-ONLY mode (header is
 * Content-Security-Policy-Report-Only, not Content-Security-Policy).
 * Browsers honour the policy and post violations to /api/csp-report
 * but don't block resources. After deploy + zero-violation period,
 * flip helmet's `reportOnly: false` to enforce.
 *
 * What we deliberately do NOT enable yet:
 * - Cross-Origin-Embedder-Policy: `require-corp` blocks subresources
 *   without CORP headers and would need every static asset re-served
 *   with CORP. Separate hardening pass.
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

  it('sets Content-Security-Policy-Report-Only (not enforced yet)', () => {
    // Report-only mode: browser honours the policy and POSTs violations
    // to /api/csp-report but does NOT block resources. Pinned so a
    // future helmet config change that flips to enforcing CSP is
    // visible in the diff (the test name will fail and need updating).
    const csp = res.headers['content-security-policy-report-only'];
    expect(csp).toBeDefined();
    expect(res.headers['content-security-policy']).toBeUndefined();
  });

  describe('CSP directives (report-only)', () => {
    let csp: string;

    beforeAll(() => {
      csp = res.headers['content-security-policy-report-only'];
    });

    it('default-src is self only', () => {
      expect(csp).toMatch(/(^|;)\s*default-src 'self'(;|$)/);
    });

    it('script-src is self only (no unsafe-inline / unsafe-eval / CDNs)', () => {
      // Bundled scripts only — no inline <script>, no eval, no CDN refs
      // verified by the asset audit. If a future change adds an inline
      // script, this test fires and forces a deliberate decision.
      expect(csp).toMatch(/(^|;)\s*script-src 'self'(;|$)/);
      expect(csp).not.toMatch(/'unsafe-inline'.*script/);
      expect(csp).not.toMatch(/script.*'unsafe-eval'/);
    });

    it('style-src allows unsafe-inline (index.html <style> + React style props)', () => {
      // index.html has an inline <style> block; React components use
      // style={{...}} props which set the DOM style attribute and
      // require unsafe-inline in CSP2. CSP3 splits this into
      // style-src-attr but helmet/browser support is uneven, so stick
      // with unsafe-inline until the inline <style> can be hashed.
      expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
    });

    it('font-src is self only (local /fonts/*.ttf)', () => {
      expect(csp).toMatch(/font-src 'self'/);
    });

    it('img-src allows data: (favicon SVG)', () => {
      expect(csp).toMatch(/img-src[^;]*data:/);
    });

    it('connect-src is self only (covers same-origin WebSocket per CSP3)', () => {
      expect(csp).toMatch(/connect-src 'self'/);
    });

    it('frame-ancestors none (modern X-Frame-Options DENY)', () => {
      expect(csp).toMatch(/frame-ancestors 'none'/);
    });

    it('object-src none (defang plugin injection)', () => {
      expect(csp).toMatch(/object-src 'none'/);
    });

    it('base-uri self (defang base-tag injection)', () => {
      expect(csp).toMatch(/base-uri 'self'/);
    });

    it('reports violations to /api/csp-report', () => {
      expect(csp).toMatch(/report-uri \/api\/csp-report/);
    });
  });

  it('does NOT set Cross-Origin-Embedder-Policy (xterm/socket.io compat)', () => {
    // require-corp blocks subresources without CORP headers; would need
    // every static asset re-served with CORP. Separate hardening pass.
    expect(res.headers['cross-origin-embedder-policy']).toBeUndefined();
  });
});

describe('CSP violation reporter', () => {
  it('accepts legacy application/csp-report bodies and returns 204', async () => {
    // Older browsers POST CSP violations as `application/csp-report`,
    // not application/json — express.json with `type: [...]` covers it.
    const report = {
      'csp-report': {
        'document-uri': 'http://example.com/',
        'violated-directive': 'script-src',
        'blocked-uri': 'inline',
      },
    };
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/csp-report')
      .send(JSON.stringify(report));
    expect(res.status).toBe(204);
  });

  it('accepts modern application/reports+json arrays and returns 204', async () => {
    // Reporting API ships violations as a JSON array of report objects.
    const reports = [
      {
        type: 'csp-violation',
        body: { documentURL: 'http://example.com/', blockedURL: 'inline' },
      },
    ];
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/reports+json')
      .send(JSON.stringify(reports));
    expect(res.status).toBe(204);
  });

  it('does not 5xx on malformed body', async () => {
    const res = await request(app)
      .post('/api/csp-report')
      .set('Content-Type', 'application/json')
      .send('not-json-but-also-not-fatal');
    // Either 204 (parsed as null) or 4xx (parser rejected) is fine —
    // the bug we're guarding against is a 5xx propagating to clients.
    expect(res.status).toBeLessThan(500);
  });
});
