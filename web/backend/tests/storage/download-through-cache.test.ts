/**
 * A caller downloading a file whose area lives in the pool.
 *
 * The rule this suite exists to hold, from the FileCache header and every
 * review since: "the volume cannot answer" and "the object is not there" are
 * different answers and stay different all the way out to the caller's
 * screen. A fetch failure that reaches a user as "File not found" is how a
 * sysop deletes a catalog row for a file that was fine.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { materialiseRemoteFile } from '../../src/storage/remote-download';
import type { StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { resolveFile, resolveFlaggedFile } from '../../src/handlers/transfer/batch-download.handler';
import { FakeBackend } from './fake-backend';

interface Fixture {
  ctx: StorageContext;
  backend: FakeBackend;
  dataDir: string;
}

/** Conference 1 is pooled on DRIVE.2; conference 2 is an ordinary local area. */
function remoteAreaFixture(): Fixture {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-'));
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
  const cache = new FileCache({
    cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-')),
    volumes,
    maxBytes: 1024 * 1024,
  });

  const areas: RemoteArea[] = [
    { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    { id: 2, conferenceId: 2, dirNumber: 1, path: 'BBS:Conf2/Files/' },
  ];

  return { ctx: { volumes, cache, names: new NameIndexRegistry(volumes), areas }, backend, dataDir };
}

describe('materialiseRemoteFile', () => {
  it('materialises the object and hands back a real local path', async () => {
    const { ctx, backend } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const found = await materialiseRemoteFile('demo.lha', 1, ctx);

    expect(found).not.toBeNull();
    expect(fs.readFileSync(found!.fullPath, 'utf8')).toBe('payload');
    expect(found!.name).toBe('DEMO.LHA');
    expect(found!.size).toBe(7);
    expect(found!.driveNumber).toBe(2);
    expect(found!.key).toBe('Conf1/Files/DEMO.LHA');
    expect(backend.gets).toBe(1);
  });

  it('fetches once for two downloads of the same file', async () => {
    const { ctx, backend } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await materialiseRemoteFile('demo.lha', 1, ctx);
    await materialiseRemoteFile('demo.lha', 1, ctx);

    expect(backend.gets).toBe(1);
  });

  it('lists the area once, however many files are asked for', async () => {
    const { ctx, backend } = remoteAreaFixture();
    await backend.put('Conf1/Files/A.LHA', Buffer.from('a'));
    await backend.put('Conf1/Files/B.LHA', Buffer.from('b'));

    await materialiseRemoteFile('a.lha', 1, ctx);
    await materialiseRemoteFile('b.lha', 1, ctx);

    expect(backend.lists).toBe(1);
  });

  it('is null for a name the area does not hold', async () => {
    const { ctx } = remoteAreaFixture();
    expect(await materialiseRemoteFile('NOPE.LHA', 1, ctx)).toBeNull();
  });

  it('is null for a conference with no remote area, and spends no request', async () => {
    const { ctx, backend } = remoteAreaFixture();
    expect(await materialiseRemoteFile('LOCAL.TXT', 2, ctx)).toBeNull();
    expect(backend.requests).toBe(0);
  });

  it('surfaces a down volume as unavailable rather than as a missing file', async () => {
    const { ctx, backend } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;

    await expect(materialiseRemoteFile('demo.lha', 1, ctx)).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('still says unavailable when the name resolves and only the fetch fails', async () => {
    // The listing half and the fetch half fail independently. This is the
    // second one: the index knows the object, the bucket will not hand it over.
    const { ctx, backend } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    await backend.put('Conf1/Files/OTHER.LHA', Buffer.from('other'));
    await materialiseRemoteFile('demo.lha', 1, ctx); // primes the index and the cache
    backend.down = true;

    await expect(materialiseRemoteFile('OTHER.LHA', 1, ctx)).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

describe('resolveFile', () => {
  it('serves a pooled file through the cache', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const found = await resolveFile(dataDir, 1, 'demo.lha', ctx);

    expect(found).not.toBeNull();
    expect(fs.readFileSync(found!.fullPath, 'utf8')).toBe('payload');
    expect(found!.confNum).toBe(1);
  });

  it('leaves a local area exactly as it was - no listing, no fetch', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();

    const found = await resolveFile(dataDir, 2, 'LOCAL.TXT', ctx);

    expect(found).not.toBeNull();
    expect(found!.fullPath).toBe(path.join(dataDir, 'Conf2', 'Files', 'LOCAL.TXT'));
    expect(backend.requests).toBe(0);
  });

  it('works with no storage configured at all, which is every board today', async () => {
    const { dataDir } = remoteAreaFixture();

    const found = await resolveFile(dataDir, 2, 'LOCAL.TXT', null);

    expect(found!.name).toBe('LOCAL.TXT');
  });

  it('serves the pool, not a stale local copy, for a remote area', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();
    fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'DEMO.LHA'), 'stale-local');
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const found = await resolveFile(dataDir, 1, 'DEMO.LHA', ctx);

    expect(fs.readFileSync(found!.fullPath, 'utf8')).toBe('payload');
  });

  it('is null for a file that is genuinely in neither place', async () => {
    const { ctx, dataDir } = remoteAreaFixture();
    expect(await resolveFile(dataDir, 1, 'NOPE.LHA', ctx)).toBeNull();
  });

  it('throws rather than answering null when the volume cannot be reached', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;

    await expect(resolveFile(dataDir, 1, 'demo.lha', ctx)).rejects.toBeInstanceOf(StorageUnavailableError);
  });
});

describe('what the caller is told', () => {
  function lines(): { emit: (line: string) => void; written: () => string } {
    const out: string[] = [];
    return { emit: (line: string) => out.push(line), written: () => out.join('') };
  }

  it('says the volume is unavailable, and never says the file is missing', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    const out = lines();

    const found = await resolveFlaggedFile(out.emit, dataDir, 1, 'DEMO.LHA', ctx);

    expect(found).toBeNull();
    expect(out.written()).toContain('DEMO.LHA');
    expect(out.written()).toContain('unavailable');
    expect(out.written()).toContain('try again later');
    expect(out.written()).toContain('DRIVE.2');
    expect(out.written()).not.toContain('File not found');
  });

  it('says the file is not found when it genuinely is not there', async () => {
    const { ctx, dataDir } = remoteAreaFixture();
    const out = lines();

    const found = await resolveFlaggedFile(out.emit, dataDir, 1, 'NOPE.LHA', ctx);

    expect(found).toBeNull();
    expect(out.written()).toContain('[X] File not found: NOPE.LHA');
    expect(out.written()).not.toContain('unavailable');
  });

  it('says nothing at all when the file resolves', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    const out = lines();

    const found = await resolveFlaggedFile(out.emit, dataDir, 1, 'DEMO.LHA', ctx);

    expect(found).not.toBeNull();
    expect(out.written()).toBe('');
  });

  it('reports an unexpected storage failure as a failure, still not as a missing file', async () => {
    const { ctx, backend, dataDir } = remoteAreaFixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    // Resolvable by name, then gone from under the fetch: the bucket answers
    // "no" to a key its own listing just offered.
    await materialiseRemoteFile('DEMO.LHA', 1, ctx);
    await backend.delete('Conf1/Files/DEMO.LHA');
    ctx.cache.evictTo(0);
    const out = lines();

    const found = await resolveFlaggedFile(out.emit, dataDir, 1, 'DEMO.LHA', ctx);

    expect(found).toBeNull();
    expect(out.written()).toContain('DEMO.LHA');
    expect(out.written()).not.toContain('File not found');
  });
});
