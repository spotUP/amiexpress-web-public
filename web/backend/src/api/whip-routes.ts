/**
 * WHIP mirror bot routes (Phase 1).
 *
 * Mounted behind authenticateServiceToken - the bot's shared secret, not a
 * user JWT. Reads go through WhipService (fresh door-DataManager per call,
 * never writes WHIP JSON); link verification spends LINKDISCORD codes.
 *
 * Base URL: /api/whip
 */

import express, { Request, Response } from 'express';
import { getSystemTime } from '../utils/date-time.util';
import type { Database } from '../database';
import { whipService } from '../services/whip.service';
import { discordLinkService } from '../services/discord-link.service';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

export function createWhipRouter(database: Database): ReturnType<typeof express.Router> {
  const router = express.Router();

  const sendResponse = <T>(res: Response, data: T, message?: string) => {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message,
      timestamp: getSystemTime().toISOString(),
    };
    res.json(response);
  };

  const sendError = (res: Response, message: string, statusCode: number) => {
    const response: ApiResponse = { success: false, message, timestamp: getSystemTime().toISOString() };
    res.status(statusCode).json(response);
  };

  // Verify a LINKDISCORD code and bind the Discord account. Single use:
  // unknown, expired, and already-spent codes all read the same.
  router.post('/link', async (req: Request, res: Response) => {
    const { code, discordId } = req.body ?? {};
    if (typeof code !== 'string' || !code.trim() || typeof discordId !== 'string' || !discordId.trim()) {
      sendError(res, 'code and discordId are required', 400);
      return;
    }
    const redeemed = await discordLinkService.redeemCode(code, discordId.trim(), database as any);
    if (!redeemed) {
      sendError(res, 'Unknown, expired, or already-used code. Run LINKDISCORD on the BBS for a fresh one.', 404);
      return;
    }
    sendResponse(res, redeemed, `Linked to ${redeemed.username}`);
  });

  // Which BBS user (if any) owns this Discord account.
  router.get('/link-status', async (req: Request, res: Response) => {
    const discordId = req.query.discordId;
    if (typeof discordId !== 'string' || !discordId) {
      sendError(res, 'discordId query parameter is required', 400);
      return;
    }
    const link = await database.getDiscordLinkByDiscordId(discordId);
    if (!link) {
      sendError(res, 'Not linked', 404);
      return;
    }
    sendResponse(res, { userId: link.userId });
  });

  router.get('/projects', async (_req: Request, res: Response) => {
    try {
      sendResponse(res, await whipService.listProjects());
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load projects', 500);
    }
  });

  router.get('/tasks', async (req: Request, res: Response) => {
    const projectId = req.query.projectId;
    if (typeof projectId !== 'string' || !projectId) {
      sendError(res, 'projectId query parameter is required', 400);
      return;
    }
    try {
      sendResponse(res, await whipService.listTasks(projectId));
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load tasks', 500);
    }
  });

  router.get('/my-tasks', async (req: Request, res: Response) => {
    const userId = req.query.userId;
    if (typeof userId !== 'string' || !userId) {
      sendError(res, 'userId query parameter is required', 400);
      return;
    }
    try {
      sendResponse(res, await whipService.listUserTasks(userId));
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load tasks', 500);
    }
  });

  router.get('/leaderboard', async (_req: Request, res: Response) => {
    try {
      sendResponse(res, await whipService.leaderboard());
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load leaderboard', 500);
    }
  });

  router.get('/achievements/:userId', async (req: Request, res: Response) => {
    try {
      const result = await whipService.achievementsFor(req.params.userId);
      if (!result) {
        sendError(res, 'Unknown user', 404);
        return;
      }
      sendResponse(res, result);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load achievements', 500);
    }
  });

  router.get('/parties', async (_req: Request, res: Response) => {
    try {
      sendResponse(res, await whipService.listParties());
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load parties', 500);
    }
  });

  return router;
}
