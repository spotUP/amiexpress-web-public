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
import { Readable } from 'stream';

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

doorRepoRouter.use(async (req: Request, res: Response, next: NextFunction) => {
  const base = upstreamBase();
  if (!base) {
    next();
    return;
  }

  const target = `${base}/api/door-repo${req.url}`;
  const headers: Record<string, string> = { 'accept-encoding': 'identity' };
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = req.headers[name];
    if (typeof value === 'string') headers[name] = value;
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(target, { method: req.method, headers, redirect: 'manual' });
  } catch (err) {
    // Plain text in the same register as the API's own 404 body, so a C
    // client parsing bytes sees something predictable rather than HTML.
    console.error(`[door-repo proxy] ERROR upstream unreachable: ${(err as Error).message}`);
    res.status(502).set('Content-Type', 'text/plain').send('DOOR REPO UNAVAILABLE\r\n');
    return;
  }

  res.status(upstream.status);
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value !== null) res.set(name, value);
  }

  if (upstream.status === 304 || req.method === 'HEAD' || upstream.body === null) {
    res.end();
    return;
  }

  Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]).pipe(res);
});
