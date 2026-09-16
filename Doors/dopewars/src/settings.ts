/**
 * What the sysop can set on GANJA WARS, and what the door does with it.
 *
 * The declaration is `door.settings.json` at the door root; the values are
 * `settings.json` beside it, written by the admin. Both are read through the
 * SDK, which resolves the door root itself - `__dirname` is `src/` in
 * development and `dist/` in production, and the walk lands on the door
 * either way.
 *
 * Read once per door launch (`loadSettings` in `onStart`), which is what makes
 * a change in the admin reach the next player without a backend restart.
 */

import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';

export interface DopewarsSettings {
  /** Turns (days) a game lasts before it ends and scores. */
  numTurns: number;
  startCash: number;
  startDebt: number;
  /** Percent the loan shark debt grows each turn. */
  debtInterest: number;
  /** Percent cash in the bank earns each turn. */
  bankInterest: number;
  /** Whether busts, deals and high scores go out through the announcer. */
  notifyLivechat: boolean;
}

/**
 * What GANJA WARS ran with before it declared anything. A board that sets
 * nothing must play exactly the game it played yesterday.
 */
export const DEFAULT_SETTINGS: DopewarsSettings = {
  numTurns: 30,
  startCash: 2000,
  startDebt: 5500,
  debtInterest: 10,
  bankInterest: 5,
  notifyLivechat: true,
};

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * The declared values, made safe to use.
 *
 * The SDK has already applied the manifest's types; this is the door's own
 * floor - a game of 0 turns is not a setting, it is a door that ends before it
 * starts, and a hand-edited settings.json can carry one.
 */
export function applySettings(raw: Record<string, string | number | boolean>): DopewarsSettings {
  return {
    numTurns: clampInt(raw.numTurns, DEFAULT_SETTINGS.numTurns, 5, 100),
    startCash: clampInt(raw.startCash, DEFAULT_SETTINGS.startCash, 0, 100000),
    startDebt: clampInt(raw.startDebt, DEFAULT_SETTINGS.startDebt, 0, 100000),
    debtInterest: clampInt(raw.debtInterest, DEFAULT_SETTINGS.debtInterest, 0, 100),
    bankInterest: clampInt(raw.bankInterest, DEFAULT_SETTINGS.bankInterest, 0, 100),
    notifyLivechat:
      raw.notifyLivechat === undefined ? DEFAULT_SETTINGS.notifyLivechat : raw.notifyLivechat !== false,
  };
}

/**
 * Read what the sysop set. Called once, when a player opens the door.
 *
 * `from` is the directory the SDK resolves the door root out of, and is only
 * ever passed by a test standing up a board of its own.
 */
export function loadSettings(from: string = __dirname): DopewarsSettings {
  try {
    return applySettings(readDoorSettings(from));
  } catch (error) {
    // A manifest someone broke by hand must not stop the door: it runs on what
    // it shipped with, and the admin reports the fault.
    console.error('[GanjaWars] settings:', (error as Error).message);
    return DEFAULT_SETTINGS;
  }
}

/**
 * The settings, shaped the way `DopewarsConfig` wants them.
 *
 * Every field here comes from a setting and nothing else does: the Discord
 * webhook is an environment variable and the theme is a constant, so both stay
 * at the call site in `index.ts`. Extracted 2026-09-16 because the mapping was
 * written inline in `onStart`, where the only way to check it was to read the
 * source and look for the word `settings.` once per key - which cannot tell a
 * forwarded value from a mentioned one.
 *
 * A key that stops being forwarded now fails a test that compares VALUES.
 */
export function configFieldsFrom(settings: DopewarsSettings): DopewarsSettings {
  return {
    numTurns: settings.numTurns,
    startCash: settings.startCash,
    startDebt: settings.startDebt,
    debtInterest: settings.debtInterest,
    bankInterest: settings.bankInterest,
    notifyLivechat: settings.notifyLivechat,
  };
}
