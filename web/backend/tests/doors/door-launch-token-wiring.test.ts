/**
 * Task 11: mint the DoorRepo management token when the door launches.
 *
 * Kept separate from tests/doors/door-launch-token.test.ts (which is a
 * clean unit test of the token module itself) because exercising
 * executeDoor() pulls in door.handler.ts's full import graph, including
 * `../index` — the process entry point that boots express/socket.io/the
 * database at module scope. This file pays that cost once and mocks the
 * handful of dependencies executeDoor touches before it ever reaches a
 * real door type (drop files, the callers log, and the BBS data root),
 * while leaving the token module itself completely real: the token file
 * is written to and read back from an actual temp directory, never mocked.
 *
 * Security properties under test (Task 11 brief):
 *   - DOORREPO + sysop (secLevel >= 250)   -> a token is minted and the
 *     file lands on disk where Task 10's C door reads it.
 *   - any other door, or a non-sysop       -> no token at all.
 *   - the token is revoked when the door exits, on every exit path,
 *     including when the door throws.
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

import {
  launchTokenForDoor,
  releaseLaunchTokenForDoor,
  executeDoor,
  setHelpers,
} from '../../src/handlers/door.handler';
import { verifyLaunchToken } from '../../src/doors/door-launch-token';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import type { Door } from '../../src/types';

// executeDoor calls the module-level `callersLog` helper the live BBS
// injects via setHelpers() during startup (src/server/initialization.ts).
// Nothing in this file wants a real CallersLog write, so stub it once —
// mirrors src/scripts/corpus-integration-runner.ts's own test-mode setup.
setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;

// config is the real ConfigManager singleton — other modules read other
// keys from it at import time (e.g. SamiLogService's module-level
// DATA_DIR), so replacing the whole module breaks unrelated code.
// Redirect only the 'dataDir' key executeDoor asks for; everything else
// falls through to the real implementation.
const realConfigGet = config.get.bind(config);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-token-wiring-'));
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function tokenFilePath(bbsRoot: string): string {
  return path.join(bbsRoot, 'Doors', 'DoorRepo', 'DoorRepo.token');
}

// executeDoor's switch has no case for this type, so it falls to the
// lightweight `default:` branch (logs "Unknown door type" and returns) —
// deliberately avoiding any real door runtime (68K emulator, TS door
// import, child_process) that a recognized type would pull in.
const UNROUTED_DOOR_TYPE = 'unrecognized-test-door-type' as unknown as Door['type'];

function doorRepoDoor(): Door {
  return {
    id: 'doorrepo',
    name: 'DoorRepo',
    description: 'Door repository manager',
    command: 'DOORREPO',
    path: 'Doors/DoorRepo',
    accessLevel: 0,
    enabled: true,
    type: UNROUTED_DOOR_TYPE,
  } as Door;
}

function otherDoor(): Door {
  return {
    id: 'aehelp',
    name: 'AEHELP',
    description: 'Help door',
    command: 'AEHELP',
    path: 'Doors/AEHELP',
    accessLevel: 0,
    enabled: true,
    type: UNROUTED_DOOR_TYPE,
  } as Door;
}

let socketIdCounter = 0;
function makeSocket() {
  return { id: `test-socket-${++socketIdCounter}`, emit: jest.fn(), on: jest.fn() };
}

function sysopSession(overrides: Record<string, unknown> = {}) {
  return {
    state: 'loggedon',
    user: { id: 7, secLevel: 255 },
    nodeId: 3,
    subState: 'display-menu',
    menuPause: false,
    timeRemaining: 3600,
    tempData: {},
    ...overrides,
  } as any;
}

describe('launchTokenForDoor / releaseLaunchTokenForDoor', () => {
  it('mints a token for the DoorRepo door launched by a sysop, and writes the file', () => {
    const token = launchTokenForDoor('DOORREPO', root, { nodeId: 3, userId: 7, secLevel: 255 });

    expect(token).not.toBeNull();
    expect(verifyLaunchToken(token!)).toMatchObject({ userId: 7, secLevel: 255 });

    const onDisk = fs.readFileSync(tokenFilePath(root), 'latin1').trim();
    expect(onDisk).toBe(token);
  });

  it('mints nothing for any other door, even for a sysop', () => {
    const token = launchTokenForDoor('AEHELP', root, { nodeId: 3, userId: 7, secLevel: 255 });

    expect(token).toBeNull();
    expect(fs.existsSync(tokenFilePath(root))).toBe(false);
  });

  it('mints nothing for DOORREPO when the caller is not a sysop', () => {
    const token = launchTokenForDoor('DOORREPO', root, { nodeId: 3, userId: 7, secLevel: 249 });

    expect(token).toBeNull();
    expect(fs.existsSync(tokenFilePath(root))).toBe(false);
  });

  it('is case-insensitive on the command name', () => {
    const token = launchTokenForDoor('doorrepo', root, { nodeId: 3, userId: 7, secLevel: 255 });
    expect(token).not.toBeNull();
  });

  it('releaseLaunchTokenForDoor revokes a minted token', () => {
    const token = launchTokenForDoor('DOORREPO', root, { nodeId: 3, userId: 7, secLevel: 255 });
    expect(verifyLaunchToken(token!)).not.toBeNull();

    releaseLaunchTokenForDoor(token);
    expect(verifyLaunchToken(token!)).toBeNull();
  });

  it('releaseLaunchTokenForDoor tolerates null (the "no token" case)', () => {
    expect(() => releaseLaunchTokenForDoor(null)).not.toThrow();
  });
});

describe('executeDoor wiring: mint on launch, release on exit', () => {
  // These read the real token file executeDoor's mint wrote to `root`,
  // rather than spying on mintLaunchToken — TS's compiled export binding
  // for that function is non-configurable under ts-jest, so jest.spyOn on
  // the required module object throws "Cannot redefine property". Going
  // through the actual file Task 10's C door reads is more faithful anyway.
  function tokenFromDisk(): string {
    return fs.readFileSync(tokenFilePath(root), 'latin1').trim();
  }

  it('mints a DoorRepo token on launch and revokes it once the door exits normally', async () => {
    const socket = makeSocket();
    const session = sysopSession();

    await executeDoor(socket, session, doorRepoDoor());

    expect(fs.existsSync(tokenFilePath(root))).toBe(true);
    const token = tokenFromDisk();
    expect(verifyLaunchToken(token)).toBeNull();
  });

  it('never mints a token for a non-DOORREPO door launch', async () => {
    const socket = makeSocket();
    const session = sysopSession();

    await executeDoor(socket, session, otherDoor());

    expect(fs.existsSync(tokenFilePath(root))).toBe(false);
  });

  it('never mints a token when the launching user is not a sysop, even for DOORREPO', async () => {
    const socket = makeSocket();
    const session = sysopSession({ user: { id: 7, secLevel: 100 } });

    await executeDoor(socket, session, doorRepoDoor());

    expect(fs.existsSync(tokenFilePath(root))).toBe(false);
  });

  it('revokes the token even when the door throws mid-launch', async () => {
    (doorDropFileManager.createAllDropFiles as jest.Mock).mockImplementationOnce(() => {
      throw new Error('drop file boom');
    });

    const socket = makeSocket();
    const session = sysopSession();

    await expect(executeDoor(socket, session, doorRepoDoor())).rejects.toThrow('drop file boom');

    expect(fs.existsSync(tokenFilePath(root))).toBe(true);
    const token = tokenFromDisk();
    expect(verifyLaunchToken(token)).toBeNull();
  });

  // Round 1 fix, Important finding: a bookkeeping failure (the token mint)
  // must never stop a sysop's door from running, and must never skip the
  // catch block's session cleanup. Reproduce a real mint failure — not a
  // mocked one — by putting a plain FILE where mintLaunchToken expects to
  // mkdirSync a directory (<root>/Doors/DoorRepo), so fs.mkdirSync throws
  // for real (ENOTDIR).
  it('still launches the door, and still returns the session to the menu, when the token directory is unwritable', async () => {
    fs.mkdirSync(path.join(root, 'Doors'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'DoorRepo'), 'not a directory');

    const socket = makeSocket();
    const session = sysopSession();

    await expect(executeDoor(socket, session, doorRepoDoor())).resolves.toBeUndefined();

    // No token could have been written — DoorRepo is a file, not a
    // directory, so the token path can't exist underneath it.
    expect(fs.existsSync(tokenFilePath(root))).toBe(false);
    // The door still ran to completion and the existing post-door
    // bookkeeping (never skipped by the mint failure) put the session
    // back on the menu.
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });

  // Minor finding: session.user entirely absent must not throw when
  // computing the mint session (session.user?.id ?? 0 / ?.secLevel ?? 0).
  // secLevel then reads as 0, well under the sysop floor, so this also
  // proves no token is minted for a guest-shaped session.
  it('mints nothing and does not throw when session.user is entirely absent', async () => {
    const socket = makeSocket();
    const session = sysopSession();
    delete session.user;

    await expect(executeDoor(socket, session, doorRepoDoor())).resolves.toBeUndefined();

    expect(fs.existsSync(tokenFilePath(root))).toBe(false);
  });
});
