/**
 * Door API Routes
 * HTTP endpoints for serving client door bundles
 */

import express, { Request, Response } from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { getClientDoorBundler } from './client-door-bundler';

export const doorApiRouter = express.Router();

/**
 * GET /api/doors/:doorId/bundle.js
 * Serve bundled client door JavaScript
 */
doorApiRouter.get('/doors/:doorId/bundle.js', async (req: Request, res: Response) => {
  const { doorId } = req.params;

  try {
    console.log(`[DoorAPI] Serving bundle for door: ${doorId}`);

    // Look up door manifest
    const doorManifest = await loadDoorManifest(doorId);

    if (!doorManifest) {
      return res.status(404).json({ error: 'Door not found' });
    }

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

    // Resolve door path
    const doorPath = resolveDoorPath(doorId, entryPoint);

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
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
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
    const manifest = await loadDoorManifest(doorId);

    if (!manifest) {
      return res.status(404).json({ error: 'Door not found' });
    }

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
 */
async function loadDoorManifest(doorId: string): Promise<any | null> {
  try {
    // Prefer installed doors/ in the BBS tree so deployments without sdk/ still work.
    const doorsPath = path.join(process.cwd(), '../doors', doorId, 'package.json');
    if (fs.existsSync(doorsPath)) {
      const content = fs.readFileSync(doorsPath, 'utf8');
      return JSON.parse(content);
    }

    // Fall back to sdk/doors for dev setups.
    const sdkPath = path.join(process.cwd(), '../../sdk/doors', doorId, 'package.json');
    if (fs.existsSync(sdkPath)) {
      const content = fs.readFileSync(sdkPath, 'utf8');
      return JSON.parse(content);
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
  // Prefer doors directory in the BBS tree
  const doorsPath = path.join(process.cwd(), '../doors', doorId, entryPoint);
  if (fs.existsSync(doorsPath)) {
    return doorsPath;
  }

  // Fall back to SDK examples (dev)
  const sdkPath = path.join(process.cwd(), '../../sdk/doors', doorId, entryPoint);
  if (fs.existsSync(sdkPath)) {
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

  // Scan SDK examples
  // Scan doors directory (preferred for deployments)
  const doorsPath = path.join(process.cwd(), '../doors');
  if (fs.existsSync(doorsPath)) {
    const entries = fs.readdirSync(doorsPath);
    for (const entry of entries) {
      const manifestPath = path.join(doorsPath, entry, 'package.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(content);

          // Skip if already added from SDK
          if (!doors.find(d => d.id === entry)) {
            doors.push({
              id: entry,
              name: manifest.name || entry,
              runtime: manifest.runtime || 'server',
              description: manifest.description || '',
            });
          }
        } catch (error) {
          console.error(`Error loading manifest for ${entry}:`, error);
        }
      }
    }
  }

  // Scan SDK examples (dev fallback)
  const sdkExamplesPath = path.join(process.cwd(), '../../sdk/doors');
  if (fs.existsSync(sdkExamplesPath)) {
    const entries = fs.readdirSync(sdkExamplesPath);
    for (const entry of entries) {
      const manifestPath = path.join(sdkExamplesPath, entry, 'package.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const content = fs.readFileSync(manifestPath, 'utf8');
          const manifest = JSON.parse(content);
          // Skip if already present from doors/
          if (!doors.find(d => d.id === entry)) {
            doors.push({
              id: entry,
              name: manifest.name || entry,
              runtime: manifest.runtime || 'server',
              description: manifest.description || '',
            });
          }
        } catch (error) {
          console.error(`Error loading manifest for ${entry}:`, error);
        }
      }
    }
  }

  return doors;
}

export default doorApiRouter;
