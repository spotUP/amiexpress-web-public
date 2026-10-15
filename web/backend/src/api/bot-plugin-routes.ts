/**
 * Bot plugin admin routes (bot plugin Phase 1).
 *
 * Sysop JWT auth at mount (like every other /api/config route), envelope
 * responses like sessions/stats + config/logs. The :id parameter only ever
 * selects a manifest on disk - service names never come from requests.
 *
 * Base URL: /api/config/bots
 */

import express, { Request, Response } from 'express';
import { getSystemTime } from '../utils/date-time.util';
import type { Database } from '../database';
import {
  getPlugin,
  listPlugins,
  pluginAction,
  pluginLogs,
  pluginState,
  probeBotHealth,
  readPluginConfig,
  writePluginConfig,
  type PluginAction,
} from '../services/plugin.service';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

export function createBotPluginRouter(_database: Database): ReturnType<typeof express.Router> {
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

  const manifestOr404 = (req: Request, res: Response) => {
    const manifest = getPlugin(req.params.id);
    if (!manifest) {
      sendError(res, 'Unknown bot plugin', 404);
      return null;
    }
    return manifest;
  };

  router.get('/', async (_req: Request, res: Response) => {
    const plugins = listPlugins().map((p) => ({
      id: p.id,
      name: p.name,
      version: p.version,
      description: p.description,
      nav: p.nav,
      configSchema: p.configSchema.map((f) => ({ key: f.key, label: f.label, secret: !!f.secret, default: f.default ?? '' })),
    }));
    sendResponse(res, plugins);
  });

  router.get('/:id/status', async (req: Request, res: Response) => {
    const manifest = manifestOr404(req, res);
    if (!manifest) return;
    try {
      const state = await pluginState(manifest);
      const botHealth = state.state === 'running' ? await probeBotHealth(manifest) : null;
      sendResponse(res, { ...state, id: manifest.id, botHealth });
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Status check failed', 500);
    }
  });

  router.get('/:id/logs', async (req: Request, res: Response) => {
    const manifest = manifestOr404(req, res);
    if (!manifest) return;
    const lines = typeof req.query.lines === 'string' ? parseInt(req.query.lines, 10) : 200;
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    try {
      sendResponse(res, await pluginLogs(manifest, Number.isFinite(lines) ? lines : 200, search));
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Log tail failed', 500);
    }
  });

  for (const action of ['start', 'stop', 'restart'] as PluginAction[]) {
    router.post(`/:id/${action}`, async (req: Request, res: Response) => {
      const manifest = manifestOr404(req, res);
      if (!manifest) return;
      try {
        const result = await pluginAction(manifest, action);
        if (!result.ok) {
          sendError(res, result.message, 500);
          return;
        }
        sendResponse(res, { action }, result.message);
      } catch (error) {
        sendError(res, error instanceof Error ? error.message : `${action} failed`, 500);
      }
    });
  }

  router.get('/:id/config', async (req: Request, res: Response) => {
    const manifest = manifestOr404(req, res);
    if (!manifest) return;
    try {
      sendResponse(res, readPluginConfig(manifest));
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Config read failed', 500);
    }
  });

  router.put('/:id/config', async (req: Request, res: Response) => {
    const manifest = manifestOr404(req, res);
    if (!manifest) return;
    const values = req.body?.values;
    if (!values || typeof values !== 'object' || Array.isArray(values)) {
      sendError(res, 'values object is required', 400);
      return;
    }
    try {
      writePluginConfig(manifest, values as Record<string, string>);
      sendResponse(res, readPluginConfig(manifest), 'Saved. Restart the bot to apply.');
    } catch (error) {
      sendError(res, error instanceof Error ? error.message : 'Config write failed', 500);
    }
  });

  return router;
}
