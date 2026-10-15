import { Request, Response } from 'express';
import * as fs from 'fs';
import { dirname, join, resolve, sep } from 'path';
import { AuthRequest } from '../../middleware/auth.middleware';
import { boardRoot } from '../../utils/board-root.util';

/**
 * Sprite management API for the admin web UI.
 * Reuses the same path-resolution guards as Doors/sprite-editor/assets.ts.
 */

/**
 * The board's Doors/ - the directory the door runner loads from.
 *
 * This walked up from its own file looking for a folder named Doors, then
 * guessed cwd/Doors and web/Doors. On the live board none of those is the
 * board: the code runs from /app/web/backend and the doors live in the
 * volume, /app/data/bbs/Doors, so the page listed no doors and no sprites
 * (sysop, 2026-09-07). boardRoot() is the one answer the rest of the board
 * uses.
 */
function doorsRoot(): string {
  return join(boardRoot(), 'Doors');
}

function resolveSpritePath(door: string, file?: string): string {
  const root = doorsRoot();
  const base = resolve(root, door, 'sprites');
  if (!base.startsWith(root + sep)) {
    throw new Error(`Outside Doors/: ${door}`);
  }
  if (!file) return base;
  const target = resolve(base, file);
  if (!target.startsWith(base + sep)) {
    throw new Error(`Outside ${door}/sprites/: ${file}`);
  }
  return target;
}

export class SpriteManagerHandler {
  /** GET /api/sprite-manager/doors — list doors with sprites */
  async listDoors(_req: Request, res: Response): Promise<void> {
    try {
      const root = doorsRoot();
      if (!fs.existsSync(root)) {
        res.json({ doors: [] });
        return;
      }
      const doors = fs.readdirSync(root, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name)
        .filter(name => {
          try {
            const spritesDir = join(root, name, 'sprites');
            return fs.existsSync(spritesDir) &&
              fs.readdirSync(spritesDir).some(f => f.endsWith('.sprite.json'));
          } catch { return false; }
        })
        .sort();
      res.json({ doors });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to list doors' });
    }
  }

  /** GET /api/sprite-manager/:door/sprites — list sprite files in a door */
  async listSprites(req: AuthRequest, res: Response): Promise<void> {
    try {
      const dir = resolveSpritePath(req.params.door);
      const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.sprite.json'))
        .sort();
      // Return basic metadata for each sprite
      const sprites = files.map(file => {
        const path = resolve(dir, file);
        const stat = fs.statSync(path);
        let animationCount = 0;
        let dimensions = { width: 0, height: 0 };
        try {
          const raw = JSON.parse(fs.readFileSync(path, 'utf8'));
          if (raw.animations) animationCount = Object.keys(raw.animations).length;
          if (raw.width) dimensions.width = raw.width;
          if (raw.height) dimensions.height = raw.height;
        } catch { /* just skip metadata on parse error */ }
        return { file, size: stat.size, mtime: stat.mtimeMs, animationCount, dimensions };
      });
      res.json({ door: req.params.door, sprites });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to list sprites' });
    }
  }

  /** GET /api/sprite-manager/:door/sprite/:file — read a sprite file's content */
  async readSprite(req: AuthRequest, res: Response): Promise<void> {
    try {
      const path = resolveSpritePath(req.params.door, req.params.file);
      if (!fs.existsSync(path)) {
        res.status(404).json({ error: 'Sprite not found' });
        return;
      }
      const content = fs.readFileSync(path, 'utf8');
      res.json({ content, door: req.params.door, file: req.params.file });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to read sprite' });
    }
  }

  /** PUT /api/sprite-manager/:door/sprite/:file — upload/replace a sprite file */
  async writeSprite(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { content } = req.body;
      if (!content || typeof content !== 'string') {
        res.status(400).json({ error: 'content (JSON string) required' });
        return;
      }
      // Validate JSON before writing
      let parsed: any;
      try { parsed = JSON.parse(content); } catch {
        res.status(400).json({ error: 'content must be valid JSON' });
        return;
      }
      // Basic sprite shape validation
      if (!parsed.animations || typeof parsed.animations !== 'object') {
        res.status(400).json({ error: 'Sprite JSON must have an animations object' });
        return;
      }
      const path = resolveSpritePath(req.params.door, req.params.file);
      const dir = dirname(path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${path}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(parsed, null, 2));
      fs.renameSync(tmp, path);
      res.json({ door: req.params.door, file: req.params.file, written: true });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to write sprite' });
    }
  }

  /** DELETE /api/sprite-manager/:door/sprite/:file — delete a sprite file */
  async deleteSprite(req: AuthRequest, res: Response): Promise<void> {
    try {
      const path = resolveSpritePath(req.params.door, req.params.file);
      if (!fs.existsSync(path)) {
        res.status(404).json({ error: 'Sprite not found' });
        return;
      }
      fs.unlinkSync(path);
      res.json({ door: req.params.door, file: req.params.file, deleted: true });
    } catch (e: unknown) {
      res.status(500).json({ error: 'Failed to delete sprite' });
    }
  }
}