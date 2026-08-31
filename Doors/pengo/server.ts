/**
 * Pengo - Server RPC Handlers
 */

import { GameState, HighScore } from './game/types';
import { trackForState } from './music-select';
import { DEFAULT_HIGHSCORES } from './game/constants';
import * as fs from 'fs';
import * as path from 'path';

const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');

function loadHighscores(): HighScore[] {
  try {
    if (fs.existsSync(HIGHSCORES_FILE)) {
      return JSON.parse(fs.readFileSync(HIGHSCORES_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [...DEFAULT_HIGHSCORES];
}

function saveHighscores(scores: HighScore[]): void {
  try {
    fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(scores, null, 2));
  } catch { /* ignore */ }
}

/**
 * What the door is showing right now, for getMusicTrack to answer with.
 *
 * A module-level value rather than session state: a TypeScript door is
 * loaded per launch, so this belongs to the one game being played through
 * it - the same thing the polling client is asking about. Same shape as
 * Super Qix's.
 */
let currentState: GameState = 'menu';

/** Told by the door whenever the screen changes. */
export function setMusicState(state: GameState): void {
  currentState = state;
}

export const rpcHandlers = {
  /**
   * Which module the client should be playing.
   *
   * Answered from the pure trackForState the tests cover, so the music
   * cannot drift from the screen.
   */
  getMusicTrack: async (): Promise<{ track: string }> => {
    return { track: trackForState(currentState) };
  },

  getHighscores: async (): Promise<HighScore[]> => loadHighscores(),

  saveHighscore: async (params: { name: string; score: number; level: number }): Promise<void> => {
    const scores = loadHighscores();
    scores.push({
      name: params.name.toUpperCase().substring(0, 3),
      score: params.score,
      level: params.level,
      date: new Date().toISOString().split('T')[0],
    });
    scores.sort((a, b) => b.score - a.score);
    saveHighscores(scores.slice(0, 10));
  },
};
