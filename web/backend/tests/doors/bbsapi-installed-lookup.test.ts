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

  it('does not BUILD the list from the catalog service', () => {
    // The door list moved to door-list.ts on 2026-08-31 (phase B), taking
    // the door_installs import with it. The rule this pins is unchanged:
    // the list is built from door_installs, never from the retired
    // door_catalog service. Both files are checked so neither can quietly
    // reacquire it.
    //
    // WHAT CHANGED, 2026-09-08: this used to forbid the STRING
    // 'door-catalog.service' anywhere in door-list.ts, and bdde95215 then had
    // to put a bare `import './door-catalog.service';` back - not to build
    // anything with, but for its side effect. A door runs in its own context
    // and cannot import backend paths, so DOORMAN's getCatalogSvc() finds the
    // catalogue by scanning require.cache for that key. Nothing imported it,
    // so the cache never held it, and DOORMAN's owner-mode browse degraded to
    // an empty list that looked like an empty repository.
    //
    // So the pin is on the PROPERTY rather than on the text: no VALUE may be
    // imported from the catalog service, which is what "built from it" would
    // look like. A bare side-effect import is not that, and is required.
    //
    // Stated as an ALLOWLIST rather than a list of forbidden import spellings.
    // The first attempt at this matched `import {x} from` and `import x from`
    // and let `const c = require(...)` and `import * as c from` straight
    // through - and a rule that has to enumerate every syntax for "use" is one
    // that will be wrong again the next time somebody writes a different one.
    // Every line naming the catalog service must be a comment or the bare
    // import; anything else is a use, whatever it looks like.
    const read = (file: string) => fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', file), 'utf-8');

    // REASONABLE source read: an import that must be ABSENT is invisible at
    // runtime. That the list IS built from door_installs is driven below
    // (getDoorList counts its getInstallByCommand calls).
    const uses = read('door-list.ts')
      .split('\n')
      .map(line => line.trim())
      .filter(line => /door-catalog\.service/.test(line))
      .filter(line => !line.startsWith('*') && !line.startsWith('//') && !line.startsWith('/*'))
      .filter(line => !/^import\s+['"]\.\/door-catalog\.service['"];?$/.test(line));

    expect(uses).toEqual([]);
    expect(read('BBSApi.ts')).not.toMatch(/door-catalog\.service/);
  });

  it('keeps the catalog service in require.cache for DOORMAN', () => {
    // The other half of the same rule, and the one that actually broke: the
    // bare import must STAY. It has no named binding on purpose - a named
    // import nothing used would be elided by the compiler and DOORMAN's
    // catalogue browse would go quietly empty again (bdde95215).
    //
    // Driven: load door-list and see whether the catalog service module was
    // loaded with it. jest keeps its own registry rather than require.cache,
    // so the service is replaced by a factory that records being evaluated -
    // it runs exactly when, and only if, something requires the module.
    const loaded = { catalogService: false };
    jest.doMock('../../src/doors/door-catalog.service', () => {
      loaded.catalogService = true;
      return {};
    });
    require('../../src/doors/door-list');
    expect(loaded.catalogService).toBe(true);
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
