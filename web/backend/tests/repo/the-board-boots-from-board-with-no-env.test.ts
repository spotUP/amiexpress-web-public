/**
 * P8.12 reachability: with BBS_DATA_DIR and BBS_ROOT both unset the backend
 * serves the board from `<repo>/board/` (config.ts fallback), end to end:
 * a login succeeds, the door list resolves a door under board/Doors, and a
 * global bulletin screen is shown to a caller.
 *
 * The sentinel is every fs read the run makes: the test asserts boardRoot()
 * is `<repo>/board` AND that the door registration (Commands/BBSCmd) and the
 * BULL screen were read from paths under it. Read-only on the tracked board:
 * live-data-guard would throw on a write, and the user store is mocked so the
 * login writes nothing to disk.
 */
// The real core module: an `import * as` namespace is a copy, and a spy on a copy sees nothing.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs: typeof import('fs') = require('fs');
import * as path from 'path';

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() },
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
    findUserSlotByName: jest.fn().mockReturnValue(0),
    readUserFromDisk: jest.fn().mockReturnValue(null),
    readUserStatsFromDisk: jest.fn().mockReturnValue(null),
  },
}));

// SamiLogService creates Utils/samilog when it is imported (a write at module
// load); the live-data-guard refuses it on the tracked board, so it is stubbed.
jest.mock('../../src/services/SamiLogService', () => new Proxy({ __esModule: true }, {
  get: (t, k) => (k in t ? (t as Record<string | symbol, unknown>)[k] : jest.fn()),
}));

const BOARD = path.resolve(__dirname, '../../../../board');

const saved = { data: process.env.BBS_DATA_DIR, root: process.env.BBS_ROOT };
const reads: string[] = [];
const spies: jest.SpyInstance[] = [];

function recordReads(): void {
  for (const name of ['readFileSync', 'readdirSync', 'existsSync', 'statSync'] as const) {
    const real = (fs[name] as (...a: unknown[]) => unknown).bind(fs);
    spies.push(
      jest.spyOn(fs, name as 'readFileSync').mockImplementation(((p: unknown, ...rest: unknown[]) => {
        if (typeof p === 'string') reads.push(path.resolve(p));
        return real(p, ...rest);
      }) as never),
    );
  }
}

beforeAll(() => {
  delete process.env.BBS_DATA_DIR;
  delete process.env.BBS_ROOT;
  recordReads();
  jest.resetModules(); // config reads the environment once, at load
});

afterAll(() => {
  spies.forEach((s) => s.mockRestore());
  if (saved.data !== undefined) process.env.BBS_DATA_DIR = saved.data;
  if (saved.root !== undefined) process.env.BBS_ROOT = saved.root;
});

const readUnderBoard = (needle: string) =>
  reads.some((p) => p.startsWith(BOARD + path.sep) && p.toLowerCase().includes(needle.toLowerCase()));

it('boots from <repo>/board with no env: login, a door, a bulletin', async () => {
  const { boardRoot } = require('../../src/utils/board-root.util') as typeof import('../../src/utils/board-root.util');
  expect(boardRoot()).toBe(BOARD); // sentinel 1: the fallback resolved to board/

  // Login: the HTTP entry the web client posts to.
  const { AuthHandler } = require('../../src/handlers/user/auth.handler') as typeof import('../../src/handlers/user/auth.handler');
  const holder = global as unknown as { testDb?: import('../../src/database').Database };
  for (let i = 0; i < 60 && !holder.testDb; i++) await new Promise((r) => setTimeout(r, 500));
  const db = holder.testDb as import('../../src/database').Database;
  const username = `p8_login_${Date.now()}`;
  await db.createUser({
    username, passwordHash: await db.hashPassword('Pass12345'), realname: 'P8', location: '', phone: '', email: '',
    secLevel: 255, uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0, ratio: 0, ratioType: 0,
    timeTotal: 3600, timeLimit: 3600, timeUsed: 0, chatLimit: 60, chatUsed: 0, lastLogin: null,
    firstLogin: new Date(), calls: 0, callsToday: 0, newUser: false, expert: 'N', ansi: true,
    linesPerScreen: 24, computer: 'Amiga', screenType: 'Amiga Ansi', protocol: 'Z', editor: 'L',
    zoomType: 'QWK', availableForChat: false, quietNode: false, autoRejoin: 1, confAccess: '', areaName: '',
    uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, baud: 0,
  } as never);
  const out: { status?: number; body?: { accessToken?: string } } = {};
  const res = {
    status: (s: number) => { out.status = s; return res; },
    json: (b: { accessToken?: string }) => { out.body = b; return res; },
  };
  await new AuthHandler(db).login({ body: { username, password: 'Pass12345' } } as never, res as never);
  expect(out.body?.accessToken).toBeTruthy();

  // Door: reloadDoors reads Commands/BBSCmd under the board; the list resolves a dir under board/Doors.
  const { reloadDoors } = require('../../src/handlers/door.handler') as typeof import('../../src/handlers/door.handler');
  const { buildDoorList } = require('../../src/doors/door-list') as typeof import('../../src/doors/door-list');
  await reloadDoors();
  const doors = await buildDoorList(boardRoot());
  const resolved = doors.filter((d) => d.resolvedPath);
  expect(resolved.length).toBeGreaterThan(0);
  expect(resolved.every((d) => path.resolve(d.resolvedPath as string).startsWith(BOARD + path.sep))).toBe(true);
  expect(resolved.some((d) => path.resolve(d.resolvedPath as string).startsWith(path.join(BOARD, 'Doors') + path.sep))).toBe(true);
  expect(readUnderBoard(path.join('Commands', 'BBSCmd'))).toBe(true); // sentinel 2

  // Bulletin: the global BULL screen, through the real screen entry.
  const { displayScreen } = require('../../src/handlers/screen.handler') as typeof import('../../src/handlers/screen.handler');
  const emits: string[] = [];
  const socket = { id: 'p8-12', emit: (_e: string, d: unknown) => { if (typeof d === 'string') emits.push(d); }, on: () => {} };
  const session = { nodeId: 1, currentConf: 1, relConfNum: 1, user: { username: 'Spot', secLevel: 255 }, tempData: {} };
  reads.length = 0;
  const shown = await displayScreen(socket, session as never, 'BULL');
  expect(shown).toBe(true);
  expect(emits.join('').length).toBeGreaterThan(0);
  expect(readUnderBoard('BULL')).toBe(true); // sentinel 3: the bulletin came from board/
}, 60000);
