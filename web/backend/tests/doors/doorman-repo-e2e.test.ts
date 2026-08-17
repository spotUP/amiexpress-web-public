/**
 * doorman-repo-e2e: end-to-end consumer flow against a REAL, locally-started
 * HTTP server — Task 10 of the door-repo API plan.
 *
 * Unlike tests/api/door-repo-routes.test.ts (supertest, no real socket) and
 * tests/doors/doorman-repo-client.test.ts (real client, mocked fetch), this
 * test wires the REAL client (Doors/door-manager/repo-client.ts:
 * fetchManifest/downloadArchive) against the REAL doorRepoRouter bound to a
 * real ephemeral TCP port via app.listen(0) — no mocks on either side, all
 * traffic over 127.0.0.1. It proves the whole round trip actually works over
 * the wire: ETag/If-None-Match conditional GET, real Content-Length framing,
 * and real sha256 verification against bytes the client actually received.
 *
 * DB/env setup mirrors door-repo-routes.test.ts's pattern exactly: an
 * isolated sqlite DB seeded via DATABASE_DIR/DATABASE_FILE, and the router
 * module required only AFTER those env vars (plus DOOR_ARCHIVES_ROOT) are
 * set, via jest.resetModules() + require() — door-repo-manifest.ts and
 * door-catalog.service.ts resolve their DB path from process.env at first
 * require, so importing them earlier would point at the real repo database.
 *
 * Run with SKIP_DB_INIT=1 (see the task command) so tests/setup.ts's global
 * testDb bootstrap — irrelevant here, this suite manages its own DB — never
 * runs; the isolated per-suite sqlite file below is the only DB touched.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import Database from 'better-sqlite3';
import express, { Express, Router } from 'express';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import type { RepoClientConfig } from '../../../../Doors/door-manager/repo-client';

describe('doorman repo-client E2E against a real local server', () => {
  let tmpDir: string;
  let archiveDir: string;
  let app: Express;
  let server: Server;
  let baseUrl: string;
  let realArchivePath: string;
  let realArchiveContent: Buffer;
  const ORIGINAL_ENV = { ...process.env };

  // Real fetchManifest/downloadArchive — loaded via jest.resetModules() +
  // require() alongside the router below so both sides of the flow come
  // from the SAME require pass (avoids any stale-module surprises from
  // resetModules() being called elsewhere in the suite run).
  let fetchManifest: typeof import('../../../../Doors/door-manager/repo-client').fetchManifest;
  let downloadArchive: typeof import('../../../../Doors/door-manager/repo-client').downloadArchive;

  beforeAll(async () => {
    jest.resetModules();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-repo-e2e-'));
    archiveDir = path.join(tmpDir, 'Archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'test.sqlite');

    process.env.DOOR_ARCHIVES_ROOT = archiveDir;
    process.env.DATABASE_DIR = tmpDir;
    process.env.DATABASE_FILE = 'test.sqlite';

    const db = new Database(dbPath);
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

    realArchiveContent = Buffer.from(
      'door-repo-e2e-test-archive-contents\r\nreal bytes for real checksum verification\r\n' +
        crypto.randomBytes(64).toString('hex')
    );
    realArchivePath = path.join(archiveDir, 'real.lha');
    fs.writeFileSync(realArchivePath, realArchiveContent);

    // Row 1: real archive on disk — the one fetched/downloaded below.
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-1',
      'E2E_REAL_DOOR.LHA',
      'real.lha',
      'XIM',
      'E2E Real Door',
      'E2E Author',
      'E2EGroup',
      'Games',
      'A real archive on disk for the e2e flow',
      'E2E file_id.diz',
      realArchiveContent.length
    );

    // Row 2: catalog row whose archive was never written to disk — just
    // proves the manifest tolerates a mixed catalog (matches
    // door-repo-routes.test.ts's seeding shape); not otherwise exercised.
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-2',
      'E2E_MISSING_DOOR.LHA',
      'missing.lha',
      'DD',
      'E2E Missing Door',
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const repoClient = require('../../../../Doors/door-manager/repo-client') as typeof import('../../../../Doors/door-manager/repo-client');
    fetchManifest = repoClient.fetchManifest;
    downloadArchive = repoClient.downloadArchive;

    app = express();
    app.use('/api/door-repo', doorRepoRouter);

    await new Promise<void>((resolve, reject) => {
      server = app.listen(0, '127.0.0.1', () => resolve());
      server.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function freshClientConfig(cacheFileName: string): RepoClientConfig {
    return { url: baseUrl, cacheFile: path.join(tmpDir, cacheFileName) };
  }

  it('fetchManifest: a fresh request returns fromCache:false and persists the cache to disk', async () => {
    const cfg = freshClientConfig('cache-fresh.json');

    const result = await fetchManifest(cfg);

    expect(result.fromCache).toBe(false);
    expect(result.manifest.formatVersion).toBe(1);
    expect(result.manifest.doors).toHaveLength(2);
    const door = result.manifest.doors.find((d) => d.archiveName === 'E2E_REAL_DOOR.LHA');
    expect(door).toBeDefined();
    expect(door!.sha256).toBe(crypto.createHash('sha256').update(realArchiveContent).digest('hex'));
    expect(door!.md5).toBe(crypto.createHash('md5').update(realArchiveContent).digest('hex'));

    expect(fs.existsSync(cfg.cacheFile)).toBe(true);
    const cached = JSON.parse(fs.readFileSync(cfg.cacheFile, 'utf8')) as { etag: string; manifest: unknown };
    expect(cached.etag).toBeTruthy();
    expect(cached.manifest).toEqual(result.manifest);
  });

  // DISCOVERED DEFECT (reported, not fixed -- this is a test-only task and
  // neither door-repo.routes.ts nor Doors/door-manager/repo-client.ts was
  // touched). The task brief for this test expected: real fetchManifest()
  // call #1 -> fromCache:false + persists {etag}; call #2, driven through
  // the SAME unmodified fetchManifest(), sends If-None-Match from that
  // cache and gets a real 304 -> fromCache:true. That does NOT happen.
  //
  // Root cause, isolated below: repo-client.ts's fetchManifest() calls
  // `fetch(manifestUrl, { headers })` with no `cache` option and no
  // Cache-Control override. Node's built-in fetch (undici) then adds
  // `Cache-Control: no-cache` + `Pragma: no-cache` to EVERY outgoing
  // request by default (verified directly against a raw http.Server echo
  // -- confirmed independent of this test's Express app, this repo, or
  // jest: also reproduced with `cache: 'default'` and `cache: 'no-store'`
  // explicitly set, and by omitting `cache` entirely; only `cache:
  // 'force-cache'` or the caller supplying its own non-"no-cache"
  // Cache-Control header value suppresses it). door-repo.routes.ts's
  // GET /manifest deliberately honors RFC 9111 s5.2.1.4 ("Cache-Control:
  // no-cache forces end-to-end revalidation even when If-None-Match would
  // otherwise match exactly" -- see its own doc comment and the matching
  // unit test in door-repo-routes.test.ts) by routing every request
  // through Express's `req.fresh`, which respects that directive. The two
  // behaviors are each correct/intentional in isolation and independently
  // unit-tested, but together they mean: a real Node fetch()-based
  // door-repo consumer can NEVER receive a 304 from this endpoint as the
  // client is currently written -- every "conditional" fetch pays the full
  // buildManifest() cost (md5+sha256 for every catalog row, ~3300 archives
  // in production) server-side, defeating the entire point of the ETag
  // cache. This can only surface with a real client + real server + real
  // fetch() wired together, which is exactly what this task built.
  it('fetchManifest: DEFECT -- a refetch through the real (unmodified) client never reaches the server 304 path, because Node fetch always sends Cache-Control: no-cache and the server (correctly, per RFC 9111) honors it', async () => {
    const cfg = freshClientConfig('cache-304.json');

    const first = await fetchManifest(cfg);
    expect(first.fromCache).toBe(false);
    const persistedEtag = (JSON.parse(fs.readFileSync(cfg.cacheFile, 'utf8')) as { etag: string }).etag;
    expect(persistedEtag).toBeTruthy();

    // What the brief expected: a second call through the SAME unmodified
    // fetchManifest() should come back fromCache:true. It does not --
    // pinned here as the actual, current, reproducible behavior so this
    // test fails loudly (not silently) if that ever accidentally starts
    // working without a deliberate fix landing (which would mean this
    // comment block and task-10-report.md need updating, not that the
    // assertion below is wrong).
    const second = await fetchManifest(cfg);
    expect(second.fromCache).toBe(false);

    // Isolates the fault to the CLIENT's default fetch headers, not the
    // server's conditional-GET logic (already unit-tested in
    // door-repo-routes.test.ts, and re-verified here end-to-end): a raw
    // fetch of the exact same URL with the exact same If-None-Match value,
    // using `cache: 'force-cache'` to suppress undici's default
    // Cache-Control injection (the one override confirmed above to work),
    // DOES get a real 304 from the real server over the real socket.
    const manifestUrl = `${baseUrl}/api/door-repo/manifest`;
    const rawConditional = await fetch(manifestUrl, {
      headers: { 'If-None-Match': persistedEtag },
      cache: 'force-cache',
    });
    expect(rawConditional.status).toBe(304);
  });

  it('downloadArchive: downloads the real archive and verifies it against the server\'s own manifest sha256', async () => {
    const cfg = freshClientConfig('cache-download.json');
    const manifestResult = await fetchManifest(cfg);
    const door = manifestResult.manifest.doors.find((d) => d.archiveName === 'E2E_REAL_DOOR.LHA');
    expect(door).toBeDefined();
    expect(door!.sha256).toBeTruthy();

    const destPath = path.join(tmpDir, 'downloaded-real-door.lha');

    await downloadArchive(cfg, 'E2E_REAL_DOOR.LHA', destPath, door!.sha256!);

    expect(fs.existsSync(destPath)).toBe(true);
    const written = fs.readFileSync(destPath);
    expect(Buffer.compare(written, realArchiveContent)).toBe(0);

    fs.rmSync(destPath, { force: true });
  });

  it('downloadArchive: a deliberately wrong expected sha256 throws naming both digests and leaves no file behind', async () => {
    const cfg = freshClientConfig('cache-corrupt.json');
    const manifestResult = await fetchManifest(cfg);
    const door = manifestResult.manifest.doors.find((d) => d.archiveName === 'E2E_REAL_DOOR.LHA');
    expect(door).toBeDefined();
    const actualSha256 = door!.sha256!;
    const wrongExpected = 'f'.repeat(64);
    expect(wrongExpected).not.toBe(actualSha256);

    const destPath = path.join(tmpDir, 'corrupted-real-door.lha');

    await expect(
      downloadArchive(cfg, 'E2E_REAL_DOOR.LHA', destPath, wrongExpected)
    ).rejects.toThrow(new RegExp(`${wrongExpected}.*${actualSha256}|${actualSha256}.*${wrongExpected}`, 's'));

    expect(fs.existsSync(destPath)).toBe(false);
  });
});
