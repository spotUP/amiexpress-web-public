/**
 * Session Logs API Handler
 * Provides endpoints for viewing BBS session terminal output in admin interface
 */

import { Request, Response } from 'express';
import { sessionLogManager } from '../../services/SessionLogManager';
import { AuthRequest } from '../../middleware/auth.middleware';

export class SessionLogsHandler {
  /**
   * GET /api/sessions
   * Get list of all active sessions
   */
  async getActiveSessions(req: AuthRequest, res: Response): Promise<void> {
    try {
console.log('[SessionLogsHandler] getActiveSessions called, user:', req.user?.username, 'secLevel:', req.user?.secLevel);

      // Require sysop access (secLevel >= 255)
      if (!req.user || req.user.secLevel < 255) {
console.log('[SessionLogsHandler] Access denied - insufficient privileges');
        res.status(403).json({ error: 'Sysop access required' });
        return;
      }

      const sessions = sessionLogManager.getActiveSessions();
console.log('[SessionLogsHandler] Returning sessions:', sessions.length);
      res.json({ sessions });
    } catch (error) {
console.error('[SessionLogsHandler] Error getting active sessions:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/sessions/:sessionId/log
   * Get terminal output for a specific session
   */
  async getSessionLog(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Require sysop access (secLevel >= 255)
      if (!req.user || req.user.secLevel < 255) {
        res.status(403).json({ error: 'Sysop access required' });
        return;
      }

      const { sessionId } = req.params;
      const log = sessionLogManager.getSessionLog(sessionId);

      if (!log) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({ log });
    } catch (error) {
console.error('[SessionLogsHandler] Error getting session log:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/sessions/:sessionId/log/raw
   * Get terminal output as plain text (for copying)
   */
  async getSessionLogRaw(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Require sysop access (secLevel >= 255)
      if (!req.user || req.user.secLevel < 255) {
        res.status(403).json({ error: 'Sysop access required' });
        return;
      }

      const { sessionId } = req.params;
      const output = sessionLogManager.getSessionOutput(sessionId);

      if (output === null) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      // Return as plain text
      res.setHeader('Content-Type', 'text/plain');
      res.send(output);
    } catch (error) {
console.error('[SessionLogsHandler] Error getting session log raw:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * GET /api/sessions/stats
   * Get session log statistics
   */
  async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Require sysop access (secLevel >= 255)
      if (!req.user || req.user.secLevel < 255) {
        res.status(403).json({ error: 'Sysop access required' });
        return;
      }

      const stats = sessionLogManager.getStats();
      res.json({ stats });
    } catch (error) {
console.error('[SessionLogsHandler] Error getting stats:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * POST /api/sessions/:sessionId/save
   * Save session log to disk and return file path
   */
  async saveSessionLog(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Require sysop access (secLevel >= 255)
      if (!req.user || req.user.secLevel < 255) {
        res.status(403).json({ error: 'Sysop access required' });
        return;
      }

      const { sessionId } = req.params;
      const filePath = sessionLogManager.saveToFile(sessionId);

      if (!filePath) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      res.json({ filePath });
    } catch (error) {
console.error('[SessionLogsHandler] Error saving session log:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
