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

// Same deferred-lookup trick as __uploadMockDb above, for one test that needs
// the fallback HOLD quarantine move (called from the pooled-put failure
// catch block) to fail on its own. `null` means "use the real
// implementation" - every other test in this file exercises the genuine
// move.
(globalThis as any).__moveUploadedFileOverride = null;
jest.mock('../../src/utils/file-hold.util', () => {
  const actual = jest.requireActual('../../src/utils/file-hold.util');
  return {
    ...actual,
    moveUploadedFile: (...args: unknown[]) => {
      const override = (globalThis as any).__moveUploadedFileOverride;
      return (override ?? actual.moveUploadedFile)(...args);
    },
  };
});

import { processBatchFile } from '../../src/server/file-socket-handlers';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { locateRemoteFile } from '../../src/storage/remote-download';
import { config } from '../../src/config';
import { FakeBackend } from './fake-backend';
import { bbsEventEmitter } from '../../src/services/bbs-event-emitter';
import { webhookService } from '../../src/services/webhook.service';

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
  (globalThis as any).__moveUploadedFileOverride = null;
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

  it('keeps the bytes and quarantines the file when the volume refuses the put', async () => {
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;

    await processBatchFile(h.socket, h.session, h.data, config);

    // Nothing was put, and nothing was lost: the file is in the sysop's HOLD
    // directory on local disk, which is where a failed integrity test puts one.
    expect(h.backend.puts).toBe(0);
    const held = path.join(h.dataDir, 'Conf1', 'HOLD', 'DEMO.ZIP');
    expect(fs.existsSync(held)).toBe(true);
    expect(fs.statSync(held).size).toBe(h.data.size);
    expect(h.written()).toContain('DRIVE.2');
  });

  it('does not list a file the pool refused as if it were in the area', async () => {
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;

    await processBatchFile(h.socket, h.session, h.data, config);

    // The catalog row carries no location - a row pointing at an object that
    // was never written sends every download at a key the bucket does not have.
    expect(createdEntries[0]?.storageVolume).toBeUndefined();
    expect(createdEntries[0]?.objectKey).toBeUndefined();
    // And it is not advertised as a file of this area: status hold, so the
    // entry goes to HELD rather than into the area's DIR listing.
    expect(createdEntries[0]?.status).toBe('hold');
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'DIR1'))).toBe(false);
  });

  it('leaves the file in the playpen, and writes no listing at all, when the HOLD quarantine also fails', async () => {
    // The put failed (backend.down), and the fallback quarantine move into
    // HOLD fails too - the review that found this defect: the pooled-put
    // failure handler called moveUploadedFile in its own catch block, that
    // call's error was only console.error'd, and execution fell through
    // UNCONDITIONALLY to db.createFileEntry({status: 'hold'}) and
    // writeUploadToDirFile(..., 'hold', ...) - writing a HOLD catalog row and
    // a HOLD DIR entry for a file that never reached HOLD and is still
    // sitting in the playpen.
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;
    (globalThis as any).__moveUploadedFileOverride = async () => {
      throw new Error('HOLD directory disk full');
    };

    await processBatchFile(h.socket, h.session, h.data, config);

    // The one thing that must stay true: the caller's only copy is still in
    // the playpen. Nothing sweeps or reconciles it from there today -
    // cleanPlayPen is never called and resumeStuff only scans PartUpload -
    // so this is a file only a sysop reading the console can find; see the
    // ORPHANED log the catch block writes.
    expect(fs.existsSync(h.playpenFile)).toBe(true);
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'HOLD', 'DEMO.ZIP'))).toBe(false);
    // No catalog row claiming the file is in HOLD...
    expect(createdEntries).toHaveLength(0);
    // ...and no DIR entry pointing at a HOLD file that isn't there.
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'DIR1'))).toBe(false);
  });

  it('credits nobody and tells nobody about a file that never reached HOLD', async () => {
    // The double-failure case above (put fails, quarantine fails) must not
    // fall through to the "successful upload" side-effects: crediting the
    // caller's ratio/byte count, logging to callersLog, announcing the
    // upload to other users over the BBS event bus, and firing the
    // NEW_UPLOAD webhook - all for a file that exists nowhere but the
    // playpen. Every one of those was gated only on `!foundDupe`, and
    // `quarantineFailed` can only be true when `foundDupe` is false, so
    // before this fix every one of them fired.
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;
    (globalThis as any).__moveUploadedFileOverride = async () => {
      throw new Error('HOLD directory disk full');
    };

    const emitUploadSpy = jest.spyOn(bbsEventEmitter, 'emitUpload').mockImplementation(() => undefined);
    const webhookSpy = jest.spyOn(webhookService, 'sendWebhook').mockResolvedValue(undefined);

    await processBatchFile(h.socket, h.session, h.data, config);

    // No ratio/byte credit for a file the caller cannot ever download again.
    expect(h.session.user.uploads).toBeUndefined();
    expect(h.session.user.bytesUpload).toBeUndefined();
    // No announcement to other users of a file nobody can list or fetch.
    expect(emitUploadSpy).not.toHaveBeenCalled();
    // No external webhook consumer told a file exists that does not.
    expect(webhookSpy).not.toHaveBeenCalled();

    emitUploadSpy.mockRestore();
    webhookSpy.mockRestore();
  });

  it('still credits the caller and tells the world when only the put fails but HOLD succeeds', async () => {
    // Round-trip on the fix above: quarantineFailed must gate the double
    // failure ONLY, not every pooled-put failure. A file that lands safely
    // in HOLD (single failure, the existing express.e:19364-19369 path)
    // keeps crediting the caller and announcing the upload exactly as it did
    // before this round - it is a real, sysop-reviewable file on disk.
    const h = harness({ storageVolume: 2 });
    h.backend.down = true;

    const emitUploadSpy = jest.spyOn(bbsEventEmitter, 'emitUpload').mockImplementation(() => undefined);
    const webhookSpy = jest.spyOn(webhookService, 'sendWebhook').mockResolvedValue(undefined);

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(h.session.user.uploads).toBe(1);
    expect(emitUploadSpy).toHaveBeenCalledTimes(1);
    expect(webhookSpy).toHaveBeenCalledTimes(1);

    emitUploadSpy.mockRestore();
    webhookSpy.mockRestore();
  });

  it('renames into the local area, untouched, when the area is not pooled', async () => {
    const h = harness({});

    await processBatchFile(h.socket, h.session, h.data, config);

    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'Files', 'DEMO.ZIP'))).toBe(true);
    expect(fs.existsSync(h.playpenFile)).toBe(false);
    expect(h.backend.puts).toBe(0);
    expect(createdEntries[0]?.storageVolume).toBeUndefined();
  });

  it('sends a duplicate to the sysop on local disk instead of overwriting the object', async () => {
    const h = harness({ storageVolume: 2 });
    duplicateRows = [{ id: 7, filename: 'DEMO.ZIP' }];

    await processBatchFile(h.socket, h.session, h.data, config);

    // express.e:19372-19376 - the duplicate goes to the sysop's private
    // directory. It must never have been put: paying a PUT to replace a good
    // object that every other node can already see, and then unlinking the
    // playpen copy, leaves the sysop nothing to review.
    expect(h.backend.puts).toBe(0);
    expect(fs.existsSync(path.join(h.dataDir, 'Conf1', 'HOLD', 'DEMO.ZIP'))).toBe(true);
    expect(createdEntries).toHaveLength(0); // duplicates insert no row
    expect(recordedLocations).toEqual([]);
    expect(h.written()).toContain('File already exists');
  });
});
