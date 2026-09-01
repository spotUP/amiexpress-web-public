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
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';
import { screenSearchLocations } from '../screens/screen-resolution';
import {
  getScreenIndex, invalidateScreenIndex, screenFileFacts, buildScreenIndex,
} from '../screens/screen-index.service';

export const screensRouter = express.Router();

/**
 * Resolve a path under the BBS root, the way the rest of this codebase does.
 *
 * Confinement is checked on the requested path AND on what it resolved to, so
 * a symlink cannot walk out of the board.
 */
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
  sendOk(res, getScreenIndex(config.get('dataDir')));
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
