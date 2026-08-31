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
import { parseInfoFile, writeInfoFile } from '../utils/info-file.util';
import { isAllowed, resolveDoorDir, resolveDoorFile, walkDoorDir } from '../doors/door-path-guard';
import { deleteDoorAndRefresh } from '../doors/door-delete';
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

/**
 * POST /installed/:cmd/rescan - the door changed a .info; reload the registry.
 *
 * NOT an enable/disable route, and deliberately so. The C door already owns
 * that rule and must: on a real AmiExpress board there is no API at all, so
 * disable has to work by writing the .info directly. It does - ACCESS=255 with
 * DRACCESS remembering the prior level, the ruling in
 * examples/doorrepo-c/flow.h:618 marked "do not redesign", with
 * flow_rewrite_access_lines editing the file in place. Implementing that here
 * as well would put one ruling in two languages, which is exactly what the
 * spec's "two front ends must never carry two rules" forbids.
 *
 * What the door cannot do from outside this process is make the BBS notice.
 * getDoors() is an in-memory registry, so a door disabled by a direct write
 * stays live until a rescan - the same reason deleteDoor already calls
 * refreshDoorCache() and initializeDoors() when it finishes.
 *
 * The reply reports whether the command is registered after the reload, which
 * is what the door needs to tell the sysop the board has picked the change up.
 */
doorAdminRouter.post('/installed/:cmd/rescan', async (req: Request, res: Response) => {
  const { cmd } = req.params;
  if (!isCommandName(cmd)) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  try {
    const { refreshDoorCache } = await import('../doors/amigaDoorManager');
    await refreshDoorCache();
    const { initializeDoors } = require('../handlers/door.handler');
    await initializeDoors();
  } catch {
    res.status(500).type('text/plain').send('ERROR\r\n');
    return;
  }

  let found = false;
  try {
    const { getDoors } = require('../handlers/door.handler');
    const wanted = cmd.toUpperCase();
    found = (getDoors() as any[]).some(
      (d) => String(d.command || d.id || '').toUpperCase() === wanted,
    );
  } catch { /* a registry that will not answer is reported as not found */ }

  res.status(200).type('text/plain').send(`RESCAN|${found ? '1' : '0'}\r\n`);
});

/** A door's .info is a handful of tooltypes; a request carrying hundreds is
 *  not an edit, and the writer rebuilds the whole array from what it is given. */
const MAX_TOOLTYPES = 64;

/**
 * PUT /installed/:cmd/info - replace the command's tooltypes.
 *
 * Reads the existing file with parseInfoFile, swaps the tooltype array, and
 * writes it back through writeInfoFile - which keeps the DiskObject header and
 * the icon imagery around the array. The board's .info files are binary Amiga
 * DiskObjects; rebuilding one from a template would throw its icon away, which
 * is the mistake caf489708 fixed in the C door for the same reason.
 *
 * The whole array is replaced, not merged: a partial update has no way to
 * express "delete this tooltype", and the editor calling this always holds the
 * full list it just read from GET .../info.
 *
 * Does not rescan. Editing a registration and making the board notice are
 * separate acts - POST .../rescan is the second one - so a caller making
 * several edits pays for one reload, not one per field.
 */
doorAdminRouter.put('/installed/:cmd/info', (req: Request, res: Response) => {
  const { cmd } = req.params;
  if (!isCommandName(cmd)) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const incoming = (req.body ?? {}).tooltypes;
  if (!Array.isArray(incoming) || incoming.length > MAX_TOOLTYPES) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  // A key with '=' or a line break in it would not read back as the same
  // tooltype, and a key that is empty is not a tooltype at all.
  const clean: Array<{ key: string; value: string; commented: boolean }> = [];
  for (const entry of incoming) {
    const key = typeof entry?.key === 'string' ? entry.key.trim() : '';
    const value = typeof entry?.value === 'string' ? entry.value : '';
    if (key === '' || /[=\r\n]/.test(key) || /[\r\n]/.test(value)) {
      res.status(400).type('text/plain').send('BAD REQUEST\r\n');
      return;
    }
    clean.push({ key, value, commented: entry?.commented === true });
  }

  const command = cmd.toUpperCase();
  const infoPath = path.join(resolveBbsRoot(), 'Commands', 'BBSCmd', `${command}.info`);
  if (!amigafs.existsSync(infoPath)) {
    res.status(404).type('text/plain').send('NOT FOUND\r\n');
    return;
  }

  try {
    const resolved = amigafs.resolvePath(infoPath) ?? infoPath;
    const info = parseInfoFile(resolved);
    info.tooltypes = clean.map((t) => ({
      key: t.key,
      value: t.value,
      commented: t.commented,
      prefix: '',
      originalLine: '',
    }));
    writeInfoFile(info);
  } catch {
    res.status(500).type('text/plain').send('ERROR\r\n');
    return;
  }

  res.status(200).type('text/plain').send(`INFOWRITE|${clean.length}\r\n`);
});

/**
 * DELETE /installed/:cmd - remove a door, streaming the log as it happens.
 *
 * The steps are written to the socket as they occur, not collected and sent
 * at the end: a door with a few hundred files takes long enough that a silent
 * pause followed by a finished log is what the sysop reads as a hang. This is
 * the same onStep contract DOORMAN already consumes in-process.
 *
 *     STEP|ok|removed Doors/AEHELP/aehelp.data
 *     STEP|skip|Doors/AEHELP/missing was not there
 *     DONE|1|Deleted AEHELP
 *
 * Because the first STEP flushes the headers, the status code is decided
 * BEFORE anything is removed. Whether the delete then succeeded is in the
 * DONE line, not in the status - a client must read to DONE.
 *
 * The removal is amigaDoorManager's, whose guard confines every path it
 * touches - the tracked database rows included - to Doors/, Commands/ or a
 * recorded library, and never to one of those roots. That guard was written
 * after an unchecked recursive delete took the whole Doors/ tree out on
 * 2026-08-30, which is also why this route exists rather than any path
 * assembly of its own.
 */
doorAdminRouter.delete('/installed/:cmd', async (req: Request, res: Response) => {
  const { cmd } = req.params;
  if (!isCommandName(cmd)) {
    res.status(400).type('text/plain').send('BAD REQUEST\r\n');
    return;
  }

  const command = cmd.toUpperCase();
  const bbsRoot = resolveBbsRoot();
  const hasInfo = amigafs.existsSync(
    path.join(bbsRoot, 'Commands', 'BBSCmd', `${command}.info`),
  );
  const hasDir = amigafs.existsSync(path.join(bbsRoot, 'Doors', cmd));
  if (!hasInfo && !hasDir) {
    // Nothing to delete and nothing to stream: say so with a status, while
    // one still can.
    res.status(404).type('text/plain').send('NOT FOUND\r\n');
    return;
  }

  res.status(200).type('text/plain');
  res.setHeader('Cache-Control', 'no-store');
  if (typeof (res as any).flushHeaders === 'function') (res as any).flushHeaders();

  const line = (parts: string[]): void => { res.write(parts.join('|') + '\r\n'); };

  let result;
  try {
    result = await deleteDoorAndRefresh(command, undefined, (step) => {
      line(['STEP', step.kind, sanitizeField(step.text, FIELD_CAPS.step)]);
    });
  } catch (err) {
    line(['DONE', '0', sanitizeField((err as Error).message, FIELD_CAPS.step)]);
    res.end();
    return;
  }

  line(['DONE', result.success ? '1' : '0', sanitizeField(result.message, FIELD_CAPS.step)]);
  res.end();
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
