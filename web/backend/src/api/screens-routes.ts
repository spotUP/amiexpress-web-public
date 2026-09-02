/**
 * Screen Files API - the admin's view of every screen the board can display.
 *
 * Four rules run through every route here, and each was paid for by a bug
 * already in this repo's history:
 *
 *   1. Resolve a path ONCE, case-insensitively, and use that resolved path for
 *      the read, the backup and the write. info-editor-routes.ts tested
 *      existence case-insensitively and then read case-sensitively - invisible
 *      on macOS, broken on the Linux container.
 *   2. Bytes, never text. Content crosses as base64 both ways: a UTF-8 round
 *      trip turns an Amiga high-bit byte into U+FFFD.
 *   3. Never normalise a filename. The security level (LOGON20.TXT) and the
 *      type extension (flt.txt.gr) ARE the routing (express.e:6544-6640).
 *   4. Back up before every destructive write, and restore on failure.
 */

import express, { Request, Response } from 'express';
import multer from 'multer';
import AdmZip from 'adm-zip';
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { config } from '../config';
import { userFileManager } from '../services/UserFileManager';
import { getSystemTime } from '../utils/date-time.util';
import { screenSearchLocations } from '../screens/screen-resolution';
import { checkShare } from '../screens/share-preconditions';
import { applyTooltypes } from '../utils/info-file.util';
import {
  getScreenIndex, invalidateScreenIndex, screenFileFacts, buildScreenIndex,
  listScreenDirectories,
} from '../screens/screen-index.service';

export const screensRouter = express.Router();

/**
 * Resolve a path under the BBS root, the way the rest of this codebase does.
 *
 * Confinement is checked on the requested path AND on what it resolved to, so
 * a symlink cannot walk out of the board.
 */
/**
 * A path inside the board root, whether or not anything is there yet.
 *
 * resolveScreenPath() answers null for a path that does not exist, because it
 * resolves through the Amiga filesystem's case-insensitive lookup. That is
 * right for reading a file and wrong for naming a directory a sysop may be
 * about to choose or create: the two questions were the same call, so "there
 * is no Screens/Shared" was reported as "outside the board root".
 */
export function containedScreenPath(relativePath: string): string | null {
  const bbsRoot = path.resolve(config.get('dataDir'));
  const full = path.resolve(path.join(bbsRoot, relativePath));

  return full === bbsRoot || full.startsWith(`${bbsRoot}${path.sep}`) ? full : null;
}

export function resolveScreenPath(relativePath: string): string | null {
  const bbsRoot = config.get('dataDir');
  const fullPath = path.join(bbsRoot, relativePath);

  const resolvedRoot = path.resolve(bbsRoot);
  if (!path.resolve(fullPath).startsWith(resolvedRoot)) return null;

  const real = amigafs.resolvePath(fullPath);
  if (!real) return null;
  if (!path.resolve(real).startsWith(resolvedRoot)) return null;

  return real;
}

/** The envelope every admin page unwraps - `success`, `data`, `message`. */
function sendOk<T>(res: Response, data: T, message?: string): void {
  res.json({
    success: true,
    data,
    message,
    timestamp: getSystemTime().toISOString(),
  });
}

/**
 * GET /api/screens
 * Every screen, where it resolves per scope, the duplicate groups and the
 * files nothing reads.
 */
screensRouter.get('/', (_req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const index = getScreenIndex(baseDir);

  // How many accounts sit at each security level.
  //
  // Not part of the index: that is built from the screen directories and
  // cached on their mtimes, while user.data changes every time somebody logs
  // on. Counted here so a variant can say "95 callers" rather than "levels
  // 30 and above", which is the fact a sysop is actually asking for.
  const callersByLevel: Record<number, number> = {};
  try {
    for (const user of userFileManager.readAllUsers() ?? []) {
      const level = Number((user as { secLevel?: number }).secLevel ?? 0);
      if (!Number.isFinite(level)) continue;
      callersByLevel[level] = (callersByLevel[level] ?? 0) + 1;
    }
  } catch (error) {
    console.error('[Screens] could not count callers by level:', error);
  }

  sendOk(res, { ...index, callersByLevel });
});

/**
 * GET /api/screens/file?path=...[&download=1]
 * The bytes, base64 for the editor and raw for a download.
 */
screensRouter.get('/file', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  let buf: Buffer;
  try {
    buf = fs.readFileSync(full);
  } catch (error) {
    return res.status(404).json({ success: false, error: (error as Error).message });
  }

  if (req.query.download) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(full)}"`);
    return res.end(buf);
  }

  return sendOk(res, {
    ...screenFileFacts(config.get('dataDir'), full),
    content: buf.toString('base64'),
  });
});

/**
 * GET /api/screens/resolve?screen=&node=&conf=
 * Which directories express.e would search, in order, and which file won.
 *
 * This is the question nobody could answer before: "what does node 7 actually
 * display for BBSTITLE, and why".
 */
screensRouter.get('/resolve', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const screen = String(req.query.screen || '').toUpperCase();
  const nodeId = parseInt(String(req.query.node ?? '1'), 10);
  const confId = req.query.conf ? parseInt(String(req.query.conf), 10) : undefined;

  const searched = screenSearchLocations(baseDir, screen, { nodeId, confId })
    .map(l => ({ dir: path.relative(baseDir, l.dir) || '.', desc: l.desc }));

  const index = getScreenIndex(baseDir);
  const entry = index.screens.find(s => s.screen === screen);
  const resolution = entry?.resolutions.find(r =>
    r.scope === 'conf' ? r.id === confId : r.scope === 'node' ? r.id === nodeId : true);

  sendOk(res, {
    screen,
    searched,
    chosen: resolution?.file ?? null,
    variants: resolution?.variants ?? [],
  });
});

/**
 * Resolve a path that may not exist yet: the parent has to be real, the
 * basename does not.
 */
function resolveScreenPathAllowingNew(relativePath: string): string | null {
  const existing = resolveScreenPath(relativePath);
  if (existing) return existing;

  const parent = resolveScreenPath(path.dirname(relativePath));
  if (!parent) return null;
  return path.join(parent, path.basename(relativePath));
}

/**
 * Write one buffer to many targets, atomically enough to undo.
 *
 * Each target is backed up before it is touched, and a failure anywhere
 * restores every file already written - a replace across forty nodes is
 * all-or-nothing rather than half-applied.
 */
function writeToTargets(targets: string[], buf: Buffer): string[] {
  const done: { full: string; backup: string | null }[] = [];

  try {
    for (const rel of targets) {
      const full = resolveScreenPathAllowingNew(rel);
      if (!full) throw new Error(`Path outside the board root: ${rel}`);

      let backup: string | null = null;
      if (fs.existsSync(full)) {
        backup = `${full}.backup`;
        fs.copyFileSync(full, backup);
      }
      fs.writeFileSync(full, buf);
      done.push({ full, backup });
    }
  } catch (error) {
    for (const d of done) {
      if (d.backup) fs.copyFileSync(d.backup, d.full);
      else fs.unlinkSync(d.full);
    }
    throw error;
  }

  invalidateScreenIndex();
  return done.map(d => d.full);
}

/**
 * Whether a rename would move a screen off its route.
 *
 * The security level and the type extension are not decoration:
 * findSecurityScreen picks LOGON20.TXT for a level-20 caller and LOGON.TXT for
 * everyone below, and ScreenTypes.info decides which extension an ANSI caller
 * is served. Renaming either silently unroutes the screen.
 */
function renameChangesRouting(from: string, to: string): boolean {
  const stem = (n: string) => n.toLowerCase().replace(/\.[^.]*$/, '');
  const securityLevel = (n: string) => (stem(n).match(/(\d+)$/) || ['', ''])[1];
  const extension = (n: string) => {
    const lower = n.toLowerCase();
    const dot = lower.indexOf('.');
    return dot === -1 ? '' : lower.slice(dot);
  };
  return securityLevel(from) !== securityLevel(to) || extension(from) !== extension(to);
}

/** Which `screen scope=id` pairs lose their file when these paths go away. */
function resolutionsLost(baseDir: string, before: ReturnType<typeof buildScreenIndex>): string[] {
  const after = buildScreenIndex(baseDir);
  const lost: string[] = [];

  for (const entry of before.screens) {
    const now = after.screens.find(s => s.screen === entry.screen);
    for (const res of entry.resolutions) {
      if (!res.file) continue;
      const stillThere = now?.resolutions.find(r => r.scope === res.scope && r.id === res.id)?.file;
      if (!stillThere) lost.push(`${entry.screen} ${res.scope}=${res.id}`);
    }
  }

  return lost;
}

/**
 * PUT /api/screens/file?path=...[&rename=...]
 * Body: { content: base64, targets?: string[] }
 */
screensRouter.put('/file', (req: Request, res: Response) => {
  const rel = String(req.query.path || '');
  const rename = req.query.rename ? String(req.query.rename) : null;

  if (rename && renameChangesRouting(path.basename(rel), rename)) {
    return res.status(400).json({
      success: false,
      error: 'That rename changes the routing - the security level and the type extension decide which caller sees this screen',
    });
  }

  const content = String((req.body || {}).content ?? '');
  const targets: string[] = Array.isArray(req.body?.targets) && req.body.targets.length
    ? req.body.targets
    : [rename ? path.join(path.dirname(rel), rename) : rel];

  try {
    const written = writeToTargets(targets, Buffer.from(content, 'base64'));
    return sendOk(res, { written: written.map(w => path.relative(config.get('dataDir'), w)) },
      `Wrote ${written.length} file${written.length === 1 ? '' : 's'}`);
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * DELETE /api/screens/file?path=...
 * Backs up, removes, and reports which scopes stop resolving because of it.
 */
screensRouter.delete('/file', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const rel = String(req.query.path || '');
  const full = resolveScreenPath(rel);
  if (!full) {
    return res.status(400).json({ success: false, error: 'Path outside the board root' });
  }

  const before = buildScreenIndex(baseDir);

  try {
    fs.copyFileSync(full, `${full}.backup`);
    fs.unlinkSync(full);
    invalidateScreenIndex();
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }

  return sendOk(res, {
    deleted: path.relative(baseDir, full),
    backup: `${path.relative(baseDir, full)}.backup`,
    stopsResolving: resolutionsLost(baseDir, before),
  });
});

/** Uploads are held in memory: a screen is kilobytes, and the bytes go straight to disk. */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

/**
 * POST /api/screens/upload
 * multipart: `file`, plus `path` and optional `targets` (JSON array).
 *
 * Refuses a file whose bytes disagree with the target's extension - RIP bytes
 * under a .txt name would render as garbage to every caller, and the extension
 * is what the loader routes on.
 */
screensRouter.post('/upload', upload.single('file'), (req: Request, res: Response) => {
  const rel = String((req.body || {}).path || '');
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const looksRip = file.buffer.subarray(0, 2).toString('latin1') === '!|';
  const namedRip = rel.toLowerCase().endsWith('.rip');
  if (looksRip !== namedRip) {
    return res.status(400).json({
      success: false,
      error: looksRip
        ? 'These are RIP bytes; the target name is not a .rip, and the extension is what the loader routes on'
        : 'The target is a .rip but these bytes are not RIP',
    });
  }

  let targets: string[] = [rel];
  try {
    const raw = (req.body || {}).targets;
    if (raw) targets = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return res.status(400).json({ success: false, error: 'targets must be a JSON array of paths' });
  }

  try {
    const written = writeToTargets(targets, file.buffer);
    return sendOk(res, { written: written.map(w => path.relative(config.get('dataDir'), w)) },
      `Uploaded to ${written.length} file${written.length === 1 ? '' : 's'}`);
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }
});

/**
 * POST /api/screens/share
 * Body: { nodes: number[], sharedDir: string, dryRun?: boolean }
 *
 * Points nodes at one screen directory - express.e's own answer to a board
 * with more nodes than screen sets (ACP.e:2666-2673). Nothing is deleted: the
 * node's own files stay where they are and simply stop being read, so undoing
 * this is clearing one tooltype rather than restoring from a backup.
 *
 * Every node is checked BEFORE any is written. A share that half-applies
 * leaves the board in two states, and the sysop cannot see which node is in
 * which.
 */
/**
 * GET /api/screens/shared-directories
 *
 * Directories a node's SCREENS tooltype can point at: they exist, they hold
 * screen files, and they belong to no single node or conference. This board's
 * is `Screens/Node`, where 215 nodes already read from - the admin used to
 * offer a hardcoded `Screens/Shared`, which does not exist here, and the share
 * failed with a message about the board root.
 */
screensRouter.get('/shared-directories', (_req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const found: { dir: string; files: number }[] = [];

  const countScreens = (dir: string): number => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter(entry => entry.isFile() && isScreenFileName(entry.name))
        .length;
    } catch {
      return 0;
    }
  };

  const consider = (rel: string) => {
    // A node's or a conference's own directory is not a shared one.
    if (/^(Node|Conf)\d+(\/|$)/i.test(rel)) return;
    const files = countScreens(path.join(baseDir, rel));
    if (files > 0) found.push({ dir: rel, files });
  };

  consider('Screens');
  try {
    for (const entry of fs.readdirSync(path.join(baseDir, 'Screens'), { withFileTypes: true })) {
      if (entry.isDirectory()) consider(`Screens/${entry.name}`);
    }
  } catch { /* a board with no Screens directory simply has none to offer */ }

  return sendOk(res, { directories: found.sort((a, b) => b.files - a.files) });
});

screensRouter.post('/share', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const nodes: number[] = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
  const sharedDirRel = String(req.body?.sharedDir || '');
  const dryRun = !!req.body?.dryRun;

  if (!nodes.length || !sharedDirRel) {
    return res.status(400).json({ success: false, error: 'nodes and sharedDir are required' });
  }
  // Containment and existence are different answers and the sysop needs the
  // right one. resolveScreenPath() resolves THROUGH the Amiga filesystem, which
  // returns null for a path that is simply not there - so asking to share
  // `Screens/Shared` on a board that has no such directory was reported as an
  // attempt to escape the board root. Reported live, 2026-09-02.
  const sharedDirFull = containedScreenPath(sharedDirRel);
  if (!sharedDirFull) {
    return res.status(400).json({ success: false, error: 'The shared directory is outside the board root' });
  }
  if (!fs.existsSync(sharedDirFull) || !fs.statSync(sharedDirFull).isDirectory()) {
    return res.status(400).json({
      success: false,
      error: `No such directory: ${sharedDirRel}. Choose one that exists - the board reports them at /api/screens/shared-directories.`,
    });
  }

  const checks = nodes.map(id => ({ id, check: checkShare(baseDir, id, sharedDirRel) }));
  const blocked = checks.filter(c => !c.check.ok).map(c => ({
    id: c.id,
    reasons: [
      ...c.check.reasons,
      ...c.check.losing.map(name => `would lose ${name}`),
      ...c.check.gaining.map(name => `would gain ${name}`),
    ],
    losing: c.check.losing,
    gaining: c.check.gaining,
  }));

  const canShare = checks.filter(c => c.check.ok).map(c => c.id);

  if (blocked.length) {
    // A DRY RUN that finds blockers has answered the question it was asked:
    // "which of these nodes could share this directory?". Answering 409 made
    // the browser log it as a failed request and forced the page to read its
    // own answer out of an exception. A real share keeps the 409 - that one is
    // a refusal, and nothing was written.
    if (dryRun) {
      return sendOk(
        res,
        { blocked, canShare, wouldWrite: [], tooltype: null },
        `${blocked.length} node${blocked.length === 1 ? '' : 's'} cannot share this directory`,
      );
    }

    return res.status(409).json({
      success: false,
      error: `${blocked.length} node${blocked.length === 1 ? '' : 's'} cannot share this directory`,
      data: { blocked, canShare },
    });
  }

  // ACP.e:2668 runs checkPathSlash over the value, so a real board's tooltype
  // carries the trailing slash. Write the same thing.
  const amigaPath = `BBS:${sharedDirRel.split(path.sep).join('/')}/`;
  const wouldWrite = nodes.map(id => `Node${id}.info`);

  if (dryRun) {
    return sendOk(res, { wouldWrite, tooltype: amigaPath, canShare: nodes, blocked: [] },
      'Nothing written - this was a dry run');
  }

  try {
    for (const id of nodes) {
      // applyTooltypes preserves the icon and every tooltype it does not name;
      // SCREENS is the only key this owns.
      applyTooltypes(path.join(baseDir, `Node${id}.info`), [['SCREENS', amigaPath]]);
    }
    invalidateScreenIndex();
  } catch (error) {
    return res.status(500).json({ success: false, error: (error as Error).message });
  }

  return sendOk(res, { written: wouldWrite, tooltype: amigaPath },
    `${nodes.length} node${nodes.length === 1 ? '' : 's'} now read ${sharedDirRel}`);
});

const SCREEN_EXTENSIONS = ['.txt', '.gr', '.ibm', '.seq', '.rip', '.ans', '.asc'];

function isScreenFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return !lower.endsWith('.backup') && SCREEN_EXTENSIONS.some(ext => lower.endsWith(ext));
}

/**
 * GET /api/screens/export?scope=all|Screens|Node<N>|Conf<N>
 *
 * A sysop on a release package has no git and no shell on the volume; an
 * archive is how screens are backed up and carried between hosts.
 */
screensRouter.get('/export', (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const scope = String(req.query.scope || 'all');

  const dirs = listScreenDirectories(baseDir).filter(dir => {
    if (scope === 'all') return true;
    const rel = path.relative(baseDir, dir);
    return rel === scope || rel.startsWith(`${scope}${path.sep}`);
  });

  if (!dirs.length) {
    return res.status(404).json({ success: false, error: `Nothing to export for scope ${scope}` });
  }

  const zip = new AdmZip();
  for (const dir of dirs) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        if (!fs.statSync(full).isFile() || !isScreenFileName(name)) continue;
      } catch {
        continue;
      }
      // Zip paths are always forward-slashed, whatever this host uses.
      zip.addFile(path.relative(baseDir, full).split(path.sep).join('/'), fs.readFileSync(full));
    }
  }

  const stamp = getSystemTime().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="screens-${scope}-${stamp}.zip"`);
  return res.end(zip.toBuffer());
});

/**
 * POST /api/screens/import
 * multipart: `archive`, optional `dryRun`.
 *
 * The whole archive is validated before ANY of it is written: an archive that
 * half-applies is worse than one that is rejected, because the sysop cannot
 * see which half landed.
 */
screensRouter.post('/import', upload.single('archive'), (req: Request, res: Response) => {
  const baseDir = config.get('dataDir');
  const file = (req as Request & { file?: { buffer: Buffer } }).file;
  if (!file) return res.status(400).json({ success: false, error: 'No archive uploaded' });

  let entries: { entryName: string; getData: () => Buffer; isDirectory: boolean }[];
  try {
    entries = new AdmZip(file.buffer).getEntries() as never;
  } catch (error) {
    return res.status(400).json({ success: false, error: `Not a readable archive: ${(error as Error).message}` });
  }

  const plan: { path: string; action: 'create' | 'replace'; bytes: number }[] = [];
  const payloads: { rel: string; buf: Buffer }[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const rel = entry.entryName.split('/').join(path.sep);

    if (!isScreenFileName(path.basename(rel))) {
      return res.status(400).json({
        success: false,
        error: `${entry.entryName} is not a screen file - the extension is what the loader routes on`,
      });
    }

    const full = resolveScreenPathAllowingNew(rel);
    if (!full) {
      return res.status(400).json({
        success: false,
        error: `${entry.entryName} would land outside the board root; nothing was written`,
      });
    }

    const buf = entry.getData();
    payloads.push({ rel, buf });
    plan.push({
      path: path.relative(baseDir, full),
      action: fs.existsSync(full) ? 'replace' : 'create',
      bytes: buf.length,
    });
  }

  if (req.body?.dryRun === 'true' || req.body?.dryRun === true) {
    return sendOk(res, { plan }, 'Nothing written - this was a dry run');
  }

  try {
    for (const { rel, buf } of payloads) writeToTargets([rel], buf);
  } catch (error) {
    return res.status(400).json({ success: false, error: (error as Error).message });
  }

  return sendOk(res, { plan }, `Imported ${plan.length} file${plan.length === 1 ? '' : 's'}`);
});
