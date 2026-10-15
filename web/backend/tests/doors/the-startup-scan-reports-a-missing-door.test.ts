/**
 * The startup scan must SAY that a registered door is not on disk.
 *
 * Live board, reported 2026-08-30: `Commands/BBSCmd/BROADCAST.info` carries
 * `LOCATION=DOORS:ANNOUNCE/ANNOUNCE.REXX` and `Doors/ANNOUNCE/` does not
 * exist. The command was offered on the menu to everyone with access 20 and
 * failed only when a caller ran it - "Error: ARexx script not found ...
 * Please contact the sysop". The sysop had no way to find out first.
 *
 * `missingDoorTargets` is pinned as a pure function in
 * a-registration-whose-door-is-gone.test.ts. THIS file exists because a pure
 * function nobody calls fixes nothing: it drives the real `initializeDoors()`
 * over real .info definitions and asserts the warning actually reaches the
 * console, beside the "resolves outside Doors/" warning that was already
 * there.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

const mockRootRef = { value: '' };
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRootRef.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { initializeDoors, getDoors } from '../../src/handlers/door.handler';
import { commandCache } from '../../src/handlers/command-execution.handler';
import { config } from '../../src/config';

let root: string;
const realConfigGet = config.get.bind(config);
let warnings: string[];
let warnSpy: jest.SpyInstance;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'missing-door-'));
  mockRootRef.value = root;
  jest.spyOn(config, 'get').mockImplementation(((key: string) =>
    key === 'dataDir' || key === 'bbsPath' ? root : realConfigGet(key as never)) as never);

  // PENGO is really there; BROADCAST is the live case - registered, absent.
  fs.mkdirSync(path.join(root, 'Doors', 'pengo'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'pengo', 'index.ts'), '');
  fs.mkdirSync(path.join(root, 'Commands', 'BBSCmd'), { recursive: true });
});

afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  warnings = [];
  warnSpy = jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args.map(String).join(' '));
  });
});

afterEach(() => {
  warnSpy.mockRestore();
});

const def = (name: string, location: string, type = 'TS') => ({
  name,
  type,
  location,
  access: undefined,
  toolTypes: { LOCATION: location, TYPE: type },
});

async function register(...defs: any[]) {
  commandCache.bbscmd.clear();
  for (const d of defs) commandCache.bbscmd.set(d.name.toUpperCase(), d);
  await initializeDoors();
}

describe('the startup scan', () => {
  it('names a door whose LOCATION points at nothing', async () => {
    await register(
      def('PENGO', 'Doors/pengo'),
      def('BROADCAST', 'DOORS:ANNOUNCE/ANNOUNCE.REXX', 'AIM'),
    );

    const broken = warnings.filter((w) => w.includes('does not exist'));
    expect(broken).toHaveLength(1);
    expect(broken[0]).toContain('BROADCAST');
    expect(broken[0]).toContain('ANNOUNCE.REXX');
  });

  it('tells the sysop what to do about it, in the two ways there are', async () => {
    await register(def('BROADCAST', 'DOORS:ANNOUNCE/ANNOUNCE.REXX', 'AIM'));

    const broken = warnings.find((w) => w.includes('does not exist')) ?? '';
    // Install the door, or drop the registration. Naming the .info matters:
    // the file the sysop edits is not the one the warning is about.
    expect(broken).toContain('BBSCmd/BROADCAST.info');
  });

  it('stays quiet about doors that are really there', async () => {
    await register(def('PENGO', 'Doors/pengo'));

    expect(warnings.filter((w) => w.includes('does not exist'))).toEqual([]);
    expect(getDoors().map((d: any) => d.command)).toContain('PENGO');
  });

  // The registration is left in place: a door missing at boot may be a
  // volume that has not finished mounting, and hiding the command would make
  // that look like the door was deleted.
  it('leaves the command registered, so the menu is unchanged', async () => {
    await register(def('BROADCAST', 'DOORS:ANNOUNCE/ANNOUNCE.REXX', 'AIM'));

    expect(getDoors().map((d: any) => d.command)).toContain('BROADCAST');
  });
});
