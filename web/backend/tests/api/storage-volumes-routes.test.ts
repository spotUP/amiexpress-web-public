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

    it('reports secretConfigured true for an s3 drive with a working secret', async () => {
      const res = await request(app).get('/api/config/drives');
      const s3Drive = res.body.data.find((d: any) => d.drive_number === 2);
      expect(s3Drive.secretConfigured).toBe(true);
    });

    it('reports secretConfigured false for an s3 drive with no secret at all - this drive is unreachable', async () => {
      const noSecretRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-nosec-'));
      applyTooltypes(path.join(noSecretRoot, 'Drives.info'), [
        ['DRIVE.1', 's3://cold'],
        ['DRIVE.1.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.1.KEYID', 'keyid-1'],
      ]);
      process.env.BBS_DATA_DIR = noSecretRoot;
      jest.resetModules();
      const { createConfigRouter: createRouter2 } = require('../../src/api/config-routes');
      const app2 = express();
      app2.use(express.json());
      app2.use('/api/config', createRouter2(db));

      try {
        const res = await request(app2).get('/api/config/drives');
        expect(res.body.data[0].secretConfigured).toBe(false);
      } finally {
        fs.rmSync(noSecretRoot, { recursive: true, force: true });
      }
    });

    it('reports inPool as undefined - a third state, never false - with no live process context', async () => {
      const res = await request(app).get('/api/config/drives');
      const s3Drive = res.body.data.find((d: any) => d.drive_number === 2);
      expect(s3Drive.inPool).toBeUndefined();
    });

    it('reports inPool true when the live VolumeSet actually holds the drive, false when it does not', async () => {
      const { setStorageContext } = require('../../src/storage/storage-context');
      const { VolumeSet } = require('../../src/storage/volume-set');
      const { FakeBackend } = require('../storage/fake-backend');

      const volumes = new VolumeSet([
        {
          volume: { driveNumber: 2, kind: 's3', path: 'b', egress: 'FREE', volumeClass: 'FREE' },
          backend: new FakeBackend({ driveNumber: 2 }),
          usedBytes: 0,
          requestsThisMonth: 0,
          egressBytesThisMonth: 0,
          degraded: false,
        },
        // Drive 1 is deliberately left out of this hand-built VolumeSet, so
        // it stands in for whatever `byNumber()` cannot find - the exact
        // signal `inPool` reports, regardless of why a real VolumeSet would
        // ever be missing an entry.
      ]);
      setStorageContext({ volumes, cache: {} as any, names: {} as any, areas: [] });

      try {
        const res = await request(app).get('/api/config/drives');
        const s3Drive = res.body.data.find((d: any) => d.drive_number === 2);
        const local = res.body.data.find((d: any) => d.drive_number === 1);
        expect(s3Drive.inPool).toBe(true);
        expect(local.inPool).toBe(false);
      } finally {
        setStorageContext(null);
      }
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

    it('refuses a non-numeric drive segment rather than writing Storage/NaN.key', async () => {
      const res = await request(app).post('/api/config/drives/not-a-number/secret').send({ secret: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(fs.existsSync(path.join(root, 'Storage', 'NaN.key'))).toBe(false);
    });

    it('refuses a drive number parseVolumes does not know', async () => {
      const res = await request(app).post('/api/config/drives/99/secret').send({ secret: 'x' });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(fs.existsSync(path.join(root, 'Storage', '99.key'))).toBe(false);
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

    it('refuses a drive number parseVolumes does not know', async () => {
      const res = await request(app).post('/api/config/drives/99/test');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it('refuses a non-integer drive segment', async () => {
      const res = await request(app).post('/api/config/drives/1.5/test');
      expect(res.status).toBeGreaterThanOrEqual(400);
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

    it('refuses a drive number parseVolumes does not know', async () => {
      const res = await request(app).get('/api/config/drives/99/contents');
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('PUT /api/config/drives/:id - renumbering an s3 drive', () => {
    it('refuses to renumber an s3 drive - it would strand DRIVE.n.QUOTA/KEYID/ENDPOINT and its credentials', async () => {
      const res = await request(app).put('/api/config/drives/2').send({ drive_number: 5 });
      expect(res.status).toBeGreaterThanOrEqual(400);

      const info = fs.readFileSync(path.join(root, 'Drives.info'), 'latin1');
      expect(info).toContain('DRIVE.2=');
      expect(info).not.toContain('DRIVE.5=');
    });

    it('still allows renumbering a local drive, which has no sub-keys to strand', async () => {
      const res = await request(app).put('/api/config/drives/1').send({ drive_number: 7 });
      expect(res.status).toBe(200);
    });

    it('still allows an ordinary path edit on an s3 drive - only the NUMBER is refused', async () => {
      const res = await request(app).put('/api/config/drives/2').send({ drive_path: 's3://uprough-cold-renamed' });
      expect(res.status).toBe(200);
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
      expect(res.body.data.brokenAreas).toHaveLength(1);
      expect(res.body.data.brokenAreas[0]).toMatch(/DRIVE\.9/);
      expect(res.body.data.brokenAreas[0]).toMatch(/Conf1 dir 1/);
    });

    it('reports an area broken when its drive IS in Drives.info but has no usable secret - the case "listed" used to miss', async () => {
      // Drive 2 already exists (from the outer beforeEach) with a secret; add
      // a THIRD s3 drive that has none, and point an area's STORAGEDRIVE at
      // it. The old rule ("is this drive number listed in Drives.info?")
      // would call drive 3 configured; VolumeSet.fromBoard drops it, so the
      // board itself already treats this area as local disk. This is the
      // regression the review named directly: the missing-secret case is the
      // likeliest way a listed drive never makes it into the pool.
      applyTooltypes(path.join(root, 'Drives.info'), [
        ['DRIVE.3', 's3://no-secret-bucket'],
        ['DRIVE.3.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.3.KEYID', 'keyid-3'],
        // Deliberately no DRIVE.3 secret file and no BBS_STORAGE_3_SECRET.
      ]);

      const confPath = path.join(root, 'ConfConfig.info');
      applyTooltypes(confPath, [
        ['NCONFS', '1'],
        ['NAME.1', 'General'],
        ['LOCATION.1', 'BBS:Conf1/'],
      ]);
      applyTooltypes(path.join(root, 'Conf1.info'), [
        ['NDIRS', '1'],
        ['DLPATH.1', 'BBS:Conf1/Files/'],
        ['ULPATH.1', 'BBS:Conf1/Upload/'],
        ['STORAGEDRIVE.1', '3'],
      ]);

      const res = await request(app).get('/api/config/drives/pool/status');
      expect(res.status).toBe(200);
      expect(res.body.data.brokenAreas).toHaveLength(1);
      expect(res.body.data.brokenAreas[0]).toMatch(/DRIVE\.3/);
    });

    it('surfaces a prefix collision, not only a mis-numbered drive', async () => {
      const confPath = path.join(root, 'ConfConfig.info');
      applyTooltypes(confPath, [
        ['NCONFS', '1'],
        ['NAME.1', 'General'],
        ['LOCATION.1', 'BBS:Conf1/'],
      ]);
      applyTooltypes(path.join(root, 'Conf1.info'), [
        ['NDIRS', '2'],
        ['DLPATH.1', 'BBS:Conf1/Files/'],
        ['ULPATH.1', 'BBS:Conf1/Upload/'],
        ['STORAGEDRIVE.1', '2'],
        ['DLPATH.2', 'DH1:Archive/Files/'],
        ['ULPATH.2', 'DH1:Archive/Upload/'],
        ['STORAGEDRIVE.2', '2'],
      ]);

      const res = await request(app).get('/api/config/drives/pool/status');
      expect(res.status).toBe(200);
      expect(res.body.data.brokenAreas.some((m: string) => /same object prefix/.test(m))).toBe(true);
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

    it('reports pendingUploads - a Blocker follow-up: flushPending has no return value any caller sees, so the count is the admin page\'s only signal', async () => {
      const { setStorageContext } = require('../../src/storage/storage-context');
      const { FileCache } = require('../../src/storage/file-cache');
      const { VolumeSet } = require('../../src/storage/volume-set');
      const { FakeBackend } = require('../storage/fake-backend');

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-pending-'));
      const backend = new FakeBackend({ driveNumber: 2 });
      backend.down = true; // the volume is unreachable - the upload stays pending
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
      const local = cache.localPathFor(2, 'Files/DOOR.DAT');
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, Buffer.alloc(10, 9));
      cache.markDirty(2, 'Files/DOOR.DAT', local);

      setStorageContext({ volumes, cache, names: {} as any, areas: [] });
      try {
        const res = await request(app).get('/api/config/drives/pool/status');
        expect(res.status).toBe(200);
        expect(res.body.data.pendingUploads).toBe(1);
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

    it('with a live context, uses pool membership - not "listed in Drives.info" - as the broken-area rule', async () => {
      // DRIVE.3 has a real secret on disk, so the disk-only check the old
      // code used ("is this number in Drives.info?") would call it fine. The
      // LIVE VolumeSet nonetheless does not include it - modelling a drive
      // VolumeSet.fromBoard dropped for some other construction reason (bad
      // KEYID, bad ENDPOINT) despite the secret being present. The area must
      // still come back broken, because that is what the running board does.
      applyTooltypes(path.join(root, 'Drives.info'), [
        ['DRIVE.3', 's3://has-a-secret-but-dropped'],
        ['DRIVE.3.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.3.KEYID', 'keyid-3'],
      ]);
      const { writeFileSync, mkdirSync } = require('fs');
      mkdirSync(path.join(root, 'Storage'), { recursive: true });
      writeFileSync(path.join(root, 'Storage', '3.key'), 'a-real-secret\n');

      applyTooltypes(path.join(root, 'ConfConfig.info'), [
        ['NCONFS', '1'],
        ['NAME.1', 'General'],
        ['LOCATION.1', 'BBS:Conf1/'],
      ]);
      applyTooltypes(path.join(root, 'Conf1.info'), [
        ['NDIRS', '1'],
        ['DLPATH.1', 'BBS:Conf1/Files/'],
        ['ULPATH.1', 'BBS:Conf1/Upload/'],
        ['STORAGEDRIVE.1', '3'],
      ]);

      const { setStorageContext } = require('../../src/storage/storage-context');
      const { FileCache } = require('../../src/storage/file-cache');
      const { VolumeSet } = require('../../src/storage/volume-set');

      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'drive-routes-cache3-'));
      // Deliberately empty: drive 3 is NOT in the live pool, secret or not.
      const volumes = new VolumeSet([]);
      const cache = new FileCache({ cacheDir, volumes, maxBytes: 1024 });
      setStorageContext({ volumes, cache, names: {} as any, areas: [] });

      try {
        const res = await request(app).get('/api/config/drives/pool/status');
        expect(res.status).toBe(200);
        expect(res.body.data.cacheActive).toBe(true);
        expect(res.body.data.brokenAreas).toHaveLength(1);
        expect(res.body.data.brokenAreas[0]).toMatch(/DRIVE\.3/);
      } finally {
        setStorageContext(null);
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    });
  });

  describe('review finding 4 - a Drives.info write takes effect on the live pool, no restart', () => {
    it('a drive with no secret joins the live pool the moment POST /secret gives it one', async () => {
      applyTooltypes(path.join(root, 'Drives.info'), [
        ['DRIVE.3', 's3://third-bucket'],
        ['DRIVE.3.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.3.KEYID', 'keyid-3'],
        // Deliberately no secret yet.
      ]);

      const before = await request(app).get('/api/config/drives');
      const driveBefore = before.body.data.find((d: any) => d.drive_number === 3);
      expect(driveBefore.secretConfigured).toBe(false);
      // No write has happened yet in this test, so no live context exists at
      // all - `inPool` is the third state, undefined, not false.
      expect(driveBefore.inPool).toBeUndefined();

      const secretRes = await request(app).post('/api/config/drives/3/secret').send({ secret: 'now-i-have-one' });
      expect(secretRes.status).toBe(200);

      const after = await request(app).get('/api/config/drives');
      const driveAfter = after.body.data.find((d: any) => d.drive_number === 3);
      expect(driveAfter.secretConfigured).toBe(true);
      // No restart happened between the two GETs - the same process, the
      // same app instance. Before Task 12 review finding 4 was fixed, this
      // stayed false until the process was restarted.
      expect(driveAfter.inPool).toBe(true);
    });

    it('a local drive turned s3 through PUT /drives/:id is live immediately, not just listed', async () => {
      // Drive 1 starts local ("DH1:") - edit only its path, not its number,
      // through the same PUT route the "ordinary path edit" tests above
      // already exercise successfully for an s3 drive.
      const updateRes = await request(app).put('/api/config/drives/1').send({ drive_path: 's3://first-bucket' });
      expect(updateRes.status).toBe(200);

      applyTooltypes(path.join(root, 'Drives.info'), [
        ['DRIVE.1.ENDPOINT', 'https://s3.example.com'],
        ['DRIVE.1.KEYID', 'keyid-1'],
      ]);
      const secretRes = await request(app).post('/api/config/drives/1/secret').send({ secret: 'sekrit-1' });
      expect(secretRes.status).toBe(200);

      const res = await request(app).get('/api/config/drives');
      const drive1 = res.body.data.find((d: any) => d.drive_number === 1);
      expect(drive1.kind).toBe('s3');
      // No restart happened between the PUT, the secret POST and this GET -
      // the same process, the same app instance throughout.
      expect(drive1.inPool).toBe(true);
    });
  });
});
