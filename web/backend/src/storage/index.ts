/**
 * Wires the pooled-storage subsystem into the board.
 *
 * Every other module in `storage/` is a leaf: `VolumeSet` parses Drives.info,
 * `FileCache` moves bytes, `NameIndexRegistry` resolves names, `remote-areas`
 * decides which file areas are pooled. Tasks 8, 9 and 11 built callers that
 * branch on `getStorageContext()` (`storage-context.ts`), but nothing ever
 * called `setStorageContext` - every one of those branches was dead code with
 * no way to run. This module is the one place that builds a `StorageContext`,
 * and `refreshStorageContext` below is the one place that wires it into the
 * board - called from `server/initialization.ts` at boot, again from the
 * conference-change bus, and again after a Drives.info write, so a rebuild is
 * always the SAME rebuild rather than three call sites each re-deriving their
 * own notion of "current".
 *
 * NULL IS THE NORMAL CASE. A board with only local `DRIVE.n` entries - which
 * is every board this feature has not been asked to touch - gets `null` back
 * from `initStorage`, constructs no S3 client, opens no cache directory, and
 * behaves exactly as it did before this feature existed. `VolumeSet.hasPool()`
 * is the one test for "was a bucket actually configured"; nothing here
 * re-derives that rule.
 */
import * as fs from 'fs';
import * as path from 'path';
import { VolumeSet, type VolumeState } from './volume-set';
import { parseQuota, type StorageVolume } from './volume-config';
import type { StorageBackend } from './storage-backend';
import { FileCache } from './file-cache';
import { NameIndexRegistry } from './name-index-registry';
import type { RemoteArea } from './remote-areas';
import type { StorageContext } from './storage-context';
import { getStorageContext, setStorageContext, setStorageBootError } from './storage-context';
import { claimNodeSlot } from './node-id';

/**
 * A cache big enough to be useful on a small VPS without being asked. A
 * sysop who wants more (or less) sets `BBS_STORAGE_CACHE_MAX_BYTES` - see
 * `Documentation/2-Sysops/CONFIGURATION.md` - rather than editing this file.
 */
const DEFAULT_MAX_CACHE_BYTES = 10 * 1024 ** 3; // 10 GiB

function defaultMaxCacheBytes(): number {
  const raw = process.env.BBS_STORAGE_CACHE_MAX_BYTES;
  if (!raw) return DEFAULT_MAX_CACHE_BYTES;
  try {
    return parseQuota(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.warn(
      `[storage] BBS_STORAGE_CACHE_MAX_BYTES is unreadable (${detail}); ` +
        `using the ${DEFAULT_MAX_CACHE_BYTES} byte default`
    );
    return DEFAULT_MAX_CACHE_BYTES;
  }
}

/**
 * What tells one node's cache apart from a sibling's, when nobody said so
 * explicitly.
 *
 *   1. `BBS_STORAGE_NODE_ID` - an operator who sets it has taken
 *      responsibility for uniqueness, and this function trusts it outright.
 *   2. `HOSTNAME` - trusted outright when set, no liveness check needed.
 *      This is the CONTAINER case: Docker and every common orchestrator
 *      already set a distinct `HOSTNAME` per container, so it already got
 *      this right before Task 12 ever touched this file. See
 *      `node-id.ts`'s header for the review round that dropped this by
 *      mistake and why it is restored here, ahead of slot-claiming.
 *   3. `claimNodeSlot` (`node-id.ts`) - the bare-host fallback, for when
 *      neither of the above applies. Claims a small integer slot that
 *      survives a restart of the same process lineage AND stays distinct
 *      for two processes alive at once, memoised for this process's whole
 *      lifetime so a later rebuild reuses the same slot rather than
 *      claiming a new one - see that module's header.
 */
function defaultNodeId(bbsRoot: string): string {
  return process.env.BBS_STORAGE_NODE_ID || process.env.HOSTNAME || claimNodeSlot(bbsRoot);
}

/**
 * A node id becomes ONE path segment under `Storage/cache/`, never a path of
 * its own - an operator-supplied `BBS_STORAGE_NODE_ID` (or a container's
 * `HOSTNAME`) is not untrusted input in the security sense, but nothing here
 * should trust it to be a safe path segment either. Every character outside
 * a conservative safe set is replaced, and the two results that would
 * otherwise resolve to "no segment" or "the parent directory" fall back to a
 * pid-based name instead.
 */
function sanitizeNodeId(nodeId: string): string {
  const safe = nodeId.replace(/[^A-Za-z0-9_.-]/g, '_');
  return safe === '' || safe === '.' || safe === '..' ? `pid-${process.pid}` : safe;
}

function defaultCacheDir(bbsRoot: string, nodeId?: string): string {
  return path.join(bbsRoot, 'Storage', 'cache', sanitizeNodeId(nodeId ?? defaultNodeId(bbsRoot)));
}

export interface InitStorageOptions {
  /**
   * The pooled areas the running board has loaded from Conf*.info - the SAME
   * list `setFileAreas` was given (see `storage-context.ts`), typically
   * `fileAreas.map(remoteAreaFromDisk)` computed once by the caller right
   * after `refreshConferencesFromDisk`.
   *
   * REQUIRED, deliberately: this used to default to `[]`, and a caller that
   * forgot to pass its real area list got back a context that silently
   * treated every pooled area as local disk, with nothing to say so. Forcing
   * every caller to say what it means - even `[]`, explicitly, for a caller
   * that genuinely has none yet - turns that mistake into a compile error
   * instead of a board that looks configured and is not.
   */
  areas: readonly RemoteArea[];
  /**
   * Testing seam: overrides how an s3 volume's backend is constructed, so a
   * test can hand `VolumeSet.fromBoard` a fake rather than a real AWS client.
   * Production never sets this - see `VolumeSet.fromBoard`.
   */
  backendFactory?: (volume: StorageVolume, secret: string) => StorageBackend;
  /** Identifies this process among any siblings sharing the board's disk. Defaults per `defaultNodeId`. */
  nodeId?: string;
  /** Overrides the on-disk cache directory outright. Production always derives it from `bbsRoot` and the node id; tests use this to point at a known, inspectable directory. */
  cacheDir?: string;
  /** Defaults to `BBS_STORAGE_CACHE_MAX_BYTES`, or 10 GiB when that is unset. */
  maxCacheBytes?: number;
  /** Forwarded to `FileCache` - tests use a short one. */
  syncTimeoutMs?: number;
}

/**
 * Builds the board's storage subsystem, or answers `null` when there is
 * nothing to build.
 *
 * Deliberately does NOT call `flushPending()` or `setStorageContext()` -
 * those are `refreshStorageContext`'s job below, because a caller replaying
 * pending uploads before the context is visible to any handler, versus
 * after, is a real choice about what a request arriving mid-boot can see,
 * and because a hanging bucket must never be allowed to delay the board
 * accepting callers (see `refreshStorageContext`).
 */
export async function initStorage(
  bbsRoot: string,
  opts: InitStorageOptions
): Promise<StorageContext | null> {
  const volumes = VolumeSet.fromBoard(bbsRoot, { backendFactory: opts.backendFactory });
  if (!volumes.hasPool()) return null;

  const cache = new FileCache({
    cacheDir: opts.cacheDir ?? defaultCacheDir(bbsRoot, opts.nodeId),
    volumes,
    maxBytes: opts.maxCacheBytes ?? defaultMaxCacheBytes(),
    syncTimeoutMs: opts.syncTimeoutMs,
  });

  return {
    volumes,
    cache,
    names: new NameIndexRegistry(volumes),
    areas: opts.areas,
  };
}

/**
 * Whether two volume records name the SAME underlying drive, for deciding
 * whether it is safe to carry a live counter forward across a rebuild - see
 * `carryLiveState`. A drive number reused for a genuinely different bucket
 * (a different `path`/`endpoint`) must start its counters at zero, not
 * inherit a stranger's `degraded`/`requestsThisMonth`.
 */
function sameVolumeIdentity(a: StorageVolume, b: StorageVolume): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'local') return a.path === b.path;
  return a.path === b.path && a.endpoint === b.endpoint;
}

/**
 * Carries live, in-process state forward across a rebuild - Task 12 review,
 * the "four more, smaller" item: every rebuild used to construct a brand new
 * `VolumeSet` (every `VolumeState` zeroed) and a brand new `NameIndexRegistry`
 * (every cached listing and retry gate dropped), so a conference save or a
 * Drives.info write - which now rebuilds, per finding 4 - silently forgave a
 * degraded volume, reset the request counter finding 6 just made meaningful,
 * and forced a real `list()` per pooled area all over again on the very
 * meter finding 6 exists to protect.
 *
 * `next` is mutated in place (its fresh `VolumeState`s take on the previous
 * values) and its `names` registry is repointed at `next.volumes` via
 * `rebase` rather than replaced, so every cached `NameIndex` and gate
 * `previous` had survives. Only volumes whose identity is unchanged
 * (`sameVolumeIdentity`) inherit anything; a drive that is new, removed, or
 * points at a genuinely different bucket starts clean.
 */
function carryLiveState(previous: StorageContext | null, next: StorageContext): StorageContext {
  if (!previous) return next;

  for (const prevState of previous.volumes.states) {
    const nextState = next.volumes.byNumber(prevState.volume.driveNumber);
    if (!nextState || !sameVolumeIdentity(prevState.volume, nextState.volume)) continue;
    nextState.degraded = prevState.degraded;
    nextState.requestsThisMonth = prevState.requestsThisMonth;
    nextState.usedBytes = prevState.usedBytes;
    nextState.egressBytesThisMonth = prevState.egressBytesThisMonth;
  }

  previous.names.rebase(next.volumes);
  // Give the caller back the carried-forward registry rather than the
  // freshly-constructed one `initStorage` returned - see `NameIndexRegistry
  // .rebase`'s own doc for why this is safe.
  return { ...next, names: previous.names };
}

/**
 * Every unfinished upload owed to the pool is scanned for from ONE
 * `FileCache` at a time PER CACHE DIRECTORY - Task 12 review:
 * `refreshStorageContext` used to fire a new, unawaited `flushPending()` on
 * every rebuild while a PREVIOUS one (from the last rebuild) might still be
 * running against the SAME directory once `carryLiveState`/the node-id
 * memoisation above stopped the directory itself from moving - two
 * concurrent passes over one directory race on `writeBack`/`removeMarker`
 * and can double-PUT. Chaining every flush attempt for a given directory
 * onto that directory's last one's settlement, regardless of outcome,
 * makes that race structurally impossible.
 *
 * KEYED BY DIRECTORY, NOT GLOBAL, deliberately: a flush against a
 * genuinely unreachable bucket can only be BOUNDED, never eternal, for a
 * real backend (`createS3Backend` now gives its client explicit timeouts -
 * see finding 1) - but nothing here should assume that, and a single
 * process-wide chain would let one directory's stuck flush starve every
 * OTHER board root's flushes behind it forever, which is the same shape of
 * hazard finding 1 exists to prevent, just relocated. Scoping the chain to
 * the resource it actually protects means a stuck flush can only ever
 * queue up more of ITS OWN directory's flushes, never anyone else's.
 */
const flushChains = new Map<string, Promise<void>>();

function scheduleFlush(cache: FileCache): void {
  const key = path.resolve(cache.cacheDir);
  const previousChain = flushChains.get(key) ?? Promise.resolve();
  const nextChain = previousChain.catch(() => undefined).then(() =>
    cache.flushPending().catch((err) => {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[Storage] flushPending failed: ${detail}`);
    })
  ).then(() => undefined);
  flushChains.set(key, nextChain);
}

/**
 * Task 12 review: "the invariant is no pending marker is ever left where
 * nothing will scan it, NOT the id is stable." Id stability can still slip -
 * a changed `BBS_STORAGE_NODE_ID`, a directory an older node-id scheme left
 * behind, pid reuse, the slot scheme's own `MAX_SLOTS` fallback - so this is
 * the check that holds the invariant regardless of what the id scheme does:
 * every OTHER directory under `Storage/cache/` is inspected for a
 * `.pending/` subtree, and a non-empty one is reported loudly. It does NOT
 * attempt to recover those uploads - a sibling directory's markers were
 * staged by a different node identity, and replaying them from here could
 * race whatever (if anything) still owns them - it exists purely so a sysop
 * finds out, rather than the bytes sitting there silently for ever.
 */
function sweepOrphanedCacheDirs(bbsRoot: string, activeCacheDir: string): void {
  const cacheRoot = path.join(bbsRoot, 'Storage', 'cache');
  let entries: string[];
  try {
    entries = fs.readdirSync(cacheRoot);
  } catch {
    return; // No cache root yet - nothing to sweep.
  }

  const activeName = path.basename(path.resolve(activeCacheDir));
  for (const name of entries) {
    if (name === activeName) continue;
    const dir = path.join(cacheRoot, name);
    let isDir = false;
    try {
      isDir = fs.statSync(dir).isDirectory();
    } catch {
      continue;
    }
    if (!isDir) continue;

    const orphaned = countPendingMarkers(path.join(dir, '.pending'));
    if (orphaned > 0) {
      console.error(
        `[storage] ${orphaned} pending upload marker(s) sit under ${dir}, which no node identity this ` +
          `process is using owns - they will not be replayed until a sysop investigates. This can follow ` +
          `a changed BBS_STORAGE_NODE_ID, a directory an older node-id scheme left behind, or pid reuse.`
      );
    }
  }
}

function countPendingMarkers(pendingDir: string): number {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(pendingDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let count = 0;
  for (const entry of entries) {
    const full = path.join(pendingDir, entry.name);
    if (entry.isDirectory()) count += countPendingMarkers(full);
    else if (entry.isFile() && entry.name.endsWith('.json')) count += 1;
  }
  return count;
}

/**
 * Builds the storage subsystem and wires it into the board - the one
 * sequence every caller that changes what the pool should look like runs:
 * boot (`server/initialization.ts`), a conference change (STORAGEDRIVE, a
 * renamed conference - the change bus), and a Drives.info write (a new
 * drive, a changed quota, a new secret - `drive-config.service.ts`). All
 * three rebuild from disk and hand the result to the SAME two globals, so
 * "what the board's storage looks like right now" never has three
 * independently-maintained answers.
 *
 * OUTAGES THIS FUNCTION EXISTS TO PREVENT, ALL FROM THE TASK 12 REVIEW:
 *
 *   - A hanging bucket must never delay the caller. The context is set
 *     BEFORE `flushPending()` is even started, and that replay is launched
 *     without being awaited (`scheduleFlush`) rather than bounded by a
 *     timeout: a fixed budget still makes every boot (or every admin save)
 *     wait out that budget against a blackholed endpoint, and there is no
 *     value of it that is both "long enough to let a slow-but-healthy
 *     bucket finish" and "short enough not to matter" at the same time. Not
 *     waiting at all is the only bound that is always correct. `flushPending`
 *     still runs to completion in the background and logs its own summary
 *     ("N of M pending uploads still unsent") whether or not it fully lands.
 *   - The cache directory must never move while the board is up (Blocker A).
 *     A rebuild reuses the PREVIOUS live context's own `cache.cacheDir`
 *     when one exists, rather than re-deriving it, and `claimNodeSlot` is
 *     itself memoised per process as a second, independent guard (see its
 *     own doc comment) - so even the very first build's directory is stable
 *     across a rebuild whose `previous` context (this function's own
 *     parameter, not a module-level cache) does not yet exist. Before this,
 *     every rebuild re-derived the directory from a node-slot claim that
 *     always read its OWN prior claim back as "held by a live pid" and
 *     moved to the next slot, abandoning whatever the previous directory's
 *     `.pending/` held on the very first admin save after boot.
 *   - A rebuild that throws must not tear down a healthy pool (Blocker B).
 *     Only a build with NO previous context may leave the context null; a
 *     later rebuild that fails keeps serving whatever the last successful
 *     build produced, and stashes the failure so `PoolStatus` can say a
 *     refresh failed without pretending the pool stopped working.
 *   - A build that throws at all must not read the same as "no bucket
 *     configured". The detail is stashed via `setStorageBootError` so
 *     `PoolStatus` (Task 11) can say the pool failed to build, or that the
 *     last refresh failed, and why - see `DriveConfigService.PoolStatus`.
 *   - A rebuild must not reset the counters and caches a running pool has
 *     already earned. `carryLiveState` (above) copies `degraded`,
 *     `requestsThisMonth`, `usedBytes` and `egressBytesThisMonth` forward
 *     for every volume whose identity is unchanged, and keeps the previous
 *     `NameIndexRegistry` (with its cached listings and retry gates) alive
 *     across the rebuild rather than starting over.
 */
export async function refreshStorageContext(
  bbsRoot: string,
  areas: readonly RemoteArea[],
  opts: Omit<InitStorageOptions, 'areas'> = {}
): Promise<void> {
  const previous = getStorageContext();
  try {
    // Reuse the directory the live context is ALREADY using, rather than
    // re-deriving it - Blocker A. `previous` is this function's own
    // parameter (read fresh from `getStorageContext()` above), never a
    // module-level cache, so this is automatically correct per board root
    // and carries no state between a test's boards or a hypothetical
    // process that ever served more than one.
    const cacheDir = opts.cacheDir ?? previous?.cache.cacheDir;
    let storage = await initStorage(bbsRoot, { ...opts, areas, cacheDir });

    if (storage) {
      storage = carryLiveState(previous, storage);
      sweepOrphanedCacheDirs(bbsRoot, storage.cache.cacheDir);
    }

    // A clean (non-throwing) result REPLACES the context even when it is
    // null - that is a genuine "no bucket configured any more" state (the
    // sysop deleted the last drive), not a failure, and must not be
    // confused with Blocker B's "keep the previous context" handling below.
    setStorageContext(storage);
    setStorageBootError(null);

    if (storage) {
      const bucketCount = storage.volumes.states.filter((s) => s.volume.kind === 's3').length;
      console.log(`[Storage] Pool active - ${bucketCount} bucket(s) configured`);
    } else {
      console.log('[Storage] No pooled bucket configured (Drives.info has no DRIVE.n=s3://... entry) - local disk only');
    }

    // Replay uploads a previous run of THIS node staged but never finished -
    // a crash or restart between the staged write and the put leaves a
    // marker in `.pending/` that only a flush replays. Never awaited, and
    // serialised against any other flush this process has already started -
    // see `scheduleFlush`.
    if (storage) scheduleFlush(storage.cache);
  } catch (error) {
    const detail = error instanceof Error ? (error.stack || error.message) : String(error);
    setStorageBootError(detail);

    if (previous) {
      // Blocker B: this was a REFRESH, not the initial boot, and a healthy
      // pool was already running. A Drives.info typo or a read-only disk
      // must not tear down a pool that was working a moment ago - the
      // context is left exactly as it was; only the stashed error changes.
      console.error(
        `[Storage] Refresh failed - keeping the previous configuration running:\n${detail}`
      );
    } else {
      // Same posture as every other subsystem in initializeData: surfaced
      // loudly, board keeps running. A board that cannot build its storage
      // pool still needs to serve local files and accept callers.
      setStorageContext(null);
      console.error(`[Storage] Failed to initialize the storage subsystem - running with no pool:\n${detail}`);
    }
  }
}

// Re-exported so a caller that only needs the type does not have to know
// which leaf module it lives in.
export type { VolumeState };
