import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { StorageQuotaError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';
import type { StorageVolume, VolumeClass } from '../../src/storage/volume-config';

function state(
  driveNumber: number,
  opts: { quota?: number; used?: number; cls?: VolumeClass; egress?: StorageVolume['egress']; degraded?: boolean; requests?: number }
): VolumeState {
  return {
    volume: {
      driveNumber,
      kind: 's3',
      path: `bucket${driveNumber}`,
      quotaBytes: opts.quota,
      egress: opts.egress ?? 'METERED',
      volumeClass: opts.cls ?? 'FREE',
    },
    backend: new FakeBackend({ driveNumber }),
    usedBytes: opts.used ?? 0,
    requestsThisMonth: opts.requests ?? 0,
    egressBytesThisMonth: 0,
    degraded: opts.degraded ?? false,
  };
}

/** A local drive: no quota, and per the pool ruling never a placement candidate. */
function localState(driveNumber: number): VolumeState {
  return {
    volume: {
      driveNumber,
      kind: 'local',
      path: `/bbs/Files${driveNumber}`,
      egress: 'FREE',
      volumeClass: 'FREE',
    },
    backend: new FakeBackend({ driveNumber }),
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
}

describe('VolumeSet.freeBytes', () => {
  it('sums the pool, which is what freeDiskSpace() always meant', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 40 }), state(2, { quota: 50, used: 0 })]);
    expect(set.freeBytes()).toBe(110);
  });

  it('does not count a degraded volume as room', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 0, degraded: true }), state(2, { quota: 50 })]);
    expect(set.freeBytes()).toBe(50);
  });

  it('reports 0 free bytes for a pool of only local drives', () => {
    const set = new VolumeSet([localState(1)]);
    expect(set.freeBytes()).toBe(0);
  });

  it('ignores a local drive when summing free bytes alongside s3 volumes', () => {
    const set = new VolumeSet([localState(1), state(2, { quota: 50, used: 10 })]);
    expect(set.freeBytes()).toBe(40);
  });

  it('reports Infinity, not 0, for a bucket with no declared QUOTA - it has real room, just unmeasured', () => {
    const set = new VolumeSet([state(1, { quota: undefined })]);
    expect(set.freeBytes()).toBe(Number.POSITIVE_INFINITY);
  });

  it('still sums a bounded bucket exactly, unaffected by the Infinity case', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 40 }), state(2, { quota: 50, used: 0 })]);
    expect(set.freeBytes()).toBe(110);
  });
});

describe('VolumeSet.hasPool', () => {
  it('is false for a pool of only local drives - the case that matters: no bucket configured at all', () => {
    const set = new VolumeSet([localState(1), localState(2)]);
    expect(set.hasPool()).toBe(false);
  });

  it('is true once any s3 volume is in the pool, even one with no declared QUOTA', () => {
    const set = new VolumeSet([localState(1), state(2, { quota: undefined })]);
    expect(set.hasPool()).toBe(true);
    expect(set.freeBytes()).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('VolumeSet.place', () => {
  it('fills free volumes before paid ones', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'PAID' }), state(2, { quota: 100, cls: 'FREE' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('skips a volume without room for this file', () => {
    const set = new VolumeSet([state(1, { quota: 100, used: 95, cls: 'FREE' }), state(2, { quota: 100, cls: 'FREE' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('breaks a tie towards free egress', () => {
    const set = new VolumeSet([
      state(1, { quota: 100, cls: 'FREE', egress: 'METERED' }),
      state(2, { quota: 100, cls: 'FREE', egress: 'FREE' }),
    ]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('honours an area that prefers a paid volume', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'FREE' }), state(2, { quota: 100, cls: 'PAID' })]);
    expect(set.place(10, 'PAID').volume.driveNumber).toBe(2);
  });

  it('skips a volume that has spent its monthly request budget', () => {
    const set = new VolumeSet([
      state(1, { quota: 100, cls: 'FREE', requests: 50_000 }),
      state(2, { quota: 100, cls: 'PAID' }),
    ]);
    set.setRequestBudget(1, 50_000);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('skips a degraded volume', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'FREE', degraded: true }), state(2, { quota: 100, cls: 'PAID' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('refuses when no volume has room, so the caller is told before the transfer starts', () => {
    const set = new VolumeSet([state(1, { quota: 10, used: 10 })]);
    expect(() => set.place(5)).toThrow(StorageQuotaError);
  });

  it('never places on a local drive, which has no quota to test against', () => {
    const set = new VolumeSet([localState(1)]);
    expect(() => set.place(10)).toThrow(StorageQuotaError);
  });

  it('skips a local drive and places on the pool s3 volume behind it', () => {
    const set = new VolumeSet([localState(1), state(2, { quota: 100, cls: 'FREE' })]);
    expect(set.place(10).volume.driveNumber).toBe(2);
  });

  it('refuses a zero-byte placement against a degraded volume rather than handing it back on 0 >= 0', () => {
    const set = new VolumeSet([state(1, { quota: 100, cls: 'FREE', degraded: true })]);
    expect(() => set.place(0)).toThrow(StorageQuotaError);
  });
});
