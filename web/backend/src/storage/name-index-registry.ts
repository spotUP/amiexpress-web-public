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
import { sameVolumeIdentity } from './volume-config';
import type { VolumeSet } from './volume-set';
import type { StorageBackend } from './storage-backend';

function cacheKey(driveNumber: number, prefix: string): string {
  return `${driveNumber}:${prefix}`;
}

function driveNumberOfKey(key: string): number {
  return Number(key.slice(0, key.indexOf(':')));
}

/**
 * A backend that resolves its target drive's CURRENT `VolumeState` from
 * `lookupVolumes()` on every single call, rather than closing over one
 * captured at construction time - Task 12 re-review defect 2.
 *
 * `NameIndexRegistry.rebase` keeps a cached `NameIndex` alive across a
 * rebuild for the sake of its cached listing and retry gate, but the
 * backend that index was BUILT with used to be captured once, at whatever
 * `VolumeState` existed the first time `forArea` was called for it. Two
 * consequences followed from that, both invisible until the SECOND admin
 * save: every listing call kept charging `requestsThisMonth` on that first,
 * now-dead `VolumeState` object - so the live counter `carryLiveState`
 * seeds only counts up to the first rebuild, then goes silent forever,
 * quietly reopening finding 6 - and every real network call kept hitting
 * the FIRST backend's credentials, endpoint and bucket, so a sysop who
 * rotates a secret or repoints a drive through Drive Setup got a rebuild
 * that reported success while name resolution kept using the old client
 * until a restart, which is finding 4's own failure mode.
 *
 * Resolving fresh each call fixes both without needing to know whether a
 * given call happens to be the index's first or its fifth: whatever
 * `lookupVolumes().byNumber(driveNumber)` answers right now is what pays
 * for the call and what serves it.
 *
 * All five methods are wrapped, not just `list` - `NameIndex` only calls
 * `list` today, but a half-wrapped backend would silently stop counting
 * (or stop following a rotated backend) the day that changes.
 */
function countingBackend(driveNumber: number, lookupVolumes: () => VolumeSet): StorageBackend {
  const currentState = () => {
    const state = lookupVolumes().byNumber(driveNumber);
    if (!state) {
      throw new Error(`NameIndexRegistry: no volume configured for drive ${driveNumber}`);
    }
    return state;
  };
  const charge = async <T>(call: (backend: StorageBackend) => Promise<T>): Promise<T> => {
    const state = currentState();
    state.requestsThisMonth++;
    return call(state.backend);
  };
  return {
    driveNumber,
    head: (key) => charge((backend) => backend.head(key)),
    get: (key) => charge((backend) => backend.get(key)),
    put: (key, body) => charge((backend) => backend.put(key, body)),
    delete: (key) => charge((backend) => backend.delete(key)),
    list: (prefix) => charge((backend) => backend.list(prefix)),
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
    private volumes: VolumeSet,
    private readonly gateOptions: BackendRetryGateOptions = {}
  ) {}

  /**
   * Points this registry at a fresh `VolumeSet` after a rebuild, keeping
   * every cached `NameIndex` and retry gate exactly as they were - EXCEPT
   * for a drive whose identity actually changed, whose index is evicted
   * outright.
   *
   * Task 12 review, the finding-4 follow-up, then the re-review's defect 2:
   * `refreshStorageContext` rebuilding the whole pool on every admin save
   * used to construct a BRAND NEW registry each time, discarding every
   * cached listing along with it - so the very listing call finding 6 made
   * countable ran again after every conference save or Drives.info write,
   * against the same request meter finding 6 exists to protect. Simply
   * repointing `this.volumes` fixed that for a drive whose bucket did not
   * change (`countingBackend` above now resolves the current `VolumeState`
   * on every call, so a cached index keeps counting and keeps calling
   * correctly across any number of rebuilds) - but a drive a sysop
   * REPOINTED at a genuinely different bucket cannot be fixed the same way:
   * the cached `NameIndex`'s in-memory name map still lists the OLD
   * bucket's objects, and no amount of re-resolving the backend at call
   * time changes what names it already believes exist. Such an index is
   * evicted here, so the next `forArea` call for it builds a fresh one and
   * lists the NEW bucket instead of serving a stale answer with a "success"
   * on the admin page.
   */
  rebase(volumes: VolumeSet): void {
    const previous = this.volumes;
    this.volumes = volumes;

    for (const key of [...this.indexes.keys()]) {
      const driveNumber = driveNumberOfKey(key);
      const oldState = previous.byNumber(driveNumber);
      const newState = volumes.byNumber(driveNumber);
      if (!oldState || !newState || !sameVolumeIdentity(oldState.volume, newState.volume)) {
        this.indexes.delete(key);
      }
    }
  }

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

    const backend = countingBackend(driveNumber, () => this.volumes);
    const index = new NameIndex(backend, prefix, { retryGate: this.gateFor(driveNumber) });
    this.indexes.set(key, index);
    return index;
  }

  forget(driveNumber: number, prefix: string): void {
    this.indexes.delete(cacheKey(driveNumber, prefix));
  }
}
