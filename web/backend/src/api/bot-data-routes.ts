/**
 * WEB_BOT_DATA HTTP transport - the same reads the chat tools use, over
 * GET, behind per-bot service tokens.
 *
 * New feature, no express.e counterpart. Every route calls a bot-data
 * function verbatim - no second implementation to drift. The token is a
 * sysop-trusted READER (all routes are GET); per-token domain scopes are
 * enforced by requireBotDomain. Base URL: /api/bot/v1
 */
import express, { Request, Response } from 'express';
import { getSystemTime } from '../utils/date-time.util';
import type { Database } from '../database';
import { requireBotDomain } from '../middleware/service-auth.middleware';
import { BOT_clampLimit } from '../services/bot-data/caps';
import type { BOTActor, BOTResult } from '../services/bot-data/types';
import { BOT_userLookup, BOT_userSearch, BOT_topCallers } from '../services/bot-data/users';
import { BOT_recentMessages, BOT_searchMessages } from '../services/bot-data/messages';
import { BOT_listConferences, BOT_searchFiles, BOT_fileStats } from '../services/bot-data/files';
import {
  BOT_whipProjects, BOT_whipTasks, BOT_whipMyTasks, BOT_whipLeaderboard, BOT_whipAchievements,
} from '../services/bot-data/whip';
import { BOT_doorData, BOT_doorDataKeys } from '../services/bot-data/doors';
import { BOT_whoOnline, BOT_sessionCount, BOT_boardTotals, BOT_recentCallers } from '../services/bot-data/activity';
import { BOT_boardInfo, BOT_listDoors } from '../services/bot-data/board';
import { whipService } from '../services/whip.service';
import { getBoardConfig } from '../services/bbs-config-file.service';
import { commandsOnDisk, conferencesFromDisk } from '../handlers/sysop-ai/board-card';
import { listOnlineNodes } from '../doors/who-is-online';

export interface BOTDataRouterOptions {
  bbsRoot: string;
  presence?: { listOnlineNodes(): Array<{ nodeNumber: number; username: string; location?: string }> };
}

export function createBotDataRouter(
  database: Database,
  opts: BOTDataRouterOptions,
): ReturnType<typeof express.Router> {
  const router = express.Router();
  const presence = opts.presence ?? { listOnlineNodes };
  const board = { getBoardConfig, commandsOnDisk, conferencesFromDisk };

  /**
   * What a bot token may see, in conferences.
   *
   * It read as the board's trusted guest with `confAccess` simply omitted -
   * and `maySee` answers true when it is absent, so a messages-scoped token
   * read public mail in EVERY conference, sysop-only ones included, and the
   * Discord bot relayed it into a channel. The plan that specified this API
   * pinned the opposite ("conf-gated message refused").
   *
   * The bot is not a caller and has no account, so it gets what an ordinary
   * caller gets: the board's own new-user conference access, the same string
   * a fresh account is created with. Fail closed - an unreadable config means
   * conference 1 only, never everything.
   */
  const botConfAccess = (): number[] => {
    try {
      const cfg = (database as any)?.getConfigRepository?.()?.getSystemConfig?.();
      const mask = String(cfg?.new_user_conf_access ?? '').trim();
      if (!mask) return [1];
      // The X/_ string: position n-1 is conference n. An area NAME (the path
      // a board with more than nine conferences takes) cannot be resolved
      // without a user record, so it also means conference 1 only.
      if (!/^[X_]+$/i.test(mask)) return [1];
      const ids = mask.split('').map((c, i) => (c.toUpperCase() === 'X' ? i + 1 : 0)).filter(Boolean);
      return ids.length ? ids : [1];
    } catch {
      return [1];
    }
  };

  /** A service token reads as the board's trusted guest: full reads,
   *  domain-scoped by the token, conference-gated like any caller. */
  const actor = (req: Request): BOTActor => ({
    secLevel: 255,
    username: `bot:${(req as any).botService?.id ?? 'unknown'}`,
    confAccess: botConfAccess(),
  });

  const send = (res: Response, r: BOTResult) => {
    res.json({ success: true, data: r, timestamp: getSystemTime().toISOString() });
  };

  const need = (res: Response, name: string, value: unknown): value is string => {
    if (typeof value === 'string' && value.trim()) return true;
    res.status(400).json({ success: false, message: `${name} is required` });
    return false;
  };

  const db = database as any;
  const confOf = (req: Request): number => {
    const n = parseInt(String(req.query.conf ?? '1'), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };
  const limitOf = (req: Request): number => BOT_clampLimit(req.query.limit);

  router.get('/board-info', requireBotDomain('board'), async (_req, res) => {
    send(res, await BOT_boardInfo(board, opts.bbsRoot));
  });
  router.get('/doors', requireBotDomain('board'), async (req, res) => {
    send(res, await BOT_listDoors(board, opts.bbsRoot, actor(req)));
  });

  router.get('/users/lookup', requireBotDomain('users'), async (req, res) => {
    if (!need(res, 'handle', req.query.handle)) return;
    send(res, await BOT_userLookup(db, actor(req), String(req.query.handle)));
  });
  router.get('/users/search', requireBotDomain('users'), async (req, res) => {
    if (!need(res, 'q', req.query.q)) return;
    send(res, await BOT_userSearch(db, actor(req), String(req.query.q), limitOf(req)));
  });
  router.get('/users/top', requireBotDomain('users'), async (req, res) => {
    send(res, await BOT_topCallers(db, actor(req), limitOf(req)));
  });

  router.get('/messages/recent', requireBotDomain('messages'), async (req, res) => {
    send(res, await BOT_recentMessages(db, actor(req), confOf(req), limitOf(req)));
  });
  router.get('/messages/search', requireBotDomain('messages'), async (req, res) => {
    if (!need(res, 'q', req.query.q)) return;
    send(res, await BOT_searchMessages(db, actor(req), confOf(req), String(req.query.q), limitOf(req)));
  });

  router.get('/files/search', requireBotDomain('files'), async (req, res) => {
    if (!need(res, 'q', req.query.q)) return;
    send(res, await BOT_searchFiles(db, actor(req), confOf(req), String(req.query.q), limitOf(req)));
  });
  router.get('/files/stats', requireBotDomain('files'), async (req, res) => {
    send(res, await BOT_fileStats(db, actor(req), confOf(req)));
  });

  router.get('/conferences', requireBotDomain('conferences'), async (req, res) => {
    send(res, await BOT_listConferences(db, actor(req)));
  });

  router.get('/whip/projects', requireBotDomain('whip'), async (_req, res) => {
    send(res, await BOT_whipProjects(whipService as any));
  });
  router.get('/whip/tasks', requireBotDomain('whip'), async (req, res) => {
    if (!need(res, 'project', req.query.project)) return;
    send(res, await BOT_whipTasks(whipService as any, String(req.query.project), limitOf(req)));
  });
  router.get('/whip/my-tasks', requireBotDomain('whip'), async (req, res) => {
    if (!need(res, 'userId', req.query.userId)) return;
    send(res, await BOT_whipMyTasks(whipService as any, String(req.query.userId), limitOf(req)));
  });
  router.get('/whip/leaderboard', requireBotDomain('whip'), async (req, res) => {
    send(res, await BOT_whipLeaderboard(whipService as any, limitOf(req)));
  });
  router.get('/whip/achievements', requireBotDomain('whip'), async (req, res) => {
    if (!need(res, 'userId', req.query.userId)) return;
    send(res, await BOT_whipAchievements(whipService as any, String(req.query.userId)));
  });

  router.get('/doors/keys', requireBotDomain('doors'), async (_req, res) => {
    res.json({ success: true, data: BOT_doorDataKeys(), timestamp: getSystemTime().toISOString() });
  });
  router.get('/doors/data', requireBotDomain('doors'), async (req, res) => {
    if (!need(res, 'door', req.query.door) || !need(res, 'key', req.query.key)) return;
    send(res, await BOT_doorData(opts.bbsRoot, String(req.query.door), String(req.query.key), limitOf(req)));
  });

  router.get('/activity/online', requireBotDomain('activity'), async (_req, res) => {
    send(res, await BOT_whoOnline(presence));
  });
  router.get('/activity/sessions', requireBotDomain('activity'), async (_req, res) => {
    send(res, await BOT_sessionCount(db));
  });
  router.get('/activity/totals', requireBotDomain('activity'), async (req, res) => {
    send(res, await BOT_boardTotals(db, actor(req)));
  });
  router.get('/activity/recent-callers', requireBotDomain('activity'), async (req, res) => {
    send(res, await BOT_recentCallers(db, limitOf(req)));
  });

  return router;
}
