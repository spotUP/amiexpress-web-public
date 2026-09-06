/**
 * Task 12: the one place `initStorage`/`refreshStorageContext` are proved to
 * make Tasks 8, 9 and 11's dormant branches run.
 *
 * A board with no `s3` volume must come back untouched - no cache directory,
 * no S3 client, `getStorageContext()` stays null exactly as it is today. A
 * board with one gets back a context whose `cache` really does replay a
 * pending upload left by a previous run of the SAME node, which is the one
 * behaviour "it compiles" cannot stand in for: it proves recoverFromDisk(),
 * flushPending() and the boot sequence actually cooperate.
 *
 * The review round after the first pass added the cases below `describe
 * ('refreshStorageContext', ...)`: a hanging bucket must never delay a boot
 * or a live reconfiguration (finding 1), a conference or Drives.info change
 * must reach the live pool without a restart (finding 4), and a failed build
 * must be distinguishable from "no bucket configured" (finding 5).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { initStorage, refreshStorageContext } from '../../src/storage/index';
import { FileCache } from '../../src/storage/file-cache';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { getStorageContext, getStorageBootError, setStorageContext } from '../../src/storage/storage-context';
import type { ObjectHead, StorageBackend } from '../../src/storage/storage-backend';
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

/** Models a blackholed endpoint: every call hangs forever rather than erroring. */
class HangingBackend implements StorageBackend {
  readonly driveNumber: number;
  constructor(driveNumber: number) {
    this.driveNumber = driveNumber;
  }
  head(): Promise<ObjectHead | null> {
    return new Promise(() => undefined);
  }
  get(): Promise<Buffer> {
    return new Promise(() => undefined);
  }
  put(): Promise<void> {
    return new Promise(() => undefined);
  }
  delete(): Promise<void> {
    return new Promise(() => undefined);
  }
  list(): Promise<ObjectHead[]> {
    return new Promise(() => undefined);
  }
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

    const storage = await initStorage(root, { areas: [] });

    expect(storage).toBeNull();
    // No S3 client, no cache directory - a board with only local drives is
    // untouched by this feature, not "touched but empty".
    expect(fs.existsSync(path.join(root, 'Storage', 'cache'))).toBe(false);
  });

  it('is null on a board with no Drives.info at all', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boot-wiring-empty-'));

    expect(await initStorage(root, { areas: [] })).toBeNull();
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
    const storage = await initStorage(root, { backendFactory: () => fake, cacheDir, areas: [] });
    expect(storage).not.toBeNull();

    await storage!.cache.flushPending();

    expect(fake.puts).toBe(1);
  });

  it('gives each node its own cache directory, derived from the node id', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const backendFactory = () => new FakeBackend({ driveNumber: 1 });

    const a = await initStorage(root, { backendFactory, nodeId: 'node-a', areas: [] });
    const b = await initStorage(root, { backendFactory, nodeId: 'node-b', areas: [] });

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
      const storage = await initStorage(root, { backendFactory: () => new FakeBackend({ driveNumber: 1 }), areas: [] });
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
      areas: [],
    });

    expect(storage).not.toBeNull();
    const cacheRoot = path.join(root, 'Storage', 'cache');
    const entries = fs.readdirSync(cacheRoot);
    expect(entries).toHaveLength(1);
    expect(entries[0]).not.toBe('..');
    expect(fs.existsSync(path.join(root, 'etc'))).toBe(false);
  });

  it('review finding 2/3: with no override, two live instances against the same board root get different cache directories, not the same one', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const backendFactory = () => new FakeBackend({ driveNumber: 1 });

    // Neither call passes `nodeId` or sets BBS_STORAGE_NODE_ID - this is the
    // plain default path every board takes with no operator action, which
    // used to fall back to HOSTNAME (identical for two processes on one bare
    // host) and, failing that, the bare pid.
    const a = await initStorage(root, { backendFactory, areas: [] });
    const b = await initStorage(root, { backendFactory, areas: [] });

    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    const dirs = fs.readdirSync(path.join(root, 'Storage', 'cache')).sort();
    expect(dirs).toEqual(['1', '2']);
    // Neither directory is named after this process's own pid - the old
    // silent fallback review finding 2 flagged.
    expect(dirs).not.toContain(String(process.pid));
  });
});

describe('refreshStorageContext', () => {
  afterEach(() => {
    setStorageContext(null);
  });

  it('finding 1: sets the context before a hanging bucket has any chance to run, and never awaits the replay', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const cacheDir = path.join(root, 'Storage', 'cache', 'node-a');
    const hanging = new HangingBackend(1);

    // A previous run staged an upload it never finished - flushPending()
    // will try to replay it against a backend whose `put` never resolves.
    const priorState: VolumeState = {
      volume: { driveNumber: 1, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
      backend: hanging,
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

    const start = Date.now();
    await refreshStorageContext(root, [], { backendFactory: () => hanging, cacheDir });
    const elapsed = Date.now() - start;

    // Generous relative to a hang that would otherwise be unbounded (OS TCP
    // timeouts times SDK retries) - this only needs to prove the call did
    // not wait on the hanging put, not pin an exact budget.
    expect(elapsed).toBeLessThan(2000);
    expect(getStorageContext()).not.toBeNull();
  });

  it('finding 4: a later call updates the live areas - a conference change reaches the pool with no restart', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    expect(getStorageContext()!.areas).toEqual([]);

    const areas = [{ id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 1 }];
    await refreshStorageContext(root, areas, { backendFactory: () => fake });

    expect(getStorageContext()!.areas).toBe(areas);
  });

  it('finding 4: a later call picks up a bucket added to Drives.info after boot, with no restart', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=DH1:Files']);

    await refreshStorageContext(root, []);
    expect(getStorageContext()).toBeNull();

    // The sysop adds a bucket through Drive Setup - Drives.info now names one.
    applyTooltypes(path.join(root, 'Drives.info'), [
      ['DRIVE.2', 's3://bucket'],
      ['DRIVE.2.KEYID', 'k'],
    ]);
    writeSecret(root, 2, 'sekrit');

    await refreshStorageContext(root, [], { backendFactory: () => new FakeBackend({ driveNumber: 2 }) });

    expect(getStorageContext()).not.toBeNull();
    expect(getStorageContext()!.volumes.hasPool()).toBe(true);
  });

  it('finding 5: stashes the boot error on a failed build, distinct from "no bucket configured"', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.QUOTA=garbage']);

    await refreshStorageContext(root, []);

    expect(getStorageContext()).toBeNull();
    expect(getStorageBootError()).toMatch(/QUOTA/);
  });

  it('finding 5: clears the boot error on the next successful build', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.QUOTA=garbage']);
    await refreshStorageContext(root, []);
    expect(getStorageBootError()).not.toBeNull();

    applyTooltypes(path.join(root, 'Drives.info'), [['DRIVE.1.QUOTA', '10G']]);
    writeSecret(root, 1, 'sekrit');
    await refreshStorageContext(root, [], { backendFactory: () => new FakeBackend({ driveNumber: 1 }) });

    expect(getStorageBootError()).toBeNull();
    expect(getStorageContext()).not.toBeNull();
  });
});
