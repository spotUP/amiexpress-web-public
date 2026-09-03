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
 * candidates for `place()` and never contribute to `freeBytes()`.
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

  static fromBoard(bbsRoot: string): VolumeSet {
    const states: VolumeState[] = [];
    for (const volume of parseVolumes(bbsRoot)) {
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
   * Room on this volume, in bytes - or `Number.MAX_SAFE_INTEGER` for an s3
   * volume with no declared QUOTA, which is a real but unmeasured amount of
   * room, not a bug. A local drive, a degraded volume, or one that has spent
   * its monthly request budget offers 0: none of the three are candidates.
   */
  private roomOn(state: VolumeState): number {
    if (state.volume.kind !== 's3') return 0;
    if (state.degraded || this.outOfRequests(state)) return 0;
    if (state.volume.quotaBytes === undefined) return Number.MAX_SAFE_INTEGER;
    return Math.max(0, state.volume.quotaBytes - state.usedBytes);
  }

  /**
   * The pool total shown on the upload screen. An unbounded s3 volume
   * (`roomOn` === MAX_SAFE_INTEGER) contributes 0 here, not its sentinel: a
   * sysop reading "free space" wants a real number to compare against a
   * file's size, and "9007199254740991 bytes free" is not that - it is still
   * a valid `place()` target, just not summable into a finite total.
   */
  freeBytes(): number {
    return this.states.reduce((total, state) => {
      const room = this.roomOn(state);
      return total + (room === Number.MAX_SAFE_INTEGER ? 0 : room);
    }, 0);
  }

  place(sizeBytes: number, prefer?: VolumeClass): VolumeState {
    const candidates = this.states.filter((s) => this.roomOn(s) >= sizeBytes);
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
