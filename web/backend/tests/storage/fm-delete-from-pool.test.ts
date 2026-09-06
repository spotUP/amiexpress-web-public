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
function harness(opts: { retentionDays?: number } = {}): Harness {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fm-delete-'));
  tempDirs.push(dataDir);
  const confDir = path.join(dataDir, 'Conf1');
  fs.mkdirSync(confDir, { recursive: true });

  const dirFilePath = path.join(confDir, 'DIR1');
  fs.writeFileSync(dirFilePath, `${DIR_LINE}\r\n`, 'utf-8');

  const out: string[] = [];
  const socket = {
    id: 'socket-fm-delete',
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
    },
  };

  setFileMaintenanceDependencies({
    db: { query: async () => ({ rows: [] }) },
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
      currentFile: { filename: 'DEMO.LHA', lineNumber: 0, rawLines: [DIR_LINE] },
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
