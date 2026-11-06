import type { EventPrefs } from '../types';
/** Anything with a socket-style emit (the door's socket, a test double). */
export interface PrefsEmitter {
    emit(event: string, payload?: unknown): unknown;
}
/**
 * Sends the full prefs to the server (chat:prefs-set); they are stored per
 * user there and come back on the next open as chat:prefs.
 */
export declare function prefsSender(socket: PrefsEmitter | undefined): (prefs: EventPrefs) => void;
/**
 * Merges the server's stored prefs into `target`. Keys the server did not
 * send keep their current (default) value; unknown keys and values of the
 * wrong type are ignored. Returns true when anything changed.
 */
export declare function applyServerPrefs(target: EventPrefs, stored: unknown): boolean;
