/**
 * door-repo API mount gating (I5) — the door-repo router only makes sense
 * for a door-repo OWNER. A consumer BBS's own local catalog is not meant
 * to be served to the world (unauthenticated read of its local archive
 * corpus, including thin `source='door-repo'` cache rows with
 * `archive_path=''`). app.ts must only `app.use('/api/door-repo', ...)`
 * when isDoorRepoOwner() (door-repo.routes.ts) resolves true — semantics
 * matching Doors/door-manager/repoDataSource.ts's resolveDoorRepoMode:
 * owner only when DOOR_REPO_ROLE is EXACTLY the string 'owner'.
 *
 * When not owner, the paths must simply not exist — Express's default
 * "no route matched" 404, not a custom error response — so a disabled
 * feature isn't advertised.
 *
 * Requires a fresh require() of src/server/app.ts per scenario (the mount
 * decision runs once at module-load time), via jest.resetModules() +
 * process.env manipulation, same pattern as
 * tests/api/door-repo-routes.test.ts. DATABASE_DIR/DATABASE_FILE point at
 * an isolated temp sqlite DB so this never touches the real repo database.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import request from 'supertest';
import type { Express } from 'express';

describe('door-repo API mount gating (I5)', () => {
  let tmpDir: string;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-repo-mount-'));
    const archiveDir = path.join(tmpDir, 'Archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    const dbPath = path.join(tmpDir, 'test.sqlite');

    process.env.DOOR_ARCHIVES_ROOT = archiveDir;
    process.env.DATABASE_DIR = tmpDir;
    process.env.DATABASE_FILE = 'test.sqlite';

    // Minimal door_catalog table — just enough for getDoorCount()'s
    // `SELECT COUNT(*)` (the owner-mode /health assertion below) to
    // succeed. Empty is fine; this test asserts mounting, not content.
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS door_catalog (
        id                  TEXT PRIMARY KEY,
        archive_name        TEXT NOT NULL UNIQUE,
        archive_path        TEXT NOT NULL,
        door_type           TEXT DEFAULT 'XIM',
        name                TEXT NOT NULL,
        md5                 TEXT,
        sha256              TEXT
      )
    `);
    db.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function freshApp(): Express {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { app } = require('../../src/server/app') as { app: Express };
    return app;
  }

  it('mounts and responds when DOOR_REPO_ROLE=owner', async () => {
    process.env.DOOR_REPO_ROLE = 'owner';
    const app = freshApp();

    const res = await request(app).get('/api/door-repo/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.doors).toBe(0);
  });

  it('404s (Express default, not a custom response) when DOOR_REPO_ROLE is unset', async () => {
    delete process.env.DOOR_REPO_ROLE;
    const app = freshApp();

    const res = await request(app).get('/api/door-repo/health');

    expect(res.status).toBe(404);
    // Express's default 404 body, not door-repo.routes.ts's own plaintext
    // 404 handler (which the router would use for e.g. archive/:name) —
    // proving the ROUTER never got a chance to handle this at all.
    expect(res.text).not.toContain('NOT FOUND:');
  });

  it('404s when DOOR_REPO_ROLE=consumer (only exact "owner" mounts)', async () => {
    process.env.DOOR_REPO_ROLE = 'consumer';
    const app = freshApp();

    const res = await request(app).get('/api/door-repo/health');

    expect(res.status).toBe(404);
  });

  it('also gates /api/door-repo/manifest and /list.txt, not just /health', async () => {
    delete process.env.DOOR_REPO_ROLE;
    const app = freshApp();

    const manifestRes = await request(app).get('/api/door-repo/manifest');
    const listRes = await request(app).get('/api/door-repo/list.txt');

    expect(manifestRes.status).toBe(404);
    expect(listRes.status).toBe(404);
  });
});
