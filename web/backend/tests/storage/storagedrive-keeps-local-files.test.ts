/**
 * Putting a directory that already holds files on a cloud drive.
 *
 * The storage wizard's last step (config-app StorageSetupWizard, step "use")
 * and the Conferences form both save `STORAGEDRIVE.<dir>=<drive>` into the
 * conference icon, and nothing moves the files already in that directory. So
 * the board runs with a directory whose OLD files are on this server's disk
 * and whose NEW uploads go to the bucket - and both halves must stay
 * reachable through every entry point a caller has:
 *
 *   - web:    GET /api/download/<conf>/<dir>/<name> (what BBSTerminal fetches)
 *   - FTP and the flagged-file batch: `resolveFile`, which `boardFtpDeps`
 *     and `resolveFlaggedFile` both call
 *   - a new upload: `processBatchFile`, which files it into the bucket
 *
 * The board is built the way the live one is: a `Conf1.info` on disk with
 * NDIRS/DLPATH/ULPATH, the STORAGEDRIVE written by the same
 * `applyConferenceFields` the admin PUT uses, and the storage context's
 * areas loaded from that icon by `loadFileAreasFromDisk`.
 *
 * The drive being DOWN is the case that used to break: the file is on this
 * server's disk, so the bucket's health has nothing to do with it - yet the
 * web route answered 503 and FTP/the batch threw "unavailable" for it, while
 * `D` (download.handler findFilesInConference) already served it.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import request from 'supertest';
import AdmZip = require('adm-zip');

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockDb = {
  query: jest.fn(async () => ({ rows: [] })),
  createFileEntry: jest.fn(async () => 1),
  recordLocation: jest.fn(() => undefined),
  run: jest.fn(async () => undefined),
  getConfigRepository: () => ({ getNodeConfig: () => ({ sentby_files: false }) }),
  getConferences: jest.fn(async () => []),
  updateConference: jest.fn(async () => undefined),
  getConferenceById: jest.fn(async () => ({ id: 1, name: 'Conf1' })),
};
(globalThis as any).__storagedriveMockDb = mockDb;
jest.mock('../../src/database', () => ({
  db: new Proxy({} as any, { get: (_target, prop) => (globalThis as any).__storagedriveMockDb[prop] }),
}));
jest.mock('../../src/server/database-helpers', () => ({ callersLog: jest.fn(async () => undefined) }));
jest.mock('../../src/services/post-upload.service', () => ({ runPostUpload: jest.fn(async () => undefined) }));

import { config } from '../../src/config';
import { applyTooltypes } from '../../src/utils/info-file.util';
import { applyConferenceFields } from '../../src/services/config-services/conference-info-file.service';
import { loadFileAreasFromDisk } from '../../src/services/file-areas-loader';
import { remoteAreaFromDisk } from '../../src/storage/remote-areas';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext } from '../../src/storage/storage-context';
import { resolveFile } from '../../src/handlers/transfer/batch-download.handler';
import { processBatchFile } from '../../src/server/file-socket-handlers';
import { FakeBackend } from './fake-backend';

interface Board {
  dataDir: string;
  backend: FakeBackend;
  area: ReturnType<typeof loadFileAreasFromDisk>[number];
}

let restoreConfig: (() => void) | null = null;

/** Conf1 dir 1 with OLD.LHA on disk, then put on DRIVE.2 the way the wizard does. */
function boardMovedToDrive(): Board {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'storagedrive-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'Conf1', 'Files', 'OLD.LHA'), 'old-local-bytes');

  const icon = path.join(dataDir, 'Conf1.info');
  applyTooltypes(icon, [
    ['NDIRS', '1'],
    ['DLPATH.1', 'BBS:Conf1/Files/'],
    ['ULPATH.1', 'BBS:Conf1/Files/'],
  ]);
  // The wizard's "Put 1 on drive 2": PUT storagedrive_1=2 -> applyConferenceFields.
  const toolTypes = new Map<string, string>();
  applyConferenceFields(toolTypes as any, { storagedrives: { 1: 2 } });
  applyTooltypes(icon, toolTypes.entries());

  const original = config.get.bind(config);
  const spy = jest
    .spyOn(config, 'get')
    .mockImplementation((key: string) => (key === 'dataDir' ? dataDir : original(key as never)));
  restoreConfig = () => spy.mockRestore();

  const diskAreas = loadFileAreasFromDisk(dataDir, [{ id: 1, name: 'Conf1' }]);
  expect(diskAreas).toHaveLength(1);
  expect(diskAreas[0].storageVolume).toBe(2);

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
  setStorageContext({
    volumes,
    cache: new FileCache({
      cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'storagedrive-cache-')),
      volumes,
      maxBytes: 4 * 1024 * 1024,
    }),
    names: new NameIndexRegistry(volumes),
    areas: diskAreas.map(remoteAreaFromDisk),
  });

  return { dataDir, backend, area: diskAreas[0] };
}

function app(): express.Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerHttpRoutes } = require('../../src/server/routes-setup');
  const server = express();
  registerHttpRoutes(server, { emit: () => undefined });
  return server;
}

afterEach(() => {
  setStorageContext(null);
  restoreConfig?.();
  restoreConfig = null;
});

describe('a directory put on a cloud drive with files already in it', () => {
  it('still serves the files left on local disk over the web route', async () => {
    boardMovedToDrive();

    const res = await request(app()).get('/api/download/1/1/OLD.LHA');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('old-local-bytes');
  });

  it('still serves them over the web route while the drive is down - they are not on the drive', async () => {
    const { backend } = boardMovedToDrive();
    backend.down = true;

    const res = await request(app()).get('/api/download/1/1/OLD.LHA');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('old-local-bytes');
  });

  it('still answers 503 over the web route for a file that is in neither place while the drive is down', async () => {
    const { backend } = boardMovedToDrive();
    backend.down = true;

    const res = await request(app()).get('/api/download/1/1/NOPE.LHA');

    expect(res.status).toBe(503);
  });

  it('resolves them for FTP and the flagged batch, with the drive up and down', async () => {
    // Down FIRST, on a board that has never listed the bucket: a warm name
    // index answers "not here" without asking the drive, which would hide
    // the outage this case is about.
    const down = boardMovedToDrive();
    down.backend.down = true;
    // Lower-cased: a case-insensitive Mac disk answers in the spelling asked.
    const onDisk = (dataDir: string) => path.join(dataDir, 'Conf1', 'Files', 'OLD.LHA').toLowerCase();

    const whileDown = await resolveFile(down.dataDir, 1, 'OLD.LHA');
    expect(whileDown!.fullPath.toLowerCase()).toBe(onDisk(down.dataDir));
    expect(whileDown!.objectKey).toBeUndefined();
    await expect(resolveFile(down.dataDir, 1, 'NOPE.LHA')).rejects.toThrow(/unavailable/);

    setStorageContext(null);
    restoreConfig?.();
    const up = boardMovedToDrive();
    const whileUp = await resolveFile(up.dataDir, 1, 'old.lha');
    expect(whileUp!.fullPath.toLowerCase()).toBe(onDisk(up.dataDir));
  });

  it('files a NEW upload into the bucket while the old file stays where it was', async () => {
    const { dataDir, backend, area } = boardMovedToDrive();
    const playpen = path.join(dataDir, 'Node1', 'Playpen');
    fs.mkdirSync(playpen, { recursive: true });
    const zip = new AdmZip();
    zip.addFile('FILE_ID.DIZ', Buffer.from('A new upload'));
    zip.addFile('payload.bin', Buffer.from('payload'));
    const upload = path.join(playpen, 'NEW.ZIP');
    zip.writeZip(upload);

    const session: any = {
      user: { id: 1, username: 'tester', securityFlags: 'T'.repeat(100), secLibrary: 0 },
      currentConf: 1,
      nodeId: 1,
      tempData: {
        uploadMode: true,
        fileArea: area,
        uploadSessionId: 'sess-1',
        uploadBatch: [{ filename: 'NEW.ZIP', description: '', isPrivate: false }],
        uploadCount: 1,
        currentUploadIndex: 0,
        uploadStartTime: Date.now(),
        webUploadMode: true,
        pendingZmodemFiles: [],
      },
    };
    const socket: any = { id: 'socket-1', emit: () => undefined };
    const data = { filename: 'NEW.ZIP', originalname: 'NEW.ZIP', size: fs.statSync(upload).size, path: upload };

    await processBatchFile(socket, session, data, config);

    expect((await backend.get('Conf1/Files/NEW.ZIP')).length).toBe(data.size);
    expect(fs.existsSync(path.join(dataDir, 'Conf1', 'Files', 'NEW.ZIP'))).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, 'Conf1', 'Files', 'OLD.LHA'), 'utf8')).toBe('old-local-bytes');

    // And both halves download through the same web route.
    const server = app();
    const fresh = await request(server).get('/api/download/1/1/NEW.ZIP');
    expect(fresh.status).toBe(200);
    expect(Buffer.from(fresh.body).length).toBe(data.size);
    const old = await request(server).get('/api/download/1/1/OLD.LHA');
    expect(Buffer.from(old.body).toString()).toBe('old-local-bytes');
  });
});
