/**
 * This board's own door management API.
 *
 * Deliberately NOT under /api/door-repo/*, which proxies out to the door
 * server: these routes act on THIS board's installed doors. Phase A adds one
 * route - the install record the DoorRepo C door reports after it installs
 * something. Reads and the remaining writes arrive in phases B and C.
 *
 * Mounted at /api/door-admin, not /api/doors: /api/doors is already
 * door-api-routes.ts (client door bundles, manifests, assets) and that
 * router serves browsers with no door token at all. Putting this router's
 * token-gated middleware on the same prefix would 401 every browser
 * fetching a TypeScript door's client bundle.
 *
 * Text responses, not JSON: the client is a C89 door.
 */
import express, { NextFunction, Request, Response } from 'express';
import * as path from 'path';
import { recordDoorInstall } from '../doors/door-install-record';
import { verifyLaunchToken } from '../doors/door-launch-token';
import { buildDoorList } from '../doors/door-list';
import * as amigafs from '../utils/amigafs';
import { parseInfoFile } from '../utils/info-file.util';
import { isAllowed, resolveDoorDir, resolveDoorFile, walkDoorDir } from '../doors/door-path-guard';
import { FIELD_CAPS, renderRows, sanitizeField } from './door-admin-text';

export const doorAdminRouter = express.Router();

/**
 * A body-parser failure (malformed JSON, a body over the limit, a bare
 * JSON string) happens before Express reaches `doorAdminRouter` at all, so
 * without this it would fall through to app.ts's global JSON error
 * handler. The client here is a C89 door reading plain text with CRLF - it
 * must never be handed JSON, including on this path. Exported (rather than
 * defined inline at the app.ts mount site) so the mount and the test that
 * exercises it import the exact same function instead of two copies that
 * can drift apart.
 *
 * Four parameters, not three: Express only recognises a middleware as an
 * error handler when its function signature declares four parameters, so
 * the unused `_req` must stay.
 */
export function doorAdminBodyError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!err) { next(); return; }
  res.status(400).type('text/plain').send('BAD REQUEST\r\n');
}

/** A BBS command: A-Z, 0-9, up to 12 - the same shape the C door validates
 *  and the only shape that can name a Commands/BBSCmd/<CMD>.info. */
function isCommandName(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{1,12}$/.test(value);
}

doorAdminRouter.use((req: Request, res: Response, next: NextFunction) => {
  const claims = verifyLaunchToken(req.header('X-Door-Token') ?? undefined);
  if (!claims) {
    res.status(401).type('text/plain').send('UNAUTHORIZED\r\n');
    return;
  }
  // The token says which session this is; it does not say what that session
  // may do. Checked server-side on every request, never inferred from the
  // mere presence of a token.
  if (claims.secLevel < 250) {
    res.status(403).type('text/plain').send('FORBIDDEN\r\n');
    return;
  }
  (req as any).doorClaims = claims;
  next();
});

/** Where this board's files live. The route has no session to ask. */
function resolveBbsRoot(): string {
  return process.env.BBS_DATA_DIR || process.cwd();
}

/**
 * GET /installed - every registered command, with what is known about it.
 *
 * Built by the same buildDoorList the in-process doors render, so the
 * precedence between a door's own .info and the catalog is decided in one
 * place. `archive` is empty for a door with no install record, which is all
 * 370 already on this board - the scope call at the spec's line 60.
 */
doorAdminRouter.get('/installed', async (_req: Request, res: Response) => {
  let doors;
  try {
    doors = await buildDoorList(resolveBbsRoot());
  } catch {
    res.status(500).type('text/plain').send('ERROR\r\n');
    return;
  }

  const rows = doors.map((d) => [
    sanitizeField(d.command, FIELD_CAPS.command),
    sanitizeField(d.type, FIELD_CAPS.type),
    String(d.size ?? 0),
    d.enabled ? '1' : '0',
    String(d.accessLevel ?? 0),
    sanitizeField(d.archiveName, FIELD_CAPS.archive),
    sanitizeField(d.name, FIELD_CAPS.name),
    sanitizeField(d.category, FIELD_CAPS.category),
    sanitizeField(d.description, FIELD_CAPS.description),
  ]);

  res.status(200).type('text/plain').send(renderRows('DOORS', rows));
});

/** At most this many rows from one directory walk. */
const DIR_ROW_LIMIT = 2000;

/**
 * GET /installed/:cmd/files - the door's own directory, recursively.
 *
 * Nested under /installed rather than the spec's /api/door-admin/:cmd/files:
 * :cmd is [A-Za-z0-9]{1,12}, which matches the literal string "installed", so
 * a board with a command named INSTALLED would make the list route ambiguous.
 */
doorAdminRouter.get('/installed/:cmd/files', (req: Request, res: Response) => {
  const { cmd } = req.params;
  if (!isCommandName(cmd)) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const decision = resolveDoorDir(resolveBbsRoot(), cmd);
  if (!isAllowed(decision)) {
    res.status(decision.status).type('text/plain')
      .send(decision.status === 404 ? 'NOT FOUND\r\n' : 'FORBIDDEN\r\n');
    return;
  }

  const entries = walkDoorDir(decision.path, DIR_ROW_LIMIT);
  const rows = entries.map((e) => [
    String(e.size),
    e.isDir ? '1' : '0',
    sanitizeField(e.path, FIELD_CAPS.path),
  ]);

  res.status(200).type('text/plain').send(renderRows('DIR', rows));
});

/**
 * Most bytes of one file that will be served. Above the C door's own DIZ
 * (16 KB) and document (24 KB) ceilings in examples/doorrepo-c/doorrepo.c, so
 * the door decides how much of a file it keeps and the server only stops a
 * door directory's LHA archive from being pushed down a BBS socket.
 */
const FILE_BYTE_LIMIT = 32768;
/** A NUL this early means the file is not text the door can display. */
const BINARY_SNIFF_BYTES = 8192;

/**
 * GET /installed/:cmd/file?p= - one file from inside the door's directory.
 *
 * The dangerous route. `p` comes from a query string, and RepoHost ships
 * baked to bbs.uprough.net in doors handed to other sysops, so an escape here
 * is an arbitrary-file-read of this host. Containment is in door-path-guard,
 * which checks the resolved path AND the path after realpath, because a
 * symlink inside the door satisfies a string comparison while reading
 * something else.
 */
doorAdminRouter.get('/installed/:cmd/file', (req: Request, res: Response) => {
  const { cmd } = req.params;
  if (!isCommandName(cmd)) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const dir = resolveDoorDir(resolveBbsRoot(), cmd);
  if (!isAllowed(dir)) {
    res.status(dir.status).type('text/plain')
      .send(dir.status === 404 ? 'NOT FOUND\r\n' : 'FORBIDDEN\r\n');
    return;
  }

  const requested = req.query.p;
  if (typeof requested !== 'string' || requested.trim() === '') {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const target = resolveDoorFile(dir.path, requested);
  if (!isAllowed(target)) {
    res.status(target.status).type('text/plain')
      .send(target.status === 404 ? 'NOT FOUND\r\n' : 'FORBIDDEN\r\n');
    return;
  }

  let stats;
  try {
    stats = amigafs.statSync(target.path);
  } catch {
    res.status(404).type('text/plain').send('NOT FOUND\r\n');
    return;
  }
  if (stats.isDirectory()) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  let contents: Buffer;
  try {
    contents = amigafs.readFileSync(target.path) as Buffer;
  } catch {
    res.status(404).type('text/plain').send('NOT FOUND\r\n');
    return;
  }

  if (contents.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
    // Door directories hold LHA archives and 68K binaries. The C door has no
    // use for either, and its buffers are not the place to find that out.
    res.status(415).type('text/plain').send('BINARY\r\n');
    return;
  }

  const truncated = contents.length > FILE_BYTE_LIMIT;
  const body = truncated ? contents.subarray(0, FILE_BYTE_LIMIT) : contents;

  res.status(200).type('text/plain').send(
    `FILE|${body.length}|${truncated ? '1' : '0'}\r\n` + body.toString('binary'),
  );
});

/**
 * GET /installed/:cmd/info - the command's tooltypes.
 *
 * Straight from `parseInfoFile`, which is what DOORMAN's editor already reads
 * through and what the writer in phase C will use. A commented tooltype keeps
 * its flag: the Amiga syntax it was disabled with matters on write, and a
 * reader that dropped disabled entries would make an editor built on it lose
 * them.
 */
doorAdminRouter.get('/installed/:cmd/info', (req: Request, res: Response) => {
  const { cmd } = req.params;
  if (!isCommandName(cmd)) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const command = cmd.toUpperCase();
  const infoPath = path.join(resolveBbsRoot(), 'Commands', 'BBSCmd', `${command}.info`);
  if (!amigafs.existsSync(infoPath)) {
    res.status(404).type('text/plain').send('NOT FOUND\r\n');
    return;
  }

  let tooltypes;
  try {
    tooltypes = parseInfoFile(amigafs.resolvePath(infoPath) ?? infoPath).tooltypes;
  } catch {
    res.status(500).type('text/plain').send('ERROR\r\n');
    return;
  }

  const rows = tooltypes.map((t) => [
    t.commented ? '1' : '0',
    sanitizeField(t.key, FIELD_CAPS.key),
    sanitizeField(t.value, FIELD_CAPS.value),
  ]);

  res.status(200).type('text/plain').send(renderRows('INFO', rows));
});

doorAdminRouter.post('/installed', (req: Request, res: Response) => {
  const { command, archiveName, metadata } = req.body ?? {};
  if (!isCommandName(command) || typeof archiveName !== 'string' || archiveName.length === 0) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const bbsRoot = process.env.BBS_DATA_DIR || process.cwd();
  recordDoorInstall({
    bbsRoot,
    command: command.toUpperCase(),
    archiveName,
    installDir: path.join(bbsRoot, 'Doors', command.toUpperCase()),
    infoPath: path.join(bbsRoot, 'Commands', 'BBSCmd', `${command.toUpperCase()}.info`),
    metadata: metadata ?? {},
  });

  res.status(200).type('text/plain').send('OK\r\n');
});
