/**
 * The board's one storage subsystem, and how a handler reaches it.
 *
 * Every consumer takes the context as an argument; this module only holds the
 * board-wide instance so the socket handlers - which are called from a
 * dispatcher that threads no such argument - can find it. Same shape as the
 * `setFileAreas` / `setDatabase` injection the rest of `initialization.ts`
 * uses.
 *
 * NULL IS THE NORMAL CASE. A board with no bucket configured never sets one,
 * and every branch on it is "then behave exactly as before".
 *
 * THE REGISTRY IS PART OF THE CONTEXT, not built per call: `NameIndexRegistry`
 * exists so one listing per area serves every caller, and a caller that
 * constructed its own registry would list the bucket again for every download.
 *
 * `areas` must be the SAME list `setFileAreas` was given - the disk loader's,
 * carrying each area's `storageVolume` - so Task 12 sets this context after
 * both the pool and the area list exist.
 */
import type { FileCache } from './file-cache';
import type { NameIndexRegistry } from './name-index-registry';
import type { RemoteArea } from './remote-areas';
import type { VolumeSet } from './volume-set';

export interface StorageContext {
  volumes: VolumeSet;
  cache: FileCache;
  names: NameIndexRegistry;
  areas: readonly RemoteArea[];
}

let current: StorageContext | null = null;

export function setStorageContext(context: StorageContext | null): void {
  current = context;
}

/** Null on every board with no pool configured, which is the default. */
export function getStorageContext(): StorageContext | null {
  return current;
}

/**
 * Non-null exactly when the LAST attempt to build the storage subsystem
 * threw - never merely because no bucket is configured, which is the
 * ordinary, silent, null-context case.
 *
 * Without this, `getStorageContext()` returning null reads identically
 * whether the board never had a pool to begin with, or Drives.info is
 * broken and the pool that should exist could not be built. A caller on the
 * download path already tells the two apart correctly (a boot failure must
 * never present as "file not found"), but the admin page's `PoolStatus` had
 * no way to ask the question at all - `cacheActive: false` looked exactly
 * like "not configured" either way. This is that missing signal.
 */
let bootError: string | null = null;

/** Set by `initStorage`'s caller on a failed build; cleared on the next successful one. */
export function setStorageBootError(message: string | null): void {
  bootError = message;
}

/** The detail behind a failed build, or null when nothing has failed. */
export function getStorageBootError(): string | null {
  return bootError;
}
