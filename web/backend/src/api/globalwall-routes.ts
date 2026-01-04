/**
 * Global Wall Admin API Routes
 * Proxy endpoints for managing Global Wall comments and settings
 *
 * Base URL: /api/globalwall
 */

import express, { Request, Response } from 'express';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import type { Database } from '../database';

// Global Wall server configuration
const GWALL_HOST = 'scenewall.bbs.io';
const GWALL_PORT = 1541;
const TIMEOUT = 10000; // 10 seconds

interface GlobalWallConfig {
  style: number;
  mybbsshortcode: string;
  coloursettings: string;
}

/**
 * Make HTTP request to Global Wall server
 */
function makeGlobalWallRequest(
  requestPath: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: string
): Promise<{ statusCode: number; data: string }> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      Host: GWALL_HOST,
      Connection: 'close'
    };

    if (body) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body).toString();
    }

    const options: http.RequestOptions = {
      hostname: GWALL_HOST,
      port: GWALL_PORT,
      method,
      path: requestPath,
      timeout: TIMEOUT,
      headers
    };

    const req = http.request(options, (res) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      res.on('end', () => {
        const data = Buffer.concat(chunks).toString('utf-8');
        resolve({ statusCode: res.statusCode || 0, data });
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Global Wall request failed: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Global Wall request timeout'));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

export function createGlobalWallRouter(database: Database): ReturnType<typeof express.Router> {
  const router = express.Router();

  /**
   * GET /api/globalwall/comments
   * Fetch wall comments
   */
  router.get('/comments', async (req: Request, res: Response) => {
    try {
      const pagenum = parseInt(req.query.page as string) || 1;
      const itemCount = parseInt(req.query.limit as string) || 20;

      const requestPath = `/GlobalWall/api/WallItems?itemCount=${itemCount}&pagenum=${pagenum}`;
      const result = await makeGlobalWallRequest(requestPath, 'GET');

      if (result.statusCode === 200) {
        res.json(JSON.parse(result.data));
      } else {
        res.status(result.statusCode).json({ error: 'Failed to fetch comments' });
      }
    } catch (error) {
console.error('[GlobalWall API] Error fetching comments:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * PUT /api/globalwall/comments/:id
   * Update a wall comment
   */
  router.put('/comments/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userName, source, comment, bbsshortcode } = req.body;

      const linedata = JSON.stringify({
        userName: userName || null,
        source: source || null,
        comment: comment || null,
        bbsshortcode: bbsshortcode || null
      });

      const requestPath = `/GlobalWall/api/WallItems/${id}`;
      const result = await makeGlobalWallRequest(requestPath, 'PUT', linedata);

      if (result.statusCode === 200 || result.statusCode === 204) {
        res.json({ success: true, message: 'Comment updated successfully' });
      } else {
        res.status(result.statusCode).json({ error: 'Failed to update comment' });
      }
    } catch (error) {
console.error('[GlobalWall API] Error updating comment:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * DELETE /api/globalwall/comments/:id
   * Delete a wall comment
   */
  router.delete('/comments/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const requestPath = `/GlobalWall/api/WallItems/${id}`;
      const result = await makeGlobalWallRequest(requestPath, 'DELETE');

      if (result.statusCode === 200 || result.statusCode === 204) {
        res.json({ success: true, message: 'Comment deleted successfully' });
      } else {
        res.status(result.statusCode).json({ error: 'Failed to delete comment' });
      }
    } catch (error) {
console.error('[GlobalWall API] Error deleting comment:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * GET /api/globalwall/config
   * Get Global Wall configuration
   */
  router.get('/config', (req: Request, res: Response) => {
    try {
      const baseDir = config.getConfig().dataDir;
      const configPath = path.join(baseDir, 'doors', 'gwall', 'GWall.cfg');

      if (!fs.existsSync(configPath)) {
        // Return defaults
        return res.json({
          style: 4,
          mybbsshortcode: 'AMI',
          coloursettings: '42626717772363'
        });
      }

      const content = fs.readFileSync(configPath, 'utf-8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      const gwallConfig: GlobalWallConfig = {
        style: parseInt(lines[0], 10) || 4,
        mybbsshortcode: lines[1] || 'AMI',
        coloursettings: lines[2] || '42626717772363'
      };

      res.json(gwallConfig);
    } catch (error) {
console.error('[GlobalWall API] Error reading config:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * PUT /api/globalwall/config
   * Update Global Wall configuration
   */
  router.put('/config', (req: Request, res: Response) => {
    try {
      const { style, mybbsshortcode, coloursettings } = req.body;

      // Validate input
      if (style < 1 || style > 4) {
        return res.status(400).json({ error: 'Style must be between 1 and 4' });
      }

      if (!mybbsshortcode || mybbsshortcode.length > 3) {
        return res.status(400).json({ error: 'BBS short code must be 1-3 characters' });
      }

      if (!coloursettings || coloursettings.length !== 14) {
        return res.status(400).json({ error: 'Colour settings must be 14 characters' });
      }

      const baseDir = config.getConfig().dataDir;
      const configDir = path.join(baseDir, 'doors', 'gwall');
      const configPath = path.join(configDir, 'GWall.cfg');

      // Ensure directory exists
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Write config file
      const content = `${style}\n${mybbsshortcode}\n${coloursettings}\n`;
      fs.writeFileSync(configPath, content, 'utf-8');

      res.json({ success: true, message: 'Configuration saved successfully' });
    } catch (error) {
console.error('[GlobalWall API] Error saving config:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  return router;
}
