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
 *
 * It also owns one BackendRetryGate per DRIVE, and hands it to every index
 * it builds for that drive. An outage is a property of the bucket, not of a
 * prefix: one bucket going down takes every area on it, and if each area
 * kept its own "the backend is down, retry in 15s" it would cost one listing
 * attempt per area per window instead of one between them - roughly nine
 * simultaneously-down areas for a day would spend the entire 50,000-a-month
 * ceiling on retries, and a board with a couple of dozen conference file
 * areas on one bucket is ordinary. Sharing the gate also means the first
 * area to find the volume healthy releases all the others at once.
 *
 * This registry is the natural owner rather than VolumeSet's VolumeState:
 * it is already what constructs every index for a drive, so the gate reaches
 * the indexes without any other code having to know it exists, whereas
 * VolumeState is a plain inventory record - built by VolumeSet.fromBoard,
 * read by placement and the admin screens - and putting live retry policy in
 * it would oblige every present and future constructor of one to supply a
 * gate that only the name index uses.
 */
import { BackendRetryGate, NameIndex } from './name-index';
import type { BackendRetryGateOptions } from './name-index';
import type { VolumeState, VolumeSet } from './volume-set';
import type { StorageBackend } from './storage-backend';

function cacheKey(driveNumber: number, prefix: string): string {
  return `${driveNumber}:${prefix}`;
}

/**
 * `state.backend`, wrapped so every call it makes charges `requestsThisMonth`
 * - Task 12 review finding 6. `FileCache.ensureLocal`/`writeBack` already
 * charge the meter themselves for the calls THEY make directly against
 * `state.backend`; this wraps the copy handed to `NameIndex` so the listing
 * call `NameIndex.refresh()` makes (`name-index.ts:358`) is counted too,
 * without double-charging the direct callers, since they never see this
 * wrapper.
 *
 * All five methods are wrapped, not just `list` - `NameIndex` only calls
 * `list` today, but a half-wrapped backend would silently stop counting the
 * day that changes, which is exactly the kind of gap this finding exists to
 * close.
 */
function countingBackend(state: VolumeState): StorageBackend {
  const real = state.backend;
  return {
    driveNumber: real.driveNumber,
    head: (key) => {
      state.requestsThisMonth++;
      return real.head(key);
    },
    get: (key) => {
      state.requestsThisMonth++;
      return real.get(key);
    },
    put: (key, body) => {
      state.requestsThisMonth++;
      return real.put(key, body);
    },
    delete: (key) => {
      state.requestsThisMonth++;
      return real.delete(key);
    },
    list: (prefix) => {
      state.requestsThisMonth++;
      return real.list(prefix);
    },
  };
}

export class NameIndexRegistry {
  private readonly indexes = new Map<string, NameIndex>();
  /**
   * One per drive, never evicted: a gate is a few bytes, there are as many
   * as there are drives, and `forget()` drops one AREA - the other areas on
   * that drive are still sharing this gate and must keep sharing it.
   */
  private readonly gates = new Map<number, BackendRetryGate>();

  /**
   * `gateOptions` configures the per-drive retry gates - the outage cadence,
   * and the clock they measure it on. Board-wide on purpose: the question
   * they answer ("is this bucket back yet") is not per area. How long a MISS
   * is trusted IS per area, and is a separate gap this registry still does
   * not plumb.
   */
  constructor(
    private readonly volumes: VolumeSet,
    private readonly gateOptions: BackendRetryGateOptions = {}
  ) {}

  private gateFor(driveNumber: number): BackendRetryGate {
    const existing = this.gates.get(driveNumber);
    if (existing) return existing;

    const gate = new BackendRetryGate(this.gateOptions);
    this.gates.set(driveNumber, gate);
    return gate;
  }

  /** Memoised per `${driveNumber}:${prefix}` - same area, same instance. */
  forArea(driveNumber: number, prefix: string): NameIndex {
    const key = cacheKey(driveNumber, prefix);
    const existing = this.indexes.get(key);
    if (existing) return existing;

    const state = this.volumes.byNumber(driveNumber);
    if (!state) {
      throw new Error(`NameIndexRegistry: no volume configured for drive ${driveNumber}`);
    }

    const index = new NameIndex(countingBackend(state), prefix, { retryGate: this.gateFor(driveNumber) });
    this.indexes.set(key, index);
    return index;
  }

  forget(driveNumber: number, prefix: string): void {
    this.indexes.delete(cacheKey(driveNumber, prefix));
  }
}
