/**
 * Cross-origin access for the door-repo API.
 *
 * Requested by the AmiExpress author, who wants to fetch the catalog from a
 * browser and build searching on top of it. Nothing here exposes anything
 * new: every /api/door-repo endpoint is already public, read-only and
 * unauthenticated (docs/DOOR-REPO-API.md), and answers the same bytes to
 * curl, to a 68K door and to anyone who types the URL. The only thing this
 * changes is whether a BROWSER is willing to let its own JavaScript read a
 * reply it already received.
 *
 * Why a dedicated middleware rather than adding an origin to the global
 * allowlist: the global CORS policy is an allowlist WITH credentials, which
 * is the right shape for the BBS's authenticated API and the wrong shape
 * here. A public catalog has no session to protect and no list of clients to
 * enumerate - the whole point is that anyone can write a client.
 *
 * Three things have to be right together, and missing any one of them still
 * looks like "CORS is broken" from the browser:
 *
 *   1. Access-Control-Allow-Origin: * - permission to read the response.
 *   2. NO Access-Control-Allow-Credentials. A wildcard origin combined with
 *      credentials is invalid per the Fetch spec and browsers reject the
 *      response outright, so the global policy's credentials:true must not
 *      leak onto these routes.
 *   3. Cross-Origin-Resource-Policy: cross-origin. helmet defaults this to
 *      same-origin, which blocks the read at a different layer than CORS
 *      does - the request succeeds, the headers look fine, and the browser
 *      still refuses. Setting it here REPLACES helmet's value rather than
 *      adding a second one.
 *
 * Expose-Headers matters as much as the allow: by default script can read
 * only the CORS-safelisted response headers, so without this a browser
 * client could download an archive and be unable to see the digest it is
 * supposed to verify it against.
 */
import type { Request, Response, NextFunction } from 'express';

/**
 * Response headers a cross-origin client may read. Content-Length is not
 * safelisted either, and a downloader wants it for progress.
 */
export const DOOR_REPO_EXPOSED_HEADERS = [
  'Content-Length',
  'X-Archive-MD5',
  'X-Archive-SHA256',
  'X-Door-Repo-Revision',
];

/**
 * Request headers a preflight may ask for. A plain GET of list.txt is a
 * "simple request" and never preflights, but a conditional fetch does:
 * If-None-Match is NOT on the safelist, and revalidating against
 * X-Door-Repo-Revision/ETag is exactly what a well-behaved client does.
 */
export const DOOR_REPO_ALLOWED_REQUEST_HEADERS = [
  'If-None-Match',
  'If-Modified-Since',
  'Range',
  'Content-Type',
];

export function doorRepoCors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Defensive: nothing upstream of this sets it today, but '*' plus
  // credentials is a combination browsers refuse, and it would be a
  // maddening thing to debug from the other side of the wire.
  res.removeHeader('Access-Control-Allow-Credentials');
  res.setHeader('Access-Control-Expose-Headers', DOOR_REPO_EXPOSED_HEADERS.join(', '));
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', DOOR_REPO_ALLOWED_REQUEST_HEADERS.join(', '));
    res.setHeader('Access-Control-Max-Age', '86400');
    res.status(204).end();
    return;
  }

  next();
}

/** True for a path the door-repo policy owns. */
export function isDoorRepoPath(path: string): boolean {
  return path === '/api/door-repo' || path.startsWith('/api/door-repo/');
}
