/**
 * Statistics API Routes
 * Provides real-time BBS statistics for admin dashboard
 *
 * Endpoints:
 * - GET /api/stats/last-callers - Recent login activity
 * - GET /api/stats/last-downloads - Recent file downloads
 * - GET /api/stats/last-uploads - Recent file uploads
 * - GET /api/stats/system - Overall system statistics
 * - GET /api/stats/session - Current session statistics
 */

import express, { Request, Response } from 'express';
import type { Database } from '../database';
import { getSystemTime } from '../utils/date-time.util';

export function createStatisticsRouter(database: Database): ReturnType<typeof express.Router> {
  const router = express.Router();

  /**
   * Get last N callers (login activity)
   * Query params: limit (default: 20)
   */
  router.get('/last-callers', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      // Query caller_activity table for login events
      const result = await database.query(`
        SELECT
          ca.id,
          ca.node_id,
          ca.user_id,
          ca.username,
          ca.action,
          ca.details,
          ca.timestamp,
          u.location,
          u.phoneNumber as phone
        FROM caller_activity ca
        LEFT JOIN users u ON ca.user_id = u.id
        WHERE ca.action IN ('login', 'logout', 'connect')
        ORDER BY ca.timestamp DESC
        LIMIT ?
      `, [limit]);
      const callers = result.rows;

      // Format timestamps
      const formatted = callers.map((c: any) => ({
        id: c.id,
        nodeId: c.node_id,
        userId: c.user_id,
        username: c.username,
        action: c.action,
        details: c.details,
        location: c.location || 'Unknown',
        phone: c.phone || 'Unknown',
        timestamp: new Date(c.timestamp * 1000).toISOString(),
      }));

      res.json({
        success: true,
        data: formatted,
        timestamp: getSystemTime().toISOString(),
      });
    } catch (error: any) {
      console.error('[StatsAPI] Error fetching last callers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch last callers',
        error: error.message,
      });
    }
  });

  /**
   * Get last N downloads
   * Query params: limit (default: 20)
   */
  router.get('/last-downloads', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      // Query file_entries for recently downloaded files
      // We need to track download events - this requires adding download_history table
      // For now, get most downloaded files
      const result = await database.query(`
        SELECT
          fe.id,
          fe.filename,
          fe.description,
          fe.size,
          fe.uploader,
          fe.uploaddate,
          fe.downloads,
          fe.areaid,
          fa.name as area_name
        FROM file_entries fe
        LEFT JOIN file_areas fa ON fe.areaid = fa.id
        WHERE fe.downloads > 0
        ORDER BY fe.id DESC
        LIMIT ?
      `, [limit]);
      const downloads = result.rows;

      const formatted = downloads.map((d: any) => ({
        id: d.id,
        filename: d.filename,
        description: d.description,
        size: d.size,
        uploader: d.uploader,
        uploadDate: d.uploaddate,
        downloadCount: d.downloads,
        areaId: d.areaid,
        areaName: d.area_name || 'Unknown',
      }));

      res.json({
        success: true,
        data: formatted,
        timestamp: getSystemTime().toISOString(),
      });
    } catch (error: any) {
      console.error('[StatsAPI] Error fetching last downloads:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch last downloads',
        error: error.message,
      });
    }
  });

  /**
   * Get last N uploads
   * Query params: limit (default: 20)
   */
  router.get('/last-uploads', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      // Query file_entries for recently uploaded files
      const result = await database.query(`
        SELECT
          fe.id,
          fe.filename,
          fe.description,
          fe.size,
          fe.uploader,
          fe.uploaddate,
          fe.downloads,
          fe.areaid,
          fa.name as area_name
        FROM file_entries fe
        LEFT JOIN file_areas fa ON fe.areaid = fa.id
        ORDER BY fe.uploaddate DESC
        LIMIT ?
      `, [limit]);
      const uploads = result.rows;

      const formatted = uploads.map((u: any) => ({
        id: u.id,
        filename: u.filename,
        description: u.description,
        size: u.size,
        uploader: u.uploader,
        uploadDate: u.uploaddate,
        downloadCount: u.downloads,
        areaId: u.areaid,
        areaName: u.area_name || 'Unknown',
      }));

      res.json({
        success: true,
        data: formatted,
        timestamp: getSystemTime().toISOString(),
      });
    } catch (error: any) {
      console.error('[StatsAPI] Error fetching last uploads:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch last uploads',
        error: error.message,
      });
    }
  });

  /**
   * Get system statistics (all-time and today)
   */
  router.get('/system', async (req: Request, res: Response) => {
    try {
      // Get total users
      const totalUsersResult = await database.query('SELECT COUNT(*) as count FROM users');
      const totalUsers = totalUsersResult.rows[0] as { count: number };

      // Get total messages
      const totalMessagesResult = await database.query('SELECT COUNT(*) as count FROM messages');
      const totalMessages = totalMessagesResult.rows[0] as { count: number };

      // Get total files
      const totalFilesResult = await database.query('SELECT COUNT(*) as count FROM file_entries');
      const totalFiles = totalFilesResult.rows[0] as { count: number };

      // Get total file bytes
      const totalBytesResult = await database.query('SELECT SUM(size) as total FROM file_entries');
      const totalBytes = totalBytesResult.rows[0] as { total: number };

      // Get total downloads
      const totalDownloadsResult = await database.query('SELECT SUM(downloads) as total FROM file_entries');
      const totalDownloads = totalDownloadsResult.rows[0] as { total: number };

      // Get calls today (from caller_activity)
      const today = getSystemTime().toISOString().split('T')[0];
      const todayTimestamp = Math.floor(new Date(today).getTime() / 1000);

      const callsTodayResult = await database.query(`
        SELECT COUNT(*) as count
        FROM caller_activity
        WHERE action = 'login' AND timestamp >= ?
      `, [todayTimestamp]);
      const callsToday = callsTodayResult.rows[0] as { count: number };

      // Get total calls all-time
      const totalCallsResult = await database.query(`
        SELECT COUNT(*) as count
        FROM caller_activity
        WHERE action = 'login'
      `);
      const totalCalls = totalCallsResult.rows[0] as { count: number };

      // Get active users count
      const activeUsersResult = await database.query('SELECT COUNT(*) as count FROM sessions');
      const activeUsers = activeUsersResult.rows[0] as { count: number };

      res.json({
        success: true,
        data: {
          allTime: {
            totalUsers: totalUsers.count,
            totalMessages: totalMessages.count,
            totalFiles: totalFiles.count,
            totalBytes: totalBytes.total || 0,
            totalDownloads: totalDownloads.total || 0,
            totalCalls: totalCalls.count,
          },
          today: {
            calls: callsToday.count,
            activeUsers: activeUsers.count,
          },
        },
        timestamp: getSystemTime().toISOString(),
      });
    } catch (error: any) {
      console.error('[StatsAPI] Error fetching system stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch system statistics',
        error: error.message,
      });
    }
  });

  /**
   * Get current session statistics
   */
  router.get('/session', async (req: Request, res: Response) => {
    try {
      // Get start time of oldest active session (session start time)
      const sessionStartResult = await database.query(`
        SELECT MIN(lastactivity) as start FROM sessions
      `);
      const sessionStart = sessionStartResult.rows[0] as { start: number };

      // Get active sessions
      const activeSessionsResult = await database.query('SELECT COUNT(*) as count FROM sessions');
      const activeSessions = activeSessionsResult.rows[0] as { count: number };

      // Get active users with details
      const activeUsersResult = await database.query(`
        SELECT
          s.id,
          s.userid,
          u.username,
          u.location,
          s.currentconf,
          s.lastactivity,
          s.timeremaining
        FROM sessions s
        LEFT JOIN users u ON s.userid = u.id
        ORDER BY s.lastactivity DESC
      `);
      const activeUsers = activeUsersResult.rows;

      // Calculate session uptime
      const sessionStartTime = sessionStart?.start || Math.floor(Date.now() / 1000);
      const uptime = Math.floor(Date.now() / 1000) - sessionStartTime;

      res.json({
        success: true,
        data: {
          sessionStartTime: new Date(sessionStartTime * 1000).toISOString(),
          uptime,  // in seconds
          activeSessions: activeSessions.count,
          activeUsers: activeUsers.map((u: any) => ({
            sessionId: u.id,
            userId: u.userid,
            username: u.username,
            location: u.location || 'Unknown',
            currentConference: u.currentconf,
            lastActivity: new Date(u.lastactivity * 1000).toISOString(),
            timeRemaining: u.timeremaining,
          })),
        },
        timestamp: getSystemTime().toISOString(),
      });
    } catch (error: any) {
      console.error('[StatsAPI] Error fetching session stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch session statistics',
        error: error.message,
      });
    }
  });

  return router;
}
