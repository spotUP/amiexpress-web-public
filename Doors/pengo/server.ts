/**
 * Pengo - Server RPC Handlers
 */

import { GameState, HighScore } from './game/types';
import { trackForState } from './music-select';
import { DEFAULT_HIGHSCORES } from './game/constants';
import * as fs from 'fs';
import * as path from 'path';

const HIGHSCORES_FILE = path.join(__dirname, 'highscores.json');

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

  saveHighscore: async (params: { name: string; score: number; level: number }, session?: DoorSessionLike): Promise<void> => {
    const scores = loadHighscores();
    const entry: HighScore = {
      name: params.name.toUpperCase().substring(0, 3),
      score: params.score,
      level: params.level,
      date: new Date().toISOString().split('T')[0],
    };
    scores.push(entry);
    scores.sort((a, b) => b.score - a.score);
    const topScores = scores.slice(0, 10);
    saveHighscores(topScores);

    try {
      if (session?.bbs?.emitCustomEvent) {
        const rank = topScores.indexOf(entry) + 1; // 0 -> fell off the board
        const parts = [`Score: ${params.score.toLocaleString('en-US')}`, `Level: ${params.level}`];
        if (rank > 0) parts.push(`Rank: #${rank}`);

        session.bbs.emitCustomEvent('score_submitted', parts.join(' | '), {
          name: entry.name,
          score: params.score,
          level: params.level,
          rank: rank > 0 ? rank : undefined,
        });
      }
    } catch (e) {
      console.error('[Pengo Server] Failed to broadcast score event:', e);
    }
  },
};
