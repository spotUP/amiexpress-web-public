/**
 * The drives, and which one a new object goes on.
 *
 * The pool's free space is the sum across volumes - the number
 * express.e:17400-17424 freeDiskSpace() produced from DRIVE.1..n, made real
 * again. Free tiers fill before paid ones so a sysop's money is spent last.
 *
 * Only `kind: 's3'` volumes are placement candidates and count towards the
 * pool total. A local drive has no quota, so treating it as room would let
 * `roomOn` report it as effectively infinite and every upload would land on
 * the small local disk this feature exists to get files off of. Local drives
 * still appear in `states` - the admin page lists them, and a board with no
 * bucket configured falls back to a plain disk stat - they are just never
 * candidates for `place()` and never contribute to `freeBytes()`. Use
 * `hasPool()` to tell "no bucket configured" apart from "the bucket is full."
 */
import type { StorageVolume, VolumeClass } from './volume-config';
import { parseVolumes, readVolumeSecret } from './volume-config';
import type { StorageBackend } from './storage-backend';
import { StorageQuotaError } from './storage-backend';
import { LocalBackend } from './local-backend';
import { createS3Backend } from './s3-backend';

export interface VolumeState {
  volume: StorageVolume;
  backend: StorageBackend;
  usedBytes: number;
  requestsThisMonth: number;
  /** Undefined means the provider publishes no monthly request cap. */
  requestBudget?: number;
  egressBytesThisMonth: number;
  degraded: boolean;
}

export class VolumeSet {
  constructor(public readonly states: readonly VolumeState[]) {}

  /**
   * `parseVolumes` itself is left to throw uncaught: a malformed line (a bad
   * QUOTA or RETENTION unit) is a list-wide problem with Drives.info, not one
   * drive's problem, and Task 1 chose deliberately to stop the board on a
   * Drives.info it cannot parse rather than boot with an ambiguous pool.
   *
   * Constructing any ONE volume's backend is different: a missing KEYID, a
   * missing ENDPOINT, or an `s3://bucket/prefix` target are all the same
   * class of sysop typo as a missing secret, and none of them should be able
   * to take the rest of the pool - or the boot, per Task 12 - down with them.
   * So each volume's construction is wrapped individually; a failure here
   * warns naming the drive and skips just that volume.
   */
  static fromBoard(bbsRoot: string): VolumeSet {
    const states: VolumeState[] = [];
    for (const volume of parseVolumes(bbsRoot)) {
      try {
        if (volume.kind === 'local') {
          states.push(VolumeSet.blank(volume, new LocalBackend(volume.driveNumber, volume.path)));
          continue;
        }
        const secret = readVolumeSecret(bbsRoot, volume.driveNumber);
        if (!secret) {
          // A bucket with no key is a configuration mistake, not a reason to
          // refuse to boot: the board runs, the volume is simply left out of
          // the pool.
          console.warn(`[storage] DRIVE.${volume.driveNumber} has no secret; volume disabled`);
          continue;
        }
        states.push(VolumeSet.blank(volume, createS3Backend(volume, secret)));
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        console.warn(`[storage] DRIVE.${volume.driveNumber} is misconfigured (${detail}); volume disabled`);
      }
    }
    return new VolumeSet(states);
  }

  private static blank(volume: StorageVolume, backend: StorageBackend): VolumeState {
    return { volume, backend, usedBytes: 0, requestsThisMonth: 0, egressBytesThisMonth: 0, degraded: false };
  }

  byNumber(driveNumber: number): VolumeState | undefined {
    return this.states.find((s) => s.volume.driveNumber === driveNumber);
  }

  /**
   * Oracle's free tier allows 50,000 requests a MONTH, which binds long before
   * its 10 GB does. A volume at its ceiling is not a place to put a new file.
   */
  setRequestBudget(driveNumber: number, budget: number): void {
    const state = this.byNumber(driveNumber);
    if (state) state.requestBudget = budget;
  }

  private outOfRequests(state: VolumeState): boolean {
    return state.requestBudget !== undefined && state.requestsThisMonth >= state.requestBudget;
  }

  markDegraded(driveNumber: number, degraded: boolean): void {
    const state = this.byNumber(driveNumber);
    if (state) state.degraded = degraded;
  }

  /**
   * Whether this volume is eligible to be a `place()` destination at all -
   * kind, degraded state, and request budget. This is deliberately separate
   * from `roomOn`'s capacity answer: `roomOn` uses 0 as its "not a
   * candidate" value, and a caller asking for a zero-byte placement must
   * still be refused a degraded or local volume, not handed one because
   * `0 >= 0`. Candidacy and capacity are different questions and must not
   * share a sentinel.
   */
  private isCandidate(state: VolumeState): boolean {
    return state.volume.kind === 's3' && !state.degraded && !this.outOfRequests(state);
  }

  /**
   * Room on this volume, in bytes - or `Number.POSITIVE_INFINITY` for an s3
   * candidate with no declared QUOTA, which is a real but unmeasured amount
   * of room, not a bug. A non-candidate (local, degraded, out of requests)
   * answers 0, but that 0 must never be read as "this volume is a candidate
   * with zero room" - see `isCandidate`.
   */
  private roomOn(state: VolumeState): number {
    if (!this.isCandidate(state)) return 0;
    if (state.volume.quotaBytes === undefined) return Number.POSITIVE_INFINITY;
    return Math.max(0, state.volume.quotaBytes - state.usedBytes);
  }

  /** Whether the pool holds any bucket at all - as opposed to only local drives. */
  hasPool(): boolean {
    return this.states.some((s) => s.volume.kind === 's3');
  }

  /**
   * The pool total shown on the upload screen and fed to the upload gate.
   *
   * Returns `Number.POSITIVE_INFINITY` when any non-degraded s3 volume has no
   * declared QUOTA: that volume's room is real, just unmeasured, and a gate
   * comparing `freeBytes() >= fileSize` must accept against it rather than
   * seeing a sentinel and refusing every upload against an empty, willing
   * bucket. A formatter is free to render Infinity as "unlimited". Returns 0
   * when the pool holds no bucket at all (`!hasPool()`) or every bucket is
   * genuinely full - callers that need to tell those two 0s apart use
   * `hasPool()`.
   */
  freeBytes(): number {
    return this.states.reduce((total, state) => total + this.roomOn(state), 0);
  }

  /**
   * Room on ONE drive - which is what an upload actually has, because a pooled
   * area pins its objects to the drive its STORAGEDRIVE names (every read path
   * resolves through that drive's name index).
   *
   * `freeBytes()` is the pool SUM: the right number to SHOW a caller, since
   * that is express.e's freeDiskSpace(), and the wrong one to gate a single
   * upload on. A full or degraded drive beside one healthy sibling bucket
   * passes a sum-based gate, lets the caller send the whole file, and fails at
   * the put - which is the one thing the gate exists to prevent.
   *
   * 0 for a drive that is not a placement candidate at all (local, degraded,
   * out of requests) and for a drive number the pool does not have. As with
   * `roomOn`, that 0 must not be read as "a candidate with no room" - ask
   * `byNumber` and `hasPool` to tell those apart.
   */
  freeBytesOn(driveNumber: number): number {
    const state = this.byNumber(driveNumber);
    return state ? this.roomOn(state) : 0;
  }

  /**
   * The volume a new object should go on, free tiers before paid ones.
   *
   * NOTHING CALLS THIS YET, deliberately. An upload cannot use it: a pooled
   * area pins its objects to the drive its STORAGEDRIVE names, because every
   * read path resolves them through that drive's name index over the area's
   * prefix, so an object placed on a free-tier sibling would be invisible to
   * the board that stored it. Free-before-paid placement needs a read side
   * that searches the pool rather than one prefix; the surface that would use
   * it is Task 11's. Kept, and kept honest, rather than deleted and rebuilt.
   */
  place(sizeBytes: number, prefer?: VolumeClass): VolumeState {
    const candidates = this.states.filter((s) => this.isCandidate(s) && this.roomOn(s) >= sizeBytes);
    if (candidates.length === 0) {
      throw new StorageQuotaError(undefined, 'no volume in the pool has room for this file');
    }

    const rank = (s: VolumeState): number => {
      const classRank = prefer
        ? s.volume.volumeClass === prefer ? 0 : 1
        : s.volume.volumeClass === 'FREE' ? 0 : 1;
      const egressRank = s.volume.egress === 'FREE' ? 0 : s.volume.egress === '3X' ? 1 : 2;
      return classRank * 10 + egressRank;
    };

    return [...candidates].sort((a, b) => rank(a) - rank(b) || a.volume.driveNumber - b.volume.driveNumber)[0];
  }
}
