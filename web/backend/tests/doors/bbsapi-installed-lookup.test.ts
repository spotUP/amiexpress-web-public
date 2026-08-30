import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import { applyInstallMetadata } from '../../src/doors/BBSApi';

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

  it('overlays all five catalog fields onto the door object', () => {
    const door = { command: 'ACCV103', name: 'ACCV103', description: '', category: '' };
    const out = applyInstallMetadata(door, {
      id: 'i1', catalog_id: null, archive_name: 'ACC-V103.LHA', command: 'ACCV103',
      install_dir: 'Doors/ACCV103', door_type: 'AIM', name: 'Account Editor',
      description: 'Account editor door', category: 'Utility', version: '1.03',
      release_group: 'VTL', md5: null, installed_at: 1, source_url: null, source_revision: null,
    });
    expect(out).toMatchObject({
      name: 'Account Editor', description: 'Account editor door',
      category: 'Utility', version: '1.03', releaseGroup: 'VTL',
    });
  });

  it('keeps the door object unchanged when nothing is installed under that command', () => {
    const door = { command: 'NOPE', name: 'Original', description: 'Original description' };
    expect(applyInstallMetadata(door, null)).toEqual(door);
  });

  it('falls back to the door object own values when the install record has blanks', () => {
    // applyInstallMetadata always adds version/releaseGroup keys to its
    // result (possibly undefined); type the fixture to admit those fields
    // so this reads the real return contract instead of the narrower shape
    // TS would otherwise infer from the literal.
    const door: {
      command: string; name: string; description: string; category: string;
      version?: string; releaseGroup?: string;
    } = { command: 'X', name: 'Door Name', description: 'Door description', category: 'Games' };
    const out = applyInstallMetadata(door, {
      id: 'i2', catalog_id: null, archive_name: 'X.LHA', command: 'X', install_dir: 'Doors/X',
      door_type: 'XIM', name: '', description: '', category: '', version: null,
      release_group: null, md5: null, installed_at: 1, source_url: null, source_revision: null,
    });
    expect(out).toMatchObject({ name: 'Door Name', description: 'Door description', category: 'Games' });
    expect(out.version).toBeUndefined();
    expect(out.releaseGroup).toBeUndefined();
  });
});
