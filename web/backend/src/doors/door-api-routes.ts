/**
 * Door API Routes
 * HTTP endpoints for serving client door bundles
 */

import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { getClientDoorBundler } from './client-door-bundler';

export const doorApiRouter = express.Router();

const getBbsRoot = (): string => {
  return process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');
};

/**
 * GET /api/doors/:doorId/bundle.js
 * Serve bundled client door JavaScript
 */
doorApiRouter.get('/doors/:doorId/bundle.js', async (req: Request, res: Response) => {
  const { doorId } = req.params;

  try {
    console.log(`[DoorAPI] Serving bundle for door: ${doorId}`);

    // Look up door manifest and path
    const result = await loadDoorManifest(doorId);

    if (!result) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const { manifest: doorManifest, doorBasePath } = result;

    // Check runtime type
    if (doorManifest.runtime !== 'client' && doorManifest.runtime !== 'hybrid') {
      return res.status(400).json({ error: 'Not a client door' });
    }

    // Get door entry point
    const entryPoint = doorManifest.client?.entry || doorManifest.entry || doorManifest.main || 'index.ts';

    if (!entryPoint) {
      return res.status(500).json({ error: 'Door entry point not configured' });
    }

    console.log(`[DoorAPI] Entry point for ${doorId}: ${entryPoint}`);
    console.log(`[DoorAPI] Door base path: ${doorBasePath}`);

    // Resolve door path - use actual door base path from registry, not doorId
    const doorPath = path.join(doorBasePath, entryPoint);

    // Bundle the door
    const bundler = getClientDoorBundler();
    const bundle = await bundler.bundle({
      doorPath,
      doorId,
      minify: process.env.NODE_ENV === 'production',
      sourcemap: process.env.NODE_ENV === 'development',
    });

    // Serve the bundle
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Bundle-Hash', bundle.hash);
    res.setHeader('X-Bundle-Size', bundle.size.toString());

    res.send(bundle.bundleCode);

  } catch (error) {
    console.error(`[DoorAPI] Error serving bundle for ${doorId}:`, error);
    res.status(500).json({
      error: 'Failed to bundle door',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/doors/:doorId/manifest
 * Get door manifest information
 */
doorApiRouter.get('/doors/:doorId/manifest', async (req: Request, res: Response) => {
  const { doorId } = req.params;

  try {
    const result = await loadDoorManifest(doorId);

    if (!result) {
      return res.status(404).json({ error: 'Door not found' });
    }

    const { manifest } = result;

    // Return public manifest info
    res.json({
      name: manifest.name,
      version: manifest.version,
      author: manifest.author,
      description: manifest.description,
      runtime: manifest.runtime,
      minSecurity: manifest.minSecurity,
      maxTime: manifest.maxTime,
      multiplayer: manifest.multiplayer,
    });

  } catch (error) {
    console.error(`[DoorAPI] Error loading manifest for ${doorId}:`, error);
    res.status(500).json({
      error: 'Failed to load manifest',
      message: (error as Error).message,
    });
  }
});

/**
 * GET /api/doors/list
 * List all available doors
 */
doorApiRouter.get('/doors/list', async (req: Request, res: Response) => {
  try {
    const doors = await listAvailableDoors();
    res.json({ doors });
  } catch (error) {
    console.error('[DoorAPI] Error listing doors:', error);
    res.status(500).json({
      error: 'Failed to list doors',
      message: (error as Error).message,
    });
  }
});

/**
 * POST /api/doors/clear-cache
 * Clear door bundle cache (development only)
 */
doorApiRouter.post('/doors/clear-cache', async (req: Request, res: Response) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Not available in production' });
  }

  try {
    const bundler = getClientDoorBundler();
    bundler.clearCache();

    res.json({ message: 'Cache cleared successfully' });
  } catch (error) {
    console.error('[DoorAPI] Error clearing cache:', error);
    res.status(500).json({
      error: 'Failed to clear cache',
      message: (error as Error).message,
    });
  }
});

/**
 * Load door manifest from package.json
 * Returns both the manifest and the resolved door path
 */
async function loadDoorManifest(doorId: string): Promise<{ manifest: any; doorBasePath: string } | null> {
  try {
    const bbsRoot = getBbsRoot();
    const amigafs = require('../utils/amigafs');

    // Get door from registry to find actual location (LOCATION tooltype from .info file)
    const { getDoors } = require('../handlers/door.handler');
    const doors = getDoors();
    const door = doors.find((d: any) => d.id.toUpperCase() === doorId.toUpperCase());

    if (door && door.path) {
      // Use door.path from registry (e.g., "Doors/arkanoid-audio")
      const doorBasePath = path.join(bbsRoot, door.path);
      const manifestPath = path.join(doorBasePath, 'package.json');
      if (amigafs.existsSync(manifestPath)) {
        const content = amigafs.readFileSync(manifestPath, 'utf8');
        return { manifest: JSON.parse(content), doorBasePath };
      }
    }

    // Fallback: try standard locations with case-insensitive matching
    const doorBasePath = path.join(bbsRoot, 'Doors', doorId);
    const manifestPath = path.join(doorBasePath, 'package.json');
    if (amigafs.existsSync(manifestPath)) {
      const content = amigafs.readFileSync(manifestPath, 'utf8');
      return { manifest: JSON.parse(content), doorBasePath };
    }

    return null;
  } catch (error) {
    console.error(`[DoorAPI] Error loading manifest for ${doorId}:`, error);
    return null;
  }
}

/**
 * Resolve door path from door ID and entry point
 */
function resolveDoorPath(doorId: string, entryPoint: string): string {
  const bbsRoot = getBbsRoot();
  const amigafs = require('../utils/amigafs');

  // Check Doors directory (amigafs handles case-insensitive matching automatically)
  const doorsPath = path.join(bbsRoot, 'Doors', doorId, entryPoint);
  if (amigafs.existsSync(doorsPath)) {
    return doorsPath;
  }

  // Fall back to SDK examples (dev)
  const sdkPath = path.join(bbsRoot, 'sdk/doors', doorId, entryPoint);
  if (amigafs.existsSync(sdkPath)) {
    return sdkPath;
  }

  // Return absolute path if provided
  if (path.isAbsolute(entryPoint)) {
    return entryPoint;
  }

  // Default to SDK examples
  return path.join(process.cwd(), '../../sdk/doors', doorId, entryPoint);
}

/**
 * List all available doors
 */
async function listAvailableDoors(): Promise<any[]> {
  const doors: any[] = [];
  const bbsRoot = getBbsRoot();
  const amigafs = require('../utils/amigafs');

  // Scan Doors directory (amigafs handles case-insensitive matching automatically)
  const doorsPath = path.join(bbsRoot, 'Doors');
  if (amigafs.existsSync(doorsPath)) {
    const entries = amigafs.readdirSync(doorsPath);
    for (const entry of entries) {
      const manifestPath = path.join(doorsPath, entry, 'package.json');
      if (amigafs.existsSync(manifestPath)) {
        try {
          const content = amigafs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(content);

          doors.push({
            id: entry,
            name: manifest.name || entry,
            runtime: manifest.runtime || 'server',
            description: manifest.description || '',
          });
        } catch (error) {
          console.error(`Error loading manifest for ${entry}:`, error);
        }
      }
    }
  }

  return doors;
}

export default doorApiRouter;
