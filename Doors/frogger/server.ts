/**
 * Frogger - Server RPC Handlers
 * High score persistence for the arcade game
 */

import { HighScore } from './game/types';
import { DEFAULT_HIGHSCORES } from './game/constants';
import * as fs from 'fs';
import * as path from 'path';

const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');

/**
 * Load high scores from file
 */
function loadHighscores(): HighScore[] {
  try {
    if (fs.existsSync(HIGHSCORES_FILE)) {
      const data = fs.readFileSync(HIGHSCORES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Frogger] Error loading highscores:', error);
  }
  return [...DEFAULT_HIGHSCORES];
}

/**
 * Save high scores to file
 */
function saveHighscores(scores: HighScore[]): void {
  try {
    fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(scores, null, 2));
  } catch (error) {
    console.error('[Frogger] Error saving highscores:', error);
  }
}

/**
 * RPC handlers for hybrid door mode
 */
export const rpcHandlers = {
  /**
   * Get high scores list
   */
  getHighscores: async (): Promise<HighScore[]> => {
    return loadHighscores();
  },

  /**
   * Save a new high score
   */
  saveHighscore: async (params: { name: string; score: number; level: number }): Promise<void> => {
    const scores = loadHighscores();

    // Add new score
    const newScore: HighScore = {
      name: params.name.toUpperCase().substring(0, 3),
      score: params.score,
      level: params.level,
      date: new Date().toISOString().split('T')[0],
    };

    scores.push(newScore);

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Keep top 10
    const topScores = scores.slice(0, 10);

    saveHighscores(topScores);
  },
};
