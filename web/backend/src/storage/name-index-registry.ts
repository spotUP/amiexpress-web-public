/**
 * Owns the one NameIndex per remote area (drive + prefix).
 *
 * A later task calls `registry.forArea(...)` on both the upload path and the
 * download path. If those two callers ever got separate NameIndex instances
 * for the same area, each would list the bucket on its own first lookup and
 * the whole point of the index - one listing per area, not one per caller -
 * would be lost. This registry is what guarantees they share one.
 *
 * Backed by VolumeSet rather than a bare backend lookup: VolumeSet is
 * already the board's map from drive number to StorageBackend
 * (`VolumeSet.byNumber`), built once at boot from Drives.info. Accepting a
 * VolumeSet keeps that mapping in one place instead of asking every caller
 * of this registry to also know how to find a backend by drive number.
 */
import { NameIndex } from './name-index';
import type { VolumeSet } from './volume-set';

function cacheKey(driveNumber: number, prefix: string): string {
  return `${driveNumber}:${prefix}`;
}

export class NameIndexRegistry {
  private readonly indexes = new Map<string, NameIndex>();

  constructor(private readonly volumes: VolumeSet) {}

  /** Memoised per `${driveNumber}:${prefix}` - same area, same instance. */
  forArea(driveNumber: number, prefix: string): NameIndex {
    const key = cacheKey(driveNumber, prefix);
    const existing = this.indexes.get(key);
    if (existing) return existing;

    const state = this.volumes.byNumber(driveNumber);
    if (!state) {
      throw new Error(`NameIndexRegistry: no volume configured for drive ${driveNumber}`);
    }

    const index = new NameIndex(state.backend, prefix);
    this.indexes.set(key, index);
    return index;
  }

  forget(driveNumber: number, prefix: string): void {
    this.indexes.delete(cacheKey(driveNumber, prefix));
  }
}
