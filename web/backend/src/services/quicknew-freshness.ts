/**
 * Does the new-files screen still need rebuilding?
 *
 * QuickNew runs on EVERY logoff and takes about thirty seconds on the live
 * board - two vCPUs, shared with the BBS itself - and batch doors are
 * deliberately serialised, so that time sits in front of the next caller's
 * logoff too.
 *
 * It cannot simply move to a timer:
 *
 *     "it needs to be rebuilt per caller if a caller uploads something,
 *      trading is competitive"   - the sysop, 2026-09-15
 *
 * which is the real constraint and the reason this is not "run it every hour".
 * But a caller who uploaded NOTHING leaves every listing exactly as it was, and
 * the door then spends thirty seconds producing the bytes already on disk. That
 * run is the one worth skipping, and skipping it costs the trader nothing: the
 * moment a listing changes, the screen is stale and the door runs.
 *
 * Two things make a screen stale:
 *
 *   1. a LISTING is newer than the screen - somebody uploaded
 *   2. the screen was built on an EARLIER DAY - the door prints today's date
 *      and counts "last @D days", so the same listings render differently
 *      after midnight
 *
 * Deciding from mtimes rather than from content is deliberate: reading the
 * listings to hash them costs the I/O the skip is meant to save, and AmigaDOS
 * appends to a DIR file on upload, so the mtime is exactly the signal.
 */

import * as fs from 'fs';
import { parseQuickNewBlocks } from '../doors/quicknew-config';

export interface FreshnessInput {
  /** When the screen was last written, or null when it has never been. */
  screenMtime: Date | null;
  /** When each listing the config names was last written; missing ones absent. */
  listingMtimes: Date[];
  /** Now, so the day-boundary test is testable. */
  now: Date;
}

export interface FreshnessVerdict {
  stale: boolean;
  /** Why, for the log - a skipped run should say what it concluded. */
  reason: string;
}

/** Same calendar day in local time, which is the day the door prints. */
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function quickNewIsStale(input: FreshnessInput): FreshnessVerdict {
  const { screenMtime, listingMtimes, now } = input;

  if (!screenMtime) {
    return { stale: true, reason: 'no screen yet' };
  }
  if (!sameDay(screenMtime, now)) {
    return { stale: true, reason: 'screen was built on an earlier day' };
  }
  const newer = listingMtimes.filter(m => m.getTime() > screenMtime.getTime()).length;
  if (newer > 0) {
    return { stale: true, reason: `${newer} listing(s) changed since the screen was built` };
  }
  // A config that names nothing readable cannot be proved fresh, and a board
  // whose listings have all gone missing is a situation worth rebuilding into
  // rather than silently freezing the screen on.
  if (listingMtimes.length === 0) {
    return { stale: true, reason: 'no listing could be read' };
  }
  return { stale: false, reason: 'no upload since the screen was built, same day' };
}

/**
 * The mtimes behind that verdict, read off disk.
 *
 * `resolve` maps an Amiga path (`BBS:Conf1/DIR1`) to a real one; it is passed
 * in so this module needs no assigns and no case rules of its own.
 */
export function readQuickNewFreshness(
  configPath: string,
  screenPath: string,
  resolve: (amigaPath: string) => string,
  now: Date = new Date(),
): FreshnessVerdict {
  let screenMtime: Date | null = null;
  try {
    screenMtime = fs.statSync(screenPath).mtime;
  } catch { /* never built */ }

  const listingMtimes: Date[] = [];
  try {
    const text = fs.readFileSync(configPath, 'latin1');
    for (const block of parseQuickNewBlocks(text)) {
      if (!block.dirPath) continue;
      try {
        listingMtimes.push(fs.statSync(resolve(block.dirPath)).mtime);
      } catch { /* a listing the board does not have says nothing */ }
    }
  } catch {
    // An unreadable config is not a reason to skip: run the door and let it
    // report its own error, the way it did before this check existed.
    return { stale: true, reason: 'config could not be read' };
  }

  return quickNewIsStale({ screenMtime, listingMtimes, now });
}
