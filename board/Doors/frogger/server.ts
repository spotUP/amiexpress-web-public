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
  saveHighscore: async (params: { name: string; score: number; level: number }, session?: DoorSessionLike): Promise<void> => {
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

    try {
      if (session?.bbs?.emitCustomEvent) {
        const rank = topScores.indexOf(newScore) + 1; // 0 -> fell off the board
        const parts = [`Score: ${params.score.toLocaleString('en-US')}`, `Level: ${params.level}`];
        if (rank > 0) parts.push(`Rank: #${rank}`);

        session.bbs.emitCustomEvent('score_submitted', parts.join(' | '), {
          name: newScore.name,
          score: params.score,
          level: params.level,
          rank: rank > 0 ? rank : undefined,
        });
      }
    } catch (e) {
      console.error('[Frogger Server] Failed to broadcast score event:', e);
    }
  },
};
