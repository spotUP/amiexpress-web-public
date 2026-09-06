/**
 * Releasing a held file into a pooled area - the sysop's `FM M`, driven
 * through `performMove`.
 *
 * This is the other write path into a file area, and the one that carries the
 * files a caller could not put there directly: anything that failed testFile,
 * anything uploaded private, anything a sysop pulled back for review all sit
 * in HOLD until someone moves them into a DIR. Before this it was a local
 * rename, so a release into a pooled area left the bytes on local disk where
 * nothing the download side builds will ever look - the area's files are
 * resolved through that drive's name index over the area's prefix, and a file
 * that is not an object is not in the area at all.
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
import { locateRemoteFile, materialiseCatalogEntry } from '../../src/storage/remote-download';
import { FakeBackend } from './fake-backend';

/* eslint-disable @typescript-eslint/no-explicit-any */

const HELD_LINE = 'DEMO.ZIP      1024  01-01-26  A held release';

const tempDirs: string[] = [];

interface Harness {
  socket: any;
  session: any;
  ctx: any;
  storage: StorageContext;
  backend: FakeBackend;
  dataDir: string;
  heldFile: string;
  written: () => string;
  recordLocation: jest.Mock;
}

/**
 * A file sitting in Conf1/HOLD with its entry in the HOLD/HELD listing, and
 * conference 1 dir 1 pooled on DRIVE.2 - the state a sysop is in when they
 * release a held upload.
 */
function harness(opts: { storageVolume?: number } = {}): Harness {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-release-'));
  tempDirs.push(dataDir);
  const confDir = path.join(dataDir, 'Conf1');
  fs.mkdirSync(path.join(confDir, 'HOLD'), { recursive: true });
  fs.mkdirSync(path.join(confDir, 'hold'), { recursive: true });
  fs.mkdirSync(path.join(confDir, 'Files'), { recursive: true });

  const heldFile = path.join(confDir, 'HOLD', 'DEMO.ZIP');
  fs.writeFileSync(heldFile, Buffer.from('held payload'));
  const heldListing = path.join(confDir, 'hold', 'held');
  fs.writeFileSync(heldListing, `${HELD_LINE}\r\n`, 'utf-8');

  const out: string[] = [];
  const socket = {
    id: 'socket-fm',
    emit: (event: string, payload: unknown) => {
      if (event === 'ansi-output') out.push(String(payload));
    },
  };

  const recordLocation = jest.fn();
  setFileMaintenanceDependencies({
    db: {
      // getUploadBase reads ULPATH.n out of system_config; without it the
      // LOCAL branch has no destination and moves nothing.
      // The key it is looking for travels as a PARAMETER, not in the SQL.
      query: async (_sql: string, params?: unknown[]) =>
        String(params?.[0]) === 'ULPATH'
          ? { rows: [{ value: path.join(dataDir, 'Conf1', 'Files') }] }
          : { rows: [] },
      recordLocation,
    },
    config: { get: (key: string) => (key === 'dataDir' ? dataDir : undefined) },
  });

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
    { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: opts.storageVolume },
  ];
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hold-release-cache-'));
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
      dirFilePath: heldListing,
      // dirNum -1 is the HOLD listing (getDirMeta), which is where a held
      // upload's entry lives until it is released.
      dirNum: -1,
      maxDirs: 1,
      currentFile: { filename: 'DEMO.ZIP', lineNumber: 0, rawLines: [HELD_LINE] },
    },
    storage,
    backend,
    dataDir,
    heldFile,
    written: () => out.join(''),
    recordLocation,
  };
}

const performMove = (h: Harness, destDir: number): Promise<void> =>
  (FileMaintenanceHandler as any).performMove(h.socket, h.session, h.ctx, destDir);

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

describe('releasing a HOLD file into a pooled area', () => {
  it('puts the object rather than renaming it onto local disk', async () => {
    const h = harness({ storageVolume: 2 });

    await performMove(h, 1);

    expect((await h.backend.get('Conf1/Files/DEMO.ZIP')).toString()).toBe('held payload');
    expect(fs.existsSync(h.heldFile)).toBe(false);
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'Files', 'DEMO.ZIP'))).toBe(false);
    expect(h.written()).toContain('Move operation successful');
  });

  it('makes the released file findable the way a download looks for it', async () => {
    const h = harness({ storageVolume: 2 });

    await performMove(h, 1);

    const found = await locateRemoteFile('DEMO.ZIP', 1, h.storage);
    expect(found.files).toHaveLength(1);
    expect(found.files[0].size).toBe('held payload'.length);
  });

  it('says so, and moves nothing, when the pool cannot be reached', async () => {
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;

    await performMove(h, 1);

    expect(h.written()).toContain('DRIVE.2 is unavailable - try again later');
    expect(h.written()).not.toContain('Move operation successful');
    // The bytes stay in HOLD, and the listings still say HOLD - a listing that
    // moved without its file is a file the area advertises and cannot serve.
    expect(fs.existsSync(h.heldFile)).toBe(true);
    expect(fs.readFileSync(h.ctx.dirFilePath, 'utf-8')).toContain('DEMO.ZIP');
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'DIR1'))).toBe(false);
  });

  it('still renames on local disk when the destination area is not pooled', async () => {
    const h = harness({});

    await performMove(h, 1);

    expect(h.backend.puts).toBe(0);
    expect(fs.existsSync(h.heldFile)).toBe(false);
    expect(fs.readFileSync(path.join(h.dataDir, 'Conf1', 'DIR1'), 'utf-8')).toContain('DEMO.ZIP');
  });

  describe('finding 4: the catalog learns where the release put the object', () => {
    it('calls recordLocation with the drive and key the object actually landed at', async () => {
      const h = harness({ storageVolume: 2 });

      await performMove(h, 1);

      expect(h.recordLocation).toHaveBeenCalledWith('DEMO.ZIP', 1, 2, 'Conf1/Files/DEMO.ZIP');
    });

    it('makes the released file reachable by the SAME function the by-id download route calls, end to end', async () => {
      // routes-setup.ts's `/api/download/:fileId` resolves a pooled catalog
      // row through materialiseCatalogEntry - never a local disk walk. This
      // proves the chain performMove -> recordLocation -> a catalog row ->
      // materialiseCatalogEntry actually connects, the exact path that used
      // to read a NULL storage_volume and 404 a file sitting in the bucket.
      const h = harness({ storageVolume: 2 });

      await performMove(h, 1);

      const [, , driveNumber, objectKey] = h.recordLocation.mock.calls[0];
      const catalogRow = { storageVolume: driveNumber, objectKey };

      const remote = await materialiseCatalogEntry(catalogRow, h.storage);
      expect(remote).not.toBeNull();
      expect(fs.readFileSync(remote!.fullPath, 'utf8')).toBe('held payload');
    });

    it('does not fail the move when recordLocation cannot find a matching row - the bytes already landed', async () => {
      const h = harness({ storageVolume: 2 });
      h.recordLocation.mockImplementation(() => {
        throw new Error('recordLocation: no file_entries row for filename "DEMO.ZIP" in area 1');
      });

      await performMove(h, 1);

      // The object is still safely in the pool and the move still reports
      // success - only the catalog's cross-reference is missing, which is a
      // pre-existing, separate gap (see the file's own comment), not a
      // reason to strand a file that DID reach the bucket.
      expect((await h.backend.get('Conf1/Files/DEMO.ZIP')).toString()).toBe('held payload');
      expect(fs.existsSync(h.heldFile)).toBe(false);
      expect(h.written()).toContain('Move operation successful');
    });
  });
});
