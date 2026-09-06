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
  let originalHostname: string | undefined;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Review Blocker C restored HOSTNAME ahead of slot-claiming (the
    // container case). Most of this file's tests exercise slot-claiming
    // itself and must not have their result silently swapped out from
    // under them by whatever the test host's own environment happens to
    // export - see the dedicated HOSTNAME-priority test below instead.
    originalHostname = process.env.HOSTNAME;
    delete process.env.HOSTNAME;
  });

  afterEach(() => {
    warn.mockRestore();
    if (originalHostname === undefined) delete process.env.HOSTNAME;
    else process.env.HOSTNAME = originalHostname;
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

  it('review finding 3: with no override, a SEPARATE process on the same board root claims a different slot', async () => {
    // A genuinely separate process cannot be spawned deterministically in a
    // unit test, so this proves the mechanism `initStorage` actually relies
    // on directly: `claimNodeSlot` (node-id.test.ts) already covers the
    // liveness-checked negotiation in isolation. This test's job is just to
    // confirm `initStorage` really does route through it for a real board -
    // seed slot 1 as held by this (unambiguously live) test process, exactly
    // as a second real process's negotiation would see it, and confirm the
    // resulting cache directory is NOT slot 1.
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const lockDir = path.join(root, 'Storage', 'nodes');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '1.pid'), String(process.pid));

    const storage = await initStorage(root, { backendFactory: () => new FakeBackend({ driveNumber: 1 }), areas: [] });

    expect(storage).not.toBeNull();
    const dirs = fs.readdirSync(path.join(root, 'Storage', 'cache'));
    expect(dirs).toEqual(['2']);
  });

  it('review Blocker C: trusts HOSTNAME outright when set, ahead of slot-claiming - the container case', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    process.env.HOSTNAME = 'container-a';

    const storage = await initStorage(root, { backendFactory: () => new FakeBackend({ driveNumber: 1 }), areas: [] });

    expect(storage).not.toBeNull();
    expect(fs.existsSync(path.join(root, 'Storage', 'cache', 'container-a'))).toBe(true);
    // No slot was ever claimed - HOSTNAME short-circuits claimNodeSlot entirely.
    expect(fs.existsSync(path.join(root, 'Storage', 'nodes'))).toBe(false);
  });
});

describe('refreshStorageContext', () => {
  let originalHostname: string | undefined;

  beforeEach(() => {
    originalHostname = process.env.HOSTNAME;
    delete process.env.HOSTNAME;
  });

  afterEach(() => {
    setStorageContext(null);
    if (originalHostname === undefined) delete process.env.HOSTNAME;
    else process.env.HOSTNAME = originalHostname;
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

  it('review Blocker A: two refreshes of the same board root reuse ONE cache directory, not a new one each time', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    // A second refresh - what an admin save, a conference change, or a
    // second Drives.info write all trigger via the SAME function.
    const areas = [{ id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 1 }];
    await refreshStorageContext(root, areas, { backendFactory: () => fake });

    const dirs = fs.readdirSync(path.join(root, 'Storage', 'cache'));
    expect(dirs).toHaveLength(1);
  });

  it('review Blocker A: a pending upload staged before a rebuild is still reachable after it', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    const firstCacheDir = getStorageContext()!.cache.cacheDir;
    // Let boot's own (empty - nothing staged yet) scheduled flush settle
    // before staging anything, so what follows models a door writing a
    // file SOME TIME after boot, not the same instant as boot's replay.
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));

    // A door writes a file mid-uptime - staged, not yet uploaded.
    const staged = getStorageContext()!.cache.localPathFor(1, 'Conf1/Files/DEMO.LHA');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, 'payload');
    getStorageContext()!.cache.markDirty(1, 'Conf1/Files/DEMO.LHA', staged);
    expect(fake.puts).toBe(0);

    // An admin save rebuilds the pool while the upload is still pending.
    // `refreshStorageContext` schedules its own replay automatically - a
    // second, manual `flushPending()` call here would race that scheduled
    // one on the same FileCache instance, which is not a path production
    // ever takes (nothing outside this module calls `flushPending`
    // directly), so this waits for the automatic one instead of adding a
    // second attempt.
    await refreshStorageContext(root, [], { backendFactory: () => fake });

    // Same directory - before this fix, the rebuild would have claimed a
    // NEW slot and this marker would now sit somewhere nothing scans.
    expect(getStorageContext()!.cache.cacheDir).toBe(firstCacheDir);
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
    expect(fake.puts).toBe(1);
  });

  it('review Blocker B: a failed REFRESH keeps the previous healthy context running', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    const healthy = getStorageContext();
    expect(healthy).not.toBeNull();

    // A hand-edited Drives.info now has a QUOTA typo between admin saves.
    applyTooltypes(path.join(root, 'Drives.info'), [['DRIVE.1.QUOTA', 'garbage']]);
    await refreshStorageContext(root, [], { backendFactory: () => fake });

    // The exact same context object is still live - not torn down, not
    // replaced with null, which would have made every download read as
    // "file not found" until a sysop fixed the typo.
    expect(getStorageContext()).toBe(healthy);
    expect(getStorageBootError()).toMatch(/QUOTA/);
  });

  it('review "carry live state": degraded, requestsThisMonth and usedBytes survive a rebuild for an unchanged volume', async () => {
    const root = boardWithDrivesInfo([
      'DRIVE.1=s3://bucket',
      'DRIVE.1.ENDPOINT=https://s3.example.com',
      'DRIVE.1.KEYID=k',
    ]);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    const state = getStorageContext()!.volumes.byNumber(1)!;
    state.degraded = true;
    state.requestsThisMonth = 42;
    state.usedBytes = 12345;

    // An unrelated admin save (a conference rename, say) triggers a rebuild.
    await refreshStorageContext(root, [], { backendFactory: () => fake });

    const rebuilt = getStorageContext()!.volumes.byNumber(1)!;
    expect(rebuilt.degraded).toBe(true);
    expect(rebuilt.requestsThisMonth).toBe(42);
    expect(rebuilt.usedBytes).toBe(12345);
  });

  it('review defect 1: usedBytes reflects the DELTA on an overwrite after a rebuild, not the sum', async () => {
    // The bug this proves fixed: carryLiveState carried usedBytes forward
    // while the new FileCache generation's uploadedSizes map started
    // empty, so writeBack's overwrite-delta correction ("credit back the
    // previous size before charging the new one") had nothing to credit
    // back and charged the full new size on top of the already-counted
    // old one.
    const root = boardWithDrivesInfo([
      'DRIVE.1=s3://bucket',
      'DRIVE.1.ENDPOINT=https://s3.example.com',
      'DRIVE.1.KEYID=k',
    ]);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    const staged = getStorageContext()!.cache.localPathFor(1, 'Conf1/Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, Buffer.alloc(100, 1));
    await getStorageContext()!.cache.writeBack(1, 'Conf1/Files/DOOR.DAT', staged);
    expect(getStorageContext()!.volumes.byNumber(1)!.usedBytes).toBe(100);

    // An admin save (a conference rename, unrelated to this file) rebuilds
    // the pool - a brand new FileCache generation.
    await refreshStorageContext(root, [], { backendFactory: () => fake });

    // The door rewrites its file - smaller this time.
    fs.writeFileSync(staged, Buffer.alloc(40, 2));
    await getStorageContext()!.cache.writeBack(1, 'Conf1/Files/DOOR.DAT', staged);

    // 100 -> 40 is a delta of -60, giving 40 total. The bug this fixes gave
    // 140 (100 carried forward, plus the full 40 charged again on top).
    expect(getStorageContext()!.volumes.byNumber(1)!.usedBytes).toBe(40);
  });

  it('review "carry live state": a volume whose identity changed does NOT inherit the old counters', async () => {
    const root = boardWithDrivesInfo([
      'DRIVE.1=s3://bucket-a',
      'DRIVE.1.ENDPOINT=https://s3.example.com',
      'DRIVE.1.KEYID=k',
    ]);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    const before = getStorageContext()!.volumes.byNumber(1)!;
    before.degraded = true;
    before.requestsThisMonth = 42;

    // Drive 1 now points at a genuinely different bucket.
    applyTooltypes(path.join(root, 'Drives.info'), [['DRIVE.1', 's3://bucket-b']]);
    await refreshStorageContext(root, [], { backendFactory: () => fake });

    const rebuilt = getStorageContext()!.volumes.byNumber(1)!;
    expect(rebuilt.degraded).toBe(false);
    expect(rebuilt.requestsThisMonth).toBe(0);
  });

  it('review "carry live state": a rebuild keeps the previous cached listing - no second real list() for an unchanged area', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });
    await fake.put('Conf1/Files/FILE.LHA', Buffer.from('x'));

    await refreshStorageContext(root, [], { backendFactory: () => fake });
    await getStorageContext()!.names.forArea(1, 'Conf1/Files/').resolve('file.lha');
    expect(fake.lists).toBe(1);

    // An unrelated admin save rebuilds the pool.
    await refreshStorageContext(root, [], { backendFactory: () => fake });
    await getStorageContext()!.names.forArea(1, 'Conf1/Files/').resolve('file.lha');

    // Still 1 - the cached listing survived the rebuild, so this did not
    // cost the meter finding 6 was built to protect a second real request.
    expect(fake.lists).toBe(1);
  });

  it('sweeps a named sibling directory (unverifiable liveness) and reports it WITHOUT claiming nothing owns it', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    // A directory named the way an explicit BBS_STORAGE_NODE_ID or a
    // container's HOSTNAME names one - not a slot, not a `pid-<n>`
    // fallback, so `isNodeStillActive` has no signal for it either way.
    const orphanMarker = path.join(
      root, 'Storage', 'cache', 'orphan-node', '.pending', '1', 'Conf1', 'Files', 'DEMO.LHA.json'
    );
    fs.mkdirSync(path.dirname(orphanMarker), { recursive: true });
    fs.writeFileSync(
      orphanMarker,
      JSON.stringify({ driveNumber: 1, key: 'Conf1/Files/DEMO.LHA', localPath: '/irrelevant' })
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await refreshStorageContext(root, [], { backendFactory: () => fake });
      const messages = errorSpy.mock.calls.map((call) => String(call[0]));
      const message = messages.find((m) => m.includes('orphan-node') && m.includes('1 pending upload'));
      expect(message).toBeDefined();
      // The re-review fix this proves: for a name this process cannot
      // verify, the message must say so, not assert a certainty ("no live
      // node owns this") it does not have - a healthy CONFIGURATION.md
      // multi-instance sibling would be named exactly like this one.
      expect(message).toMatch(/cannot verify/i);
      expect(message).not.toMatch(/confirmed is no longer running/i);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('review defect 4: does NOT report a sibling slot directory whose owning process is still alive - a normal peer, not an orphan', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    // Node "1" is a live peer on this bare host - its lock file names THIS
    // test process, unambiguously alive - with a perfectly normal pending
    // upload of its own.
    const lockDir = path.join(root, 'Storage', 'nodes');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '1.pid'), String(process.pid));
    const peerMarker = path.join(
      root, 'Storage', 'cache', '1', '.pending', '1', 'Conf1', 'Files', 'DEMO.LHA.json'
    );
    fs.mkdirSync(path.dirname(peerMarker), { recursive: true });
    fs.writeFileSync(
      peerMarker,
      JSON.stringify({ driveNumber: 1, key: 'Conf1/Files/DEMO.LHA', localPath: '/irrelevant' })
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // This process claims slot 2 (slot 1 is held by its own, live pid).
      await refreshStorageContext(root, [], { backendFactory: () => fake });
      const messages = errorSpy.mock.calls.map((call) => String(call[0]));
      expect(messages.some((m) => m.includes('pending upload'))).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('review defect 4: DOES report a sibling slot directory whose owning process is dead', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    const lockDir = path.join(root, 'Storage', 'nodes');
    fs.mkdirSync(lockDir, { recursive: true });
    fs.writeFileSync(path.join(lockDir, '1.pid'), '999999'); // a pid nothing alive holds
    const deadMarker = path.join(
      root, 'Storage', 'cache', '1', '.pending', '1', 'Conf1', 'Files', 'DEAD.LHA.json'
    );
    fs.mkdirSync(path.dirname(deadMarker), { recursive: true });
    fs.writeFileSync(
      deadMarker,
      JSON.stringify({ driveNumber: 1, key: 'Conf1/Files/DEAD.LHA', localPath: '/irrelevant' })
    );

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      // An explicit cacheDir bypasses node-slot claiming entirely for
      // THIS run's own active directory, so slot "1" (whose lock names a
      // dead pid, seeded above) is left alone as a genuine sibling to
      // inspect rather than reclaimed as this run's own directory.
      await refreshStorageContext(root, [], {
        backendFactory: () => fake,
        cacheDir: path.join(root, 'Storage', 'cache', 'this-run'),
      });
      const messages = errorSpy.mock.calls.map((call) => String(call[0]));
      const message = messages.find((m) => m.includes('1 pending upload') && m.includes(path.join('cache', '1')));
      expect(message).toBeDefined();
      // A slot's liveness IS verifiable, and this one was confirmed dead -
      // the message may say so plainly, unlike the unverifiable case above.
      expect(message).toMatch(/confirmed is no longer running/i);
      expect(message).not.toMatch(/cannot verify/i);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('review defect 4: sweeps and reports even when the rebuild results in no pool at all', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });

    // A stray directory with a pending marker, unrelated to this run's own
    // active directory, present before the pool disappears.
    const strayMarker = path.join(
      root, 'Storage', 'cache', 'stray', '.pending', '1', 'Conf1', 'Files', 'GONE.LHA.json'
    );
    fs.mkdirSync(path.dirname(strayMarker), { recursive: true });
    fs.writeFileSync(
      strayMarker,
      JSON.stringify({ driveNumber: 1, key: 'Conf1/Files/GONE.LHA', localPath: '/irrelevant' })
    );

    // The sysop removes the last s3 drive - this rebuild produces NO pool.
    applyTooltypes(path.join(root, 'Drives.info'), [], { removeKeys: (key) => /^DRIVE\.\d+/.test(key) });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await refreshStorageContext(root, []);
      expect(getStorageContext()).toBeNull();
      const messages = errorSpy.mock.calls.map((call) => String(call[0]));
      expect(messages.some((m) => m.includes('stray') && m.includes('1 pending upload'))).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('logs a flushPending summary even when the failure is per-entry and silent otherwise', async () => {
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');
    const fake = new FakeBackend({ driveNumber: 1 });
    fake.down = true; // every call fails - models the bucket being unreachable

    const cacheDir = path.join(root, 'Storage', 'cache', 'node-a');
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

    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await refreshStorageContext(root, [], { backendFactory: () => fake, cacheDir });
      // The non-blocking flush is chained (scheduleFlush) - give it a turn
      // to run and log before asserting.
      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      const messages = logSpy.mock.calls.map((call) => String(call[0]));
      expect(messages.some((m) => m.includes('flushPending') && m.includes('1 of 1'))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('serialises overlapping flushes - never more than one put() in flight at once across two rebuilds', async () => {
    // A second rebuild's own FileCache generation can still legitimately
    // re-attempt an upload the FIRST generation's marker snapshot already
    // covers (the staged bytes and their marker only clear once a put truly
    // lands) - that is a harmless, idempotent duplicate PUT of the same key
    // and bytes, not the hazard this test is for. The hazard is two
    // `flushPending` passes actually RUNNING AT THE SAME TIME, racing
    // `removeMarker`/`writeBack` against each other - this asserts that
    // never happens, by tracking concurrent `put()` calls directly.
    const root = boardWithDrivesInfo(['DRIVE.1=s3://bucket', 'DRIVE.1.KEYID=k']);
    writeSecret(root, 1, 'sekrit');

    let releaseFirstPut: (() => void) | undefined;
    const firstPutGate = new Promise<void>((resolve) => {
      releaseFirstPut = resolve;
    });
    let putCount = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const backend = new FakeBackend({ driveNumber: 1 });
    const realPut = backend.put.bind(backend);
    backend.put = async (key: string, body: Buffer) => {
      putCount++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (putCount === 1) await firstPutGate; // hold only the first put open
        return await realPut(key, body);
      } finally {
        inFlight--;
      }
    };

    const cacheDir = path.join(root, 'Storage', 'cache', 'node-a');
    const priorState: VolumeState = {
      volume: { driveNumber: 1, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
      backend,
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

    // First refresh starts a flush that is now stuck mid-put.
    await refreshStorageContext(root, [], { backendFactory: () => backend, cacheDir });
    await new Promise((resolve) => setImmediate(resolve));
    expect(putCount).toBe(1);

    // A second admin save rebuilds while that put is still outstanding -
    // its own flush must queue behind the first, not race it.
    await refreshStorageContext(root, [], { backendFactory: () => backend, cacheDir });
    await new Promise((resolve) => setImmediate(resolve));
    expect(putCount).toBe(1);

    releaseFirstPut!();
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));

    expect(maxInFlight).toBe(1);
  });
});
