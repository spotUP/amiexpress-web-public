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
 * Get the highscores file path
 */
function getHighscorePath(): string {
  return path.join(process.cwd(), 'doors', 'arkanoid', 'highscores.json');
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
 * RPC Handler: Save a new highscore
 */
export function saveHighscore(params: { name: string; score: number; level: number }): { success: boolean } {
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
