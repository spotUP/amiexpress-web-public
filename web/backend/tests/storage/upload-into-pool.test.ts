/**
 * An upload finishing on a pooled area, driven through `processBatchFile` -
 * the function the ZMODEM/web upload pipeline actually calls when the bytes
 * have landed in the playpen.
 *
 * The entry point matters more than usual here. The move into the area is one
 * `await` in the middle of a 500-line function that also extracts FILE_ID.DIZ,
 * tests the archive, writes the DIR entry and inserts the catalog row - and
 * the ORDER of those against the put is the whole behaviour: the DIZ is read
 * from the local copy, the catalog row carries the object's location, and the
 * playpen copy only disappears once the bytes are in the bucket. A unit test
 * around a `placeUpload` helper proves none of that; revert the call site and
 * it stays green.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import AdmZip = require('adm-zip');

/* eslint-disable @typescript-eslint/no-explicit-any */

const createdEntries: any[] = [];
const recordedLocations: Array<[string, number, number, string]> = [];
let duplicateRows: any[] = [];

const mockDb = {
  query: jest.fn(async (sql: string) => {
    if (/FROM file_entries/i.test(sql)) return { rows: duplicateRows };
    return { rows: [] };
  }),
  createFileEntry: jest.fn(async (entry: any) => {
    createdEntries.push(entry);
    return createdEntries.length;
  }),
  recordLocation: jest.fn((filename: string, areaId: number, drive: number, key: string) => {
    recordedLocations.push([filename, areaId, drive, key]);
    if (duplicateRows.length === 0) {
      throw new Error(`recordLocation: no file_entries row for filename "${filename}" in area ${areaId}`);
    }
  }),
  run: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: false }) }),
  getConferences: jest.fn(async () => []),
  updateConference: jest.fn(async () => undefined),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
};

// The factory runs while the imports below are still being hoisted, so it
// cannot close over `mockDb` directly - it reads it through globalThis at
// call time instead.
(globalThis as any).__uploadMockDb = mockDb;
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__uploadMockDb[prop] }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));

import { processBatchFile } from '../../src/server/file-socket-handlers';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { locateRemoteFile } from '../../src/storage/remote-download';
import { config } from '../../src/config';
import { FakeBackend } from './fake-backend';

interface Harness {
  socket: any;
  session: any;
  data: { filename: string; originalname: string; size: number; path: string };
  playpenFile: string;
  backend: FakeBackend;
  ctx: StorageContext;
  written: () => string;
  dataDir: string;
}

let restoreConfig: (() => void) | null = null;
const tempDirs: string[] = [];

/** A real ZIP carrying a FILE_ID.DIZ, sitting in the node playpen. */
function stageUpload(dataDir: string, filename: string, diz: string): string {
  const playpen = path.join(dataDir, 'Node1', 'Playpen');
  fs.mkdirSync(playpen, { recursive: true });
  const zip = new AdmZip();
  zip.addFile('FILE_ID.DIZ', Buffer.from(diz));
  zip.addFile('payload.bin', Buffer.from('payload'));
  const full = path.join(playpen, filename);
  zip.writeZip(full);
  return full;
}

function harness(opts: { storageVolume?: number; filename?: string } = {}): Harness {
  const filename = opts.filename ?? 'DEMO.ZIP';
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-pool-'));
  tempDirs.push(dataDir);
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });

  const original = config.get.bind(config);
  const spy = jest
    .spyOn(config, 'get')
    .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  restoreConfig = () => spy.mockRestore();

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
  const fileArea = {
    id: 1,
    conferenceId: 1,
    dirNumber: 1,
    name: 'Conf1 - Dir 1',
    dlPath: 'BBS:Conf1/Files/',
    ulPath: 'BBS:Conf1/Files/',
    storageVolume: opts.storageVolume,
  };
  const areas: RemoteArea[] = [
    {
      id: 1,
      conferenceId: 1,
      dirNumber: 1,
      path: 'BBS:Conf1/Files/',
      storageVolume: opts.storageVolume,
    },
  ];
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-cache-'));
  tempDirs.push(cacheDir);
  const ctx: StorageContext = {
    volumes,
    cache: new FileCache({ cacheDir, volumes, maxBytes: 4 * 1024 * 1024 }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
  setStorageContext(ctx);

  const playpenFile = stageUpload(dataDir, filename, 'A pooled release\nSecond line');
  const out: string[] = [];

  const session: any = {
    user: { id: 1, username: 'tester', securityFlags: 'T'.repeat(100), secLibrary: 0 },
    currentConf: 1,
    nodeId: 1,
    tempData: {
      uploadMode: true,
      fileArea,
      uploadSessionId: 'sess-1',
      uploadBatch: [{ filename, description: '', isPrivate: false }],
      uploadCount: 1,
      currentUploadIndex: 0,
      uploadStartTime: Date.now(),
      webUploadMode: true,
      pendingZmodemFiles: [],
    },
  };

  return {
    socket: {
      id: 'socket-1',
      emit: (event: string, payload: unknown) => {
        if (event === 'ansi-output') out.push(String(payload));
      },
    },
    session,
    data: {
      filename,
      originalname: filename,
      size: fs.statSync(playpenFile).size,
      path: playpenFile,
    },
    playpenFile,
    backend,
    ctx,
    written: () => out.join(''),
    dataDir,
  };
}

beforeEach(() => {
  createdEntries.length = 0;
  recordedLocations.length = 0;
  duplicateRows = [];
  jest.clearAllMocks();
});

afterEach(() => {
  setStorageContext(null);
  restoreConfig?.();
  restoreConfig = null;
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

describe('an upload into a pooled area', () => {
  it('puts the object under the area prefix and removes the playpen copy', async () => {
    const h = harness({ storageVolume: 2 });

    await processBatchFile(h.socket, h.session, h.data, config);

    const body = await h.backend.get('Conf1/Files/DEMO.ZIP');
    expect(body.length).toBe(h.data.size);
    expect(fs.existsSync(h.playpenFile)).toBe(false);
    // The local area directory stays empty: the bytes live in the pool.
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'Files', 'DEMO.ZIP'))).toBe(false);
  });

  it('records the drive and the object key on the catalog row it creates', async () => {
    const h = harness({ storageVolume: 2 });

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(createdEntries).toHaveLength(1);
    expect(createdEntries[0]).toMatchObject({
      filename: 'DEMO.ZIP',
      storageVolume: 2,
      objectKey: 'Conf1/Files/DEMO.ZIP',
    });
  });

  it('reads FILE_ID.DIZ off the local copy before the object goes up', async () => {
    const h = harness({ storageVolume: 2 });

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(createdEntries[0].description).toContain('A pooled release');
  });

  it('notes the new object with its size, so the next listing does not read 0 bytes', async () => {
    const h = harness({ storageVolume: 2 });
    // Prime the area's index the way a caller browsing the area would, so the
    // listing below is the upload's doing and not the index's first look.
    await locateRemoteFile('DEMO.ZIP', 1, h.ctx);
    const listsBefore = h.backend.lists;

    await processBatchFile(h.socket, h.session, h.data, config);

    const found = await locateRemoteFile('DEMO.ZIP', 1, h.ctx);
    expect(found.files).toHaveLength(1);
    // The real byte count, not the 0 an un-sized note() would leave behind -
    // a listing must not have to fetch the body to learn how big it is.
    expect(found.files[0].size).toBe(h.data.size);
    // And answered from the index the upload maintained: no fresh listing.
    expect(h.backend.lists).toBe(listsBefore);
  });

  it('leaves the playpen copy and the catalog location alone when the volume refuses the put', async () => {
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(fs.existsSync(h.playpenFile)).toBe(true);
    expect(h.backend.puts).toBe(0);
    expect(createdEntries[0]?.storageVolume).toBeUndefined();
    expect(createdEntries[0]?.objectKey).toBeUndefined();
    expect(h.written()).toContain('DRIVE.2');
  });

  it('renames into the local area, untouched, when the area is not pooled', async () => {
    const h = harness({});

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'Files', 'DEMO.ZIP'))).toBe(true);
    expect(fs.existsSync(h.playpenFile)).toBe(false);
    expect(h.backend.puts).toBe(0);
    expect(createdEntries[0]?.storageVolume).toBeUndefined();
  });

  it('points an existing catalog row at the object when the upload is a duplicate', async () => {
    const h = harness({ storageVolume: 2 });
    duplicateRows = [{ id: 7, filename: 'DEMO.ZIP' }];

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(createdEntries).toHaveLength(0); // duplicates insert no row
    expect(recordedLocations).toEqual([['DEMO.ZIP', 1, 2, 'Conf1/Files/DEMO.ZIP']]);
  });

  it('survives a catalog row that cannot be matched - the object is still in the pool', async () => {
    const h = harness({ storageVolume: 2 });
    // A row exists (so no INSERT happens) but its filename spelling differs,
    // which is what makes recordLocation throw.
    duplicateRows = [{ id: 7, filename: 'demo.zip' }];
    mockDb.recordLocation.mockImplementationOnce(() => {
      throw new Error('recordLocation: no file_entries row for filename "DEMO.ZIP" in area 1');
    });

    await processBatchFile(h.socket, h.session, h.data, config);

    expect((await h.backend.get('Conf1/Files/DEMO.ZIP')).length).toBe(h.data.size);
    expect(h.written()).not.toContain('Upload failed');
  });
});
