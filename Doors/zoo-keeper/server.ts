/**
 * Zoo Keeper - Server RPC Handlers
 * Handles persistence operations for hybrid door mode
 */

import * as fs from 'fs';
import * as path from 'path';
import { HighScore } from './game/types';
import { DEFAULT_HIGHSCORES, MAX_HIGHSCORES } from './game/constants';

// Path to high scores file
const HIGHSCORES_PATH = path.join(__dirname, 'highscores.json');

/**
 * Load high scores from disk
 */
function loadHighscores(): HighScore[] {
  try {
    if (fs.existsSync(HIGHSCORES_PATH)) {
      const data = fs.readFileSync(HIGHSCORES_PATH, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Zoo Keeper] Error loading highscores:', error);
  }
  return [...DEFAULT_HIGHSCORES];
}

/**
 * Save high scores to disk
 */
function saveHighscores(scores: HighScore[]): void {
  try {
    fs.writeFileSync(HIGHSCORES_PATH, JSON.stringify(scores, null, 2));
  } catch (error) {
    console.error('[Zoo Keeper] Error saving highscores:', error);
  }
}

/**
 * RPC Handlers for client-server communication
 */
export const rpcHandlers = {
  /**
   * Get current high scores list
   */
  getHighscores: async (): Promise<HighScore[]> => {
    return loadHighscores();
  },

  /**
   * Save a new high score if it qualifies
   */
  saveHighscore: async (params: { name: string; score: number; level: number }): Promise<{ success: boolean; rank: number }> => {
    const { name, score, level } = params;

    // Validate input
    if (!name || name.length === 0 || name.length > 3) {
      return { success: false, rank: -1 };
    }
    if (score < 0 || level < 1) {
      return { success: false, rank: -1 };
    }

    // Load current scores
    const scores = loadHighscores();

    // Create new entry
    const newEntry: HighScore = {
      name: name.toUpperCase().substring(0, 3),
      score,
      level,
      date: new Date().toISOString().split('T')[0]
    };

    // Find insertion position
    let rank = scores.findIndex(s => score > s.score);
    if (rank === -1) {
      rank = scores.length;
    }

    // Check if it qualifies
    if (rank >= MAX_HIGHSCORES) {
      return { success: false, rank: -1 };
    }

    // Insert and trim
    scores.splice(rank, 0, newEntry);
    if (scores.length > MAX_HIGHSCORES) {
      scores.length = MAX_HIGHSCORES;
    }

    // Save
    saveHighscores(scores);

    return { success: true, rank: rank + 1 };  // 1-based rank for display
  },

  /**
   * Reset high scores to defaults (admin function)
   */
  resetHighscores: async (): Promise<{ success: boolean }> => {
    saveHighscores([...DEFAULT_HIGHSCORES]);
    return { success: true };
  }
};

// Export for hybrid door system
export default rpcHandlers;
