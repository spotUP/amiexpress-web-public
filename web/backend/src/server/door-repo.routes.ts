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

function upstreamBase(): string {
  return (process.env.DOOR_SERVER_URL ?? '').replace(/\/+$/, '');
}

export const doorRepoRouter = express.Router();

doorRepoRouter.use((req: Request, res: Response, next: NextFunction) => {
  const base = upstreamBase();
  if (!base) {
    next();
    return;
  }

  const target = new URL(`${base}/api/door-repo${req.url}`);
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
  const client = target.protocol === 'https:' ? https : http;
  const upstreamReq = client.request(
    target,
    { method: req.method, headers },
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

  upstreamReq.on('error', (err) => {
    // Plain text in the same register as the API's own 404 body, so a C
    // client parsing bytes sees something predictable rather than HTML.
    console.error(`[door-repo proxy] ERROR upstream unreachable: ${err.message}`);
    if (!res.headersSent) {
      res.status(502).set('Content-Type', 'text/plain').send('DOOR REPO UNAVAILABLE\r\n');
    }
  });

  upstreamReq.end();
});
