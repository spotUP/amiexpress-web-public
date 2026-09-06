import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache, blockOutcome } from '../../src/storage/file-cache';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { StorageUnavailableError } from '../../src/storage/storage-backend';
import { FakeBackend } from './fake-backend';

function setup(): { cache: FileCache; backend: FakeBackend; dir: string; volumes: VolumeSet } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'filecache-'));
  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE', quotaBytes: 1024 },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  return { cache: new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 }), backend, dir, volumes };
}

/** The single record: `<cacheDir>/.pending/<drive>/<key>.json`, never beside the payload. */
function markerPath(dir: string, driveNumber: number, key: string): string {
  return path.join(dir, '.pending', String(driveNumber), `${key}.json`);
}

/** Where quarantined bytes end up: `<cacheDir>/.parked/<drive>/<key>`. */
function parkedPath(dir: string, driveNumber: number, key: string): string {
  return path.join(dir, '.parked', String(driveNumber), key);
}

describe('FileCache.ensureLocal', () => {
  it('fetches once and serves the second read from disk', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));

    const first = await cache.ensureLocal(2, 'Files/DEMO.LHA');
    expect(fs.readFileSync(first, 'utf8')).toBe('payload');
    await cache.ensureLocal(2, 'Files/DEMO.LHA');

    expect(backend.gets).toBe(1);
  });

  it('reports a down volume as unavailable, not as a missing file', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    await expect(cache.ensureLocal(2, 'Files/DEMO.LHA')).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  it('marks the volume degraded, so placement stops choosing it and the admin can show it', async () => {
    const { cache, backend, volumes } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    await expect(cache.ensureLocal(2, 'Files/DEMO.LHA')).rejects.toThrow();
    expect(volumes.byNumber(2)?.degraded).toBe(true);
  });

  it('clears the degraded mark once the volume answers again', async () => {
    const { cache, backend, volumes } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    await expect(cache.ensureLocal(2, 'Files/DEMO.LHA')).rejects.toThrow();
    backend.down = false;
    await cache.ensureLocal(2, 'Files/DEMO.LHA');
    expect(volumes.byNumber(2)?.degraded).toBe(false);
  });

  it('leaves a genuinely absent object as absence, and does not degrade the volume for it', async () => {
    const { cache, volumes } = setup();
    await expect(cache.ensureLocal(2, 'Files/NEVER-EXISTED.LHA')).rejects.not.toBeInstanceOf(StorageUnavailableError);
    expect(volumes.byNumber(2)?.degraded).toBe(false);
  });

  it('serves an already-cached file while its volume is degraded - the bytes on disk are still real', async () => {
    const { cache, backend, volumes } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));
    await cache.ensureLocal(2, 'Files/DEMO.LHA');

    backend.down = true;
    volumes.markDegraded(2, true);

    const served = await cache.ensureLocal(2, 'Files/DEMO.LHA');
    expect(fs.readFileSync(served, 'utf8')).toBe('payload');
    expect(backend.gets).toBe(1);
  });

  it('shares one fetch between two callers racing for the same cold key', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/DEMO.LHA', Buffer.from('payload'));

    const [a, b] = await Promise.all([
      cache.ensureLocal(2, 'Files/DEMO.LHA'),
      cache.ensureLocal(2, 'Files/DEMO.LHA'),
    ]);

    expect(a).toBe(b);
    expect(backend.gets).toBe(1);
  });

  it('serves the newest local copy of a file whose upload has not landed yet', async () => {
    const { cache, backend, dir } = setup();
    await backend.put('Files/DOOR.DAT', Buffer.from('older-pool-copy'));
    const staged = path.join(dir, 'staged-newest.bin');
    fs.writeFileSync(staged, 'newer-not-uploaded');
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', staged)).rejects.toThrow();
    backend.down = false;

    const served = await cache.ensureLocal(2, 'Files/DOOR.DAT');
    expect(fs.readFileSync(served, 'utf8')).toBe('newer-not-uploaded');
    expect(backend.gets).toBe(0);
  });

  it('refuses a key that would escape the cache directory', async () => {
    const { cache, backend } = setup();
    await expect(cache.ensureLocal(2, '../escape.bin')).rejects.toThrow(/\.\./);
    expect(backend.requests).toBe(0);
  });
});

describe('FileCache write-back', () => {
  it('uploads what a writer left behind', async () => {
    const { cache, backend, dir } = setup();
    const local = path.join(dir, 'staged.bin');
    fs.writeFileSync(local, 'written-by-a-door');

    await cache.writeBack(2, 'Files/DOOR.DAT', local);

    expect((await backend.get('Files/DOOR.DAT')).toString()).toBe('written-by-a-door');
    expect(cache.isDirty(2, 'Files/DOOR.DAT')).toBe(false);
  });

  it('keeps the local copy and stays dirty when the upload fails', async () => {
    const { cache, backend, dir } = setup();
    const local = path.join(dir, 'staged2.bin');
    fs.writeFileSync(local, 'precious');
    backend.down = true;

    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toBeInstanceOf(StorageUnavailableError);

    expect(fs.existsSync(local)).toBe(true);
    expect(cache.isDirty(2, 'Files/DOOR.DAT')).toBe(true);
  });

  it('replays pending uploads at boot', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = path.join(dir, 'staged3.bin');
    fs.writeFileSync(local, 'survives-a-crash');
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/LATE.DAT', local)).rejects.toThrow();

    // A new process, same cache directory and the same marker on disk.
    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    backend.down = false;
    await reborn.flushPending();

    expect((await backend.get('Files/LATE.DAT')).toString()).toBe('survives-a-crash');
  });

  it('does not charge the volume twice for overwriting the same key', async () => {
    const { cache, dir, volumes } = setup();
    const local = path.join(dir, 'twice.bin');
    fs.writeFileSync(local, Buffer.alloc(100, 7));

    await cache.writeBack(2, 'Files/TWICE.DAT', local);
    await cache.writeBack(2, 'Files/TWICE.DAT', local);

    expect(volumes.byNumber(2)?.usedBytes).toBe(100);
  });
});

describe('FileCache.evictTo', () => {
  it('evicts clean files but never a dirty one', async () => {
    const { cache, backend, dir } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    const clean = await cache.ensureLocal(2, 'Files/CLEAN.LHA');

    const dirty = path.join(dir, 'dirty.bin');
    fs.writeFileSync(dirty, Buffer.alloc(400, 2));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DIRTY.DAT', dirty)).rejects.toThrow();

    cache.evictTo(0);

    expect(fs.existsSync(clean)).toBe(false);
    expect(fs.existsSync(dirty)).toBe(true);
  });

  it('never evicts a dirty file that sits at the cache path it would otherwise reclaim', async () => {
    const { cache, backend } = setup();
    // The shape Task 10 produces: a door opened the cached path, wrote it,
    // and Close() could not upload it.
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 3));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    cache.evictTo(0);

    expect(fs.existsSync(local)).toBe(true);
    expect(fs.readFileSync(local)[0]).toBe(3);
  });

  it('never evicts a file it could not fetch again', () => {
    const { cache, dir } = setup();
    // Not laid out as <drive>/<key>, so nothing in the pool can replace it.
    const stray = path.join(dir, 'someone-elses.bin');
    fs.writeFileSync(stray, Buffer.alloc(400, 4));

    cache.evictTo(0);

    expect(fs.existsSync(stray)).toBe(true);
  });

  it('reports the shortfall when the pinned set alone is over budget', async () => {
    const { cache, backend, dir } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    await cache.ensureLocal(2, 'Files/CLEAN.LHA');

    const dirty = path.join(dir, 'dirty.bin');
    fs.writeFileSync(dirty, Buffer.alloc(400, 2));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DIRTY.DAT', dirty)).rejects.toThrow();

    cache.evictTo(100);

    expect(cache.overBudgetBytes()).toBe(300);
  });

  it('reports no shortfall once it is back inside the budget', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    await cache.ensureLocal(2, 'Files/CLEAN.LHA');

    cache.evictTo(0);

    expect(cache.overBudgetBytes()).toBe(0);
  });
});

describe('FileCache keeps its record out of the payload namespace', () => {
  it('writes the pending record under .pending, never beside the staged file', async () => {
    const { cache, backend, dir } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    expect(fs.existsSync(markerPath(dir, 2, 'Files/DOOR.DAT'))).toBe(true);
    // Nothing at all lands in the payload tree except the payload itself. The
    // old sidecar layout put a `.dirty` file here, which is what made a key
    // ending `.dirty` over-pinned, sweepable and JSON-parsed at boot.
    expect(fs.readdirSync(path.dirname(local))).toEqual(['DOOR.DAT']);
  });

  it('never mistakes a payload whose key ends .json for a marker', async () => {
    const { cache, backend, dir, volumes } = setup();
    // A real cached object whose KEY spells a marker name. Under the old
    // layout this was over-pinned by name, and one round it was nearly
    // deleted by the stale-marker sweep. It is now an ordinary payload,
    // because markers do not live in this tree at all.
    await backend.put('Files/NOTES.json', Buffer.from('a real object, not a marker'));
    const payload = await cache.ensureLocal(2, 'Files/NOTES.json');

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    expect(fs.existsSync(payload)).toBe(true);
    expect(reborn.isDirty(2, 'Files/NOTES.json')).toBe(false);

    // And it is a normal, evictable cached file - not pinned for ever by the
    // shape of its name.
    reborn.evictTo(0);
    expect(fs.existsSync(payload)).toBe(false);
  });

  it('recovers a pending upload from its marker alone, and replays it', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    expect(reborn.isDirty(2, 'Files/DOOR.DAT')).toBe(true);

    reborn.evictTo(0);
    expect(fs.existsSync(local)).toBe(true);

    backend.down = false;
    await reborn.flushPending();
    expect((await backend.get('Files/DOOR.DAT')).length).toBe(400);
    expect(fs.existsSync(markerPath(dir, 2, 'Files/DOOR.DAT'))).toBe(false);
  });

  it('will not evict a file whose marker another process wrote', async () => {
    const { cache, backend, dir } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    const clean = await cache.ensureLocal(2, 'Files/CLEAN.LHA');
    // A marker left by another node on the same cache directory - this
    // instance knows nothing about it, and the pin test reads the disk.
    const marker = markerPath(dir, 2, 'Files/CLEAN.LHA');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(marker, JSON.stringify({ driveNumber: 2, key: 'Files/CLEAN.LHA', localPath: clean }));

    cache.evictTo(0);

    expect(fs.existsSync(clean)).toBe(true);
  });

  it('removes a marker whose staged file is gone, so a later clean copy stays evictable', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/GONE.LHA');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 7));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/GONE.LHA', local)).rejects.toThrow();

    // The staged file is removed; only the marker is left behind.
    fs.unlinkSync(local);

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    expect(fs.existsSync(markerPath(dir, 2, 'Files/GONE.LHA'))).toBe(false);

    // Without that sweep, the next cold fetch lands a clean copy at exactly
    // this path and it is un-evictable for the life of the cache directory.
    backend.down = false;
    await backend.put('Files/GONE.LHA', Buffer.alloc(400, 1));
    const fresh = await reborn.ensureLocal(2, 'Files/GONE.LHA');

    reborn.evictTo(0);

    expect(fs.existsSync(fresh)).toBe(false);
  });

  it('ignores a marker localPath that points outside the cache directory', async () => {
    const { backend, dir, volumes } = setup();
    // A marker is a file in a directory a sysop can write to, so its
    // `localPath` is input, not fact - and that field drives writeBack (upload
    // these bytes), ensureLocal (serve this path to a door) and park (rename
    // this file into .parked/).
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'filecache-outside-'));
    const victim = path.join(outside, 'not-ours.bin');
    fs.writeFileSync(victim, 'someone elses file');
    const st = fs.statSync(victim);

    const marker = markerPath(dir, 2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(
      marker,
      JSON.stringify({
        driveNumber: 2,
        key: 'Files/DOOR.DAT',
        localPath: victim,
        size: st.size,
        mtimeMs: st.mtimeMs,
      })
    );

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    await reborn.flushPending();

    // Nothing outside the cache directory was uploaded, moved or served.
    expect(backend.puts).toBe(0);
    expect(fs.readFileSync(victim, 'utf8')).toBe('someone elses file');
    expect(reborn.parkedFiles()).toEqual([]);
  });

  it('keeps an unreadable marker whose staged file is not at the canonical path', async () => {
    const { cache, backend, dir, volumes } = setup();
    // Staged somewhere else under the cache directory, which writeBack allows.
    const staged = path.join(dir, 'staged-elsewhere.bin');
    fs.writeFileSync(staged, 'the only copy');
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', staged)).rejects.toThrow();

    // A torn marker that no longer parses. The canonical path holds nothing,
    // but that is a GUESS about where the bytes are, not knowledge.
    const marker = markerPath(dir, 2, 'Files/DOOR.DAT');
    fs.writeFileSync(marker, '{ "driveNumber": 2, "key"');

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });

    // Unlinking here would log "the staged file it protected is gone", which is
    // false: the bytes are fine and it is the RETRY that would be forgotten.
    expect(fs.existsSync(marker)).toBe(true);
    reborn.evictTo(0);
    expect(fs.readFileSync(staged, 'utf8')).toBe('the only copy');
  });

  it('refuses to parse a marker far too large to be one', async () => {
    const { cache, backend, dir, volumes } = setup();
    await backend.put('Files/BIG.DAT', Buffer.alloc(400, 1)); // the good object in the pool

    const local = cache.localPathFor(2, 'Files/BIG.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));

    // Something enormous where a marker belongs - and VALID, with a stamp that
    // matches, so the only thing standing between it and JSON.parse at boot is
    // the size cap. A cache directory must not be able to make the board
    // allocate whatever a file there happens to be.
    const st = fs.statSync(local);
    const marker = markerPath(dir, 2, 'Files/BIG.DAT');
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    fs.writeFileSync(
      marker,
      JSON.stringify({
        driveNumber: 2,
        key: 'Files/BIG.DAT',
        localPath: local,
        size: st.size,
        mtimeMs: st.mtimeMs,
        padding: 'A'.repeat(128 * 1024),
      })
    );

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 100_000 });
    // It still pins - the marker's PATH says which object it is for, so a
    // marker nobody can read protects exactly the right file.
    expect(reborn.isDirty(2, 'Files/BIG.DAT')).toBe(true);

    // But it can vouch for nothing, so the replay parks rather than uploads.
    await reborn.flushPending();
    expect((await backend.get('Files/BIG.DAT'))[0]).toBe(1);
    expect(fs.existsSync(parkedPath(dir, 2, 'Files/BIG.DAT'))).toBe(true);
  });
});

describe('FileCache when the pin record cannot be read', () => {
  it('deletes nothing at all, and does not mistake unreadable for empty', async () => {
    const { cache, backend, dir, volumes } = setup();
    // The shape Task 10 produces: staged at the cache path, upload failed.
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    // A stray file where the pending directory belongs. `.pending/` now EXISTS
    // and cannot be listed - which is a different answer from a cache that has
    // never had a pending upload and has no `.pending/` at all. Collapsing the
    // two makes evictTo conclude nothing is pinned and delete a staged,
    // un-uploaded payload: the cardinal invariant.
    fs.rmSync(path.join(dir, '.pending'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.pending'), '');

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    // It recovered nothing, so its own map protects nothing here.
    expect(reborn.isDirty(2, 'Files/DOOR.DAT')).toBe(false);

    reborn.evictTo(0);

    expect(fs.existsSync(local)).toBe(true);
    // And the one number an admin surface plots stays live while it matters.
    expect(reborn.overBudgetBytes()).toBe(400);
  });

  it('starts evicting again once the record reads', async () => {
    const { cache, backend, dir, volumes } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    const clean = await cache.ensureLocal(2, 'Files/CLEAN.LHA');

    // Unreadable: nothing is deleted...
    fs.writeFileSync(path.join(dir, '.pending'), '');
    cache.evictTo(0);
    expect(fs.existsSync(clean)).toBe(true);

    // ...and this is NOT the sticky latch that was deleted. The moment the
    // record reads again - here, by removing the stray file - eviction resumes
    // in the same process. A read failure must not be able to fill the disk.
    fs.unlinkSync(path.join(dir, '.pending'));
    cache.evictTo(0);
    expect(fs.existsSync(clean)).toBe(false);
  });
});

describe('FileCache parking is a move, not a flag', () => {
  it('parks a truncated file instead of replaying it over a good object', async () => {
    const { cache, backend, dir, volumes } = setup();
    await backend.put('Files/DOOR.DAT', Buffer.alloc(400, 1)); // the good object in the pool

    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    // Power loss. Nothing was fsynced, so the staged file comes back
    // truncated while its marker survived.
    fs.writeFileSync(local, Buffer.alloc(120, 9));

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    expect(reborn.isDirty(2, 'Files/DOOR.DAT')).toBe(true);

    backend.down = false;
    await reborn.flushPending();

    // The good object in the pool is untouched, and nothing will retry.
    expect((await backend.get('Files/DOOR.DAT')).length).toBe(400);
    expect(reborn.isDirty(2, 'Files/DOOR.DAT')).toBe(false);

    // The bytes MOVED out of the eviction namespace rather than being flagged
    // in place. They are still on disk, and they are countable.
    expect(fs.existsSync(local)).toBe(false);
    const parked = parkedPath(dir, 2, 'Files/DOOR.DAT');
    expect(fs.readFileSync(parked).length).toBe(120);
    expect(reborn.parkedFiles()).toEqual([{ localPath: parked, driveNumber: 2, key: 'Files/DOOR.DAT' }]);
    // The marker is gone, so no sysop tidying up markers can un-safe it.
    expect(fs.existsSync(markerPath(dir, 2, 'Files/DOOR.DAT'))).toBe(false);
  });

  it('keeps a parked file out of the budget and out of eviction, with no marker holding it', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();
    fs.writeFileSync(local, Buffer.alloc(120, 9));

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    backend.down = false;
    await reborn.flushPending();

    reborn.evictTo(0);

    // Nothing pinned it - the marker was dropped when it moved - and yet
    // eviction cannot touch it, because it is not in the payload namespace.
    expect(fs.existsSync(parkedPath(dir, 2, 'Files/DOOR.DAT'))).toBe(true);
    // And it no longer counts against the cache budget, so it cannot be the
    // reason an operator sees a permanent shortfall.
    expect(reborn.overBudgetBytes()).toBe(0);
  });

  it('parks an unstamped marker on the replay path - the shape a pin-before-write caller produces', async () => {
    const { cache, backend, dir } = setup();
    const local = cache.localPathFor(2, 'Files/EARLY.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });

    // The wrong ordering: pin the path, THEN write it. The marker can carry no
    // stamp, so nothing can ever vouch for the bytes that appear afterwards.
    cache.markDirty(2, 'Files/EARLY.DAT', local);
    fs.writeFileSync(local, Buffer.alloc(400, 5));

    await cache.flushPending();

    expect(backend.puts).toBe(0);
    expect(cache.isDirty(2, 'Files/EARLY.DAT')).toBe(false);
    expect(fs.existsSync(local)).toBe(false);
    expect(fs.readFileSync(parkedPath(dir, 2, 'Files/EARLY.DAT')).length).toBe(400);
  });

  it('never parks over an earlier park of the same key', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });

    // First crash-truncation episode on this key.
    fs.writeFileSync(local, Buffer.alloc(400, 1));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();
    fs.writeFileSync(local, Buffer.alloc(111, 1));
    const first = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    await first.flushPending();

    // A second, later. POSIX rename would replace the first park's bytes
    // silently - bytes that by construction exist nowhere else and whose whole
    // purpose is to wait for a person to look at them.
    fs.writeFileSync(local, Buffer.alloc(400, 2));
    await expect(first.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();
    fs.writeFileSync(local, Buffer.alloc(222, 2));
    const second = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    await second.flushPending();

    const parked = second.parkedFiles();
    expect(parked).toHaveLength(2);
    expect(parked.map((f) => fs.readFileSync(f.localPath).length).sort((a, b) => a - b)).toEqual([111, 222]);
  });

  it('still replays a staged file that matches its marker', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/GOOD.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 3));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/GOOD.DAT', local)).rejects.toThrow();

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    backend.down = false;
    await reborn.flushPending();

    expect((await backend.get('Files/GOOD.DAT')).length).toBe(400);
    expect(reborn.isDirty(2, 'Files/GOOD.DAT')).toBe(false);
    expect(reborn.parkedFiles()).toEqual([]);
  });

  it('review Blocker follow-up: returns how many it attempted and how many are still pending, and logs a summary', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/GOOD.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(10, 3));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/GOOD.DAT', local)).rejects.toThrow();

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const stillDown = await reborn.flushPending();
      expect(stillDown).toEqual({ attempted: 1, stillPending: 1 });
      expect(reborn.pendingCount()).toBe(1);
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes('1 of 1'))).toBe(true);

      backend.down = false;
      const landed = await reborn.flushPending();
      expect(landed).toEqual({ attempted: 1, stillPending: 0 });
      expect(reborn.pendingCount()).toBe(0);
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes('all 1 pending upload'))).toBe(true);
    } finally {
      logSpy.mockRestore();
    }
  });

  it('logs nothing extra when there was nothing pending to begin with', async () => {
    const { cache } = setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      const result = await cache.flushPending();
      expect(result).toEqual({ attempted: 0, stillPending: 0 });
      expect(logSpy.mock.calls.some((c) => String(c[0]).includes('flushPending'))).toBe(false);
    } finally {
      logSpy.mockRestore();
    }
  });
});

describe('FileCache.discardParked', () => {
  async function parkOne(): Promise<{ cache: FileCache; localPath: string; dir: string }> {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();
    fs.writeFileSync(local, Buffer.alloc(120, 9)); // truncated on "restart"

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    await reborn.flushPending(); // parks it - backend is still down
    const [parked] = reborn.parkedFiles();
    return { cache: reborn, localPath: parked.localPath, dir };
  }

  it('deletes the file at the exact localPath parkedFiles() reported', async () => {
    const { cache, localPath } = await parkOne();
    expect(fs.existsSync(localPath)).toBe(true);

    cache.discardParked(localPath);

    expect(fs.existsSync(localPath)).toBe(false);
    expect(cache.parkedFiles()).toEqual([]);
  });

  it('refuses a path outside the parked directory - it must never touch payload or pending', async () => {
    const { cache, dir } = await parkOne();
    const outside = path.join(dir, 'Files', 'DOOR.DAT');
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, 'do not delete me');

    expect(() => cache.discardParked(outside)).toThrow(/parked directory/);
    expect(fs.existsSync(outside)).toBe(true);
  });

  it('refuses a traversal that resolves outside the parked directory', async () => {
    const { cache, dir } = await parkOne();
    const escape = path.join(dir, '.parked', '..', '..', 'escaped');
    expect(() => cache.discardParked(escape)).toThrow(/parked directory/);
  });
});

describe('FileCache.isEvictionDisabled', () => {
  it('is false when the pin record has never had a problem', () => {
    const { cache } = setup();
    cache.evictTo(0);
    expect(cache.isEvictionDisabled()).toBe(false);
  });

  it('turns true the moment the pin record cannot be listed', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    fs.rmSync(path.join(dir, '.pending'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.pending'), ''); // a file where a directory belongs: unreadable, not absent

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    reborn.evictTo(0);
    expect(reborn.isEvictionDisabled()).toBe(true);
  });

  it('re-arms false the moment the record reads again - it is not a sticky latch', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    fs.rmSync(path.join(dir, '.pending'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.pending'), '');

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    reborn.evictTo(0);
    expect(reborn.isEvictionDisabled()).toBe(true);

    fs.unlinkSync(path.join(dir, '.pending'));
    reborn.evictTo(0);
    expect(reborn.isEvictionDisabled()).toBe(false);
  });
});

describe('FileCache marker write failures', () => {
  it('warns but keeps evicting - a full disk must not switch off the remedy', async () => {
    const { cache, backend, dir } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    const clean = await cache.ensureLocal(2, 'Files/CLEAN.LHA');

    // A file where the marker's directory belongs, so every marker write under
    // it fails the way ENOSPC would.
    fs.mkdirSync(path.join(dir, '.pending', '2'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.pending', '2', 'Files'), 'a file, not a directory');

    const local = path.join(dir, 'staged.bin');
    fs.writeFileSync(local, 'precious');
    cache.markDirty(2, 'Files/X.DAT', local);

    // The in-memory record holds it, so it is pinned for this process...
    expect(cache.isDirty(2, 'Files/X.DAT')).toBe(true);
    // ...and eviction keeps running, which is the only thing that can free the
    // disk that caused the failure.
    cache.evictTo(0);
    expect(fs.existsSync(clean)).toBe(false);
    expect(fs.existsSync(local)).toBe(true);
  });
});

describe('FileCache download temp files', () => {
  it('does not evict a download temp this process is still writing', () => {
    const { cache, dir } = setup();
    const tmp = path.join(dir, '2', 'Files', `DEMO.LHA.tmp-${process.pid}-0`);
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, Buffer.alloc(400, 5));

    cache.evictTo(0);

    expect(fs.existsSync(tmp)).toBe(true);
  });

  it('sweeps a download temp left by a process that is gone, and spares a live one', () => {
    const { cache, dir } = setup();
    const orphan = path.join(dir, '2', 'Files', 'DEMO.LHA.tmp-999999-0');
    const live = path.join(dir, '2', 'Files', `OTHER.LHA.tmp-${process.pid}-0`);
    fs.mkdirSync(path.dirname(orphan), { recursive: true });
    fs.writeFileSync(orphan, 'orphaned by a crash');
    fs.writeFileSync(live, 'another node is renaming this');

    // The sweep rides the walk that already visits every payload path, rather
    // than a boot-time walk of its own.
    cache.evictTo(1024);

    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
  });
});

describe('blockOutcome', () => {
  // The decision a bounded deasync wait makes when its loop stops. It takes no
  // clock ON PURPOSE: `done` is set by the fulfil handler AND by the bounding
  // timer, and setTimeout fires when now - start >= N, so Date.now() can read
  // exactly the deadline. Deciding on the clock is wrong in both directions,
  // and the sliver where it goes wrong is a race that cannot be reproduced in
  // wall-clock time - so it is made unreachable instead of tested.
  it('never reports a call that timed out as a value', () => {
    // Nothing settled: `done` was flipped by the timer, not by the work. The
    // clock-reading version returned `result` here - undefined, handed back to
    // a door as a file path.
    expect(blockOutcome(false, false)).toBe('timeout');
  });

  it('never reports work that succeeded as a timeout', () => {
    // The mirror, and the worse one: the upload LANDED - marker removed and
    // bytes charged to the volume - and the clock had just passed the
    // deadline. Reporting that as unavailable tells the door its write failed
    // when it did not.
    expect(blockOutcome(true, false)).toBe('value');
  });

  it('reports a rejection as a failure, ahead of everything else', () => {
    expect(blockOutcome(false, true)).toBe('failure');
  });
});

describe('blockOn is actually wired to blockOutcome', () => {
  /**
   * The unit tests above pin the FUNCTION; they do not pin that blockOn calls
   * it. Reverting the call site to the old `if (!done || Date.now() > deadline)`
   * leaves every behavioural test green, the probe included, because at a real
   * timeout both terms are true in almost every run - the bug only shows in a
   * sliver no test can schedule. So the wiring gets a structural guard, the
   * pattern tests/amiga-emulation/jh-sf-sync-emit.test.ts uses for the same
   * class of unobservable-but-critical ordering.
   */
  const source = fs.readFileSync(path.resolve(__dirname, '../../src/storage/file-cache.ts'), 'utf8');

  function bodyOfBlockOn(): string {
    const method = source.indexOf('private blockOn<T>(');
    expect(method).toBeGreaterThan(-1);
    const endOfMethod = source.indexOf('\n  }\n', method);
    expect(endOfMethod).toBeGreaterThan(-1);
    return source.slice(method, endOfMethod);
  }

  function postLoopBodyOfBlockOn(): string {
    const body = bodyOfBlockOn();
    const afterLoop = body.indexOf('clearTimeout(timer);');
    expect(afterLoop).toBeGreaterThan(-1);
    return body.slice(afterLoop);
  }

  function fulfilArmOfBlockOn(): string {
    const body = bodyOfBlockOn();
    const start = body.indexOf('work.then(');
    expect(start).toBeGreaterThan(-1);
    const rejectArm = body.indexOf('(error: unknown) =>', start);
    expect(rejectArm).toBeGreaterThan(-1);
    return body.slice(start, rejectArm);
  }

  function timerCallbackOfBlockOn(): string {
    const body = bodyOfBlockOn();
    const armed = body.indexOf('setTimeout(');
    expect(armed).toBeGreaterThan(-1);
    const end = body.indexOf('}, this.syncTimeoutMs);', armed);
    expect(end).toBeGreaterThan(-1);
    return body.slice(armed, end);
  }

  it('decides on blockOutcome(succeeded, failed)', () => {
    expect(postLoopBodyOfBlockOn()).toContain('blockOutcome(succeeded, failed)');
  });

  it('consults no clock after the loop', () => {
    // `Date.now()` belongs in the predicate and nowhere after it. Reading it
    // to decide the outcome is the bug this whole guard exists for.
    expect(postLoopBodyOfBlockOn()).not.toContain('Date.now()');
  });

  it('sets succeeded in exactly one place in the whole method', () => {
    // Slicing only the post-loop body let a mutation put `succeeded = true`
    // inside the timer callback and still pass - which is precisely the
    // confusion blockOutcome exists to prevent. The count is over the whole
    // method, so a second assignment anywhere fails.
    const occurrences = bodyOfBlockOn().split('succeeded = true').length - 1;
    expect(occurrences).toBe(1);
  });

  it('sets succeeded inside the fulfil handler, not before the loop', () => {
    // "Exactly one, and not in the timer" still passes if the single
    // assignment is HOISTED to just before loopWhile - which would report
    // every timeout as a value and hand a door `undefined` as a file path.
    expect(fulfilArmOfBlockOn()).toContain('succeeded = true');
  });

  it('never sets succeeded from the bounding timer', () => {
    // The timer means "give up", not "the work landed". A timer that reported
    // success would hand a door `undefined` as a file path, or tell it an
    // upload that never happened had landed.
    expect(timerCallbackOfBlockOn()).not.toContain('succeeded');
  });
});

describe('FileCache shortfall warnings', () => {
  it('warns once about a persistent shortfall, not once per call', async () => {
    const { cache, backend, dir } = setup();
    const dirtyFile = path.join(dir, 'dirty.bin');
    fs.writeFileSync(dirtyFile, Buffer.alloc(400, 2));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DIRTY.DAT', dirtyFile)).rejects.toThrow();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      cache.evictTo(0);
      cache.evictTo(0);
      cache.evictTo(0);
      const overBudget = warn.mock.calls.filter((call) => String(call[0]).includes('over its 0 byte budget'));
      expect(overBudget).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it('says so again when the shortfall clears and comes back', async () => {
    const { cache, backend, dir } = setup();
    const dirtyFile = path.join(dir, 'dirty.bin');
    fs.writeFileSync(dirtyFile, Buffer.alloc(400, 2));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DIRTY.DAT', dirtyFile)).rejects.toThrow();

    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      cache.evictTo(0); // over budget: warns
      cache.evictTo(10_000); // inside budget: clears the latch
      cache.evictTo(0); // over again: worth saying out loud a second time
      const overBudget = warn.mock.calls.filter((call) => String(call[0]).includes('over its 0 byte budget'));
      expect(overBudget).toHaveLength(2);
    } finally {
      warn.mockRestore();
    }
  });
});
