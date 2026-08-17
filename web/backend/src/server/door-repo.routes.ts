/**
 * door-repo routes: read-only HTTP API over the door catalog, for both
 * modern (web) consumers and legacy AmigaDOS door-repo clients.
 *
 *   GET /manifest              JSON DoorRepoManifest; ETag + RFC 7232
 *                              conditional GET (via Express's built-in
 *                              freshness check, see the handler below).
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
import { pipeline } from 'stream';
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
 * inline arrow in the pipeline callback) specifically so it can be
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

/**
 * Streams an already-open archive fd to `res` and reports failure via
 * `handleArchiveStreamError`. Uses stream.pipeline() rather than a plain
 * `.pipe()` specifically because pipe() does NOT destroy the source when
 * the destination closes early — verified with a standalone Node probe
 * (see task-3-report.md): with a real fs.ReadStream(fd) piped via
 * `.pipe(res)`, destroying `res` mid-transfer (a client aborting the
 * download) leaves the source stream — and its fd — untouched, a leak on
 * every interrupted download on a public endpoint. pipeline() destroys
 * BOTH ends on any termination (success, error, or the other side closing
 * early), and destroying a real fs.ReadStream always closes its fd via
 * _destroy(), independent of the `autoClose` option — so this deliberately
 * does NOT pass `autoClose: false` and does NOT close the fd itself in the
 * callback: pipeline has already done that by the time the callback runs
 * (same probe), and closing it again would double-close.
 *
 * `onDone` is test-only instrumentation (the production call site never
 * passes it) — pipeline's own completion is otherwise only observable via
 * the callback closure, and tests need a race-free way to know the fd has
 * already been closed before asserting on it.
 */
export function streamArchive(
  fd: number,
  res: Response,
  archiveName: string,
  onDone?: (err: Error | null) => void
): void {
  const stream = fs.createReadStream('', { fd });
  pipeline(stream, res, (err) => {
    if (err) {
      handleArchiveStreamError(res, archiveName);
    }
    if (onDone) onDone(err ?? null);
  });
}

// GET /manifest — JSON manifest with ETag / If-None-Match support.
//
// Conditional-GET (304) handling is delegated to Express's own freshness
// primitive, `req.fresh` — backed by the `fresh` npm module, which already
// implements RFC 7232 correctly: weak comparison (a `W/"<rev>"` validator
// from a cache/proxy matches our strong `"<rev>"` ETag), comma-separated
// candidate lists, the `*` wildcard, AND (the part a hand-rolled
// `if (ifNoneMatch === etag)` shortcut would miss) RFC 9111's
// `Cache-Control: no-cache` end-to-end-reload override, which must force
// revalidation even when If-None-Match would otherwise match exactly.
// Verified directly (see task-3-report.md) before relying on it, both for
// the implicit form (inside res.json()/res.send()) and this explicit one.
//
// The ETag is just the revision string — getRepoRevision() alone, no
// catalog access. So: compute it, set the headers, and check `req.fresh`
// BEFORE calling buildManifest() at all. A 304 must never pay for
// building (and, transitively, checksumming) the full manifest just to
// throw the result away.
doorRepoRouter.get('/manifest', (req: Request, res: Response) => {
  const revision = getRepoRevision();

  res.set('X-Door-Repo-Revision', revision);
  res.set('ETag', `"${revision}"`);

  if (req.fresh) {
    res.status(304).end();
    return;
  }

  const manifest = buildManifest(parseManifestQuery(req));
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
//
// The declared Content-Length and the streamed bytes MUST come from the
// same open of the file. Doing an independent fs.statSync(path) for the
// size and a later, separate fs.createReadStream(path) for the body is a
// TOCTOU: if the file's size changes between those two opens (a
// re-indexed/replaced archive), the declared Content-Length no longer
// matches the byte count actually streamed and HTTP/1.1 framing corrupts
// for that connection. So: open once (fs.openSync), size via fstatSync on
// that fd, and stream from that same fd via streamArchive() (see its own
// doc comment for why that's stream.pipeline()-based, not a plain
// .pipe(), and who owns closing the fd).
//
// Checksums are a separate concern: getArchiveChecksums() does its own
// independent statSync+readFileSync via the Task 1 cache module. That's
// fine — they're metadata headers, not wire framing, and re-reading lets
// us keep reusing the existing cached-by-mtime+size implementation as-is.
doorRepoRouter.get('/archive/:archiveName', (req: Request, res: Response) => {
  res.set('X-Door-Repo-Revision', getRepoRevision());

  const { archiveName } = req.params;
  const entry = getCatalogEntryByArchive(archiveName);
  if (!entry) {
    sendNotFound(res, archiveName);
    return;
  }

  const absPath = resolveArchivePath(entry.archive_path);

  let fd: number;
  try {
    fd = fs.openSync(absPath, 'r');
  } catch {
    sendNotFound(res, archiveName);
    return;
  }

  let size: number;
  try {
    size = fs.fstatSync(fd).size;
  } catch {
    fs.closeSync(fd);
    sendNotFound(res, archiveName);
    return;
  }

  let checksums: { md5: string; sha256: string };
  try {
    checksums = getArchiveChecksums(absPath);
  } catch {
    fs.closeSync(fd);
    sendNotFound(res, archiveName);
    return;
  }

  res.set('Content-Length', String(size));
  res.set('Content-Type', 'application/octet-stream');
  res.set('X-Archive-MD5', checksums.md5);
  res.set('X-Archive-SHA256', checksums.sha256);

  streamArchive(fd, res, archiveName);
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
