/**
 * door-repo proxy: forwards /api/door-repo/* to the standalone door server.
 *
 * The catalog, the archive corpus and the curation API moved to
 * github.com/spotUP/amiexpress-doorserver (design:
 * docs/superpowers/specs/2026-08-23-door-server-split-design.md). This BBS
 * keeps answering at the same URL so nothing already deployed breaks - the
 * DoorRepo C door ships with RepoHost=bbs.uprough.net baked into config on
 * other people's machines.
 *
 * Deliberately NOT kept: the sqlite-backed handlers this file used to carry.
 * Two implementations of one contract is how the duplicated
 * Cross-Origin-Resource-Policy header happened on this host.
 *
 * The BBS's helmet and doorRepoCors middleware still run in front of this
 * router, exactly as before; the door server sets none of those headers.
 */
import express, { NextFunction, Request, Response } from 'express';
import * as http from 'http';
import * as https from 'https';

/** True when a door server is configured. When false, app.ts does not mount
 *  the router at all, so the path 404s through Express's own no-route
 *  handler - a disabled feature must not be advertised. */
export function isDoorRepoProxyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return typeof env.DOOR_SERVER_URL === 'string' && env.DOOR_SERVER_URL.length > 0;
}

/** Response headers that carry meaning to a door-repo client. Everything
 *  else the upstream sends is dropped; the BBS's own middleware supplies
 *  CORS and security headers. */
const FORWARDED_RESPONSE_HEADERS = [
  'content-type',
  'content-length',
  'etag',
  'last-modified',
  'x-door-repo-revision',
  'x-archive-md5',
  'x-archive-sha256',
  'x-doc-filename',
];

/** Request headers worth forwarding. `accept-encoding` is deliberately
 *  absent: the door server replies with identity encoding, and a gzipped
 *  upstream body would invalidate the Content-Length a C89 client reads. */
const FORWARDED_REQUEST_HEADERS = ['if-none-match', 'if-modified-since', 'range', 'user-agent'];

// Parsed once from DOOR_SERVER_URL for protocol/host/port ONLY -- never for
// the request path (see the `path` comment below).
function upstreamOrigin(): URL | null {
  const raw = (process.env.DOOR_SERVER_URL ?? '').replace(/\/+$/, '');
  if (!raw) return null;
  try {
    return new URL(raw);
  } catch {
    return null;
  }
}

let UPSTREAM_TIMEOUT_MS = 30_000;

/** Test-only: proves the real 30s timeout without a 30s test. */
export function _setUpstreamTimeoutForTests(ms: number): void {
  UPSTREAM_TIMEOUT_MS = ms;
}

export const doorRepoRouter = express.Router();

doorRepoRouter.use((req: Request, res: Response, next: NextFunction) => {
  const origin = upstreamOrigin();
  if (!origin) {
    next();
    return;
  }

  // The C door's catalog is read-only; nothing here needs a request body,
  // and the door server's admin routes (which DO accept writes) must never
  // appear reachable through this public, unauthenticated proxy.
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).set('Content-Type', 'text/plain').send('METHOD NOT ALLOWED\r\n');
    return;
  }

  const headers: Record<string, string> = { 'accept-encoding': 'identity' };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  // Node's global fetch() is deliberately NOT used here: per the WHATWG
  // spec, fetch() auto-injects Cache-Control: no-cache / Pragma: no-cache
  // onto any request that already carries a manual conditional header
  // (If-None-Match/If-Modified-Since above). The door server's req.fresh
  // (Express's `fresh` package) treats Cache-Control: no-cache as "never
  // fresh" regardless of ETag match, so a fetch()-based proxy silently
  // never gets a 304 -- confirmed live 2026-08-24 (a raw http.request to
  // the identical URL with the identical header got 304, fetch() got 200).
  // http.request/https.request add no such header.
  //
  // `path` is a plain string, `/api/door-repo` + req.url verbatim -- NEVER
  // built via `new URL()`. The plan requires byte-for-byte passthrough (the
  // catalog holds Latin-1 archive names like "$CP-BUß1.LZX" whose raw high
  // byte a URL parser re-encodes as UTF-8, corrupting the lookup), and a
  // parsed URL also resolves ".." segments -- letting a request escape this
  // proxy's namespace into the door server's other routes. A plain string
  // path does neither: Node sends it on the request line unmodified, and a
  // literal ".." segment just won't match any upstream route.
  const client = origin.protocol === 'https:' ? https : http;
  const upstreamReq = client.request(
    {
      protocol: origin.protocol,
      hostname: origin.hostname,
      port: origin.port,
      path: `/api/door-repo${req.url}`,
      method: req.method,
      headers,
    },
    (upstream) => {
      res.status(upstream.statusCode ?? 502);
      for (const name of FORWARDED_RESPONSE_HEADERS) {
        const value = upstream.headers[name];
        if (typeof value === 'string') res.set(name, value);
      }

      if (upstream.statusCode === 304 || req.method === 'HEAD') {
        upstream.resume();
        res.end();
        return;
      }

      upstream.pipe(res);
    },
  );

  // A stalled door server or an aborted archive download must not hold this
  // request (or, for /events' SSE, this connection) open forever.
  upstreamReq.setTimeout(UPSTREAM_TIMEOUT_MS, () => {
    upstreamReq.destroy(new Error(`upstream timed out after ${UPSTREAM_TIMEOUT_MS}ms`));
  });
  res.on('close', () => {
    upstreamReq.destroy();
  });

  upstreamReq.on('error', (err) => {
    // Plain text in the same register as the API's own 404 body, so a C
    // client parsing bytes sees something predictable rather than HTML.
    console.error(`[door-repo proxy] ERROR upstream unreachable: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).set('Content-Type', 'text/plain').send('DOOR REPO UNAVAILABLE\r\n');
    } else {
      res.destroy();
    }
  });

  upstreamReq.end();
});
