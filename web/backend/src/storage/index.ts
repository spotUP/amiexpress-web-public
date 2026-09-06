/**
 * Wires the pooled-storage subsystem into the board.
 *
 * Every other module in `storage/` is a leaf: `VolumeSet` parses Drives.info,
 * `FileCache` moves bytes, `NameIndexRegistry` resolves names, `remote-areas`
 * decides which file areas are pooled. Tasks 8, 9 and 11 built callers that
 * branch on `getStorageContext()` (`storage-context.ts`), but nothing ever
 * called `setStorageContext` - every one of those branches was dead code with
 * no way to run. This module is the one place that builds a `StorageContext`
 * and is meant to be called from `server/initialization.ts`, once, at boot.
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
 * What tells one node's cache apart from a sibling's.
 *
 * `BBS_STORAGE_NODE_ID` is for a sysop who runs more than one backend process
 * against the same board root and wants to name them deliberately.
 * `HOSTNAME` is the fallback that costs a sysop nothing: Docker and every
 * common orchestrator set it to a per-container value already, which is
 * exactly the boundary `file-cache.ts`'s header warns is unsafe to share -
 * `isProcessAlive` on a pending-marker's pid means nothing once the pid space
 * is per-container. The bare pid is the last resort, for a single process
 * with neither set.
 */
function defaultNodeId(): string {
  return process.env.BBS_STORAGE_NODE_ID || process.env.HOSTNAME || String(process.pid);
}

/**
 * A node id becomes ONE path segment under `Storage/cache/`, never a path of
 * its own - `HOSTNAME` is not sysop input in the untrusted sense, but nothing
 * here should trust it to be a safe path segment either. Every character
 * outside a conservative safe set is replaced, and the two results that
 * would otherwise resolve to "no segment" or "the parent directory" fall back
 * to a pid-based name instead.
 */
function sanitizeNodeId(nodeId: string): string {
  const safe = nodeId.replace(/[^A-Za-z0-9_.-]/g, '_');
  return safe === '' || safe === '.' || safe === '..' ? `pid-${process.pid}` : safe;
}

function defaultCacheDir(bbsRoot: string, nodeId?: string): string {
  return path.join(bbsRoot, 'Storage', 'cache', sanitizeNodeId(nodeId ?? defaultNodeId()));
}

export interface InitStorageOptions {
  /**
   * The pooled areas the running board has loaded from Conf*.info - the SAME
   * list `setFileAreas` was given (see `storage-context.ts`), typically
   * `fileAreas.map(remoteAreaFromDisk)` computed once by the caller right
   * after `refreshConferencesFromDisk`. Defaults to none: a caller that does
   * not pass its real area list gets a context that can still cache and
   * serve by drive/key, just with no area resolved as pooled.
   */
  areas?: readonly RemoteArea[];
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
 * those are the caller's decision to sequence (see
 * `server/initialization.ts`), because a caller replaying pending uploads
 * before the context is visible to any handler, versus after, is a real
 * choice about what a request arriving mid-boot can see.
 */
export async function initStorage(
  bbsRoot: string,
  opts: InitStorageOptions = {}
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
    areas: opts.areas ?? [],
  };
}

// Re-exported so a caller that only needs the type does not have to know
// which leaf module it lives in.
export type { VolumeState };
