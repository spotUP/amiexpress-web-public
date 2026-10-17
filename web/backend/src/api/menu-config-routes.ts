/**
 * Menu doors admin API: /api/config/menus/:kind (plan M11).
 *
 * Sysop-only like /api/config/bulls (routes-setup mounts it behind
 * authenticateToken + requireSysop). The kind's config is Menus/<KIND>.json,
 * its logo art Screens/menus/<kind>/logos; nothing else is reachable - a logo
 * name is a bare `name.txt|.seq` (LOGO_FILE_RE, the one rule the store also
 * uses), never a path.
 *
 * Errors answer { success: false, message } in our own words; filesystem
 * detail goes to the log only (bulls-routes.ts fail()).
 */
import express, { NextFunction, Request, Response } from 'express';
import { getSystemTime } from '../utils/date-time.util';
import { MENU_KINDS, LOGO_FILE_RE, type MenuKind } from '../screens/menu-config/menu-config';
import { readMenuConfig, writeMenuConfig } from '../services/menu-config.service';
import { menuSourceFor } from '../services/menu-catalogue/registry';
import { buildCatalogue } from '../services/menu-catalogue/build';
import { menuCallerForPreview } from '../services/menu-catalogue/caller';
import { chooseLogos, listMenuLogos, writeMenuLogo, deleteMenuLogo, logoUsedBy, MenuLogoError } from '../services/menu-catalogue/logos';
import { internalCommandRow } from '../screens/menu-config/internal-commands';
import { commandCache } from '../handlers/command-execution.handler';
import type { CatalogueEntry } from '../services/menu-catalogue/types';

const PREVIEW_COLUMNS = [40, 80, 132];

type EntrySource = 'internal' | 'door' | 'syscmd' | 'bulletin';

function entrySource(kind: MenuKind, e: CatalogueEntry): EntrySource {
  if (kind === 'BULLETINS') return 'bulletin';
  if (e.runAs === 'syscmd') return 'syscmd';
  // Decision 35: a door that shadows an internal key is the door's entry (dispatch order).
  return commandCache.bbscmd.has(e.key) || !internalCommandRow(e.key) ? 'door' : 'internal';
}

/**
 * A body the global JSON parser refused never reaches the router, so Express's
 * default HTML error page would answer it. Mounted right after the router
 * (routes-setup), this gives the admin the same envelope as every other answer.
 */
export function menuConfigBodyError(err: { type?: string }, _req: Request, res: Response, next: NextFunction): void {
  if (err?.type === 'entity.too.large') {
    res.status(413).json({ success: false, message: 'The request is too large; a logo file is at most 64 KB.', timestamp: getSystemTime().toISOString() });
  } else if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'The request body is not valid JSON.', timestamp: getSystemTime().toISOString() });
  } else next(err);
}

export function createMenuConfigRouter(bbsRoot: string): ReturnType<typeof express.Router> {
  const router = express.Router();
  const stamp = () => getSystemTime().toISOString();

  /** A failure the client can read; the detail only the log gets (see bulls-routes.ts). */
  const fail = (res: Response, what: string, status: number, message: string, error: unknown): void => {
    console.error(`[MenuConfig] ${what} failed:`, error);
    res.status(status).json({ success: false, message });
  };
  const kindOf = (req: Request, res: Response): MenuKind | null => {
    const kind = String(req.params.kind).toUpperCase() as MenuKind;
    if (MENU_KINDS.includes(kind)) return kind;
    res.status(404).json({ success: false, message: 'No such menu.' });
    return null;
  };
  const intParam = (v: unknown, fallback: number, min: number, max: number): number | null => {
    if (v === undefined) return fallback;
    const n = Number(v);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };

  router.get('/:kind', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    try { res.json({ success: true, data: readMenuConfig(bbsRoot, kind), timestamp: stamp() }); }
    catch (error) { fail(res, `GET ${kind}`, 500, 'Failed to load the menu settings', error); }
  });

  router.put('/:kind', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    try { res.json({ success: true, data: writeMenuConfig(bbsRoot, kind, req.body), timestamp: stamp() }); }
    catch (error) { fail(res, `PUT ${kind}`, 500, 'Failed to save the menu settings', error); }
  });

  // What a caller with these properties gets: the stored config applied to the live source, nothing sent to a caller.
  router.get('/:kind/preview', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    const level = intParam(req.query.level, 255, 0, 255);
    const columns = intParam(req.query.columns, 80, 0, 1000);
    const conference = intParam(req.query.conference, 1, 1, 65535);
    const mode = req.query.mode === undefined ? 'ansi' : req.query.mode;
    if (level === null || conference === null || columns === null || !PREVIEW_COLUMNS.includes(columns) || (mode !== 'ansi' && mode !== 'petscii')) {
      res.status(400).json({ success: false, message: 'level is 0-255, columns 40, 80 or 132, conference a number, mode ansi or petscii' });
      return;
    }
    try {
      const source = menuSourceFor(kind)!;
      const caller = menuCallerForPreview(level, columns, conference, mode);
      const { config } = readMenuConfig(bbsRoot, kind);
      const built = buildCatalogue(source, caller, config);
      if ('refusal' in built) { res.json({ success: true, data: { refusal: built.refusal }, timestamp: stamp() }); return; }
      const logos = chooseLogos(config, kind, caller, bbsRoot, false);
      res.json({ success: true, data: { sections: built.sections, style: built.style, wipes: built.wipes, logos }, timestamp: stamp() });
    } catch (error) { fail(res, `GET ${kind} preview`, 500, 'Failed to build the preview', error); }
  });

  // The editor's row source: everything this kind can list for the widest caller, before any sysop exception.
  router.get('/:kind/entries', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    try {
      const source = menuSourceFor(kind)!;
      const caller = menuCallerForPreview(255, 80, 1, 'ansi');
      const entries = source.gate(caller).ok ? source.entries(caller) : [];
      const data = entries.map(e => ({ key: e.key, label: e.label, description: e.description, section: e.section, source: entrySource(kind, e) }));
      res.json({ success: true, data, timestamp: stamp() });
    } catch (error) { fail(res, `GET ${kind} entries`, 500, 'Failed to list the menu entries', error); }
  });

  router.get('/:kind/logos', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    try { res.json({ success: true, data: listMenuLogos(bbsRoot, kind), timestamp: stamp() }); }
    catch (error) { fail(res, `GET ${kind} logos`, 500, 'Failed to list the logos', error); }
  });

  router.put('/:kind/logos/:file', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    const { file } = req.params;
    const { base64 } = req.body ?? {};
    if (!LOGO_FILE_RE.test(file)) {
      res.status(400).json({ success: false, message: 'A logo file name is letters, digits, - and _, then .txt or .seq.' });
      return;
    }
    if (typeof base64 !== 'string' || !base64) {
      res.status(400).json({ success: false, message: 'base64 file content is required' });
      return;
    }
    try {
      res.json({ success: true, data: writeMenuLogo(bbsRoot, kind, file, Buffer.from(base64, 'base64')), timestamp: stamp() });
    } catch (error) {
      if (error instanceof MenuLogoError) { res.status(400).json({ success: false, message: error.message }); return; }
      fail(res, `PUT ${kind} logo ${file}`, 500, 'Failed to save the logo', error);
    }
  });

  router.delete('/:kind/logos/:file', (req: Request, res: Response) => {
    const kind = kindOf(req, res); if (!kind) return;
    const { file } = req.params;
    if (!LOGO_FILE_RE.test(file)) {
      res.status(400).json({ success: false, message: 'A logo file name is letters, digits, - and _, then .txt or .seq.' });
      return;
    }
    try {
      const usedBy = logoUsedBy(readMenuConfig(bbsRoot, kind).config, file);
      if (usedBy.length) {
        res.status(409).json({ success: false, message: 'The menu still shows this logo; take it out of its logo sets first.', usedBy });
        return;
      }
      if (!deleteMenuLogo(bbsRoot, kind, file)) { res.status(404).json({ success: false, message: 'No such logo.' }); return; }
      res.status(204).end();
    } catch (error) { fail(res, `DELETE ${kind} logo ${file}`, 500, 'Failed to delete the logo', error); }
  });

  return router;
}
