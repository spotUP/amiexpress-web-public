/**
 * Galaga - Server RPC Handlers
 * High score persistence for the arcade game
 */

import { HighScore } from './game/types';
import { DEFAULT_HIGHSCORES } from './game/constants';
import * as fs from 'fs';
import * as path from 'path';

const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');

function loadHighscores(): HighScore[] {
  try {
    if (fs.existsSync(HIGHSCORES_FILE)) {
      const data = fs.readFileSync(HIGHSCORES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Galaga] Error loading highscores:', error);
  }
  return [...DEFAULT_HIGHSCORES];
}

function saveHighscores(scores: HighScore[]): void {
  try {
    fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(scores, null, 2));
  } catch (error) {
    console.error('[Galaga] Error saving highscores:', error);
  }
}

export const rpcHandlers = {
  getHighscores: async (): Promise<HighScore[]> => {
    return loadHighscores();
  },

  saveHighscore: async (params: { name: string; score: number; stage: number }): Promise<void> => {
    const scores = loadHighscores();

    const newScore: HighScore = {
      name: params.name.toUpperCase().substring(0, 3),
      score: params.score,
      stage: params.stage,
      date: new Date().toISOString().split('T')[0],
    };

    scores.push(newScore);
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, 10);

    saveHighscores(topScores);
  },
};
