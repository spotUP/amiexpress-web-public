/**
 * One deadline for the whole fetch, and the last answer kept on disk.
 *
 * The 68K viewer held a PETSCII login for 58 SECONDS on 2026-09-15 with a
 * `TIMEOUT=5` in its own config, because a socket timeout is an INACTIVITY
 * timer - it restarts on every byte, and the retries stack on top of it. A
 * caller does not care which phase was slow; he cares that the board stopped.
 *
 * So the rule here is a wall clock: from the moment the door asks, the
 * scenewall has `timeoutSeconds` to produce an answer, retries and all. When
 * it does not, the door draws the LAST answer it got rather than an error -
 * yesterday's list is worth more to a caller than a red line, and it is what
 * the door would have shown him a minute earlier anyway.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Where the last good answer is kept, beside the door. */
export const CACHE_FILE = 'glc.lastgood.json';

export interface DeadlineResult {
  /** The JSON body, from the network or from the cache. */
  body: string | null;
  /** Where it came from, for the notice the door draws. */
  source: 'network' | 'cache' | 'nothing';
}

/**
 * Race a fetch against the clock.
 *
 * The promise is not cancelled - it cannot be, in general - but it is
 * ABANDONED: whatever it eventually settles to is ignored, and the caller has
 * already been given the cache. `onLate` exists so a late answer can still be
 * written to the cache for the next caller, which is where a slow scenewall
 * pays for itself.
 */
export async function withDeadline(
  fetch: () => Promise<string>,
  timeoutSeconds: number,
  onLate?: (body: string) => void,
): Promise<string | null> {
  let timer: NodeJS.Timeout | undefined;
  let settled = false;

  const expiry = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      settled = true;
      resolve(null);
    }, Math.max(1, timeoutSeconds) * 1000);
    // A door must not hold the process open on account of its own timer.
    if (typeof timer.unref === 'function') timer.unref();
  });

  const attempt = fetch().then(
    (body) => {
      if (settled && onLate) onLate(body);
      return settled ? null : body;
    },
    () => null,
  );

  try {
    return await Promise.race([attempt, expiry]);
  } finally {
    settled = true;
    if (timer) clearTimeout(timer);
  }
}

/** The last answer this door got, or null when it has never had one. */
export function readCache(doorDir: string): string | null {
  try {
    const body = fs.readFileSync(path.join(doorDir, CACHE_FILE), 'utf8');
    return body.trim().length > 0 ? body : null;
  } catch {
    return null;
  }
}

/**
 * Keep this answer for the next caller.
 *
 * Written through a temporary file: a door killed mid-write would otherwise
 * leave a truncated cache, and the next caller would see a parse error
 * instead of yesterday's list.
 */
export function writeCache(doorDir: string, body: string): void {
  const target = path.join(doorDir, CACHE_FILE);
  const temp = `${target}.tmp`;
  try {
    fs.writeFileSync(temp, body, 'utf8');
    fs.renameSync(temp, target);
  } catch {
    try { fs.unlinkSync(temp); } catch { /* nothing to clean up */ }
  }
}

/** The body to draw, and where it came from. */
export async function bodyForThisCall(
  fetch: () => Promise<string>,
  timeoutSeconds: number,
  doorDir: string,
): Promise<DeadlineResult> {
  const fresh = await withDeadline(fetch, timeoutSeconds, (late) => writeCache(doorDir, late));
  if (fresh !== null && fresh.trim().length > 0) {
    writeCache(doorDir, fresh);
    return { body: fresh, source: 'network' };
  }
  const cached = readCache(doorDir);
  return cached ? { body: cached, source: 'cache' } : { body: null, source: 'nothing' };
}
