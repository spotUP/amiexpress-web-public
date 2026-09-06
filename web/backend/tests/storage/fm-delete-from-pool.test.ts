/**
 * Whole-branch review finding 5: a sysop's `FM D` on a pooled area's file
 * only unlinked LOCAL candidates (HOLD/LCFILES/DIRn/DLPATH/ULPATH - see
 * `buildFileCandidates`), none of which exist for an object that lives in a
 * bucket. The DIR line went; the object did not - it still resolved, still
 * served through `D` and both HTTP download routes, and still consumed
 * quota. Driven through the real FM D entry point, `performDelete`.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  FileMaintenanceHandler,
  setFileMaintenanceDependencies,
} from '../../src/handlers/file/file-maintenance.handler';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { locateRemoteFile } from '../../src/storage/remote-download';
import { FileRepository } from '../../src/database/file-repository';
import { FakeBackend } from './fake-backend';

/* eslint-disable @typescript-eslint/no-explicit-any */

const DIR_LINE = 'DEMO.LHA      1024  01-01-26  A pooled file';
const tempDirs: string[] = [];

interface Harness {
  socket: any;
  session: any;
  ctx: any;
  storage: StorageContext;
  backend: FakeBackend;
  dataDir: string;
  dirFilePath: string;
  written: () => string;
}

/** Conference 1, dir 1 pooled on DRIVE.2, with one file already in the bucket. */
function harness(opts: { retentionDays?: number; filename?: string; db?: any } = {}): Harness {
  const filename = opts.filename ?? 'DEMO.LHA';
  const dirLine = DIR_LINE.replace('DEMO.LHA', filename);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-delete-'));
  tempDirs.push(dataDir);
  const confDir = path.join(dataDir, 'Conf1');
  fs.mkdirSync(confDir, { recursive: true });

  const dirFilePath = path.join(confDir, 'DIR1');
  fs.writeFileSync(dirFilePath, `${dirLine}\r\n`, 'utf-8');

  const out: string[] = [];
  const socket = {
    id: 'socket-fm-delete',
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
    },
  };

  setFileMaintenanceDependencies({
    db: opts.db ?? { query: async () => ({ rows: [] }) },
    config: { get: (key: string) => (key === 'dataDir' ? dataDir : undefined) },
  });

  const backend = new FakeBackend({ driveNumber: 2 });
  const state: VolumeState = {
    volume: {
      driveNumber: 2,
      kind: 's3',
      path: 'bucket',
      egress: 'FREE',
      volumeClass: 'FREE',
      retentionDays: opts.retentionDays,
    },
    backend,
    usedBytes: 0,
    requestsThisMonth: 0,
    egressBytesThisMonth: 0,
    degraded: false,
  };
  const volumes = new VolumeSet([state]);
  const areas: RemoteArea[] = [
    { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
  ];
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-delete-cache-'));
  tempDirs.push(cacheDir);
  const storage: StorageContext = {
    volumes,
    cache: new FileCache({ cacheDir, volumes, maxBytes: 1024 * 1024 }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
  setStorageContext(storage);

  return {
    socket,
    session: { user: { id: 1, username: 'sysop' }, currentConf: 1, nodeId: 1 },
    ctx: {
      dirFilePath,
      dirNum: 1,
      maxDirs: 1,
      currentFile: { filename, lineNumber: 0, rawLines: [dirLine] },
    },
    storage,
    backend,
    dataDir,
    dirFilePath,
    written: () => out.join(''),
  };
}

const performDelete = (h: Harness): Promise<void> =>
  (FileMaintenanceHandler as any).performDelete(h.socket, h.session, h.ctx);

afterEach(() => {
  setStorageContext(null);
});

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('deleting a file from a pooled area', () => {
  it('removes the object from the bucket, not only the DIR line', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await performDelete(h);

    expect(fs.readFileSync(h.dirFilePath, 'utf-8')).not.toContain('DEMO.LHA');
    await expect(h.backend.get('Conf1/Files/DEMO.LHA')).rejects.toThrow();
    expect(h.written()).toContain('Delete operation complete');
  });

  it('drops it from the pool name index too, so a listing does not have to wait on a re-list', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    // Prime the index before deleting - the defect this guards against is a
    // cached index entry outliving the delete.
    const before = await locateRemoteFile('DEMO.LHA', 1, h.storage);
    expect(before.files).toHaveLength(1);

    await performDelete(h);

    const after = await locateRemoteFile('DEMO.LHA', 1, h.storage);
    expect(after.files).toHaveLength(0);
  });

  it('drops a locally cached copy too, so a stale hit does not keep serving it', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    const cachedPath = await h.storage.cache.ensureLocal(2, 'Conf1/Files/DEMO.LHA');
    expect(fs.existsSync(cachedPath)).toBe(true);

    await performDelete(h);

    expect(fs.existsSync(cachedPath)).toBe(false);
  });

  it('never deletes a staged, un-uploaded copy - the only-copy invariant beats a delete command too', async () => {
    const h = harness();
    // A door's write the volume has not accepted yet - not what the sysop
    // asked to delete, and the only copy of it in existence.
    const staged = h.storage.cache.localPathFor(2, 'Conf1/Files/DEMO.LHA');
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.writeFileSync(staged, 'not yet uploaded');
    h.backend.down = true;
    await expect(h.storage.cache.writeBack(2, 'Conf1/Files/DEMO.LHA', staged)).rejects.toThrow();
    h.backend.down = false;

    await performDelete(h);

    expect(fs.existsSync(staged)).toBe(true);
    expect(h.storage.cache.isDirty(2, 'Conf1/Files/DEMO.LHA')).toBe(true);
  });

  it('warns about a RETENTION-bound volume rather than implying the delete is unconditionally final', async () => {
    const h = harness({ retentionDays: 90 });
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await performDelete(h);

    expect(h.written()).toContain('90-day RETENTION');
  });

  it('says nothing extra for a volume with no RETENTION policy', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    await performDelete(h);

    expect(h.written()).not.toContain('RETENTION');
  });

  it('still deletes locally when the area is not pooled', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-delete-local-'));
    tempDirs.push(dataDir);
    const confDir = path.join(dataDir, 'Conf1');
    fs.mkdirSync(path.join(confDir, 'DIR1'), { recursive: true });
    const localFile = path.join(confDir, 'DIR1', 'DEMO.LHA');
    fs.writeFileSync(localFile, 'a local file');
    const dirFilePath = path.join(confDir, 'DIR1FILE');
    fs.writeFileSync(dirFilePath, `${DIR_LINE}\r\n`, 'utf-8');

    setFileMaintenanceDependencies({
      db: { query: async () => ({ rows: [] }) },
      config: { get: (key: string) => (key === 'dataDir' ? dataDir : undefined) },
    });
    setStorageContext(null);

    const out: string[] = [];
    const socket = {
      emit: (event: string, payload: unknown) => {
        if (event === 'ansi-output') out.push(String(payload));
      },
    };
    const session = { user: { id: 1, username: 'sysop' }, currentConf: 1, nodeId: 1 } as any;
    const ctx = {
      dirFilePath,
      dirNum: 1,
      maxDirs: 1,
      currentFile: { filename: 'DEMO.LHA', lineNumber: 0, rawLines: [DIR_LINE] },
    };

    await (FileMaintenanceHandler as any).performDelete(socket, session, ctx);

    expect(fs.existsSync(localFile)).toBe(false);
    expect(out.join('')).toContain('Delete operation complete');
  });
});

/**
 * Gate 2, blocker 4: `uploadObjectKey` rebuilds the key from the DIR line's
 * spelling, but the name index `D` reads through matches case-insensitively
 * (`byLowerName`). For an object whose real key differs in case from its DIR
 * line - a hand-edited DIR file, a bucket migrated in from elsewhere - the
 * reconstructed key names nothing: the S3 DELETE of a missing key succeeds,
 * `forget` matches nothing, the DIR line goes, and the sysop is told
 * "Delete operation complete" while `D` still serves the file. Finding 5's
 * bug, back on a narrower trigger.
 */
describe('an object whose key does not match the DIR line letter for letter', () => {
  it('is really deleted - the key is resolved the way D resolves it, not rebuilt', async () => {
    const h = harness();
    // The DIR line says DEMO.LHA; the bucket holds demo.lha.
    await h.backend.put('Conf1/Files/demo.lha', Buffer.from('payload'));

    await performDelete(h);

    await expect(h.backend.get('Conf1/Files/demo.lha')).rejects.toThrow();
  });

  it('stops being findable through D, which is the index that found it in the first place', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/demo.lha', Buffer.from('payload'));
    const before = await locateRemoteFile('DEMO.LHA', 1, h.storage);
    expect(before.files).toHaveLength(1);

    await performDelete(h);

    const after = await locateRemoteFile('DEMO.LHA', 1, h.storage);
    expect(after.files).toHaveLength(0);
  });

  it('falls back to the rebuilt key when the volume cannot answer - an outage is not an absence', async () => {
    const h = harness();
    await h.backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    // Prime nothing; the first resolve() this delete attempts will fail.
    h.backend.down = true;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await performDelete(h);
      const said = errorSpy.mock.calls.map((call) => String(call[0])).join('\n');
      expect(said).toMatch(/could not resolve DEMO\.LHA/);
      // It still ATTEMPTED the delete rather than concluding there was
      // nothing to remove - the object is untouched only because the volume
      // is down, and the failure was reported.
      expect(said).toMatch(/could not delete DEMO\.LHA/);
    } finally {
      errorSpy.mockRestore();
    }
    h.backend.down = false;
    await expect(h.backend.get('Conf1/Files/DEMO.LHA')).resolves.toBeDefined();
  });
});

/**
 * Gate 2, blocker 3: a pooled delete never credited quota back. Nothing
 * anywhere subtracted from `usedBytes` - the only writes were the `+=` in
 * `FileCache.writeBack` and the boot seed that reads the catalog's own SUM -
 * and the catalog row kept its `storage_volume`, so `usedBytesByVolume()`
 * went on counting the deleted bytes and the next rebuild re-seeded
 * `usedBytes` with them. On a drive with `DRIVE.n.QUOTA` set, `roomOn` is
 * `quota - usedBytes`: monotonically non-decreasing across deletes, so
 * delete-and-reupload churn walks a QUOTA'd drive to "full" and refuses
 * uploads to a bucket with room.
 *
 * These run against the REAL `FileRepository` on the real schema, so the
 * figure asserted is `usedBytesByVolume`'s own query, not a reimplementation
 * of it in a fake.
 */
describe('the quota a pooled delete gives back', () => {
  const SIZE = 5000;
  const DRIVE = 2;

  async function realRepo(): Promise<{ repo: FileRepository; raw: any }> {
    let attempts = 0;
    while (!(global as any).testDb && attempts < 30) {
      await new Promise((r) => setTimeout(r, 200));
      attempts++;
    }
    const db = (global as any).testDb;
    if (!db) throw new Error('Test database not initialized');
    const raw = (db as any).db;
    return { repo: new FileRepository(raw), raw };
  }

  /** A catalog row for `filename` in area 1, already recorded onto DRIVE.2. */
  function catalogued(raw: any, repo: FileRepository, filename: string): void {
    raw
      .prepare('INSERT INTO file_entries (filename, size, uploader, areaid) VALUES (?, ?, ?, ?)')
      .run(filename, SIZE, 'sysop', 1);
    repo.recordLocation(filename, 1, DRIVE, `Conf1/Files/${filename}`);
  }

  it('stops being counted by usedBytesByVolume - the figure the next boot re-seeds from', async () => {
    const { repo, raw } = await realRepo();
    const filename = `CREDIT_${Date.now()}.LHA`;
    const empty = repo.usedBytesByVolume().get(DRIVE) ?? 0;
    catalogued(raw, repo, filename);
    expect(repo.usedBytesByVolume().get(DRIVE)).toBe(empty + SIZE);

    const h = harness({ filename, db: { query: async () => ({ rows: [] }), clearLocation: (f: string, a: number) => repo.clearLocation(f, a) } });
    await h.backend.put(`Conf1/Files/${filename}`, Buffer.alloc(SIZE, 1));

    await performDelete(h);

    expect(repo.usedBytesByVolume().get(DRIVE) ?? 0).toBe(empty);
  });

  it('comes back on the in-process counter too, so the gate sees it before any rebuild', async () => {
    const { repo, raw } = await realRepo();
    const filename = `INPROC_${Date.now()}.LHA`;
    catalogued(raw, repo, filename);

    const h = harness({ filename, db: { query: async () => ({ rows: [] }), clearLocation: (f: string, a: number) => repo.clearLocation(f, a) } });
    await h.backend.put(`Conf1/Files/${filename}`, Buffer.alloc(SIZE, 1));
    // The state a boot seeded from the catalog, with a QUOTA that this one
    // file all but fills.
    const state = h.storage.volumes.byNumber(DRIVE)!;
    state.volume.quotaBytes = SIZE + 100;
    state.usedBytes = SIZE;
    expect(h.storage.volumes.freeBytesOn(DRIVE)).toBe(100);

    await performDelete(h);

    expect(state.usedBytes).toBe(0);
    expect(h.storage.volumes.freeBytesOn(DRIVE)).toBe(SIZE + 100);
  });

  it('survives delete-and-reupload churn instead of walking the drive to full', async () => {
    const { repo, raw } = await realRepo();
    const h = harness({
      filename: 'CHURN.LHA',
      db: { query: async () => ({ rows: [] }), clearLocation: (f: string, a: number) => repo.clearLocation(f, a) },
    });
    const state = h.storage.volumes.byNumber(DRIVE)!;
    state.volume.quotaBytes = SIZE * 2;

    for (let round = 0; round < 4; round++) {
      const staged = path.join(h.dataDir, `churn-${round}.bin`);
      fs.writeFileSync(staged, Buffer.alloc(SIZE, round + 1));
      await h.storage.cache.writeBack(DRIVE, 'Conf1/Files/CHURN.LHA', staged);
      expect(state.usedBytes).toBe(SIZE);

      fs.writeFileSync(h.dirFilePath, `${DIR_LINE.replace('DEMO.LHA', 'CHURN.LHA')}\r\n`, 'utf-8');
      await performDelete(h);
      // Before this fix usedBytes only ever grew: 5000, 10000, 15000, 20000,
      // and the third upload would have been refused by a drive with room.
      expect(state.usedBytes).toBe(0);
      expect(h.storage.volumes.freeBytesOn(DRIVE)).toBe(SIZE * 2);
    }
  });

  it('credits nothing back when the delete itself failed - the bytes are still there', async () => {
    const { repo, raw } = await realRepo();
    const filename = `FAILED_${Date.now()}.LHA`;
    catalogued(raw, repo, filename);

    const h = harness({ filename, db: { query: async () => ({ rows: [] }), clearLocation: (f: string, a: number) => repo.clearLocation(f, a) } });
    await h.backend.put(`Conf1/Files/${filename}`, Buffer.alloc(SIZE, 1));
    const state = h.storage.volumes.byNumber(DRIVE)!;
    state.usedBytes = SIZE;
    h.backend.down = true;
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await performDelete(h);
    } finally {
      errorSpy.mockRestore();
      h.backend.down = false;
    }

    expect(state.usedBytes).toBe(SIZE);
    // The row still names the drive: these bytes really are still on it.
    const row = raw
      .prepare('SELECT storage_volume, object_key FROM file_entries WHERE filename = ? AND areaid = 1')
      .get(filename) as { storage_volume: number | null; object_key: string | null };
    expect(row.storage_volume).toBe(DRIVE);
    expect(row.object_key).toBe(`Conf1/Files/${filename}`);
  });
});
