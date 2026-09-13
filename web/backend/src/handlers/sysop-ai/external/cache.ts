/**
 * BOUNDED TTL CACHE - one implementation for every external lookup.
 *
 * Each external module used to keep its own `new Map<string, {at, value}>`
 * whose TTL was checked only on a READ. A key nobody asked for a second time
 * was therefore never looked at again and never removed: it sat in the map
 * for the life of the process. The keys are caller-supplied text - a caller
 * can ask the co-sysop about any word there is - so eight maps grew without
 * a bound on a board that never restarts.
 *
 * This is the one cache they all use now. It is bounded by entry count, it
 * drops expired rows when it has to make room, and it evicts the least
 * recently used key first (a Map iterates in insertion order, and a re-set
 * moves a key to the back, so the front of the map is the coldest key).
 */

/** A day: the answers here are encyclopaedic, not live. */
export const EXTERNAL_CACHE_TTL_MS = 24 * 3600 * 1000;
/** Entries kept per external module. */
export const EXTERNAL_CACHE_MAX_ENTRIES = 200;
/** Every external answer is cut to this before it is cached or returned. */
export const EXTERNAL_ANSWER_CAP = 1800;

interface Entry {
  at: number;
  value: string;
}

export interface ExternalCacheOptions {
  ttlMs?: number;
  maxEntries?: number;
  /**
   * Returning false keeps a value OUT of the cache. Wikipedia uses it: a
   * throttled edge answers "Wikipedia has nothing", and a 24h-cached miss
   * outlives the throttle by a day.
   */
  shouldCache?: (value: string) => boolean;
}

export interface ExternalCache {
  /** Cached, capped, and an honest sentence when the net does not answer. */
  lookup(key: string, build: () => Promise<string>): Promise<string>;
  /** Test seam. */
  reset(): void;
  /** Live entry count - for the eviction test, and for diagnostics. */
  size(): number;
}

export function createExternalCache(options: ExternalCacheOptions = {}): ExternalCache {
  const ttlMs = options.ttlMs ?? EXTERNAL_CACHE_TTL_MS;
  const maxEntries = Math.max(1, options.maxEntries ?? EXTERNAL_CACHE_MAX_ENTRIES);
  const shouldCache = options.shouldCache ?? (() => true);
  const entries = new Map<string, Entry>();

  const fresh = (entry: Entry, now: number): boolean => now - entry.at < ttlMs;

  const evict = (now: number): void => {
    if (entries.size <= maxEntries) return;
    for (const [key, entry] of entries) {
      if (!fresh(entry, now)) entries.delete(key);
    }
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  };

  return {
    async lookup(key: string, build: () => Promise<string>): Promise<string> {
      const hit = entries.get(key);
      if (hit) {
        if (fresh(hit, Date.now())) {
          // Touch: the warmest key goes to the back of the eviction queue.
          entries.delete(key);
          entries.set(key, hit);
          return hit.value;
        }
        entries.delete(key);
      }
      try {
        const value = (await build()).slice(0, EXTERNAL_ANSWER_CAP);
        if (shouldCache(value)) {
          const now = Date.now();
          entries.delete(key);
          entries.set(key, { at: now, value });
          evict(now);
        }
        return value;
      } catch (err) {
        return `No answer from the net right now (${(err as Error).message}).`;
      }
    },
    reset(): void {
      entries.clear();
    },
    size(): number {
      return entries.size;
    },
  };
}
