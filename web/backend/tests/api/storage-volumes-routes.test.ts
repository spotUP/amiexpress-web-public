/**
 * Drive Setup as the storage page: `/api/config/drives` decorated with pool
 * facts, the write-only secret, the connectivity test, the contents listing,
 * and pool-wide status (parked files, eviction shortfall, broken areas).
 *
 * `config`, and everything that reads `config.get('dataDir')` transitively
 * (drive-config.service.ts, config-routes.ts), is a singleton keyed off
 * `BBS_DATA_DIR` at construction time - so each test rebuilds the router
 * fresh, via `jest.resetModules()`, after pointing that env var at a new temp
 * board. The database is the shared global one from tests/setup.ts: it does
 * not care about `BBS_DATA_DIR` at all, so reusing it across the resets is
 * safe, and every seeded row uses a unique name to avoid colliding with
 * whatever else that database holds.
 */
import express from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { applyTooltypes } from '../../src/utils/info-file.util';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise((r) => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

function unique(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Seeds a conference + file area + one file entry, straight through better-sqlite3. */
function seedCatalogEntry(
  raw: any,
  opts: { storageVolume: number; filename: string; size: number }
): { conferenceId: number; areaId: number } {
  const confName = unique('Conf');
  const conferenceId = raw
    .prepare('INSERT INTO conferences (name) VALUES (?)')
    .run(confName).lastInsertRowid as number;

  const areaName = unique('Area');
  const areaId = raw
    .prepare('INSERT INTO file_areas (name, path, conferenceid) VALUES (?, ?, ?)')
    .run(areaName, 'BBS:Conf/Files/', conferenceId).lastInsertRowid as number;

  raw
    .prepare(
      `INSERT INTO file_entries (filename, size, uploader, areaid, storage_volume, object_key)
       VALUES (?, ?, 'sysop', ?, ?, ?)`
    )
    .run(opts.filename, opts.size, areaId, opts.storageVolume, `Conf/Files/${opts.filename}`);

  return { conferenceId, areaId };
}

describe('Drive Setup storage routes', () => {
  let db: any;
  let root: string;
  let app: express.Express;

  beforeAll(async () => {
    db = await waitForTestDb();
  }, 30000);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-'));
    applyTooltypes(path.join(root, 'Drives.info'), [
      ['DRIVE.1', 'DH1:'],
      ['DRIVE.2', 's3://uprough-cold'],
      ['DRIVE.2.ENDPOINT', 'https://s3.example.com'],
      ['DRIVE.2.REGION', 'eu-central-003'],
      ['DRIVE.2.QUOTA', '10G'],
      ['DRIVE.2.EGRESS', '3X'],
      ['DRIVE.2.CLASS', 'FREE'],
      ['DRIVE.2.KEYID', 'keyid-2'],
      ['DRIVE.2.RETENTION', '90'],
    ]);
    process.env.BBS_STORAGE_2_SECRET = 'sekrit';
    process.env.BBS_DATA_DIR = root;

    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createConfigRouter } = require('../../src/api/config-routes');
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  });

  afterEach(() => {
    delete process.env.BBS_STORAGE_2_SECRET;
    delete process.env.BBS_DATA_DIR;
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe('GET /api/config/drives', () => {
    it('reports quota, class and egress for an s3 drive', async () => {
      const res = await request(app).get('/api/config/drives');
      expect(res.status).toBe(200);
      const s3Drive = res.body.data.find((d: any) => d.drive_number === 2);
      expect(s3Drive).toMatchObject({
        kind: 's3',
        volumeClass: 'FREE',
        quotaBytes: 10 * 1024 ** 3,
        egress: '3X',
        retentionDays: 90,
      });
    });

    it('reports the used bytes from the catalog, not zero, for a drive nothing in this process has written', async () => {
      const raw = (db as any).db;
      seedCatalogEntry(raw, { storageVolume: 2, filename: unique('DEMO') + '.LHA', size: 12345 });

      const res = await request(app).get('/api/config/drives');
      const s3Drive = res.body.data.find((d: any) => d.drive_number === 2);
      expect(s3Drive.usedBytes).toBeGreaterThanOrEqual(12345);
    });

    it('never returns a secret, in any field', async () => {
      const res = await request(app).get('/api/config/drives');
      expect(JSON.stringify(res.body)).not.toContain('sekrit');
    });

    it('reports a local drive plainly, with no quota or class noise', async () => {
      const res = await request(app).get('/api/config/drives');
      const local = res.body.data.find((d: any) => d.drive_number === 1);
      expect(local.kind).toBe('local');
      expect(local.quotaBytes).toBeUndefined();
    });

    it('surfaces a DRIVE.n.REQUESTS budget', async () => {
      const withRequests = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-req-'));
      applyTooltypes(path.join(withRequests, 'Drives.info'), [
        ['DRIVE.1', 's3://oracle-cold'],
        ['DRIVE.1.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.1.KEYID', 'keyid-1'],
        ['DRIVE.1.REQUESTS', '50000'],
      ]);
      process.env.BBS_STORAGE_1_SECRET = 'sekrit-1';
      process.env.BBS_DATA_DIR = withRequests;
      jest.resetModules();
      const { createConfigRouter: createRouter2 } = require('../../src/api/config-routes');
      const app2 = express();
      app2.use(express.json());
      app2.use('/api/config', createRouter2(db));

      try {
        const res = await request(app2).get('/api/config/drives');
        expect(res.body.data[0].requestBudget).toBe(50000);
      } finally {
        delete process.env.BBS_STORAGE_1_SECRET;
        fs.rmSync(withRequests, { recursive: true, force: true });
      }
    });
  });

  describe('POST /api/config/drives/:n/secret', () => {
    it('writes the key file at 0600 and never touches Drives.info', async () => {
      const res = await request(app).post('/api/config/drives/2/secret').send({ secret: 'brand-new' });
      expect(res.status).toBe(200);

      const keyPath = path.join(root, 'Storage', '2.key');
      expect(fs.readFileSync(keyPath, 'utf8').trim()).toBe('brand-new');
      if (process.platform !== 'win32') {
        expect(fs.statSync(keyPath).mode & 0o777).toBe(0o600);
      }
      expect(fs.readFileSync(path.join(root, 'Drives.info'), 'latin1')).not.toContain('brand-new');
    });

    it('refuses an empty secret', async () => {
      const res = await request(app).post('/api/config/drives/2/secret').send({ secret: '' });
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('POST /api/config/drives/:n/test', () => {
    it('reports a local drive reachable without touching the network', async () => {
      const res = await request(app).post('/api/config/drives/1/test');
      expect(res.status).toBe(200);
      expect(res.body.data.reachable).toBe(true);
    });

    it('reports an s3 drive with no secret as unreachable, naming why', async () => {
      const noSecret = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-nosecret-'));
      applyTooltypes(path.join(noSecret, 'Drives.info'), [
        ['DRIVE.1', 's3://cold'],
        ['DRIVE.1.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.1.KEYID', 'keyid-1'],
      ]);
      process.env.BBS_DATA_DIR = noSecret;
      jest.resetModules();
      const { createConfigRouter: createRouter2 } = require('../../src/api/config-routes');
      const app2 = express();
      app2.use(express.json());
      app2.use('/api/config', createRouter2(db));

      try {
        const res = await request(app2).post('/api/config/drives/1/test');
        expect(res.status).toBe(200);
        expect(res.body.data.reachable).toBe(false);
        expect(res.body.data.error).toMatch(/secret/i);
      } finally {
        fs.rmSync(noSecret, { recursive: true, force: true });
      }
    });
  });

  describe('GET /api/config/drives/:n/contents', () => {
    it('lists what would be lost if this volume disappeared', async () => {
      const raw = (db as any).db;
      const filename = unique('DEMO') + '.LHA';
      seedCatalogEntry(raw, { storageVolume: 2, filename, size: 999 });

      const res = await request(app).get('/api/config/drives/2/contents');
      expect(res.status).toBe(200);
      expect(res.body.data.map((r: any) => r.filename)).toContain(filename);
    });

    it('is empty for a drive with nothing on it', async () => {
      const res = await request(app).get('/api/config/drives/1/contents');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
    });
  });

  describe('GET /api/config/drives/pool/status', () => {
    it('reports the cache inactive before the storage subsystem is wired into the process', async () => {
      const res = await request(app).get('/api/config/drives/pool/status');
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({
        cacheActive: false,
        overBudgetBytes: 0,
        evictionDisabled: false,
        parkedFiles: [],
      });
    });

    it('names an area whose STORAGEDRIVE points at a drive Drives.info does not have', async () => {
      const confPath = path.join(root, 'ConfConfig.info');
      applyTooltypes(confPath, [
        ['NCONFS', '1'],
        ['NAME.1', 'General'],
        ['LOCATION.1', 'BBS:Conf1/'],
      ]);
      const conf1InfoPath = path.join(root, 'Conf1.info');
      applyTooltypes(conf1InfoPath, [
        ['NDIRS', '1'],
        ['DLPATH.1', 'BBS:Conf1/Files/'],
        ['ULPATH.1', 'BBS:Conf1/Upload/'],
        ['STORAGEDRIVE.1', '9'],
      ]);

      const res = await request(app).get('/api/config/drives/pool/status');
      expect(res.status).toBe(200);
      expect(res.body.data.brokenAreas).toEqual([
        { conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', driveNumber: 9 },
      ]);
    });

    it('reports parked files, overBudgetBytes and evictionDisabled once the cache is live, and discards by localPath', async () => {
      // Same module registry as the app under test - getStorageContext() must
      // read the `current` this test just set, not a separately-required copy.
      const { setStorageContext } = require('../../src/storage/storage-context');
      const { FileCache } = require('../../src/storage/file-cache');
      const { VolumeSet } = require('../../src/storage/volume-set');
      const { FakeBackend } = require('../storage/fake-backend');

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-cache-'));
      const backend = new FakeBackend({ driveNumber: 2 });
      const volumes = new VolumeSet([
        {
          volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE' },
          backend,
          usedBytes: 0,
          requestsThisMonth: 0,
          egressBytesThisMonth: 0,
          degraded: false,
        },
      ]);
      const cache = new FileCache({ cacheDir, volumes, maxBytes: 1024 });

      // Park a file the direct way file-cache.test.ts uses: a staged write
      // whose upload fails, truncated on "restart" so the stamp cannot vouch
      // for it - `flushPending` then parks it rather than replaying it.
      const local = cache.localPathFor(2, 'Files/DOOR.DAT');
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, Buffer.alloc(400, 9));
      backend.down = true;
      await expect(cache.writeBack(2, 'Files/DOOR.DAT', local)).rejects.toThrow();
      fs.writeFileSync(local, Buffer.alloc(120, 9));
      const reborn = new FileCache({ cacheDir, volumes, maxBytes: 1024 });
      await reborn.flushPending();

      setStorageContext({ volumes, cache: reborn, names: {} as any, areas: [] });
      try {
        const statusRes = await request(app).get('/api/config/drives/pool/status');
        expect(statusRes.status).toBe(200);
        expect(statusRes.body.data.cacheActive).toBe(true);
        expect(statusRes.body.data.parkedFiles).toHaveLength(1);
        expect(statusRes.body.data.parkedFiles[0]).toMatchObject({ driveNumber: 2, sizeBytes: 120 });

        const parkedPath = statusRes.body.data.parkedFiles[0].localPath;
        const discardRes = await request(app)
          .post('/api/config/drives/pool/parked/discard')
          .send({ localPath: parkedPath });
        expect(discardRes.status).toBe(200);
        expect(fs.existsSync(parkedPath)).toBe(false);

        const afterRes = await request(app).get('/api/config/drives/pool/status');
        expect(afterRes.body.data.parkedFiles).toEqual([]);
      } finally {
        setStorageContext(null);
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    });

    it('refuses to discard a path outside the parked directory', async () => {
      const { setStorageContext } = require('../../src/storage/storage-context');
      const { FileCache } = require('../../src/storage/file-cache');
      const { VolumeSet } = require('../../src/storage/volume-set');

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-cache2-'));
      const volumes = new VolumeSet([]);
      const cache = new FileCache({ cacheDir, volumes, maxBytes: 1024 });
      setStorageContext({ volumes, cache, names: {} as any, areas: [] });

      try {
        const outside = path.join(root, 'Drives.info');
        const res = await request(app)
          .post('/api/config/drives/pool/parked/discard')
          .send({ localPath: outside });
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(fs.existsSync(outside)).toBe(true);
      } finally {
        setStorageContext(null);
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    });
  });
});
