import type { EventPrefs } from '../types';

/** Anything with a socket-style emit (the door's socket, a test double). */
export interface PrefsEmitter {
  emit(event: string, payload?: unknown): unknown;
}

/**
 * Sends the full prefs to the server (chat:prefs-set); they are stored per
 * user there and come back on the next open as chat:prefs.
 */
export function prefsSender(socket: PrefsEmitter | undefined): (prefs: EventPrefs) => void {
  return (prefs) => { socket?.emit('chat:prefs-set', { prefs: { ...prefs } }); };
}

/**
 * Merges the server's stored prefs into `target`. Keys the server did not
 * send keep their current (default) value; unknown keys and values of the
 * wrong type are ignored. Returns true when anything changed.
 */
export function applyServerPrefs(target: EventPrefs, stored: unknown): boolean {
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return false;
  const src = stored as Record<string, unknown>;
  const dst = target as unknown as Record<string, unknown>;
  let changed = false;
  for (const key of Object.keys(target)) {
    if (key === 'pinnedChannels') continue;
    if (typeof src[key] === 'boolean' && dst[key] !== src[key]) { dst[key] = src[key]; changed = true; }
  }
  const pins = src.pinnedChannels;
  if (Array.isArray(pins) && pins.every((n) => typeof n === 'string')) {
    target.pinnedChannels = [...(pins as string[])];
    changed = true;
  }
  return changed;
}
