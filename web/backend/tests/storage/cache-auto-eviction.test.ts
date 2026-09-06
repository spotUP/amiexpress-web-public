/**
 * Whole-branch review, finding 1 (CRITICAL): `evictTo()` had 32 call sites,
 * every one in `tests/`, none in `src/` - so `Storage/cache/<node>/` grew
 * without bound on the same `bbs-data` volume the pooled file areas exist to
 * relieve. Driving `evictTo()` directly would prove nothing about that
 * regression - that call site existed all along and was never the problem.
 *
 * These tests drive the REAL callers - `materialiseRemoteFile` (what the D
 * command and the download routes call) and `FileCache.ensureLocal`/
 * `writeBack` directly - so reverting the production wiring in
 * `file-cache.ts` (not this test file) is what must turn them red.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { materialiseRemoteFile } from '../../src/storage/remote-download';
import type { StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { FakeBackend } from './fake-backend';

function volumeState(backend: FakeBackend): VolumeState {
  return {
    volume: { driveNumber: backend.driveNumber, kind: 's3', path: 'bucket', egress: 'FREE', volumeClass: 'FREE' },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
}

describe('the cache actually evicts, through a real caller', () => {
  it('sweeps a clean cached file back out once enough traffic has moved through a download', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-auto-evict-'));
    const backend = new FakeBackend({ driveNumber: 2 });
    const volumes = new VolumeSet([volumeState(backend)]);
    const areas: RemoteArea[] = [
      { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    ];
    // A budget small enough that two ordinary files exceed it, and a sweep
    // threshold (5% of it) small enough that fetching the second one crosses
    // it well before the disk actually fills.
    const cache = new FileCache({ cacheDir: dir, volumes, maxBytes: 1000 });
    const storage: StorageContext = { volumes, cache, names: new NameIndexRegistry(volumes), areas };

    await backend.put('Conf1/Files/FIRST.LHA', Buffer.alloc(600, 1));
    await backend.put('Conf1/Files/SECOND.LHA', Buffer.alloc(600, 2));

    const first = await materialiseRemoteFile('FIRST.LHA', 1, storage);
    expect(first).not.toBeNull();
    expect(fs.existsSync(first!.fullPath)).toBe(true);

    // This second fetch pushes 1200 bytes through a 1000-byte budget, and
    // nothing in this test ever calls evictTo. Only the production wiring
    // inside FileCache.fetch()/writeBack() can make the next assertion pass.
    const second = await materialiseRemoteFile('SECOND.LHA', 1, storage);
    expect(second).not.toBeNull();

    expect(fs.existsSync(first!.fullPath)).toBe(false); // the LRU clean file was swept
    expect(fs.existsSync(second!.fullPath)).toBe(true); // the one just fetched survives
  });

  it('never sweeps a file that has not been uploaded yet, even while over budget', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-auto-evict-pin-'));
    const backend = new FakeBackend({ driveNumber: 2 });
    const volumes = new VolumeSet([volumeState(backend)]);
    const cache = new FileCache({ cacheDir: dir, volumes, maxBytes: 1000 });

    await backend.put('Conf1/Files/OLD.LHA', Buffer.alloc(600, 1));
    const oldLocal = await cache.ensureLocal(2, 'Conf1/Files/OLD.LHA');
    expect(fs.existsSync(oldLocal)).toBe(true);

    // A door's write that the volume then refuses - stays pinned, dirty, and
    // on disk. The auto-sweep this test provokes must not touch it.
    const staged = cache.localPathFor(2, 'Conf1/Files/PENDING.DAT');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, Buffer.alloc(600, 2));
    backend.down = true;
    await expect(cache.writeBack(2, 'Conf1/Files/PENDING.DAT', staged)).rejects.toThrow();

    // A second, healthy fetch - large enough on its own to cross the sweep
    // threshold and land the cache well over its 1000-byte budget.
    backend.down = false;
    await backend.put('Conf1/Files/NEW.LHA', Buffer.alloc(600, 3));
    await cache.ensureLocal(2, 'Conf1/Files/NEW.LHA');

    // OLD.LHA is clean and least-recently-used - it may be swept.
    // PENDING.DAT is dirty and un-uploaded - it must never be, budget or not.
    expect(fs.existsSync(staged)).toBe(true);
    expect(cache.isDirty(2, 'Conf1/Files/PENDING.DAT')).toBe(true);
  });

  it('sweeps after a writeBack lands too, not only after a fetch', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-auto-evict-write-'));
    const backend = new FakeBackend({ driveNumber: 2 });
    const volumes = new VolumeSet([volumeState(backend)]);
    const cache = new FileCache({ cacheDir: dir, volumes, maxBytes: 1000 });

    await backend.put('Conf1/Files/OLD.LHA', Buffer.alloc(600, 1));
    const oldLocal = await cache.ensureLocal(2, 'Conf1/Files/OLD.LHA');
    expect(fs.existsSync(oldLocal)).toBe(true);

    const staged = path.join(dir, 'staged.bin');
    fs.writeFileSync(staged, Buffer.alloc(600, 2));
    await cache.writeBack(2, 'Conf1/Files/NEW.LHA', staged);

    // Nothing here calls evictTo directly - only writeBack's own trailing
    // sweep can remove the now-stale, least-recently-used OLD.LHA.
    expect(fs.existsSync(oldLocal)).toBe(false);
  });
});
