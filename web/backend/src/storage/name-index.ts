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
 * 1. Unavailability during refresh() must never look like an empty area. A
 *    caller reading a StorageUnavailableError as "no such file" deletes the
 *    catalog row for a file that is fine. refresh() only commits a new
 *    listing once backend.list() has actually succeeded; on failure the
 *    index keeps whatever it held before, and the error propagates instead
 *    of being swallowed.
 *
 * 2. note()/forget() that land WHILE a refresh() is outstanding must not be
 *    discarded by the listing that predates them - two nodes, one listing
 *    in flight, one upload finishing mid-flight, and the listing's snapshot
 *    landing after the upload was never asked to be re-listed. Such calls
 *    are buffered and replayed once the in-flight refresh settles: onto the
 *    fresh maps on success (so the write is not lost to a stale snapshot),
 *    or onto the maps as they were on failure (so the write is still not
 *    lost even though this attempt could not confirm it against the
 *    backend). Concurrent resolve() calls on an unprimed index share the
 *    one in-flight listing rather than each starting their own - the
 *    registry exists to make one listing serve every caller of an area, and
 *    N concurrent first lookups producing N listings would undo that.
 *
 * 3. A caller's EXACT spelling wins outright over the case-insensitive
 *    fallback. amigafs.ts's own resolvePath checks the literal path first
 *    and only then scans case-insensitively; with FILE.LHA and file.lha
 *    both present, resolving "FILE.LHA" must return FILE.LHA, not whichever
 *    of the two an ordinal tie-break prefers. The tie-break only runs when
 *    there is no exact hit, and only amongst whichever real keys currently
 *    share that lowered name - recomputed at lookup time, not cached, so a
 *    write can never leave a stale "winner" behind. Deleting one case
 *    variant must not remove a same-named sibling that is still there.
 *
 * 4. A HIT is trusted forever once primed - nothing else in this process
 *    writes the bucket except through note()/forget(). A MISS is not
 *    trusted past a throttle window, because a prune job, a second node
 *    mid-deploy, or the provider's console can all write the bucket without
 *    ever calling note()/forget() here, and a miss is the one place this
 *    index can be permanently wrong for the rest of the process's life. A
 *    miss older than the window forces exactly one re-list before the
 *    answer is trusted; a miss inside the window, and every hit regardless
 *    of age, costs nothing.
 */
import type { ObjectHead, StorageBackend } from './storage-backend';

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
  private refreshedAt = 0;
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

  /** A real key's path relative to this area's prefix - what gets lowercased and compared. */
  private relKey(key: string): string {
    return key.startsWith(this.prefix) ? key.slice(this.prefix.length) : key;
  }

  /**
   * Lists the area and rebuilds the index from scratch.
   *
   * Concurrent callers share one in-flight listing (see invariant 2 above):
   * a second refresh() call while one is already outstanding returns the
   * same promise rather than starting a second backend.list().
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
        this.refreshedAt = this.now();
      } finally {
        // Replay whatever note()/forget() arrived while list() was in
        // flight - onto the maps above on success, onto the maps as they
        // were on failure. Either way the write is not lost (invariant 2).
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
    if (!this.primed) await this.refresh();

    let found = this.lookup(name);
    if (found === null && this.now() - this.refreshedAt >= this.staleAfterMs) {
      await this.refresh();
      found = this.lookup(name);
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

  private lookup(name: string): string | null {
    const exact = this.exactByRelKey.get(name);
    if (exact) return exact;

    const candidates = this.byLowerName.get(name.toLowerCase());
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
