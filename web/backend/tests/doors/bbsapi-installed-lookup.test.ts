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

  describe('getDoorList — single DB fetch per door', () => {
    // door-installs.repository's getInstallByCommand opens and closes its
    // own better-sqlite3 connection per call. getDoorList used to call it
    // twice per door (once for applyInstallMetadata, once for the repo
    // overlay's archiveName) - 740 open/close cycles for 370 registered
    // commands. This pins it at once per door.
    it('fetches each door\'s install row once, not once per overlay', async () => {
      jest.doMock('../../src/handlers/door.handler', () => ({
        getDoors: jest.fn(() => [
          { id: 'ACCV103', command: 'ACCV103', name: 'ACCV103', description: '', type: 'AIM', accessLevel: 0 },
          { id: 'WALL', command: 'WALL', name: 'WALL', description: '', type: 'XIM', accessLevel: 0 },
        ]),
      }));

      // swc compiles named exports as non-configurable getters, so
      // jest.spyOn() on the real module throws "Cannot redefine property".
      // Wrapping the real implementation in a jest.fn() via a mock factory
      // gets the same call-counting without that restriction, while every
      // other export (recordInstall, etc.) still runs its real code.
      jest.doMock('../../src/doors/door-installs.repository', () => {
        const actual = jest.requireActual('../../src/doors/door-installs.repository');
        return { ...actual, getInstallByCommand: jest.fn(actual.getInstallByCommand) };
      });

      const repoModule = require('../../src/doors/door-installs.repository') as
        typeof import('../../src/doors/door-installs.repository');
      repoModule.recordInstall({
        id: 'i1', catalog_id: null, archive_name: 'ACC-V103.LHA', command: 'ACCV103',
        install_dir: 'Doors/ACCV103', door_type: 'AIM', name: 'Account Editor',
        md5: null, description: 'Account editor door', category: 'Utility', version: null,
        release_group: null, source_url: null, source_revision: null,
      });

      const spy = repoModule.getInstallByCommand as jest.Mock;

      const { BBSApi } = require('../../src/doors/BBSApi') as typeof import('../../src/doors/BBSApi');
      const api = new BBSApi({} as any, { dataDir: dir } as any);

      const doors = await api.getDoorList();

      expect(doors).toHaveLength(2);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls.map(c => c[0]).sort()).toEqual(['ACCV103', 'WALL']);
      expect(doors.find(d => d.command === 'ACCV103')?.name).toBe('Account Editor');
    });
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
