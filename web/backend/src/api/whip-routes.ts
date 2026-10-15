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
import { whipService, WhipWriteError, type WhipActor } from '../services/whip.service';
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
    try {
      await whipService.ensureUser(redeemed.userId, redeemed.username);
    } catch (error) {
      console.error('[WHIP link]ensureUser failed (link itself succeeded):', error);
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

  // Which BBS user (if any) owns this handle. Case-insensitive, like the
  // login prompt. Ensures WHIP stats so a fresh match never hits
  // "Unknown user" on reads. The Discord bot's username matching starts
  // here; LINKDISCORD stays the explicit override.
  router.get('/resolve', async (req: Request, res: Response) => {
    const handle = req.query.handle;
    if (typeof handle !== 'string' || !handle.trim()) {
      sendError(res, 'handle query parameter is required', 400);
      return;
    }
    try {
      const user = await database.getUserByUsername(handle.trim());
      if (!user) {
        sendError(res, `No BBS user called "${handle.trim()}"`, 404);
        return;
      }
      await whipService.ensureUser(String(user.id), user.username);
      sendResponse(res, { userId: String(user.id), username: user.username });
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to resolve user', 500);
    }
  });

  router.get('/projects', async (_req: Request, res: Response) => {
    try {
      sendResponse(res, await whipService.listProjects());    } catch (error) {
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

  // Before /tasks/:id: exact match wins, but keep the specific path first
  // anyway so a project literally named "all" can never shadow the list.
  router.get('/tasks/all', async (_req: Request, res: Response) => {
    try {
      sendResponse(res, await whipService.listAllTasks());
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load tasks', 500);
    }
  });

  router.get('/tasks/:id', async (req: Request, res: Response) => {
    try {
      const task = await whipService.getTask(req.params.id);
      if (!task) {
        sendError(res, 'Unknown task', 404);
        return;
      }
      sendResponse(res, task);
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load task', 500);
    }
  });

  router.get('/my-tasks', async (req: Request, res: Response) => {    const userId = req.query.userId;
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

  router.get('/users', async (_req: Request, res: Response) => {
    try {
      sendResponse(res, await whipService.listUsers());
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Failed to load users', 500);
    }
  });

  // ---- Writes (bot Phase 2). Every write names its acting BBS user; when
  // discordId is present the link must agree with actorUserId, so a linked
  // account can never write as somebody else. ----
  /**
   * Who a write is FROM, proved rather than claimed.
   *
   * The link check used to run only `if (discordId !== undefined)` - so a
   * caller who simply left the field out was taken at their word about
   * actorUserId, and the bot deliberately left it out for anyone it had
   * matched by username. Any member of the Discord guild could rename
   * themselves to a BBS handle (or pass `user: <handle>`) and complete, edit
   * or delete that caller's work, with the points and achievements landing on
   * the victim. The service token proves the REQUEST is the bot; it says
   * nothing about who the bot says it is acting for, and that is the half
   * that was missing.
   *
   * Every write now carries a discordId, and the link row is the authority.
   * The board refuses on its own, so a compromised or replaced bot cannot
   * hand itself an identity.
   */
  const resolveActor = async (req: Request): Promise<WhipActor> => {
    const { actorUserId, discordId } = req.body ?? {};
    if (typeof actorUserId !== 'string' || !actorUserId) {
      throw new WhipWriteError('actorUserId is required', 400);
    }
    if (typeof discordId !== 'string' || !discordId) {
      throw new WhipWriteError('discordId is required: a write must come from a linked account', 403);
    }
    const link = await database.getDiscordLinkByDiscordId(discordId);
    if (!link || link.userId !== actorUserId) {
      throw new WhipWriteError('discordId is not linked to actorUserId', 403);
    }
    const user = await database.getUserById(actorUserId);
    if (!user) throw new WhipWriteError('Unknown actorUserId', 404);
    return { userId: user.id, username: user.username, gdprConsented: !!user.gdprConsentAt };
  };

  const write = (handler: (req: Request, actor: WhipActor) => Promise<unknown>, message?: string) => {
    return async (req: Request, res: Response) => {
      try {
        const actor = await resolveActor(req);
        sendResponse(res, await handler(req, actor), message);
      } catch (error) {
        if (error instanceof WhipWriteError) {
          sendError(res, error.message, error.statusCode);
          return;
        }
        sendError(res, error instanceof Error ? error.message : 'Write failed', 500);
      }
    };
  };

  // The Discord handle a user claims ("my Discord name" in the WHIP door).
  // Empty clears it. Over-long input is refused, never silently cut.
  //
  // THIS IS A WRITE, so it names its actor like every other write here. It
  // used to be the one exception: the caller named the target user in the
  // path and nothing checked who was asking, so a service token could rename
  // anybody. `write`/`resolveActor` resolve the acting BBS user, verify any
  // `discordId` really is linked to them, and 404 an actorUserId the board
  // does not know - and the path id must be that same user.
  router.patch(
    '/users/:id',
    write(async (req, actor) => {
      const { discordName } = req.body ?? {};
      if (typeof discordName !== 'string') throw new WhipWriteError('discordName must be a string', 400);
      if (discordName.trim().length > 32) throw new WhipWriteError('discordName is at most 32 characters', 400);
      if (actor.userId !== req.params.id) {
        throw new WhipWriteError('actorUserId must name the user being changed', 403);
      }
      return whipService.setDiscordName(actor.userId, discordName);
    })
  );

  router.post('/projects', write(async (req, actor) => whipService.createProject(req.body ?? {}, actor), 'Project created'));
  router.patch(
    '/projects/:id',
    write(async (req, actor) => whipService.updateProject(req.params.id, req.body ?? {}, actor), 'Project updated')
  );
  router.delete(
    '/projects/:id',
    write(async (req, actor) => {
      await whipService.deleteProject(req.params.id, actor);
      return { deleted: req.params.id };
    }, 'Project deleted')
  );

  router.post(
    '/tasks',
    write(async (req, actor) => {
      const { projectId, ...input } = req.body ?? {};
      if (typeof projectId !== 'string' || !projectId) throw new WhipWriteError('projectId is required', 400);
      return whipService.createTask(projectId, input, actor);
    }, 'Task created')
  );
  router.patch(
    '/tasks/:id',
    write(async (req, actor) => whipService.updateTask(req.params.id, req.body ?? {}, actor), 'Task updated')
  );
  router.delete(
    '/tasks/:id',
    write(async (req, actor) => {
      await whipService.deleteTask(req.params.id, actor);
      return { deleted: req.params.id };
    }, 'Task deleted')
  );
  router.post(
    '/tasks/:id/move',
    write(async (req, actor) => {
      const { status } = req.body ?? {};
      if (typeof status !== 'string') throw new WhipWriteError('status is required', 400);
      return whipService.moveTask(req.params.id, status, actor);
    }, 'Task moved')
  );

  return router;
}
