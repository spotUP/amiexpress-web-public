/**
 * The pooled areas of a conference that can actually be honoured, resolved
 * against the live storage context.
 *
 * `usableRemoteAreasFor` is the pure rule (Task 8); this is the one place that
 * feeds it the running board's volume list and decides what to do with the
 * complaints it produces. It lives on its own because BOTH directions need
 * exactly the same answer: an upload that files an object in an area the
 * download side refuses to read has written the file somewhere nobody looks,
 * and two copies of this glue would drift into precisely that.
 */
import { usableRemoteAreasFor, type RemoteArea } from './remote-areas';
import type { StorageContext } from './storage-context';

/**
 * When each unusable-area complaint was last logged.
 *
 * Throttled rather than latched: one line per download would drown the log,
 * but a Set that never forgets means a sysop who fixes Drives.info and then
 * breaks it again is told nothing the second time - the board would carry a
 * silent misconfiguration for as long as the process lives.
 */
const warnedAt = new Map<string, number>();

/** Long enough not to repeat inside one caller's session, short enough to re-notice. */
const WARN_AGAIN_AFTER_MS = 5 * 60 * 1000;

export function usableAreasFor(conferenceId: number, storage: StorageContext): RemoteArea[] {
  return usableRemoteAreasFor(
    conferenceId,
    storage.areas,
    driveNumber => storage.volumes.byNumber(driveNumber) !== undefined,
    message => {
      const last = warnedAt.get(message);
      const now = Date.now();
      if (last !== undefined && now - last < WARN_AGAIN_AFTER_MS) return;
      warnedAt.set(message, now);
      console.warn(message);
    }
  );
}
