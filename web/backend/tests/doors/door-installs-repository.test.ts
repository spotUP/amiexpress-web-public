import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const DDL = fs.readFileSync(
  path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8');

describe('door_installs repository', () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'installs-'));
    dbPath = path.join(dir, 'test.db');
    const db = new Database(dbPath);
    db.exec(DDL);
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

  function repo() {
    return require('../../src/doors/door-installs.repository') as
      typeof import('../../src/doors/door-installs.repository');
  }

  const base = {
    id: 'i1', catalog_id: 'c1', archive_name: 'ACC-V103.LHA', command: 'ACCV103',
    install_dir: 'Doors/ACCV103', door_type: 'AIM', name: 'Account Editor',
    md5: 'ef283e5f', description: 'Account editor', category: 'Utility',
    version: '1.03', release_group: 'VTL',
    source_url: 'https://doors.uprough.net/api/door-repo',
    source_revision: 'c3300-t1787029906',
  };

  it('records an install and finds it by command', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByCommand('ACCV103')?.archive_name).toBe('ACC-V103.LHA');
  });

  it('finds an install by archive name, which is the durable join key', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByArchive('ACC-V103.LHA')?.command).toBe('ACCV103');
    expect(r.isArchiveInstalled('ACC-V103.LHA')).toBe(true);
    expect(r.isArchiveInstalled('NOPE.LHA')).toBe(false);
  });

  it('stamps installed_at when the caller does not', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByCommand('ACCV103')!.installed_at).toBeGreaterThan(0);
  });

  // BBSApi overlays these onto the doors list; without them a door installed
  // from the repo would lose its description and version in the door menu.
  it('keeps the display metadata BBSApi overlays', () => {
    const r = repo();
    r.recordInstall(base);
    expect(r.getInstallByCommand('ACCV103')).toMatchObject({
      description: 'Account editor', category: 'Utility',
      version: '1.03', release_group: 'VTL',
    });
  });

  it('re-installing the same command replaces the row rather than duplicating it', () => {
    const r = repo();
    r.recordInstall(base);
    r.recordInstall({ ...base, id: 'i2', archive_name: 'ACC-V105.LHA' });
    expect(r.listInstalls()).toHaveLength(1);
    expect(r.getInstallByCommand('ACCV103')?.archive_name).toBe('ACC-V105.LHA');
  });

  it('removes an install', () => {
    const r = repo();
    r.recordInstall(base);
    r.removeInstall('ACCV103');
    expect(r.getInstallByCommand('ACCV103')).toBeNull();
    expect(r.listInstalls()).toHaveLength(0);
  });

  it('returns null rather than throwing for an unknown command', () => {
    expect(repo().getInstallByCommand('NOSUCH')).toBeNull();
  });
});
