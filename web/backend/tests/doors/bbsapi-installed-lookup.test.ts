import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('BBSApi installed-door lookup', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bbsapi-'));
    const dbPath = path.join(dir, 'test.db');
    const db = new Database(dbPath);
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8'));
    db.close();
    process.env.DATABASE_DIR = dir;
    process.env.DATABASE_FILE = 'test.db';
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.DATABASE_DIR;
    delete process.env.DATABASE_FILE;
  });

  it('finds an installed door by its command through door_installs', () => {
    const repo = require('../../src/doors/door-installs.repository') as
      typeof import('../../src/doors/door-installs.repository');
    repo.recordInstall({
      id: 'i1', catalog_id: null, archive_name: 'ACC-V103.LHA', command: 'ACCV103',
      install_dir: 'Doors/ACCV103', door_type: 'AIM', name: 'Account Editor',
      md5: null, description: null, category: null, version: null, release_group: null,
      source_url: null, source_revision: null,
    });
    expect(repo.getInstallByCommand('ACCV103')?.name).toBe('Account Editor');
  });

  it('does not import the catalog service any more', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'BBSApi.ts'), 'utf-8');
    expect(src).not.toMatch(/door-catalog\.service/);
    expect(src).toMatch(/door-installs\.repository/);
  });
});
