import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileCache } from '../../src/storage/file-cache';
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

    // A new process, same cache directory and same journal.
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

describe('FileCache journal sharing', () => {
  it('one node saving the journal never drops another node pending upload', async () => {
    const { cache, backend, dir, volumes } = setup();
    // A second node on the same board, holding the same cache directory. It
    // booted before the first node dirtied anything, so its in-memory map
    // does not know about K1.
    const other = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });

    const one = path.join(dir, 'node1.bin');
    const two = path.join(dir, 'node2.bin');
    fs.writeFileSync(one, 'node-one-write');
    fs.writeFileSync(two, 'node-two-write');

    backend.down = true;
    await expect(cache.writeBack(2, 'Files/K1.DAT', one)).rejects.toThrow();
    await expect(other.writeBack(2, 'Files/K2.DAT', two)).rejects.toThrow();

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.pending.json'), 'utf8')) as Array<{ key: string }>;
    expect(onDisk.map((e) => e.key).sort()).toEqual(['Files/K1.DAT', 'Files/K2.DAT']);

    // And when the second node's own upload finally lands, it removes only
    // its own entry.
    backend.down = false;
    await other.writeBack(2, 'Files/K2.DAT', two);

    const after = JSON.parse(fs.readFileSync(path.join(dir, '.pending.json'), 'utf8')) as Array<{ key: string }>;
    expect(after.map((e) => e.key)).toEqual(['Files/K1.DAT']);
  });

  it('survives a corrupt journal rather than refusing to boot', async () => {
    const { dir, volumes } = setup();
    fs.writeFileSync(path.join(dir, '.pending.json'), '{ this is not json');

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    await expect(reborn.flushPending()).resolves.toBeUndefined();
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

  it('never evicts a file it could not fetch again', async () => {
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

describe('FileCache pins that outlive the journal', () => {
  it('deletes nothing at all when the journal is corrupt, even a staged file with no marker', async () => {
    const { cache, backend, dir, volumes } = setup();
    // The shape Task 10 produces: staged at the cache path, upload failed.
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    // A torn write leaves the journal unparseable, and the marker is gone too,
    // so NOTHING records that these bytes are not in the pool. The file still
    // sits at <drive>/<key>, which is exactly the shape evictTo would
    // otherwise call a clean, re-fetchable copy.
    fs.writeFileSync(path.join(dir, '.pending.json'), '{ this is not json');
    fs.unlinkSync(`${local}.dirty`);

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    expect(reborn.isEvictionDisabled()).toBe(true);

    reborn.evictTo(0);

    expect(fs.existsSync(local)).toBe(true);
  });

  it('recovers a pending upload from its sidecar marker when the journal is gone', async () => {
    const { cache, backend, dir, volumes } = setup();
    const local = cache.localPathFor(2, 'Files/DOOR.DAT');
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.alloc(400, 9));
    backend.down = true;
    await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();

    // Another node clobbered the journal. Only the per-file marker is left.
    fs.unlinkSync(path.join(dir, '.pending.json'));

    const reborn = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    // An absent journal is not a corrupt one - eviction still runs.
    expect(reborn.isEvictionDisabled()).toBe(false);
    // And the marker did more than protect the bytes: it restored the retry.
    expect(reborn.isDirty(2, 'Files/DOOR.DAT')).toBe(true);

    reborn.evictTo(0);
    expect(fs.existsSync(local)).toBe(true);

    backend.down = false;
    await reborn.flushPending();
    expect((await backend.get('Files/DOOR.DAT')).length).toBe(400);
    expect(fs.existsSync(`${local}.dirty`)).toBe(false);
  });

  it('will not evict a file carrying a sidecar marker', async () => {
    const { cache, backend } = setup();
    await backend.put('Files/CLEAN.LHA', Buffer.alloc(400, 1));
    const clean = await cache.ensureLocal(2, 'Files/CLEAN.LHA');
    // A marker left by some other writer - this instance knows nothing of it.
    fs.writeFileSync(
      `${clean}.dirty`,
      JSON.stringify({ driveNumber: 2, key: 'Files/CLEAN.LHA', localPath: clean })
    );

    cache.evictTo(0);

    expect(fs.existsSync(clean)).toBe(true);
  });

  it('removes the marker once the upload lands', async () => {
    const { cache, dir } = setup();
    const local = path.join(dir, 'staged-then-sent.bin');
    fs.writeFileSync(local, 'sent');

    await cache.writeBack(2, 'Files/SENT.DAT', local);

    expect(fs.existsSync(`${local}.dirty`)).toBe(false);
  });
});

describe('FileCache journal merge does not suppress a later re-dirty', () => {
  it('keeps a second node re-staging of a key this node already uploaded', async () => {
    const { cache, backend, dir, volumes } = setup();
    const first = path.join(dir, 'first.bin');
    fs.writeFileSync(first, 'one');
    await cache.writeBack(2, 'Files/K.DAT', first); // this node resolves 2:Files/K.DAT

    // A second node stages the SAME key again later and journals it.
    const other = new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });
    const second = path.join(dir, 'second.bin');
    fs.writeFileSync(second, 'two');
    backend.down = true;
    await expect(other.writeBack(2, 'Files/K.DAT', second)).rejects.toThrow();

    // The first node saves its journal again, for an unrelated key. A durable
    // "already resolved" set would silently delete the second node only copy
    // record here.
    const third = path.join(dir, 'third.bin');
    fs.writeFileSync(third, 'three');
    await expect(cache.writeBack(2, 'Files/OTHER.DAT', third)).rejects.toThrow();

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, '.pending.json'), 'utf8')) as Array<{ key: string }>;
    expect(onDisk.map((e) => e.key).sort()).toEqual(['Files/K.DAT', 'Files/OTHER.DAT']);
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
    const { dir, volumes } = setup();
    const orphan = path.join(dir, '2', 'Files', 'DEMO.LHA.tmp-999999-0');
    const live = path.join(dir, '2', 'Files', `OTHER.LHA.tmp-${process.pid}-0`);
    fs.mkdirSync(path.dirname(orphan), { recursive: true });
    fs.writeFileSync(orphan, 'orphaned by a crash');
    fs.writeFileSync(live, 'another node is renaming this');

    new FileCache({ cacheDir: dir, volumes, maxBytes: 1024 });

    expect(fs.existsSync(orphan)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
  });
});
