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
import * as path from 'path';
import { VolumeSet, type VolumeState } from './volume-set';
import { parseQuota, type StorageVolume } from './volume-config';
import type { StorageBackend } from './storage-backend';
import { FileCache } from './file-cache';
import { NameIndexRegistry } from './name-index-registry';
import type { RemoteArea } from './remote-areas';
import type { StorageContext } from './storage-context';
import { setStorageContext, setStorageBootError } from './storage-context';
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
 * `BBS_STORAGE_NODE_ID` is for a sysop who runs more than one backend process
 * against the same board root and wants to name them deliberately - set it,
 * and this function trusts it outright. Absent that, `claimNodeSlot`
 * (`node-id.ts`) claims a small integer slot that survives a restart of the
 * same process lineage AND stays distinct for two processes alive at once -
 * see that module's header for why neither `HOSTNAME` nor the bare pid can
 * do both at the same time.
 */
function defaultNodeId(bbsRoot: string): string {
  return process.env.BBS_STORAGE_NODE_ID || claimNodeSlot(bbsRoot);
}

/**
 * A node id becomes ONE path segment under `Storage/cache/`, never a path of
 * its own - an operator-supplied `BBS_STORAGE_NODE_ID` is not untrusted input
 * in the security sense, but nothing here should trust it to be a safe path
 * segment either. Every character outside a conservative safe set is
 * replaced, and the two results that would otherwise resolve to "no segment"
 * or "the parent directory" fall back to a pid-based name instead.
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
 * Builds the storage subsystem and wires it into the board - the one
 * sequence every caller that changes what the pool should look like runs:
 * boot (`server/initialization.ts`), a conference change (STORAGEDRIVE, a
 * renamed conference - the change bus), and a Drives.info write (a new
 * drive, a changed quota, a new secret - `drive-config.service.ts`). All
 * three rebuild from disk and hand the result to the SAME two globals, so
 * "what the board's storage looks like right now" never has three
 * independently-maintained answers.
 *
 * TWO OUTAGES THIS FUNCTION EXISTS TO PREVENT, BOTH FROM THE TASK 12 REVIEW:
 *
 *   - A hanging bucket must never delay the caller. The context is set
 *     BEFORE `flushPending()` is even started, and that replay is launched
 *     without being awaited (`void ... .catch(...)`) rather than bounded by
 *     a timeout: a fixed budget still makes every boot (or every conference
 *     save) wait out that budget against a blackholed endpoint, and there is
 *     no value of it that is both "long enough to let a slow-but-healthy
 *     bucket finish" and "short enough not to matter" at the same time. Not
 *     waiting at all is the only bound that is always correct. `flushPending`
 *     still runs to completion in the background and still logs if it never
 *     manages to land the upload; it simply never holds up anyone else.
 *   - A build that throws (a malformed Drives.info line, a misconfigured
 *     volume) must not read the same as "no bucket configured". The detail
 *     is stashed via `setStorageBootError` so `PoolStatus` (Task 11) can say
 *     the pool failed to build, and why, rather than showing the same
 *     `cacheActive: false` a board that was never asked to pool anything
 *     shows.
 */
export async function refreshStorageContext(
  bbsRoot: string,
  areas: readonly RemoteArea[],
  opts: Omit<InitStorageOptions, 'areas'> = {}
): Promise<void> {
  try {
    const storage = await initStorage(bbsRoot, { ...opts, areas });
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
    // marker in `.pending/` that only a flush replays. Never awaited: see
    // the module doc above for why.
    void storage?.cache.flushPending().catch((err) => {
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[Storage] flushPending failed: ${detail}`);
    });
  } catch (error) {
    // Same posture as every other subsystem in initializeData: surfaced
    // loudly, board keeps running. A board that cannot build its storage
    // pool still needs to serve local files and accept callers.
    setStorageContext(null);
    const detail = error instanceof Error ? (error.stack || error.message) : String(error);
    setStorageBootError(detail);
    console.error(`[Storage] Failed to initialize the storage subsystem - running with no pool:\n${detail}`);
  }
}

// Re-exported so a caller that only needs the type does not have to know
// which leaf module it lives in.
export type { VolumeState };
