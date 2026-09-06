/**
 * Task 12: the one place `initStorage` is proved to make Tasks 8, 9 and 11's
 * dormant branches run.
 *
 * A board with no `s3` volume must come back untouched - no cache directory,
 * no S3 client, `getStorageContext()` stays null exactly as it is today. A
 * board with one gets back a context whose `cache` really does replay a
 * pending upload left by a previous run of the SAME node, which is the one
 * behaviour "it compiles" cannot stand in for: it proves recoverFromDisk(),
 * flushPending() and the boot sequence actually cooperate.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { initStorage } from '../../src/storage/index';
import { FileCache } from '../../src/storage/file-cache';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { FakeBackend } from './fake-backend';

function boardWithDrivesInfo(drivesInfoTooltypes: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-wiring-'));
  applyTooltypes(
    path.join(root, 'Drives.info'),
    drivesInfoTooltypes.map((line) => {
      const eq = line.indexOf('=');
      return [line.slice(0, eq), line.slice(eq + 1)] as const;
    })
  );
  return root;
}

function writeSecret(root: string, driveNumber: number, secret: string): void {
  const dir = path.join(root, 'Storage');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${driveNumber}.key`), secret);
}

describe('storage at boot', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('is null on a board with no s3 drive, so nothing changes for it', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=DH1:Files']);

    const storage = await initStorage(root);

    expect(storage).toBeNull();
    // No S3 client, no cache directory - a board with only local drives is
    // untouched by this feature, not "touched but empty".
    expect(fs.existsSync(path.join(root, 'Storage', 'cache'))).toBe(false);
  });

  it('is null on a board with no Drives.info at all', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-wiring-empty-'));

    expect(await initStorage(root)).toBeNull();
  });

  it('builds the pool, with the registry and the caller-supplied area list carried on the context', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=DH1:Files', 'DRIVE.2=s3://bucket', 'DRIVE.2.KEYID=k']);
    writeSecret(root, 2, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 2 });
    const areas = [{ id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 }];

    const storage = await initStorage(root, { backendFactory: () => fake, areas });

    expect(storage).not.toBeNull();
    expect(storage!.volumes.hasPool()).toBe(true);
    expect(storage!.areas).toBe(areas); // the caller's own list, not a copy
    // The registry resolves drive 2 through the SAME VolumeSet - proof it is
    // not an independently-constructed pool that could disagree with it.
    expect(() => storage!.names.forArea(2, 'Conf1/Files/')).not.toThrow();
    expect(() => storage!.names.forArea(9, 'Conf9/Files/')).toThrow(/drive 9/);
  });

  it('replays a pending upload a previous run of this SAME node staged but never finished', async () => {
    // parseVolumes stops at the first gap in DRIVE.n, so drive 1 must be the
    // s3 volume itself here - there is no drive 0 to fill in first.
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });
    const cacheDir = path.join(root, 'Storage', 'cache', 'node-a');

    // Simulate a previous process of node-a: it staged an upload (wrote the
    // bytes, wrote the marker) and then the process died before the put.
    const priorState: VolumeState = {
      volume: { driveNumber: 1, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
      backend: fake,
      usedBytes: 0,
      requestsThisMonth: 0,
      egressBytesThisMonth: 0,
      degraded: false,
    };
    const priorCache = new FileCache({ cacheDir, volumes: new VolumeSet([priorState]), maxBytes: 1024 * 1024 });
    const staged = priorCache.localPathFor(1, 'Conf1/Files/DEMO.LHA');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, 'payload');
    priorCache.markDirty(1, 'Conf1/Files/DEMO.LHA', staged);
    expect(fake.puts).toBe(0); // staged, not yet uploaded - the crash this test models

    // The next boot of node-a: same cache directory, a fresh FileCache.
    const storage = await initStorage(root, { backendFactory: () => fake, cacheDir });
    expect(storage).not.toBeNull();

    await storage!.cache.flushPending();

    expect(fake.puts).toBe(1);
  });

  it('gives each node its own cache directory, derived from the node id', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const backendFactory = () => new FakeBackend({ driveNumber: 1 });

    const a = await initStorage(root, { backendFactory, nodeId: 'node-a' });
    const b = await initStorage(root, { backendFactory, nodeId: 'node-b' });

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(fs.existsSync(path.join(root, 'Storage', 'cache', 'node-a'))).toBe(true);
    expect(fs.existsSync(path.join(root, 'Storage', 'cache', 'node-b'))).toBe(true);
  });

  it('derives the node id from BBS_STORAGE_NODE_ID when no explicit nodeId is given', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    process.env.BBS_STORAGE_NODE_ID = 'edge-1';
    try {
      const storage = await initStorage(root, { backendFactory: () => new FakeBackend({ driveNumber: 1 }) });
      expect(storage).not.toBeNull();
      expect(fs.existsSync(path.join(root, 'Storage', 'cache', 'edge-1'))).toBe(true);
    } finally {
      delete process.env.BBS_STORAGE_NODE_ID;
    }
  });

  it('sanitizes a node id that is not a safe path segment, rather than let it escape Storage/cache', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');

    const storage = await initStorage(root, {
      backendFactory: () => new FakeBackend({ driveNumber: 1 }),
      nodeId: '../../etc',
    });

    expect(storage).not.toBeNull();
    const cacheRoot = path.join(root, 'Storage', 'cache');
    const entries = fs.readdirSync(cacheRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toBe('..');
    expect(fs.existsSync(path.join(root, 'etc'))).toBe(false);
  });
});
