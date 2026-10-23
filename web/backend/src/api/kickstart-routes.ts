/**
 * Kickstart ROM status and upload for the web admin.
 *
 *   GET  /api/config/kickstart   what the emulator will run (and what was rejected)
 *   POST /api/upload/kickstart   multipart field `rom`; any filename, validated by content
 *
 * The decision of what counts as a Kickstart lives in rom/amiga-rom.ts; this
 * file is transport only.
 */
import express, { Request, Response, Router } from 'express';
import multer from 'multer';
import { authenticateToken, requireSysop } from '../middleware/auth.middleware';
import { installKickstart, kickstartStatus } from '../amiga-emulation/rom/amiga-rom';

/** A Kickstart is 512K; anything a lot larger is not one, so do not buffer it. */
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function createKickstartRouter(db: Parameters<typeof authenticateToken>[0]): Router {
  const router = express.Router();
  const guard = [authenticateToken(db), requireSysop()];
  const parse = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } }).single('rom');

  router.get('/api/config/kickstart', ...guard, (_req: Request, res: Response) => {
    res.json(kickstartStatus());
  });

  router.post('/api/upload/kickstart', ...guard, (req: Request, res: Response) => {
    parse(req, res, (err: unknown) => {
      if (err) {
        return res.status(400).json({ error: `Upload failed: ${(err as Error).message}` });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided (multipart field "rom")' });
      }
      try {
        const result = installKickstart(req.file.buffer);
        if (!result.ok) {
          return res.status(400).json({ error: result.reason });
        }
        return res.json({ ...kickstartStatus(), installed: result.label });
      } catch (e) {
        console.error('[Kickstart Upload] Install failed:', e);
        return res.status(500).json({ error: 'Could not store the ROM' });
      }
    });
  });

  return router;
}
