/**
 * WEB_BULLS_CONFIG routes - the Bulls door menu, editable from the admin.
 *
 * Sysop-only like every other board-file writer. GET answers the parsed
 * config with its problems; PUT saves exact bytes (the service keeps one
 * .bak) and answers the rechecked parse.
 */
import express, { Request, Response } from 'express';
import { getSystemTime } from '../utils/date-time.util';
import { loadBullsConfig, saveBullsConfig } from '../services/bulls-config.service';

export function createBullsRouter(bbsRoot: string): ReturnType<typeof express.Router> {
  const router = express.Router();

  router.get('/', (_req: Request, res: Response) => {
    try {
      const { raw, parsed } = loadBullsConfig(bbsRoot);
      res.json({ success: true, data: { raw, ...parsed }, timestamp: getSystemTime().toISOString() });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load Bulls.CFG',
      });
    }
  });

  router.put('/', (req: Request, res: Response) => {
    const { raw } = req.body ?? {};
    if (typeof raw !== 'string' || !raw) {
      res.status(400).json({ success: false, message: 'raw file text is required' });
      return;
    }
    try {
      const parsed = saveBullsConfig(bbsRoot, raw);
      res.json({ success: true, data: { raw, ...parsed }, timestamp: getSystemTime().toISOString() });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save Bulls.CFG',
      });
    }
  });

  return router;
}
