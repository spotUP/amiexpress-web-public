/**
 * The board is case-insensitive and S3 is not.
 *
 * amigafs.resolvePath answers "the caller typed file.lha, the disk says
 * FILE.LHA" by listing the directory. A bucket cannot be listed per lookup -
 * Oracle's free tier allows 50,000 requests a MONTH, which one busy evening
 * of listings would spend - so each remote area keeps this index instead:
 * one listing, then maintained on every write.
 *
 * Four invariants this index has to hold at once, each earned from a real
 * failure mode:
 *
 * 1. Unavailability must never look like an empty area, or answer as one.
 *    refresh() only commits a new listing once backend.list() has actually
 *    succeeded; on failure the index keeps whatever it held before, and the
 *    error propagates instead of being swallowed. That much is not enough by
 *    itself, though - see invariant 4 below for the other half of this: a
 *    MISS answered while the backend is known to be down must also never
 *    look like "no such object" to a caller. A sysop sweeping a catalog
 *    during an outage who gets "not found" instead of an error deletes a
 *    row for a file that is fine.
 *
 * 2. note()/forget() that land WHILE a refresh() is outstanding must not be
 *    discarded by the listing that predates them - two nodes, one listing
 *    in flight, one upload finishing mid-flight, and the listing's snapshot
 *    landing after the upload was never asked to be re-listed. Such calls
 *    are buffered and replayed once the in-flight refresh settles: onto the
 *    fresh maps on success (so the write is not lost to a stale snapshot),
 *    or onto the maps as they were on failure (so the write is still not
 *    lost even though this attempt could not confirm it against the
 *    backend). The in-flight flag is cleared and the buffer drained in the
 *    SAME synchronous stretch, before this function's own promise settles -
 *    clearing it a tick later (in the caller's own finally, after `await`
 *    resumes) leaves a window where a note()/forget() lands after the
 *    drain has already run but is still buffered into an array nothing
 *    will read again, discarding it exactly as if this fix did not exist.
 *    Concurrent resolve() calls on an unprimed index share the one
 *    in-flight listing rather than each starting their own - the registry
 *    exists to make one listing serve every caller of an area, and N
 *    concurrent first lookups producing N listings would undo that.
 *
 * 3. A caller's EXACT spelling wins outright over the case-insensitive
 *    fallback. amigafs.ts's own resolvePath checks the literal path first
 *    and only then scans case-insensitively; with FILE.LHA and file.lha
 *    both present, resolving "FILE.LHA" must return FILE.LHA, not whichever
 *    of the two an ordinal tie-break prefers. The tie-break only runs when
 *    there is no exact hit, and only amongst whichever real keys currently
 *    share that lowered name - recomputed at lookup time, not cached, so a
 *    write can never leave a stale "winner" behind. Deleting one case
 *    variant must not remove a same-named sibling that is still there. And
 *    a caller may resolve() either a bare name or a full key (prefix
 *    included) - the same relative-path normalisation applied to a stored
 *    key is applied to the lookup argument, so both spellings hit the same
 *    entry.
 *
 * 4. A HIT is trusted forever once primed - nothing else in this process
 *    writes the bucket except through note()/forget(). A MISS is not
 *    trusted past a throttle window, because a prune job, a second node
 *    mid-deploy, or the provider's console can all write the bucket without
 *    ever calling note()/forget() here, and a miss is the one place this
 *    index can be permanently wrong for the rest of the process's life. A
 *    miss older than the window forces exactly one re-list before the
 *    answer is trusted; a miss inside the window, and every hit regardless
 *    of age, costs nothing. The window is measured from the last ATTEMPT
 *    (lastAttemptAt), not the last SUCCESS: gating on success alone means a
 *    down backend never advances the stamp, so every single stale miss
 *    re-attempts (and re-fails) for as long as the outage lasts - one list
 *    call per miss instead of one per window.
 *
 *    Capping the attempt rate is not enough on its own, though: a throttled
 *    attempt that is skipped because one already failed inside this window
 *    must NOT fall through to "no candidates found, so answer null" - that
 *    is invariant 1's failure again, just reached through the throttle
 *    instead of through refresh() itself. lastAttemptError remembers the
 *    outcome of the last attempt, not only its time: a MISS with a cached
 *    failure re-throws that failure (preserving its drive number) instead
 *    of degrading to "not found," on both the primed-but-stale path and the
 *    never-primed cold-start path, so attempts stay capped at one per
 *    window WITHOUT ever trading a wrong "not found" for the saved
 *    request. A HIT still answers from the primed maps regardless - the
 *    data behind a hit is real and was already trusted before the backend
 *    went down. The flag clears the moment a listing actually succeeds, so
 *    recovery is detected on the very next attempt the window allows.
 */
import type { ObjectHead, StorageBackend } from './storage-backend';
import { StorageUnavailableError } from './storage-backend';

/**
 * One hour: cheap enough that a write from outside this process becomes
 * visible without spending the monthly request budget on every miss - about
 * 720 listings a month per area against Oracle's 50,000 request ceiling.
 */
const DEFAULT_STALE_AFTER_MS = 60 * 60 * 1000;

interface PendingOp {
  readonly type: 'note' | 'forget';
  readonly key: string;
}

export interface NameIndexOptions {
  /** How long a MISS is trusted before it forces a re-list. A HIT never re-lists. */
  staleAfterMs?: number;
  /** Injectable clock so tests can move time without waiting on it. Defaults to Date.now. */
  now?: () => number;
}

export class NameIndex {
  /** Real key, keyed by its path relative to the prefix, exactly as spelled. */
  private exactByRelKey = new Map<string, string>();
  /** Real keys sharing a lowercased relative path - the case-insensitive fallback pool. */
  private byLowerName = new Map<string, Set<string>>();
  private primed = false;
  /** When a listing was last ATTEMPTED, success or failure - what gates a stale-miss re-list. */
  private lastAttemptAt = 0;
  /**
   * The failure from the last attempt, or null if the last attempt
   * succeeded (or none has been made yet). This is what stops a throttled
   * MISS from answering "not found" while the backend is known to be
   * down - see invariant 4 above.
   */
  private lastAttemptError: StorageUnavailableError | null = null;
  private inFlight: Promise<void> | null = null;
  private pendingOps: PendingOp[] = [];
  private readonly staleAfterMs: number;
  private readonly now: () => number;

  constructor(
    private readonly backend: StorageBackend,
    private readonly prefix: string,
    options: NameIndexOptions = {}
  ) {
    this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.now = options.now ?? Date.now;
  }

  /** A path's location relative to this area's prefix - what gets lowercased and compared. */
  private relKey(key: string): string {
    return key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key;
  }

  private throttled(): boolean {
    return this.now() - this.lastAttemptAt < this.staleAfterMs;
  }

  /**
   * Lists the area and rebuilds the index from scratch.
   *
   * A second refresh() call while one is already outstanding joins that
   * same listing instead of starting a second backend.list() - its `await`
   * settles once the original listing (and its buffered-op replay) has
   * finished, one microtask after that work completes, not synchronously
   * with it.
   */
  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    const opsDuringThisRefresh: PendingOp[] = [];
    this.pendingOps = opsDuringThisRefresh;

    const run = (async () => {
      try {
        const heads = await this.backend.list(this.prefix);

        const exact = new Map<string, string>();
        const byLower = new Map<string, Set<string>>();
        for (const head of heads) {
          this.index(head, exact, byLower);
        }

        // Only committed once list() has actually succeeded - a throw above
        // never reaches these lines, so a failed refresh leaves the index
        // exactly as it was (invariant 1).
        this.exactByRelKey = exact;
        this.byLowerName = byLower;
        this.primed = true;
        // This attempt confirmed the data - any previously cached failure
        // no longer describes the backend's current state.
        this.lastAttemptError = null;
      } catch (err) {
        // Only StorageUnavailableError is cached and re-served to a
        // throttled miss (invariant 4) - an unexpected error of some other
        // kind still propagates below, it just is not remembered as "the
        // backend is known down."
        if (err instanceof StorageUnavailableError) this.lastAttemptError = err;
        throw err;
      } finally {
        // Runs on success AND failure - a down backend still advances the
        // "last attempt" stamp, or every stale miss would keep re-trying
        // for the length of the outage (invariant 4).
        this.lastAttemptAt = this.now();

        // Cleared and drained HERE, inside this same synchronous stretch -
        // not in the outer refresh() caller's own finally below, which only
        // runs a microtask later once `await run` resumes. A note()/
        // forget() landing in that later tick would otherwise still see
        // in-flight as true and buffer into an array this function has
        // already stopped reading (invariant 2). Unconditional, not an
        // identity-guarded clear: nothing else can set this.inFlight while
        // this synchronous stretch is running - JS is single-threaded, and
        // refresh() only ever starts a new listing when this.inFlight is
        // already falsy - so this is always still the owner's own flight.
        this.inFlight = null;
        for (const op of opsDuringThisRefresh) {
          if (op.type === 'note') this.applyNote(op.key);
          else this.applyForget(op.key);
        }
      }
    })();

    this.inFlight = run;
    try {
      await run;
    } finally {
      // Almost always a no-op by the time this runs, since run's own
      // finally already cleared it above - kept as a safety net for any
      // path that reaches here without going through run's finally.
      if (this.inFlight === run) this.inFlight = null;
    }
  }

  private index(head: ObjectHead, exact: Map<string, string>, byLower: Map<string, Set<string>>): void {
    const rel = this.relKey(head.key);
    exact.set(rel, head.key);
    const lower = rel.toLowerCase();
    let candidates = byLower.get(lower);
    if (!candidates) {
      candidates = new Set<string>();
      byLower.set(lower, candidates);
    }
    candidates.add(head.key);
  }

  async resolve(name: string): Promise<string | null> {
    if (!this.primed) {
      // Never attempted, or the last attempt failed and this window has not
      // rolled over yet: re-throw what we already know rather than spending
      // a request to learn it again. A cold-start outage would otherwise
      // cost one list() per resolve() call, hit or miss - the throttle
      // this class exists to provide, skipped entirely on this path.
      if (this.lastAttemptError !== null && this.throttled()) {
        throw this.lastAttemptError;
      }
      await this.refresh();
    }

    let found = this.lookup(name);
    if (found === null) {
      if (!this.throttled()) {
        await this.refresh();
        found = this.lookup(name);
      }
      if (found === null && this.lastAttemptError !== null) {
        // No candidates AND the backend is known down: answering null here
        // would be indistinguishable from "no such object" to a caller
        // sweeping a catalog, and is exactly the wrong answer invariant 1
        // exists to prevent. Re-throw the cached failure instead.
        throw this.lastAttemptError;
      }
    }
    return found;
  }

  /** Called after a put. */
  note(key: string): void {
    if (this.inFlight) {
      this.pendingOps.push({ type: 'note', key });
      return;
    }
    this.applyNote(key);
  }

  /** Called after a delete. */
  forget(key: string): void {
    if (this.inFlight) {
      this.pendingOps.push({ type: 'forget', key });
      return;
    }
    this.applyForget(key);
  }

  /**
   * `name` may be a bare filename ('FILE.LHA') or a full key including this
   * area's prefix ('Conf1/Files/FILE.LHA') - both are normalised to the same
   * relative-to-prefix form the maps are keyed on, so either spelling hits
   * the same entry (invariant 3).
   */
  private lookup(name: string): string | null {
    const rel = this.relKey(name);

    const exact = this.exactByRelKey.get(rel);
    if (exact !== undefined) return exact;

    const candidates = this.byLowerName.get(rel.toLowerCase());
    if (!candidates || candidates.size === 0) return null;

    let winner: string | null = null;
    for (const key of candidates) {
      if (winner === null || key > winner) winner = key;
    }
    return winner;
  }

  private applyNote(key: string): void {
    const rel = this.relKey(key);
    this.exactByRelKey.set(rel, key);
    const lower = rel.toLowerCase();
    let candidates = this.byLowerName.get(lower);
    if (!candidates) {
      candidates = new Set<string>();
      this.byLowerName.set(lower, candidates);
    }
    candidates.add(key);
  }

  private applyForget(key: string): void {
    const rel = this.relKey(key);
    // Only removed if this key is actually what the exact-spelling slot
    // holds - guards against a same-named case sibling's forget() call
    // clobbering a different real key's exact entry.
    if (this.exactByRelKey.get(rel) === key) this.exactByRelKey.delete(rel);

    const lower = rel.toLowerCase();
    const candidates = this.byLowerName.get(lower);
    if (candidates) {
      candidates.delete(key);
      if (candidates.size === 0) this.byLowerName.delete(lower);
    }
  }
}
