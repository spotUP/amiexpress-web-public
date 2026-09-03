/**
 * The HTTP route that actually moves the bytes.
 *
 * `batch-download.handler` resolves a flagged file and then emits a
 * `download-file` event whose `url` is `/api/download/<conf>/<dir>/<name>`;
 * BBSTerminal.tsx fetches that URL and the browser saves what comes back. So
 * a download that only materialises in the handler still 404s at the wire:
 * this route does its own lookup, and it has to know about the pool too.
 */
import express from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { config } from '../../src/config';
import { FileCache } from '../../src/storage/file-cache';
import { NameIndexRegistry } from '../../src/storage/name-index-registry';
import { VolumeSet, type VolumeState } from '../../src/storage/volume-set';
import { setStorageContext, type StorageContext } from '../../src/storage/storage-context';
import type { RemoteArea } from '../../src/storage/remote-areas';
import { FakeBackend } from './fake-backend';

function buildApp(): express.Express {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { registerHttpRoutes } = require('../../src/server/routes-setup');
  const app = express();
  registerHttpRoutes(app, { emit: () => undefined });
  return app;
}

interface Fixture {
  app: express.Express;
  backend: FakeBackend;
  dataDir: string;
}

let restoreConfig: (() => void) | null = null;

function fixture(): Fixture {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'board-http-'));
  fs.mkdirSync(path.join(dataDir, 'Conf1', 'Files'), { recursive: true });
  fs.mkdirSync(path.join(dataDir, 'Conf2', 'Files'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'Conf2', 'Files', 'LOCAL.TXT'), 'on-disk');

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
  const areas: RemoteArea[] = [
    { id: 1, conferenceId: 1, dirNumber: 1, path: 'BBS:Conf1/Files/', storageVolume: 2 },
    { id: 2, conferenceId: 2, dirNumber: 1, path: 'BBS:Conf2/Files/' },
  ];
  const ctx: StorageContext = {
    volumes,
    cache: new FileCache({
      cacheDir: fs.mkdtempSync(path.join(os.tmpdir(), 'cache-http-')),
      volumes,
      maxBytes: 1024 * 1024,
    }),
    names: new NameIndexRegistry(volumes),
    areas,
  };
  setStorageContext(ctx);

  return { app: buildApp(), backend, dataDir };
}

afterEach(() => {
  setStorageContext(null);
  restoreConfig?.();
  restoreConfig = null;
});

describe('GET /api/download/:confNum/:dirNum/:filename', () => {
  it('serves a pooled file, streamed from the cache copy', async () => {
    const { app, backend } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));

    const res = await request(app).get('/api/download/1/1/DEMO.LHA');

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('DEMO.LHA');
    expect(Buffer.from(res.body).toString()).toBe('payload');
  });

  it('answers 503, not 404, when the volume cannot be reached', async () => {
    // 404 is the answer that gets a good catalog row deleted. The caller is
    // told to come back, and the drive is named.
    const { app, backend } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;

    const res = await request(app).get('/api/download/1/1/DEMO.LHA');

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).toContain('try again later');
    expect(JSON.stringify(res.body)).not.toContain('not found');
  });

  it('keeps the backend detail out of the body on this unauthenticated route', async () => {
    const { app, backend } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;

    const res = await request(app).get('/api/download/1/1/DEMO.LHA');

    // A backend message can name a bucket, an endpoint or a key id.
    expect(JSON.stringify(res.body)).not.toContain('DRIVE.2');
    expect(JSON.stringify(res.body)).not.toContain('bucket');
  });

  it('still answers 404 for a file the pooled area genuinely does not hold', async () => {
    const { app } = fixture();

    const res = await request(app).get('/api/download/1/1/NOPE.LHA');

    expect(res.status).toBe(404);
  });

  it('serves a local area exactly as before, without touching the pool', async () => {
    const { app, backend } = fixture();

    const res = await request(app).get('/api/download/2/1/LOCAL.TXT');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('on-disk');
    expect(backend.requests).toBe(0);
  });
});

describe('GET /api/download/:fileId', () => {
  /**
   * The legacy by-id route hands back a MAPPED FileEntry - storageVolume and
   * objectKey included - and then walked the local directories for it. For a
   * pooled row that walk always failed, so the route answered "File not found
   * on server" while holding the file's exact location.
   */
  interface CatalogRow {
    id: number;
    filename: string;
    size: number;
    storageVolume?: number;
    objectKey?: string;
  }

  let restoreLookup: (() => void) | null = null;

  function catalogRoute(entry: CatalogRow): express.Express {
    // The exported `db` is a Proxy whose get trap always reads the lazy
    // singleton, so assigning to it is invisible - the class method is what
    // the route ends up calling.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Database } = require('../../src/database');
    const original = Database.prototype.getFileEntry;
    Database.prototype.getFileEntry = async () => ({ conferenceId: 1, areaId: 1, ...entry });
    restoreLookup = () => { Database.prototype.getFileEntry = original; };
    return buildApp();
  }

  afterEach(() => { restoreLookup?.(); restoreLookup = null; });

  it('serves a pooled row from its recorded location', async () => {
    const { backend } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    const app = catalogRoute({
      id: 7,
      filename: 'DEMO.LHA',
      size: 7,
      storageVolume: 2,
      objectKey: 'Conf1/Files/DEMO.LHA',
    });

    const res = await request(app).get('/api/download/7');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('payload');
    expect(res.headers['content-disposition']).toContain('DEMO.LHA');
  });

  it('answers 503, not 404, when that volume cannot be reached', async () => {
    const { backend } = fixture();
    await backend.put('Conf1/Files/DEMO.LHA', Buffer.from('payload'));
    backend.down = true;
    const app = catalogRoute({
      id: 7,
      filename: 'DEMO.LHA',
      size: 7,
      storageVolume: 2,
      objectKey: 'Conf1/Files/DEMO.LHA',
    });

    const res = await request(app).get('/api/download/7');

    expect(res.status).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('not found');
  });

  it('leaves a local row on the disk walk it always used', async () => {
    const { backend, dataDir } = fixture();
    fs.mkdirSync(path.join(dataDir, 'Node0', 'Playpen'), { recursive: true });
    fs.writeFileSync(path.join(dataDir, 'Node0', 'Playpen', 'LEGACY.TXT'), 'legacy');
    const app = catalogRoute({ id: 8, filename: 'LEGACY.TXT', size: 6 });

    const res = await request(app).get('/api/download/8');

    expect(res.status).toBe(200);
    expect(Buffer.from(res.body).toString()).toBe('legacy');
    expect(backend.requests).toBe(0);
  });
});
