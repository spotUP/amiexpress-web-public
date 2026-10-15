/**
 * What the sysop set, made safe to use.
 *
 * Follows the wrapper shape every other door uses (see
 * Doors/bbs-dashboard/settings.ts): the manifest declares, the admin edits,
 * this clamps, and a hand-broken settings.json costs the door nothing.
 */
import { readDoorSettings } from '@amiexpress/bbs-door-sdk/settings';

export interface TeletextSettings {
  /** Pack id to open directly, or '' for the service list. */
  defaultService: string;
  /** Carousel dwell for a page that does not carry its own CT timing. */
  dwellSeconds: number;
  /** How block graphics are drawn for a caller who is not in teletext mode. */
  mosaicStyle: 'ascii' | 'sextant';
  /** Whether V reveals concealed text. */
  allowReveal: boolean;
}

export const DEFAULT_SETTINGS: TeletextSettings = {
  defaultService: '',
  dwellSeconds: 8,
  mosaicStyle: 'ascii',
  allowReveal: true,
};

function clampInt(raw: unknown, def: number, min: number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function applySettings(raw: Record<string, string | number | boolean>): TeletextSettings {
  const style = String(raw.mosaicStyle ?? DEFAULT_SETTINGS.mosaicStyle);
  return {
    defaultService: String(raw.defaultService ?? '').trim(),
    dwellSeconds: clampInt(raw.dwellSeconds, DEFAULT_SETTINGS.dwellSeconds, 2, 60),
    mosaicStyle: style === 'sextant' ? 'sextant' : 'ascii',
    allowReveal: raw.allowReveal === undefined ? DEFAULT_SETTINGS.allowReveal : Boolean(raw.allowReveal),
  };
}

export function loadSettings(): TeletextSettings {
  try {
    return applySettings(readDoorSettings(__dirname));
  } catch (error) {
    console.error('[Teletext] settings:', (error as Error).message);
    return DEFAULT_SETTINGS;
  }
}
