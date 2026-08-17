/**
 * door-repo routes: read-only HTTP API over the door catalog —
 * GET /api/door-repo/manifest, /list.txt, /archive/:archiveName, /health.
 *
 * Seeds its own isolated sqlite DB via DATABASE_DIR/DATABASE_FILE (mirrors
 * tests/doors/door-repo-manifest.test.ts's pattern) rather than the global
 * testDb, and defers requiring the router module until AFTER those env vars
 * are set (jest.resetModules() + require() inside beforeEach, never a
 * static top-level import of door-repo.routes/door-repo-manifest/
 * door-catalog.service) — those modules compute their DB path from
 * process.env at first-require time, so importing them before the env vars
 * are set would point them at the real repo database.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import express, { Express, Router } from 'express';
import request from 'supertest';

describe('door-repo routes', () => {
  let tmpDir: string;
  let archiveDir: string;
  let db: Database.Database;
  let app: Express;
  let realArchivePath: string;
  let realArchiveContent: Buffer;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-repo-routes-'));
    archiveDir = path.join(tmpDir, 'Archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'test.sqlite');

    process.env.DOOR_ARCHIVES_ROOT = archiveDir;
    process.env.DATABASE_DIR = tmpDir;
    process.env.DATABASE_FILE = 'test.sqlite';

    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS door_catalog (
        id                  TEXT PRIMARY KEY,
        archive_name        TEXT NOT NULL UNIQUE,
        archive_path        TEXT NOT NULL,
        binary_name         TEXT,
        door_type           TEXT DEFAULT 'XIM',
        name                TEXT NOT NULL,
        version             TEXT,
        author              TEXT,
        release_group       TEXT,
        description         TEXT,
        file_id_diz         TEXT,
        doc_filename        TEXT,
        doc_raw             TEXT,
        suggested_tooltypes TEXT,
        category            TEXT,
        archive_size        INTEGER DEFAULT 0,
        junk_count          INTEGER DEFAULT 0,
        installed           INTEGER DEFAULT 0,
        installed_as        TEXT,
        install_dir         TEXT,
        corpus_id           TEXT,
        source              TEXT DEFAULT 'scan',
        indexed_at          INTEGER DEFAULT (strftime('%s','now'))
      )
    `);

    realArchiveContent = Buffer.from('door-repo-route-test-archive-contents\r\nsecond line');
    realArchivePath = path.join(archiveDir, 'real.lha');
    fs.writeFileSync(realArchivePath, realArchiveContent);

    // Row 1: real archive on disk — used for archive-download assertions.
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-1',
      'REAL_DOOR.LHA',
      'real.lha',
      'XIM',
      'Real Door',
      'Some Author',
      'SomeGroup',
      'Games',
      'A real archive on disk',
      'Real file_id.diz',
      realArchiveContent.length
    );

    // Row 2: catalog row whose archive was never written to disk.
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-2',
      'MISSING_DOOR.LHA',
      'missing.lha',
      'DD',
      'Missing Door',
      null,
      null,
      'Utils',
      'A door whose archive is absent',
      null,
      999
    );

    db.close();

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { doorRepoRouter } = require('../../src/server/door-repo.routes') as { doorRepoRouter: Router };
    app = express();
    app.use('/api/door-repo', doorRepoRouter);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  describe('GET /api/door-repo/manifest', () => {
    it('returns 200 with manifest JSON shape, revision header, and ETag', async () => {
      const res = await request(app).get('/api/door-repo/manifest');
      expect(res.status).toBe(200);
      expect(res.body.formatVersion).toBe(1);
      expect(Array.isArray(res.body.doors)).toBe(true);
      expect(res.body.doors).toHaveLength(2);

      const revision = res.body.revision;
      expect(typeof revision).toBe('string');
      expect(revision.length).toBeGreaterThan(0);
      expect(res.headers['x-door-repo-revision']).toBe(revision);
      expect(res.headers['etag']).toBe(`"${revision}"`);
    });

    it('returns 304 with an empty body when If-None-Match matches the current revision', async () => {
      const first = await request(app).get('/api/door-repo/manifest');
      const etag = first.headers['etag'];
      expect(etag).toBeTruthy();

      const second = await request(app)
        .get('/api/door-repo/manifest')
        .set('If-None-Match', etag);

      expect(second.status).toBe(304);
      expect(second.text || '').toBe('');
    });

    it('supports ?type= filtering', async () => {
      const res = await request(app).get('/api/door-repo/manifest').query({ type: 'DD' });
      expect(res.status).toBe(200);
      expect(res.body.doors).toHaveLength(1);
      expect(res.body.doors[0].archiveName).toBe('MISSING_DOOR.LHA');
    });

    it('supports ?q= filtering', async () => {
      const res = await request(app).get('/api/door-repo/manifest').query({ q: 'Some Author' });
      expect(res.status).toBe(200);
      expect(res.body.doors).toHaveLength(1);
      expect(res.body.doors[0].archiveName).toBe('REAL_DOOR.LHA');
    });
  });

  describe('GET /api/door-repo/list.txt', () => {
    it('returns ISO-8859-1 plain text with the golden header line and CRLF endings', async () => {
      const res = await request(app).get('/api/door-repo/list.txt');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/plain; charset=ISO-8859-1');
      expect(res.headers['x-door-repo-revision']).toBeTruthy();

      const lines = res.text.split('\r\n');
      expect(lines[0]).toMatch(/^DOORREPO\|1\|.+\|2$/);
      expect(res.text.endsWith('\r\n')).toBe(true);
    });
  });

  describe('GET /api/door-repo/archive/:archiveName', () => {
    it('streams the archive with correct Content-Length and checksum headers', async () => {
      const res = await request(app).get('/api/door-repo/archive/REAL_DOOR.LHA');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/octet-stream');
      expect(res.headers['content-length']).toBe(String(realArchiveContent.length));
      expect(res.headers['x-door-repo-revision']).toBeTruthy();
      expect(res.headers['x-archive-md5']).toBe(
        crypto.createHash('md5').update(realArchiveContent).digest('hex')
      );
      expect(res.headers['x-archive-sha256']).toBe(
        crypto.createHash('sha256').update(realArchiveContent).digest('hex')
      );

      const body: Buffer = res.body instanceof Buffer ? res.body : Buffer.from(res.text, 'latin1');
      expect(Buffer.compare(body, realArchiveContent)).toBe(0);
    });

    it('returns 404 with a plaintext NOT FOUND body for an unknown archive name', async () => {
      const res = await request(app).get('/api/door-repo/archive/NOPE_NOT_REAL.LHA');
      expect(res.status).toBe(404);
      expect(res.text).toBe('NOT FOUND: NOPE_NOT_REAL.LHA\r\n');
    });

    it('returns 404 for a catalog row whose archive file is missing on disk', async () => {
      const res = await request(app).get('/api/door-repo/archive/MISSING_DOOR.LHA');
      expect(res.status).toBe(404);
      expect(res.text).toBe('NOT FOUND: MISSING_DOOR.LHA\r\n');
    });

    it('returns 404 for an encoded path-traversal attempt (catalog lookup misses, no filesystem pathing)', async () => {
      const res = await request(app).get('/api/door-repo/archive/..%2F..%2Fetc%2Fpasswd');
      expect(res.status).toBe(404);
      expect(res.text).toContain('NOT FOUND');
    });
  });

  describe('GET /api/door-repo/health', () => {
    it('returns status ok with a non-empty revision and a doors count matching the seeds', async () => {
      const res = await request(app).get('/api/door-repo/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.revision).toBe('string');
      expect(res.body.revision.length).toBeGreaterThan(0);
      expect(res.body.doors).toBe(2);
      expect(res.headers['x-door-repo-revision']).toBe(res.body.revision);
    });

    it('does not compute archive checksums — uses the lightweight door count, not buildManifest', async () => {
      // swc compiles named exports as non-configurable getters, so
      // jest.spyOn(mod, 'getArchiveChecksums') throws "Cannot redefine
      // property". jest.doMock replaces the whole module at require() time
      // instead of trying to patch a frozen export, which works reliably
      // here. Needs its own resetModules + fresh require (the outer `app`
      // from beforeEach already bound to the real, unmocked checksums
      // module) and its own express app.
      const checksumSpy = jest.fn();
      jest.resetModules();
      jest.doMock('../../src/doors/door-repo-checksums', () => ({
        getArchiveChecksums: checksumSpy,
        _clearChecksumCacheForTests: jest.fn(),
      }));

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { doorRepoRouter: freshRouter } = require('../../src/server/door-repo.routes') as {
        doorRepoRouter: Router;
      };
      const freshApp = express();
      freshApp.use('/api/door-repo', freshRouter);

      const res = await request(freshApp).get('/api/door-repo/health');

      expect(res.status).toBe(200);
      expect(res.body.doors).toBe(2);
      expect(checksumSpy).not.toHaveBeenCalled();

      jest.dontMock('../../src/doors/door-repo-checksums');
    });
  });

  // The mid-stream fs error branch (fs.createReadStream(...).on('error', ...))
  // is extracted into a standalone, exported function specifically so it can
  // be unit-tested directly against fake Response objects — reproducing a
  // real mid-stream failure (e.g. via a mocked Readable + real HTTP request)
  // is racy: the moment any bytes are written, Node has already committed to
  // the original Content-Length, so a truncated response reads to an HTTP
  // client as a protocol violation (aborted/parse-error) rather than a clean
  // "response finished" — not a reliable assertion. Testing the branching
  // logic directly is the clean alternative.
  describe('handleArchiveStreamError (mid-stream error branch)', () => {
    function fakeRes(headersSent: boolean) {
      return {
        headersSent,
        status: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
        end: jest.fn(),
      };
    }

    it('falls back to a 404 NOT FOUND when headers have not been sent yet', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { handleArchiveStreamError } = require('../../src/server/door-repo.routes') as {
        handleArchiveStreamError: (res: unknown, archiveName: string) => void;
      };
      const res = fakeRes(false);

      handleArchiveStreamError(res, 'SOME_DOOR.LHA');

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.set).toHaveBeenCalledWith('Content-Type', 'text/plain');
      expect(res.send).toHaveBeenCalledWith('NOT FOUND: SOME_DOOR.LHA\r\n');
      expect(res.end).not.toHaveBeenCalled();
    });

    it('terminates the response instead of re-sending headers when headers were already sent', () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { handleArchiveStreamError } = require('../../src/server/door-repo.routes') as {
        handleArchiveStreamError: (res: unknown, archiveName: string) => void;
      };
      const res = fakeRes(true);

      handleArchiveStreamError(res, 'SOME_DOOR.LHA');

      expect(res.end).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.send).not.toHaveBeenCalled();
    });
  });
});
