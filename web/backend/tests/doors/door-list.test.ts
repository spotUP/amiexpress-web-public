/**
 * buildDoorList — the session-free door list.
 *
 * Extracted from BBSApi.getDoorList on 2026-08-31 so the HTTP route the
 * DoorRepo C door reads (GET /api/door-admin/installed) and every in-process
 * door build their list from the same code. The spec's rule is that two front
 * ends must never carry two rules
 * (docs/superpowers/specs/2026-08-30-doorrepo-parity-design.md:171), and there
 * are three callers now.
 *
 * Real directories on disk, not mocks: what these assertions are about is
 * whether the builder finds a door's files, and the two failures this work
 * exists to fix were both "the disk disagreed with the record".
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('buildDoorList', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'doorlist-'));
    const dbPath = path.join(root, 'test.db');
    const db = new Database(dbPath);
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8'));
    db.close();
    process.env.DATABASE_DIR = root;
    process.env.DATABASE_FILE = 'test.db';
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    delete process.env.DATABASE_DIR;
    delete process.env.DATABASE_FILE;
  });

  function mockDoors(doors: any[]): void {
    jest.doMock('../../src/handlers/door.handler', () => ({
      getDoors: jest.fn(() => doors),
    }));
  }

  function load() {
    return require('../../src/doors/door-list') as
      typeof import('../../src/doors/door-list');
  }

  it('resolves a door whose location names a directory', async () => {
    fs.mkdirSync(path.join(root, 'Doors', 'AEHELP'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'AEHELP', 'aehelp'), 'x');
    mockDoors([
      { id: 'AEHELP', command: 'AEHELP', name: 'AEHELP', type: 'XIM', accessLevel: 0, path: 'Doors/AEHELP' },
    ]);

    const [door] = await load().buildDoorList(root);

    expect(door.command).toBe('AEHELP');
    expect(door.resolvedPath).toBe(path.join(root, 'Doors', 'AEHELP'));
  });

  it('resolves to the containing directory when location names a file', async () => {
    // AquaScan's .info has LOCATION=AquaScan/AquaScan.020 - a file. The file
    // explorer needs the directory, so the builder takes its dirname.
    fs.mkdirSync(path.join(root, 'Doors', 'AquaScan'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'AquaScan', 'AquaScan.020'), 'binary');
    mockDoors([
      { id: 'FR', command: 'FR', name: 'FR', type: 'XIM', accessLevel: 0, path: 'Doors/AquaScan/AquaScan.020' },
    ]);

    const [door] = await load().buildDoorList(root);

    expect(door.resolvedPath).toBe(path.join(root, 'Doors', 'AquaScan'));
    expect(door.size).toBe('binary'.length);
  });

  it('falls back to Doors/<command> when the location does not resolve', async () => {
    fs.mkdirSync(path.join(root, 'Doors', 'WALL'), { recursive: true });
    mockDoors([
      { id: 'WALL', command: 'WALL', name: 'WALL', type: 'XIM', accessLevel: 0, path: 'DOORS:Nowhere' },
    ]);

    const [door] = await load().buildDoorList(root);

    expect(door.resolvedPath).toBe(path.join(root, 'Doors', 'WALL'));
  });

  it('leaves resolvedPath undefined when nothing on disk matches', async () => {
    mockDoors([
      { id: 'GHOST', command: 'GHOST', name: 'GHOST', type: 'XIM', accessLevel: 0, path: 'Doors/GHOST' },
    ]);

    const [door] = await load().buildDoorList(root);

    expect(door.resolvedPath).toBeUndefined();
    expect(door.command).toBe('GHOST');
  });

  it('carries archiveName from the install record, and leaves it undefined without one', async () => {
    // The 370 doors already on the board have no install record. They must
    // still appear, with an empty archive - the scope call at spec:60.
    const repo = require('../../src/doors/door-installs.repository') as
      typeof import('../../src/doors/door-installs.repository');
    repo.recordInstall({
      id: 'i1', catalog_id: null, archive_name: 'AEHELP.LHA', command: 'AEHELP',
      install_dir: 'Doors/AEHELP', door_type: 'XIM', name: 'AE Help',
      md5: null, description: null, category: null, version: null, release_group: null,
      source_url: null, source_revision: null,
    });
    mockDoors([
      { id: 'AEHELP', command: 'AEHELP', name: 'AEHELP', type: 'XIM', accessLevel: 0 },
      { id: 'LEGACY', command: 'LEGACY', name: 'LEGACY', type: 'XIM', accessLevel: 0 },
    ]);

    const doors = await load().buildDoorList(root);

    expect(doors.find(d => d.command === 'AEHELP')?.archiveName).toBe('AEHELP.LHA');
    expect(doors.find(d => d.command === 'LEGACY')?.archiveName).toBeUndefined();
  });

  it('asks the install repository once per door, not once per overlay', async () => {
    // getInstallByCommand opens and closes its own better-sqlite3 connection
    // per call. Two calls per door meant 740 open/close cycles for the 370
    // registered commands on the live board.
    jest.doMock('../../src/doors/door-installs.repository', () => {
      const actual = jest.requireActual('../../src/doors/door-installs.repository');
      return { ...actual, getInstallByCommand: jest.fn(actual.getInstallByCommand) };
    });
    const repo = require('../../src/doors/door-installs.repository') as
      typeof import('../../src/doors/door-installs.repository');
    mockDoors([
      { id: 'A', command: 'A', name: 'A', type: 'XIM', accessLevel: 0 },
      { id: 'B', command: 'B', name: 'B', type: 'XIM', accessLevel: 0 },
      { id: 'C', command: 'C', name: 'C', type: 'XIM', accessLevel: 0 },
    ]);

    await load().buildDoorList(root);

    expect(repo.getInstallByCommand as jest.Mock).toHaveBeenCalledTimes(3);
  });

  it('defaults the fields a door object may omit', async () => {
    mockDoors([{ id: 'BARE', command: 'BARE' }]);

    const [door] = await load().buildDoorList(root);

    expect(door).toMatchObject({
      name: 'BARE', description: '', type: 'AMI', size: 0,
      accessLevel: 0, enabled: true, location: '',
    });
  });

  it('reports a door as disabled only when enabled is explicitly false', async () => {
    mockDoors([
      { id: 'ON', command: 'ON', type: 'XIM' },
      { id: 'OFF', command: 'OFF', type: 'XIM', enabled: false },
    ]);

    const doors = await load().buildDoorList(root);

    expect(doors.find(d => d.command === 'ON')?.enabled).toBe(true);
    expect(doors.find(d => d.command === 'OFF')?.enabled).toBe(false);
  });

  it('returns an empty list for a board with no registered commands', async () => {
    mockDoors([]);
    expect(await load().buildDoorList(root)).toEqual([]);
  });
});
