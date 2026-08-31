/**
 * ARKANOID - Hybrid Door Server Component
 *
 * This runs in Node.js and handles:
 * - Highscore persistence to disk
 * - RPC calls from client for save/load operations
 */

import * as fs from 'fs';
import * as path from 'path';

interface HighScore {
  name: string;
  score: number;
  level: number;
  date: string;
}

const MAX_HIGHSCORES = 10;

/**
 * Resolve this door's own directory.
 *
 * __dirname is Doors/arkanoid when the door runs from TypeScript source
 * (dev - door.handler.ts prefers the .ts entry outside production) and
 * Doors/arkanoid/dist when it runs compiled. Walking up to the directory
 * holding package.json gives the door root in both cases, so dev and the
 * live board use ONE file instead of drifting apart.
 *
 * This must NOT be derived from process.cwd(): the backend runs with cwd
 * web/backend (Dockerfile WORKDIR /app/web/backend), so a cwd-relative
 * path wrote to web/backend/Doors/arkanoid/, which is outside the Doors
 * volume and lives only in the container's ephemeral layer - every deploy
 * wiped the board.
 */
function getDoorRoot(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return __dirname;
}

/**
 * Get the highscores file path
 *
 * Exported so a regression test can assert it resolves inside the door's
 * own directory rather than under the backend's cwd.
 */
export function getHighscorePath(): string {
  return path.join(getDoorRoot(), 'highscores.json');
}

/**
 * Load highscores from disk
 */
function loadHighscores(): HighScore[] {
  try {
    const filePath = getHighscorePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[Arkanoid Server] Error loading highscores:', e);
  }
  return [];
}

/**
 * Save highscores to disk
 */
function saveHighscores(highscores: HighScore[]): void {
  try {
    const filePath = getHighscorePath();
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(highscores, null, 2));
  } catch (e) {
    console.error('[Arkanoid Server] Error saving highscores:', e);
  }
}

/**
 * RPC Handler: Get highscores
 */
export function getHighscores(): { highscores: HighScore[] } {
  const highscores = loadHighscores();
  return { highscores };
}

/**
 * Slice of the hybrid-door session object the RPC bridge passes as the
 * handler's second argument (door.handler.ts builds it with `bbs` set to
 * the BBSApi). Only emitCustomEvent is used here; everything else is
 * irrelevant to this door.
 */
interface DoorSessionLike {
  user?: { username?: string };
  bbs?: {
    emitCustomEvent?: (eventType: string, message: string, data?: Record<string, any>) => void;
  };
}

/**
 * RPC Handler: Save a new highscore
 *
 * Persists to highscores.json, then broadcasts a 'score_submitted' door
 * event - LiveChat shows it, and bbs-event-emitter forwards it to any
 * sysop-configured DOOR_SCORE webhook (Discord/Slack). Same pattern as
 * GrandMaster's score broadcast. The event is strictly best-effort:
 * persistence must succeed even when no session is attached (native runs)
 * or the emitter throws.
 */
export function saveHighscore(
  params: { name: string; score: number; level: number },
  session?: DoorSessionLike
): { success: boolean } {
  const { name, score, level } = params;

  const entry: HighScore = {
    name: name.substring(0, 10).toUpperCase(),
    score,
    level,
    date: new Date().toISOString().split('T')[0],
  };

  const highscores = loadHighscores();
  highscores.push(entry);
  highscores.sort((a, b) => b.score - a.score);
  const trimmed = highscores.slice(0, MAX_HIGHSCORES);

  saveHighscores(trimmed);

  try {
    if (session?.bbs?.emitCustomEvent) {
      const rank = trimmed.indexOf(entry) + 1; // 0 -> fell off the board
      const parts = [`Score: ${score.toLocaleString('en-US')}`, `Level: ${level}`];
      if (rank > 0) parts.push(`Rank: #${rank}`);

      session.bbs.emitCustomEvent('score_submitted', parts.join(' | '), {
        name: entry.name,
        score,
        level,
        rank: rank > 0 ? rank : undefined,
      });
    }
  } catch (e) {
    console.error('[Arkanoid Server] Failed to broadcast score event:', e);
  }

  return { success: true };
}

/**
 * Server component exports for hybrid door
 */
export const rpcHandlers = {
  getHighscores,
  saveHighscore,
};

export default rpcHandlers;
