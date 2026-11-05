/**
 * What the sysop can set on the Card Lobby, and what the door does with it.
 *
 * The declaration is `door.settings.json` at the door root; the values are
 * `settings.json` beside it, written by the admin. Both are read through the
 * SDK, which resolves the door root by walking up from here - `lib/` in
 * development, `dist/lib/` in production, and neither carries a manifest or a
 * package.json of its own, so the walk lands on the door either way.
 *
 * Read once per door launch (`loadSettings` in the door's onStart), then
 * handed out by `settings()`. Reading per launch rather than per process is
 * what makes a change in the admin reach the next player without a backend
 * restart; the shipped values in `constants.ts` stay the defaults, so a board
 * that sets nothing plays exactly the lobby it played yesterday.
 */

import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';
import {
  STARTING_CHIPS,
  DAILY_BONUS,
  DAILY_COOLDOWN_MS,
  ENTRY_FEE_RATE,
  ACTIVITY_REWARD,
  WIN_REWARD,
} from './constants';

const HOUR_MS = 60 * 60 * 1000;

export interface CardLobbySettings {
  /** Chips a new player's wallet starts with. */
  startingChips: number;
  /** Chips awarded each time a player claims the daily bonus. */
  dailyBonusChips: number;
  /** How long a player waits between daily bonuses, in hours. */
  dailyBonusCooldownHours: number;
  /** Fraction of the buy-in taken as an entry fee. 0.02 is 2%. */
  entryFeeRate: number;
  activityReward: number;
  winReward: number;
}

export const DEFAULT_SETTINGS: CardLobbySettings = {
  startingChips: STARTING_CHIPS,
  dailyBonusChips: DAILY_BONUS,
  dailyBonusCooldownHours: DAILY_COOLDOWN_MS / HOUR_MS,
  entryFeeRate: ENTRY_FEE_RATE,
  activityReward: ACTIVITY_REWARD,
  winReward: WIN_REWARD,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampRate(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * The declared values, made safe to use.
 *
 * The SDK has already applied the manifest's types; this is the door's own
 * floor - an entry fee of 400% is not a setting, it is a table nobody can sit
 * at, and a hand-edited settings.json can carry one.
 */
export function applySettings(raw: Record<string, string | number | boolean>): CardLobbySettings {
  return {
    startingChips: clampInt(raw.startingChips, DEFAULT_SETTINGS.startingChips, 0, 1000000),
    dailyBonusChips: clampInt(raw.dailyBonusChips, DEFAULT_SETTINGS.dailyBonusChips, 0, 100000),
    dailyBonusCooldownHours: clampInt(
      raw.dailyBonusCooldownHours,
      DEFAULT_SETTINGS.dailyBonusCooldownHours,
      1,
      168,
    ),
    entryFeeRate: clampRate(raw.entryFeeRate, DEFAULT_SETTINGS.entryFeeRate, 0, 1),
    activityReward: clampInt(raw.activityReward, DEFAULT_SETTINGS.activityReward, 0, 10000),
    winReward: clampInt(raw.winReward, DEFAULT_SETTINGS.winReward, 0, 10000),
  };
}

let current: CardLobbySettings = DEFAULT_SETTINGS;

/**
 * Read what the sysop set. Called once, when a player opens the door.
 *
 * `from` is the directory the SDK resolves the door root out of, and is only
 * ever passed by a test standing up a board of its own.
 */
export function loadSettings(from: string = __dirname): CardLobbySettings {
  try {
    current = applySettings(readDoorSettings(from));
  } catch (error) {
    // A manifest someone broke by hand must not stop the door: it runs on what
    // it shipped with, and the admin reports the fault.
    console.error('[CardLobby] settings:', (error as Error).message);
    current = DEFAULT_SETTINGS;
  }
  return current;
}

/** What the door is running with right now. */
export function settings(): CardLobbySettings {
  return current;
}

/**
 * The bonus cooldown as the wallet code measures it. The manifest declares
 * hours because that is what a sysop types; every comparison here is against
 * Date.now().
 */
export function dailyBonusCooldownMs(): number {
  return current.dailyBonusCooldownHours * HOUR_MS;
}
