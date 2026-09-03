import { NameIndexRegistry } from '../../src/storage/name-index-registry';
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

  it('throws naming the drive when no volume is configured for it', () => {
    const registry = new NameIndexRegistry(new VolumeSet([]));
    expect(() => registry.forArea(9, 'Files/')).toThrow(/drive 9/);
  });
});
