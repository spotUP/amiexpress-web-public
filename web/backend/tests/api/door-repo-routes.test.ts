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
import { Readable } from 'stream';
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

    it('returns 304 with an empty body and the revision header when If-None-Match matches the current revision (strong exact match)', async () => {
      const first = await request(app).get('/api/door-repo/manifest');
      const etag = first.headers['etag'];
      expect(etag).toBeTruthy();

      const second = await request(app)
        .get('/api/door-repo/manifest')
        .set('If-None-Match', etag);

      expect(second.status).toBe(304);
      expect(second.text || '').toBe('');
      expect(second.headers['x-door-repo-revision']).toBeTruthy();
      expect(second.headers['x-door-repo-revision']).toBe(first.body.revision);
    });

    // RFC 7232: If-None-Match uses WEAK comparison by default (a W/"..."
    // validator from a cache/intermediary must still match our strong
    // "..." ETag), allows a comma-separated candidate list, and honors
    // "*" as a match-anything wildcard. A real 68K client or an HTTP
    // proxy sitting in front of this API will exercise all of these.
    describe('If-None-Match variants (RFC 7232 conditional GET)', () => {
      it('matches a weak validator (W/"<rev>") against our strong ETag', async () => {
        const first = await request(app).get('/api/door-repo/manifest');
        const revision = first.body.revision as string;

        const second = await request(app)
          .get('/api/door-repo/manifest')
          .set('If-None-Match', `W/"${revision}"`);

        expect(second.status).toBe(304);
        expect(second.text || '').toBe('');
      });

      it('matches when the revision appears anywhere in a comma-separated candidate list', async () => {
        const first = await request(app).get('/api/door-repo/manifest');
        const revision = first.body.revision as string;

        const second = await request(app)
          .get('/api/door-repo/manifest')
          .set('If-None-Match', `"some-other-rev", "${revision}", W/"yet-another"`);

        expect(second.status).toBe(304);
      });

      it('matches the "*" wildcard', async () => {
        const res = await request(app).get('/api/door-repo/manifest').set('If-None-Match', '*');
        expect(res.status).toBe(304);
      });

      it('returns 200 for a non-matching If-None-Match value', async () => {
        const res = await request(app)
          .get('/api/door-repo/manifest')
          .set('If-None-Match', '"totally-different-revision"');
        expect(res.status).toBe(200);
      });

      it('returns 200 when If-None-Match is absent', async () => {
        const res = await request(app).get('/api/door-repo/manifest');
        expect(res.status).toBe(200);
      });

      // RFC 9111 s5.2.1.4: Cache-Control: no-cache forces end-to-end
      // revalidation even when If-None-Match would otherwise match exactly.
      // A hand-rolled `if (ifNoneMatch === etag)` shortcut that returns 304
      // before Express's own conditional-GET handling runs would miss this
      // — it has no Cache-Control awareness at all. Routing every case
      // (including the exact match) through res.json()'s built-in
      // freshness check (which respects Cache-Control: no-cache) is what
      // this test guards.
      it('ignores an otherwise-matching If-None-Match when Cache-Control: no-cache forces revalidation', async () => {
        const first = await request(app).get('/api/door-repo/manifest');
        const etag = first.headers['etag'];

        const second = await request(app)
          .get('/api/door-repo/manifest')
          .set('If-None-Match', etag)
          .set('Cache-Control', 'no-cache');

        expect(second.status).toBe(200);
        expect(second.body.formatVersion).toBe(1);
      });
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

    // TOCTOU guard: Content-Length and the streamed bytes must come from
    // the SAME fd (one fs.openSync + fs.fstatSync), not from an independent
    // statSync followed by a second, independent createReadStream(path)
    // open — if the file's size changed between those two opens, the
    // declared Content-Length would no longer match the streamed byte
    // count and HTTP/1.1 framing corrupts for that connection. These tests
    // assert the fd lifecycle directly: opened exactly once, closed
    // exactly once, on both the success and the failure path — a
    // deterministic assertion on *whether close was invoked*, not a
    // sleep/poll waiting for the OS-level close to complete.
    //
    // Spying: `jest.spyOn(fs, 'openSync')` using this test file's own
    // `import * as fs from 'fs'` does NOT intercept the router's calls —
    // swc compiles namespace imports via `_interopRequireWildcard`, which
    // snapshots each PROPERTY VALUE into a fresh per-file object at
    // require-time (`newObj[key] = obj[key]`), so the test file's `fs` and
    // the router's `fs` are two independently-copied objects, not the same
    // reference. The fix mirrors the checksum-spy pattern above: spy on
    // the raw `require('fs')` singleton (a genuine plain CJS `require()`
    // call is left untouched by swc, no wrapping) BEFORE resetModules()
    // forces a fresh require of the router, so the router's fresh
    // namespace-import snapshot captures the already-spied functions.
    describe('file descriptor lifecycle (TOCTOU guard)', () => {
      it('opens the file exactly once and closes it exactly once after a successful stream', async () => {
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fsCore = require('fs') as typeof fs;
        const openSpy = jest.spyOn(fsCore, 'openSync');
        const closeSpy = jest.spyOn(fsCore, 'close');

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { doorRepoRouter: freshRouter } = require('../../src/server/door-repo.routes') as {
          doorRepoRouter: Router;
        };
        const freshApp = express();
        freshApp.use('/api/door-repo', freshRouter);

        // The resetModules()+fresh-require above reloads the router's
        // ENTIRE dependency graph (express, better-sqlite3, etc.), which
        // itself makes many unrelated fs.openSync/close calls as Node's
        // module loader reads .js files off disk. Clear the spies now so
        // only calls made while actually handling the request are counted.
        openSpy.mockClear();
        closeSpy.mockClear();

        const res = await request(freshApp).get('/api/door-repo/archive/REAL_DOOR.LHA');

        expect(res.status).toBe(200);
        expect(res.headers['content-length']).toBe(String(realArchiveContent.length));

        // Our own explicit fs.openSync(absPath, 'r') for the streaming fd.
        // getArchiveChecksums() independently reads the same file via
        // readFileSync (a documented, accepted separate read for metadata
        // headers, not wire framing — see the route's doc comment) which
        // may itself open+close a second fd; assert our streaming fd
        // specifically opened `absPath` and was closed exactly once,
        // rather than assuming a single global call count.
        const ourOpenCall = openSpy.mock.calls.find((call) => call[0] === realArchivePath);
        expect(ourOpenCall).toBeDefined();
        const fd = openSpy.mock.results[openSpy.mock.calls.indexOf(ourOpenCall!)]!.value as number;

        const closeCallsForFd = closeSpy.mock.calls.filter((call) => call[0] === fd);
        expect(closeCallsForFd).toHaveLength(1);

        openSpy.mockRestore();
        closeSpy.mockRestore();
      });

      it('closes the file descriptor exactly once when the stream errors after opening (no leak on the failure path)', async () => {
        jest.resetModules();
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fsCore = require('fs') as typeof fs;
        const openSpy = jest.spyOn(fsCore, 'openSync');
        const closeSpy = jest.spyOn(fsCore, 'close');
        const createReadStreamSpy = jest.spyOn(fsCore, 'createReadStream').mockImplementation(() => {
          const s = new Readable({ read() {} });
          process.nextTick(() => s.emit('error', new Error('simulated mid-stream failure')));
          return s as unknown as fs.ReadStream;
        });

        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { doorRepoRouter: freshRouter } = require('../../src/server/door-repo.routes') as {
          doorRepoRouter: Router;
        };
        const freshApp = express();
        freshApp.use('/api/door-repo', freshRouter);

        // See the previous test: clear post-require module-loading noise
        // before counting request-scoped fs calls.
        openSpy.mockClear();
        closeSpy.mockClear();

        const res = await request(freshApp).get('/api/door-repo/archive/REAL_DOOR.LHA');

        // The mocked stream errors before any bytes are pushed, so the
        // route's error handler still has a clean slate to fall back to
        // its usual 404 (see handleArchiveStreamError tests below).
        expect(res.status).toBe(404);

        const ourOpenCall = openSpy.mock.calls.find((call) => call[0] === realArchivePath);
        expect(ourOpenCall).toBeDefined();
        const fd = openSpy.mock.results[openSpy.mock.calls.indexOf(ourOpenCall!)]!.value as number;

        const closeCallsForFd = closeSpy.mock.calls.filter((call) => call[0] === fd);
        expect(closeCallsForFd).toHaveLength(1);

        createReadStreamSpy.mockRestore();
        openSpy.mockRestore();
        closeSpy.mockRestore();
      });
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
