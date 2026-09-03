/**
 * The `D` command - the one a caller actually types - reading from the pool.
 *
 * `DB` reaches BatchDownloadHandler; plain `D`, and F-flag-then-`D`, go to
 * DownloadHandler and resolve through its own disk walk. A pooled area has no
 * such directory to walk, so without this branch `D DEMO.LHA` answers
 * "File not found" for a file the bucket is holding, and a flagged pooled file
 * is dropped from the download set in silence.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { DownloadHandler } from '../../src/handlers/file/download.handler';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { rematerialise } from '../../src/storage/remote-download';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { FakeBackend } from './fake-backend';

/** A resolved file as findFilesInConference produces one. */
interface FoundFile {
  name: string;
  size: number;
  confNum: number;
  fullPath: string;
  driveNumber?: number;
  objectKey?: string;
}

/**
 * The D command's resolve layer. Private on the class (TypeScript-only), and
 * these are the functions the four call sites in beginDLF / the filespec
 * prompt go through, so they are what a storage branch has to be tested on.
 */
interface DownloadInternals {
  findFilesInConference(dataDir: string, confNum: number, pattern: string): Promise<FoundFile[]>;
  findFilesReporting(
    socket: { emit: (event: string, payload: string) => void },
    dataDir: string,
    confNum: number,
    pattern: string
  ): Promise<FoundFile[] | null>;
}

const internals = DownloadHandler as unknown as DownloadInternals;

interface Fixture {
  ctx: StorageContext;
  backend: FakeBackend;
  dataDir: string;
}

function fixture(): Fixture {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-d-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'Conf2', 'Files'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'Conf2', 'Files', 'LOCAL.TXT'), 'on-disk');

  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  const areas: RemoteArea[] = [
    { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    { id: 2, conferenceId: 2, dirNumber: 1, path: 'BBS:Conf2/Files/' },
  ];
  const ctx: StorageContext = {
    volumes,
    cache: new FileCache({
      cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-d-')),
      volumes,
      maxBytes: 1024 * 1024,
    }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
  setStorageContext(ctx);
  return { ctx, backend, dataDir };
}

function socketSpy(): { socket: { emit: (event: string, payload: string) => void }; written: () => string } {
  const out: string[] = [];
  return {
    socket: { emit: (event: string, payload: string) => { if (event === 'ansi-output') out.push(payload); } },
    written: () => out.join(''),
  };
}

afterEach(() => setStorageContext(null));

describe('D resolving a pooled file', () => {
  it('finds it by exact name and hands back a real local path', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const found = await internals.findFilesInConference(dataDir, 1, 'DEMO.LHA');

    expect(found).toHaveLength(1);
    expect(fs.readFileSync(found[0].fullPath, 'utf8')).toBe('payload');
    expect(found[0].size).toBe(7);
  });

  it('matches the caller spelling case-insensitively, as the disk walk does', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const found = await internals.findFilesInConference(dataDir, 1, 'demo.lha');

    expect(found[0].name).toBe('DEMO.LHA');
  });

  it('expands a wildcard filespec, which a pooled area has no directory for', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO1.LHA', Buffer.from('one'));
    await backend.put('Conf1/Files/DEMO2.LHA', Buffer.from('two'));
    await backend.put('Conf1/Files/OTHER.LHA', Buffer.from('no'));

    const found = await internals.findFilesInConference(dataDir, 1, 'DEMO*.LHA');

    expect(found.map(f => f.name).sort()).toEqual(['DEMO1.LHA', 'DEMO2.LHA']);
    expect(found.map(f => fs.readFileSync(f.fullPath, 'utf8')).sort()).toEqual(['one', 'two']);
  });

  it('carries the drive and key, so the transfer can fetch it again', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const [found] = await internals.findFilesInConference(dataDir, 1, 'DEMO.LHA');

    expect(found.driveNumber).toBe(2);
    expect(found.objectKey).toBe('Conf1/Files/DEMO.LHA');
  });

  it('lists pooled AND local files for a wildcard in a part-migrated conference', async () => {
    // Returning only the pooled subset would hide from `D *.LHA` the files
    // still sitting on disk - the same silent drop this branch exists to fix.
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/POOLED.LHA', Buffer.from('in-bucket'));
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'ONDISK.LHA'), 'on-disk');

    const found = await internals.findFilesInConference(dataDir, 1, '*.LHA');

    expect(found.map(f => f.name).sort()).toEqual(['ONDISK.LHA', 'POOLED.LHA']);
  });

  it('does not list a file twice when a stale local copy shares the name', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('current'));
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'DEMO.LHA'), 'stale-local');

    const found = await internals.findFilesInConference(dataDir, 1, '*.LHA');

    expect(found).toHaveLength(1);
    expect(fs.readFileSync(found[0].fullPath, 'utf8')).toBe('current');
  });

  it('serves the pool, not a stale local copy, on an exact name', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('current'));
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'DEMO.LHA'), 'stale-local');

    const found = await internals.findFilesInConference(dataDir, 1, 'DEMO.LHA');

    expect(found).toHaveLength(1);
    expect(fs.readFileSync(found[0].fullPath, 'utf8')).toBe('current');
  });

  it('falls through to a local file the pool does not hold', async () => {
    const { dataDir } = fixture();
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'ONDISK.LHA'), 'on-disk');

    const found = await internals.findFilesInConference(dataDir, 1, 'ONDISK.LHA');

    expect(found[0].fullPath).toBe(path.join(dataDir, 'Conf1', 'Files', 'ONDISK.LHA'));
  });

  it('is empty for a name the pool does not hold', async () => {
    const { dataDir } = fixture();
    expect(await internals.findFilesInConference(dataDir, 1, 'NOPE.LHA')).toEqual([]);
  });

  it('leaves a local conference alone', async () => {
    const { backend, dataDir } = fixture();

    const found = await internals.findFilesInConference(dataDir, 2, 'LOCAL.TXT');

    expect(found[0].fullPath).toBe(path.join(dataDir, 'Conf2', 'Files', 'LOCAL.TXT'));
    expect(backend.requests).toBe(0);
  });
});

describe('what D tells the caller when the volume is down', () => {
  it('names the drive and says try again later - never "File not found"', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    const spy = socketSpy();

    const found = await internals.findFilesReporting(spy.socket, dataDir, 1, 'DEMO.LHA');

    expect(found).toBeNull(); // null, NOT an empty list - the callers print "File not found" on empty
    expect(spy.written()).toContain('DRIVE.2');
    expect(spy.written()).toContain('try again later');
    expect(spy.written()).not.toContain('File not found');
  });

  it('reports an unreachable volume on a wildcard filespec too', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO1.LHA', Buffer.from('one'));
    backend.down = true;
    const spy = socketSpy();

    expect(await internals.findFilesReporting(spy.socket, dataDir, 1, 'DEMO*.LHA')).toBeNull();
    expect(spy.written()).toContain('unavailable');
  });

  it('says nothing and returns the list when all is well', async () => {
    const { backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    const spy = socketSpy();

    const found = await internals.findFilesReporting(spy.socket, dataDir, 1, 'DEMO.LHA');

    expect(found).toHaveLength(1);
    expect(spy.written()).toBe('');
  });

  it('still reports a genuine miss as a miss - an empty list, not null', async () => {
    const { dataDir } = fixture();
    const spy = socketSpy();

    expect(await internals.findFilesReporting(spy.socket, dataDir, 1, 'NOPE.LHA')).toEqual([]);
    expect(spy.written()).toBe('');
  });
});

describe('the file still being there at send time', () => {
  it('fetches the object again when the cache evicted it at the prompt', async () => {
    // D resolves, prints, waits for the caller to press RETURN, and only then
    // hands paths to Zmodem, which existsSync-checks every one. Another node's
    // fetch can evict a clean copy inside that window, and the caller would be
    // told "files not found" about a file the bucket still holds.
    const { ctx, backend, dataDir } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    const [found] = await internals.findFilesInConference(dataDir, 1, 'DEMO.LHA');

    ctx.cache.evictTo(0);
    expect(fs.existsSync(found.fullPath)).toBe(false);

    const sendPath = await rematerialise(found, ctx);

    expect(fs.existsSync(sendPath)).toBe(true);
    expect(fs.readFileSync(sendPath, 'utf8')).toBe('payload');
  });

  it('leaves a local file exactly as it is', async () => {
    const { ctx, dataDir } = fixture();
    const [found] = await internals.findFilesInConference(dataDir, 2, 'LOCAL.TXT');

    expect(await rematerialise(found, ctx)).toBe(found.fullPath);
  });

  it('is what the telnet transfer builds its paths from', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'handlers', 'file', 'download.handler.ts'),
      'utf8'
    );
    const branch = source.match(/const \{ startZmodemDownload \}[\s\S]*?startZmodemDownload\(socket/);
    expect(branch).not.toBeNull();
    expect(branch![0]).toMatch(/await rematerialise\(file, storage\)/);
  });
});
