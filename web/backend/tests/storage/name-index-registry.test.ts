import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { FakeBackend } from './fake-backend';

function s3State(driveNumber: number, backend: FakeBackend): VolumeState {
  return {
    volume: {
      driveNumber,
      kind: 's3',
      path: `bucket${driveNumber}`,
      egress: 'METERED',
      volumeClass: 'FREE',
    },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
}

describe('NameIndexRegistry', () => {
  it('returns the same NameIndex instance for the same drive and prefix', () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const volumes = new VolumeSet([s3State(2, backend)]);
    const registry = new NameIndexRegistry(volumes);

    const a = registry.forArea(2, 'Files/');
    const b = registry.forArea(2, 'Files/');

    expect(a).toBe(b);
  });

  it('two callers sharing an area cause only one listing between them', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    await backend.put('Files/FILE.LHA', Buffer.from('x'));
    const volumes = new VolumeSet([s3State(2, backend)]);
    const registry = new NameIndexRegistry(volumes);

    const uploaderView = registry.forArea(2, 'Files/');
    const downloaderView = registry.forArea(2, 'Files/');

    await uploaderView.resolve('file.lha');
    await downloaderView.resolve('file.lha');

    expect(backend.lists).toBe(1);
  });

  it('gives different prefixes on the same drive different indexes', () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const volumes = new VolumeSet([s3State(2, backend)]);
    const registry = new NameIndexRegistry(volumes);

    expect(registry.forArea(2, 'Files/')).not.toBe(registry.forArea(2, 'Uploads/'));
  });

  it('gives the same prefix on different drives different indexes', () => {
    const backendA = new FakeBackend({ driveNumber: 2 });
    const backendB = new FakeBackend({ driveNumber: 3 });
    const volumes = new VolumeSet([s3State(2, backendA), s3State(3, backendB)]);
    const registry = new NameIndexRegistry(volumes);

    expect(registry.forArea(2, 'Files/')).not.toBe(registry.forArea(3, 'Files/'));
  });

  it('forget evicts the memoised index so the next forArea builds a fresh one', () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    const volumes = new VolumeSet([s3State(2, backend)]);
    const registry = new NameIndexRegistry(volumes);

    const before = registry.forArea(2, 'Files/');
    registry.forget(2, 'Files/');
    const after = registry.forArea(2, 'Files/');

    expect(after).not.toBe(before);
  });

  it('gives every area on one drive the same failure gate - a down bucket costs one attempt, not one per area', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    backend.down = true;
    const volumes = new VolumeSet([s3State(2, backend)]);
    let clock = 0;
    const registry = new NameIndexRegistry(volumes, { errorRetryAfterMs: 100, now: () => clock });

    const files = registry.forArea(2, 'Files/');
    const uploads = registry.forArea(2, 'Uploads/');

    // The first area pays for the attempt and surfaces the real failure.
    await expect(files.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(1);

    // The second must not re-learn the same fact at its own cost. One bucket
    // is down, not one prefix - and this is the path production takes, since
    // the registry is what builds every area's index.
    await expect(uploads.resolve('ghost.lha')).rejects.toBeInstanceOf(StorageUnavailableError);
    expect(backend.requests).toBe(1);

    // Recovery reaches every area through that same shared gate: the first
    // one to look finds the volume healthy and neither of them throws again.
    backend.down = false;
    clock += 150;

    expect(await uploads.resolve('ghost.lha')).toBeNull();
    expect(await files.resolve('ghost.lha')).toBeNull();
  });

  it('does not share a failure gate between drives - one bucket down leaves the other answering', async () => {
    const backendA = new FakeBackend({ driveNumber: 2 });
    const backendB = new FakeBackend({ driveNumber: 3 });
    await backendB.put('Files/FILE.LHA', Buffer.from('x'));
    backendA.down = true;
    const volumes = new VolumeSet([s3State(2, backendA), s3State(3, backendB)]);
    let clock = 0;
    const registry = new NameIndexRegistry(volumes, { errorRetryAfterMs: 100, now: () => clock });

    await expect(registry.forArea(2, 'Files/').resolve('ghost.lha')).rejects.toBeInstanceOf(
      StorageUnavailableError
    );

    // Drive 3 is a different bucket and knows nothing about drive 2 being down.
    expect(await registry.forArea(3, 'Files/').resolve('file.lha')).toBe('Files/FILE.LHA');
  });

  it('forget evicting one area leaves the drive gate in place for the areas still sharing it', async () => {
    const backend = new FakeBackend({ driveNumber: 2 });
    backend.down = true;
    const volumes = new VolumeSet([s3State(2, backend)]);
    let clock = 0;
    const registry = new NameIndexRegistry(volumes, { errorRetryAfterMs: 100, now: () => clock });

    await expect(registry.forArea(2, 'Files/').resolve('ghost.lha')).rejects.toBeInstanceOf(
      StorageUnavailableError
    );
    expect(backend.requests).toBe(1);

    // forget() drops one AREA's index. The drive is still down and its other
    // areas are still sharing that knowledge - a fresh index for the same
    // area must join the existing gate, not start a private retry cadence.
    registry.forget(2, 'Files/');

    await expect(registry.forArea(2, 'Files/').resolve('ghost.lha')).rejects.toBeInstanceOf(
      StorageUnavailableError
    );
    expect(backend.requests).toBe(1);
  });

  it('throws naming the drive when no volume is configured for it', () => {
    const registry = new NameIndexRegistry(new VolumeSet([]));
    expect(() => registry.forArea(9, 'Files/')).toThrow(/drive 9/);
  });
});
