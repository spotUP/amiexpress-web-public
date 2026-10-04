/**
 * The admin site's file manager API (plan thoughts/shared/plans/
 * 2026-09-29-admin-file-manager.md, phase P2). Mounted behind
 * authenticateToken + requireSysop (server/routes-setup.ts).
 *
 * Every change goes through services/file-list.service - the same functions
 * FM uses at the BBS prompt - so the board and the admin site edit the
 * listings one way. `dir` is a directory number, or -1 for Hold.
 */
import express, { Request, Response } from 'express';

import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';
import { conferenceNumbers, conferenceNdirs } from '../conferences/conference-paths';
import { loadConfConfig } from '../services/conf-config.service';
import {
  bytesLocation,
  dateCompareValue,
  descriptionLinesOf,
  deleteEntry,
  deleteUnlisted,
  listEntries,
  mismatches,
  moveEntry,
  moveDirectoryToDrive,
  planMoveToDrive,
  updateDescription,
  type FileListContext,
} from '../services/file-list.service';

export function createFileListRouter(db?: unknown): express.Router {
  const router = express.Router();
  const ctx = (): FileListContext => ({ dataDir: config.get('dataDir'), db });

  const ok = <T>(res: Response, data: T, message?: string) =>
    res.json({ success: true, data, message, timestamp: getSystemTime().toISOString() });
  const fail = (res: Response, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const status = /not in that listing|not found|not on a cloud drive|No cloud drive/i.test(message) ? 404 : /must be/i.test(message) ? 400 : 500;
    res.status(status).json({ success: false, message, timestamp: getSystemTime().toISOString() });
  };
  const num = (value: string, what: string): number => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n)) throw new Error(`${what} must be a number`);
    return n;
  };

  /** Every conference with its directories and how many entries each lists. */
  router.get('/conferences', async (_req: Request, res: Response) => {
    try {
      const names = loadConfConfig(ctx().dataDir)?.entries ?? [];
      const out = [];
      for (const conf of conferenceNumbers(ctx().dataDir)) {
        const ndirs = conferenceNdirs(ctx().dataDir, conf);
        const dirs = [];
        for (const dir of [...Array.from({ length: ndirs }, (_v, i) => i + 1), -1]) {
          dirs.push({ dir, entries: (await listEntries(ctx(), conf, dir)).length });
        }
        out.push({ conf, name: names[conf - 1]?.name ?? `Conference ${conf}`, dirs });
      }
      ok(res, out);
    } catch (error) {
      fail(res, error);
    }
  });

  /** One listing's entries, with where each file's bytes are. */
  router.get('/conferences/:conf/dirs/:dir/entries', async (req: Request, res: Response) => {
    try {
      const conf = num(req.params.conf, 'conf');
      const dir = num(req.params.dir, 'dir');
      const entries = await listEntries(ctx(), conf, dir);
      const out = [];
      for (const entry of entries) {
        const filename = entry.filename.trim();
        out.push({
          filename,
          marker: entry.statusMarker,
          size: entry.fileSize,
          date: entry.uploadDateDisplay,
          // yyyymmdd, so the page can sort by date across the century
          dateValue: dateCompareValue(entry.uploadDateDisplay),
          description: descriptionLinesOf(entry),
          bytes: await bytesLocation(ctx(), conf, dir, filename),
        });
      }
      ok(res, out);
    } catch (error) {
      fail(res, error);
    }
  });

  router.patch('/conferences/:conf/dirs/:dir/entries/:name', async (req: Request, res: Response) => {
    try {
      const description = req.body?.description;
      if (!Array.isArray(description) || !description.every((l) => typeof l === 'string')) {
        throw new Error('description must be an array of lines');
      }
      await updateDescription(ctx(), num(req.params.conf, 'conf'), num(req.params.dir, 'dir'), req.params.name, description);
      ok(res, null, 'Description saved');
    } catch (error) {
      fail(res, error);
    }
  });

  router.delete('/conferences/:conf/dirs/:dir/entries/:name', async (req: Request, res: Response) => {
    try {
      const outcome = await deleteEntry(ctx(), num(req.params.conf, 'conf'), num(req.params.dir, 'dir'), req.params.name);
      ok(res, outcome, outcome.bytesError ? 'Removed from the listing; the file itself could not be deleted' : 'Deleted');
    } catch (error) {
      fail(res, error);
    }
  });

  router.post('/conferences/:conf/dirs/:dir/entries/:name/move', async (req: Request, res: Response) => {
    try {
      const to = { conf: num(String(req.body?.toConf), 'toConf'), dir: num(String(req.body?.toDir), 'toDir') };
      await moveEntry(ctx(), { conf: num(req.params.conf, 'conf'), dir: num(req.params.dir, 'dir'), filename: req.params.name }, to);
      ok(res, null, 'Moved');
    } catch (error) {
      fail(res, error);
    }
  });

  /** Where a conference's listings and folders disagree (plan D3). */
  /**
   * A directory put on a cloud drive keeps the files it already had on this
   * server's disk. What moving them would do: the files, their bytes, and
   * the room left on the drive.
   */
  router.get('/conferences/:conf/dirs/:dir/move-to-drive', async (req: Request, res: Response) => {
    try {
      ok(res, await planMoveToDrive(ctx(), num(req.params.conf, 'conf'), num(req.params.dir, 'dir')));
    } catch (error) {
      fail(res, error);
    }
  });

  /** One batch of that move (about 20 seconds); the caller repeats while files remain. */
  router.post('/conferences/:conf/dirs/:dir/move-to-drive', async (req: Request, res: Response) => {
    try {
      ok(res, await moveDirectoryToDrive(ctx(), num(req.params.conf, 'conf'), num(req.params.dir, 'dir')));
    } catch (error) {
      fail(res, error);
    }
  });

  router.get('/conferences/:conf/mismatches', async (req: Request, res: Response) => {
    try {
      ok(res, await mismatches(ctx(), num(req.params.conf, 'conf')));
    } catch (error) {
      fail(res, error);
    }
  });

  /** Delete a file no listing names; folder and filename as the mismatch report gave them. */
  router.delete('/conferences/:conf/unlisted', async (req: Request, res: Response) => {
    try {
      const folder = req.query.folder;
      const filename = req.query.name;
      if (typeof folder !== 'string' || typeof filename !== 'string') throw new Error('folder and name must be given');
      await deleteUnlisted(ctx(), num(req.params.conf, 'conf'), folder, filename);
      ok(res, null, 'Deleted');
    } catch (error) {
      fail(res, error);
    }
  });

  return router;
}
