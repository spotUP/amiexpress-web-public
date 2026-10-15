/**
 * The admin API hashes with the bcrypt this project actually installs.
 *
 * Reported from the live site, saving a user:
 *
 *   Failed to update user: Cannot find module 'bcrypt'
 *   Require stack: - /app/web/backend/src/api/config-routes.ts
 *
 * The whole backend uses bcryptjs, and that is what package.json declares.
 * This one file required the NATIVE bcrypt, which is not a dependency - so
 * every password written through the admin API threw, in every environment
 * that had not happened to pick the native package up by accident. Setting a
 * user's password from /admin could never have worked in the container.
 *
 * The two produce interchangeable hashes, so existing passwords still
 * verify.
 *
 * What is driven: the real config router, loaded unmocked (a require of the
 * uninstalled native bcrypt fails right there), writing a password through
 * each of its three write paths - create, disk-slot update, database update -
 * and the stored value read back from the database login checks. What stays
 * a source read is the ABSENCE of the native package, which no runtime check
 * can see on a machine that happens to have it installed.
 */

import * as bcryptjs from 'bcryptjs';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import request from 'supertest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..', 'src');

function read(...parts: string[]): string {
  return readFileSync(join(SRC, ...parts), 'utf8');
}

describe('the admin config API', () => {
  const routes = read('api', 'config-routes.ts');

  it('does not require the native bcrypt', () => {
    // REASONABLE source read: an import that must be ABSENT. On a machine
    // where native bcrypt happens to be installed, loading the module would
    // succeed and nothing at runtime would show the dependency.
    expect(routes).not.toMatch(/require\(['"]bcrypt['"]\)/);
    expect(routes).not.toMatch(/from ['"]bcrypt['"]/);
  });
});

describe('every password the admin API writes is stored as a bcryptjs hash', () => {
  let app: any;
  let db: any;
  let bbsRoot: string;
  let dbDir: string;
  let previousDataDir: string | undefined;
  let previousDbDir: string | undefined;

  beforeAll(async () => {
    previousDataDir = process.env.BBS_DATA_DIR;
    previousDbDir = process.env.DATABASE_DIR;
    bbsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-bcrypt-'));
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbs-bcrypt-db-'));
    process.env.BBS_DATA_DIR = bbsRoot;
    process.env.DATABASE_DIR = dbDir;
    process.env.DATABASE_FILE = 'bcrypt-hashes.db';

    // Env first, modules after: the user-file managers resolve their paths
    // at construction (same shape as user-password-change-reaches-login).
    jest.resetModules();
    /* eslint-disable @typescript-eslint/no-var-requires */
    const express = require('express');
    const { Database } = require('../../src/database');
    const { createConfigRouter } = require('../../src/api/config-routes');
    /* eslint-enable @typescript-eslint/no-var-requires */

    db = new Database();
    await db.init();
    app = express();
    app.use(express.json());
    app.use('/api/config', createConfigRouter(db));
  }, 30000);

  afterAll(async () => {
    if (db) await db.close();
    if (previousDataDir === undefined) delete process.env.BBS_DATA_DIR;
    else process.env.BBS_DATA_DIR = previousDataDir;
    if (previousDbDir === undefined) delete process.env.DATABASE_DIR;
    else process.env.DATABASE_DIR = previousDbDir;
    fs.rmSync(bbsRoot, { recursive: true, force: true });
    fs.rmSync(dbDir, { recursive: true, force: true });
  });

  /** The stored value is a cost-10 bcrypt hash of exactly this password. */
  async function expectStoredHashOf(username: string, password: string): Promise<void> {
    const row = await db.getUserByUsername(username);
    expect(row).toBeTruthy();
    expect(row.passwordHash).not.toBe(password);
    expect(row.passwordHash).toMatch(/^\$2[aby]\$10\$/);
    expect(bcryptjs.compareSync(password, row.passwordHash)).toBe(true);
  }

  it('create, disk-slot update and database update each store a hash, never the clear text', async () => {
    const username = `bcr_${Date.now()}`;

    // 1. Create.
    const created = await request(app)
      .post('/api/config/users')
      .send({ username, password: 'created-pass', securityLevel: 10 });
    expect([200, 201]).toContain(created.status);
    await expectStoredHashOf(username, 'created-pass');

    // 2. Update by DISK slot, the id GET /users hands the admin page.
    const listed = await request(app).get('/api/config/users');
    const onDisk = (listed.body.data ?? []).find(
      (u: { username?: string }) => u.username?.toLowerCase() === username.toLowerCase(),
    );
    expect(onDisk?.id).toMatch(/^user-\d+$/);
    const bySlot = await request(app).put(`/api/config/users/${onDisk.id}`).send({ password: 'slot-pass' });
    expect([200, 201]).toContain(bySlot.status);
    await expectStoredHashOf(username, 'slot-pass');

    // 3. Update by DATABASE id.
    const row = await db.getUserByUsername(username);
    expect(row.id).not.toMatch(/^user-\d+$/);
    const byId = await request(app).put(`/api/config/users/${row.id}`).send({ password: 'db-pass' });
    expect([200, 201]).toContain(byId.status);
    await expectStoredHashOf(username, 'db-pass');
  }, 30000);
});

describe('the backend as a whole', () => {
  it('never reaches for the native bcrypt anywhere', () => {
    // REASONABLE source read: a repo-wide ban on an import that must be absent.
    // One file doing this is how the admin API broke; a test that only
    // covered that file would let the next one through.
    const { execSync } = require('child_process');
    const hits = execSync(
      `grep -rln "require(['\\"]bcrypt['\\"])\\|from ['\\"]bcrypt['\\"]" ${SRC} --include=*.ts || true`,
      { encoding: 'utf8' }
    ).trim();

    expect(hits).toBe('');
  });

  it('declares bcryptjs as a dependency', () => {
    const pkg = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8'));

    expect(pkg.dependencies.bcryptjs).toBeDefined();
    expect(pkg.dependencies.bcrypt).toBeUndefined();
  });
});
