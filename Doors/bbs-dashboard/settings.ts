/**
 * The dashboard's one sysop-settable knob: how often it refreshes.
 *
 * The auto-refresh interval was hardcoded at 3 seconds (`startAutoRefresh`),
 * and the uptime counter advanced by a matching hardcoded 3. A busy board
 * wants it slower; a wall display wants it snappier. Declared in
 * `door.settings.json`, edited in the admin, read here through the same SDK
 * helper every other door uses. Mirrors `Doors/livechat/settings.ts`.
 */
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';

export interface DashboardSettings {
  /** Seconds between refreshes; also the amount the uptime counter advances. */
  refreshSeconds: number;
}

export const DEFAULT_SETTINGS: DashboardSettings = { refreshSeconds: 3 };

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * The declared value, made safe to use. A 0-second refresh is a busy-loop and
 * a 3600-second one is not a live dashboard; a hand-edited settings.json can
 * carry either, so the door has its own floor and ceiling.
 */
export function applySettings(raw: Record<string, string | number | boolean>): DashboardSettings {
  return { refreshSeconds: clampInt(raw.refreshSeconds, DEFAULT_SETTINGS.refreshSeconds, 1, 60) };
}

/** Read what the sysop set. Called once, when a user opens the door. */
export function loadSettings(): DashboardSettings {
  try {
    return applySettings(readDoorSettings(__dirname));
  } catch (error) {
    // A manifest broken by hand must not stop the door: it runs on the
    // default, and the admin reports the fault.
    console.error('[BBSDashboard] settings:', (error as Error).message);
    return DEFAULT_SETTINGS;
  }
}
