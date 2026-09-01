/**
 * Super Qix - Server RPC Handlers
 * Handles persistence operations for hybrid door mode
 */

import * as fs from 'fs';
// The narrow subpath, not the package root: one path helper, not the SDK's
// audio engine.
import { resolveDoorRoot } from '@amiexpress/bbs-door-sdk/settings';
import * as path from 'path';
import { HighScore, KeyMap, GameState } from './game/types';
import { trackForState } from './music-select';
import {
  DEFAULT_HIGHSCORES,
  MAX_HIGHSCORES,
  MAX_NAME_LENGTH,
  DEFAULT_KEY_MAP,
} from './game/constants';

/**
 * The door's own directory, wherever it is running from.
 *
 * __dirname is Doors/super-qix when the door runs from TypeScript source
 * (dev - door.handler.ts prefers the .ts entry outside production) and
 * Doors/super-qix/dist when it runs compiled. Walking up to the directory
 * holding package.json gives the door root in both cases, so dev and the
 * live board use ONE file instead of drifting apart.
 *
 * This is what HIGHSCORES_PATH used to get wrong: it was
 * path.join(__dirname, 'highscores.json'), which under the compiled door is
 * inside dist/ - and every deploy rebuilds dist/, so the board was wiped
 * each time. Arkanoid was fixed for exactly this; Super Qix never was.
 *
 * It must NOT be derived from process.cwd() either: the backend runs with
 * cwd web/backend, which is outside the Doors volume entirely.
 *
 * startAt exists so a test can prove the walk actually climbs out of dist/.
 * Under tsx, __dirname already IS the door root, so a test that only looked
 * at the resolved path would pass just as happily on the broken version.
 */
export function getDoorRoot(startAt: string = __dirname): string {
  // The walk lives in the SDK now - resolveDoorRoot. Three doors had grown
  // their own copy of it, and the doors that had NOT grown one (BBSLink, the
  // BBSLink wall, the telnet door, GRANDMASTER) are exactly the ones found
  // reading paths that never existed.
  return resolveDoorRoot(startAt);
}

/**
 * Where the high scores live.
 *
 * Exported so a regression test can assert it resolves inside the door's own
 * directory rather than into the dist/ a deploy replaces.
 */
export function getHighscorePath(): string {
  return path.join(getDoorRoot(), 'highscores.json');
}

/** Where per-player settings live, beside the high scores. */
export function getSettingsPath(): string {
  return path.join(getDoorRoot(), 'settings.json');
}

/**
 * Load high scores from disk
 */
function loadHighscores(): HighScore[] {
  try {
    const filePath = getHighscorePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('[Super Qix] Error loading highscores:', error);
  }
  return [...DEFAULT_HIGHSCORES];
}

/**
 * Save high scores to disk
 */
function saveHighscores(scores: HighScore[]): void {
  try {
    fs.writeFileSync(getHighscorePath(), JSON.stringify(scores, null, 2));
  } catch (error) {
    console.error('[Super Qix] Error saving highscores:', error);
  }
}

/**
 * What the door is showing right now, for getMusicTrack to answer with.
 *
 * A module-level value rather than session state: a TypeScript door is
 * loaded per launch, so this belongs to the one game being played through
 * it, which is the same thing the client is asking about.
 */
let currentState: GameState = 'menu';

/** Told by the door whenever the screen changes. */
export function setMusicState(state: GameState): void {
  currentState = state;
}

/** Every player's settings, keyed by BBS handle. */
type SettingsFile = Record<string, { keyMap: KeyMap }>;

function loadSettingsFile(): SettingsFile {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as SettingsFile;
    }
  } catch (error) {
    console.error('[Super Qix] Error loading settings:', error);
  }
  return {};
}

/**
 * Only the four directions, and only strings.
 *
 * The file is on disk beside a game anyone can play; a malformed or
 * hand-edited entry must not be able to put a non-key into the dispatch map.
 */
function sanitiseKeyMap(candidate: unknown): KeyMap {
  const result: KeyMap = { ...DEFAULT_KEY_MAP };
  if (!candidate || typeof candidate !== 'object') return result;

  for (const direction of ['up', 'down', 'left', 'right'] as const) {
    const value = (candidate as Record<string, unknown>)[direction];
    if (typeof value === 'string' && value.length > 0 && value.length <= 16) {
      result[direction] = value;
    }
  }
  return result;
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
  saveHighscore: async (params: {
    name: string;
    score: number;
    level: number;
    maxPercent: number;
  }): Promise<{ success: boolean; rank: number }> => {
    const { name, score, level, maxPercent } = params;

    // Validate input.
    //
    // The cap used to be 3, and it REJECTED rather than truncated: a player
    // whose BBS handle was longer than three characters could not be
    // recorded at all. It is MAX_NAME_LENGTH now, and the entry is trimmed
    // to it rather than refused.
    if (!name || name.length === 0 || name.length > MAX_NAME_LENGTH) {
      return { success: false, rank: -1 };
    }
    if (score < 0 || level < 1) {
      return { success: false, rank: -1 };
    }

    // Load current scores
    const scores = loadHighscores();

    // Create new entry
    const newEntry: HighScore = {
      name: name.toUpperCase().substring(0, MAX_NAME_LENGTH),
      score,
      level,
      maxPercent: Math.min(100, Math.max(0, maxPercent)),
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
  },

  /**
   * Which tracker module should be playing right now.
   *
   * The door's client is a stub - the game runs here, server-side, so the
   * browser has no way to know what is on screen. Arkanoid's client can
   * drive its own music because Arkanoid's client IS the game; this one
   * cannot, so it asks.
   *
   * Answered from the same pure trackForState the tests cover, so the music
   * cannot drift from the screen. setMusicState is called by the door
   * whenever the state changes.
   */
  getMusicTrack: async (): Promise<{ track: string }> => {
    return { track: trackForState(currentState) };
  },

  /**
   * This player's saved key bindings, or the defaults if they have none.
   *
   * Keyed by BBS handle so two players on the same board keep their own,
   * and stored outside dist/ so a deploy does not throw them away.
   */
  getSettings: async (params: { user: string }): Promise<{ keyMap: KeyMap }> => {
    const user = (params?.user ?? '').trim().toUpperCase();
    if (!user) return { keyMap: { ...DEFAULT_KEY_MAP } };

    const all = loadSettingsFile();
    return { keyMap: sanitiseKeyMap(all[user]?.keyMap) };
  },

  /**
   * Remember this player's key bindings.
   */
  saveSettings: async (params: {
    user: string;
    keyMap: KeyMap;
  }): Promise<{ success: boolean }> => {
    const user = (params?.user ?? '').trim().toUpperCase();
    if (!user) return { success: false };

    try {
      const all = loadSettingsFile();
      all[user] = { keyMap: sanitiseKeyMap(params.keyMap) };
      fs.writeFileSync(getSettingsPath(), JSON.stringify(all, null, 2));
      return { success: true };
    } catch (error) {
      console.error('[Super Qix] Error saving settings:', error);
      return { success: false };
    }
  }
};

// Export for hybrid door system
export default rpcHandlers;
