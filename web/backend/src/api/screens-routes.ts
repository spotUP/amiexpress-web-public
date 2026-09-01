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
import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from '../utils/amigafs';
import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';
import { screenSearchLocations } from '../screens/screen-resolution';
import { getScreenIndex, screenFileFacts } from '../screens/screen-index.service';

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
