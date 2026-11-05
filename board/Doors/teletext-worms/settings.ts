/**
 * What the sysop set, made safe to use. Same wrapper shape as every other
 * door (see Doors/bbs-dashboard/settings.ts).
 */
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';

export interface WormsSettings {
  wormsPerTeam: number;
  startingHealth: number;
  /** Whether two callers can play each other over the board. */
  allowNetwork: boolean;
}

export const DEFAULT_SETTINGS: WormsSettings = {
  wormsPerTeam: 2,
  startingHealth: 100,
  allowNetwork: true,
};

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function applySettings(raw: Record<string, string | number | boolean>): WormsSettings {
  return {
    wormsPerTeam: clampInt(raw.wormsPerTeam, DEFAULT_SETTINGS.wormsPerTeam, 1, 4),
    startingHealth: clampInt(raw.startingHealth, DEFAULT_SETTINGS.startingHealth, 25, 200),
    allowNetwork:
      raw.allowNetwork === undefined ? DEFAULT_SETTINGS.allowNetwork : Boolean(raw.allowNetwork),
  };
}

export function loadSettings(): WormsSettings {
  try {
    return applySettings(readDoorSettings(__dirname));
  } catch (error) {
    console.error('[TeletextWorms] settings:', (error as Error).message);
    return DEFAULT_SETTINGS;
  }
}
