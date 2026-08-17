/**
 * door-repo routes: read-only HTTP API over the door catalog, for both
 * modern (web) consumers and legacy AmigaDOS door-repo clients.
 *
 *   GET /manifest              JSON DoorRepoManifest; ETag + If-None-Match.
 *   GET /list.txt              byte-exact ISO-8859-1/CRLF plain-text index.
 *   GET /archive/:archiveName  streams the archive file + its checksums.
 *   GET /health                { status, revision, doors } — lightweight;
 *                              uses getDoorCount(), never buildManifest(),
 *                              so a liveness poll never re-hashes the
 *                              whole archive corpus.
 *
 * All four thin-wrap Task 1/2 building blocks (door-repo-manifest.ts,
 * door-repo-checksums.ts) and door-catalog.service.ts — no new DB access
 * or business logic lives here.
 *
 * Security: the archive endpoint resolves the requested file ONLY through
 * getCatalogEntryByArchive() (a parameterized `WHERE archive_name = ?`
 * lookup) followed by resolveArchivePath() on the catalog row's own
 * archive_path column. The raw :archiveName URL parameter is NEVER
 * path-joined onto a directory, so an encoded traversal payload
 * (`..%2F..%2Fetc%2Fpasswd`) just fails the catalog lookup and 404s like
 * any other unknown name — it can't reach the filesystem.
 */
import express, { Request, Response } from 'express';
import * as fs from 'fs';
import { buildManifest, renderListTxt, getRepoRevision, getDoorCount } from '../doors/door-repo-manifest';
import { getArchiveChecksums } from '../doors/door-repo-checksums';
import { getCatalogEntryByArchive, resolveArchivePath } from '../doors/door-catalog.service';

export const doorRepoRouter = express.Router();

function parseManifestQuery(req: Request): { type?: string; q?: string } {
  const type = typeof req.query.type === 'string' ? req.query.type : undefined;
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  return { type, q };
}

function sendNotFound(res: Response, archiveName: string): void {
  res
    .status(404)
    .set('Content-Type', 'text/plain')
    .send(`NOT FOUND: ${archiveName}\r\n`);
}

/**
 * Handles a mid-stream fs.createReadStream error so it never hangs the
 * request. Extracted as a standalone, exported function (rather than an
 * inline arrow in the 'error' listener) specifically so it can be
 * unit-tested directly against fake Response objects — reproducing a real
 * mid-stream failure end-to-end over HTTP is racy (the moment any bytes
 * are written, the client has already committed to the declared
 * Content-Length, so a truncated response reads as a protocol violation,
 * not a clean "request finished").
 */
export function handleArchiveStreamError(res: Response, archiveName: string): void {
  if (res.headersSent) {
    res.end();
  } else {
    sendNotFound(res, archiveName);
  }
}

// GET /manifest — JSON manifest with ETag / If-None-Match support.
doorRepoRouter.get('/manifest', (req: Request, res: Response) => {
  const manifest = buildManifest(parseManifestQuery(req));
  const revision = manifest.revision;
  const etag = `"${revision}"`;

  res.set('X-Door-Repo-Revision', revision);
  res.set('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }

  res.json(manifest);
});

// GET /list.txt — byte-exact ISO-8859-1/CRLF plain-text index.
doorRepoRouter.get('/list.txt', (req: Request, res: Response) => {
  const manifest = buildManifest(parseManifestQuery(req));

  res.set('X-Door-Repo-Revision', manifest.revision);
  res.set('Content-Type', 'text/plain; charset=ISO-8859-1');
  res.send(renderListTxt(manifest));
});

// GET /archive/:archiveName — stream the archive + checksum headers.
doorRepoRouter.get('/archive/:archiveName', (req: Request, res: Response) => {
  res.set('X-Door-Repo-Revision', getRepoRevision());

  const { archiveName } = req.params;
  const entry = getCatalogEntryByArchive(archiveName);
  if (!entry) {
    sendNotFound(res, archiveName);
    return;
  }

  const absPath = resolveArchivePath(entry.archive_path);

  let size: number;
  try {
    size = fs.statSync(absPath).size;
  } catch {
    sendNotFound(res, archiveName);
    return;
  }

  let checksums: { md5: string; sha256: string };
  try {
    checksums = getArchiveChecksums(absPath);
  } catch {
    sendNotFound(res, archiveName);
    return;
  }

  res.set('Content-Length', String(size));
  res.set('Content-Type', 'application/octet-stream');
  res.set('X-Archive-MD5', checksums.md5);
  res.set('X-Archive-SHA256', checksums.sha256);

  const stream = fs.createReadStream(absPath);
  stream.on('error', () => handleArchiveStreamError(res, archiveName));
  stream.pipe(res);
});

// GET /health — { status, revision, doors }. Uses getDoorCount(), NOT
// buildManifest(): buildManifest computes md5+sha256 for every catalog row
// (~3300 archives), which is far too expensive to pay on every liveness
// poll — a monitor hitting this endpoint would re-hash the whole repo on
// the first request after any archive touch.
doorRepoRouter.get('/health', (req: Request, res: Response) => {
  const revision = getRepoRevision();
  const doors = getDoorCount();
  res.set('X-Door-Repo-Revision', revision);
  res.json({ status: 'ok', revision, doors });
});
