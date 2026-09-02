/**
 * Non-negotiable (a), sysop 2026-09-02: a petsciiMode/terminalType='c64'
 * session can NEVER enter a MIN_COLUMNS=80 door; it sees the uppercase
 * notice; an 80-col session's door access is byte-for-byte unchanged.
 * Exercised through the REAL executeDoor entry point (not a source pin).
 * createAllDropFiles is called immediately before the door-type switch,
 * so its mock is the "launch actually proceeded" sentinel.
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

import { executeDoor, formatDoorLine, setHelpers } from '../../src/handlers/door.handler';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { DOOR_NEEDS_80_NOTICE } from '../../src/utils/door-min-columns.util';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import type { Door } from '../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'min-col-gate-'));
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
  (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

let socketIdCounter = 0;
function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `gate-test-socket-${++socketIdCounter}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

// Unrouted type: executeDoor's switch falls to its default branch (logs
// "Unknown door type" and returns) - deliberately avoiding any real door
// runtime, exactly like door-launch-token-wiring.test.ts does.
const UNROUTED = 'unrouted-gate-test-type' as unknown as Door['type'];

function testDoor(overrides: Partial<Door & { minColumns: number; toolTypes: Record<string, string> }> = {}): Door {
  return {
    id: 'gatetest', name: 'GateTest', description: 'gate test door',
    command: 'GATETEST', path: 'Doors/GateTest', accessLevel: 0,
    enabled: true, type: UNROUTED, ...overrides,
  } as Door;
}

// PROCESS_COMMAND is what door.handler's Enter handler sets before
// re-dispatching (handleDoorSelectInput), and what command.handler is in when
// it calls executeDoor. Starting here rather than at DISPLAY_MENU is what
// makes the post-gate state assertion mean anything: a gate that returned
// without touching subState would strand the session mid-command.
function c64Session(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 'u1', username: 'C64USER', secLevel: 10 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true,
    screenWidth: 40, screenHeight: 25, tempData: {},
    menuPause: true,
  };
}

function eightyColSession(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: 'u2', username: 'ANSIUSER', secLevel: 10 },
    nodeId: 1, terminalType: 'modern', petsciiMode: false,
    screenWidth: 80, screenHeight: 24, tempData: {},
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

describe('executeDoor MIN_COLUMNS gate', () => {
  it('blocks a c64 session from an unmarked (default-80) door and shows the notice', async () => {
    const socket = makeSocket();
    const session = c64Session();
    await executeDoor(socket as any, session, testDoor());
    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    // The refusal must RETURN the caller to the menu, not leave them parked
    // in PROCESS_COMMAND with no prompt and no way forward.
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(session.menuPause).toBe(false);
  });

  it('a refused launch is not attributed to the door (currentDoorName untouched)', async () => {
    const socket = makeSocket();
    const session = c64Session();
    await executeDoor(socket as any, session, testDoor());
    expect(session.currentDoorName).toBeUndefined();
  });

  it('blocks a web-P session (petsciiMode, terminalType modern) the same way', async () => {
    const socket = makeSocket();
    const session = { ...eightyColSession(), petsciiMode: true, screenWidth: 40, screenHeight: 25 };
    await executeDoor(socket as any, session, testDoor());
    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('blocks a c64 session even from a door that demands MORE than 80', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), testDoor({ toolTypes: { MIN_COLUMNS: '132' } }));
    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  // A door may honestly need more than 80, and a real wide terminal can give
  // it. An 80-column caller gets the notice instead of a garbled screen.
  it('MIN_COLUMNS=132: a 132-column terminal opens it, an 80-column one is refused', async () => {
    const wideSocket = makeSocket();
    const wide = { ...eightyColSession(), screenWidth: 132, screenHeight: 50 };
    await executeDoor(wideSocket as any, wide, testDoor({ toolTypes: { MIN_COLUMNS: '132' } }));
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(wideSocket)).not.toContain('THIS DOOR NEEDS');

    (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();

    const narrowSocket = makeSocket();
    await executeDoor(narrowSocket as any, eightyColSession(), testDoor({ toolTypes: { MIN_COLUMNS: '132' } }));
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(allOutput(narrowSocket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
  });

  it('80-col session: launch proceeds and output carries no gate bytes (byte-for-byte unchanged)', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, eightyColSession(), testDoor());
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
    expect(allOutput(socket)).not.toContain(DOOR_NEEDS_80_NOTICE);
  });

  // 80-column output for non-C64 platforms is NEVER degraded. Every ordinary
  // web socket carries its real xterm width (socket-handlers.ts
  // 'terminal-size'), so a phone in portrait reports far fewer than 80
  // columns - and must still be able to open every door it could open
  // yesterday. Only petsciiMode narrows a session.
  it('narrow NON-PETSCII terminal (phone in portrait): launch proceeds, no gate', async () => {
    const socket = makeSocket();
    const session = { ...eightyColSession(), screenWidth: 38, screenHeight: 20 };
    await executeDoor(socket as any, session, testDoor());
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
  });

  it('MIN_COLUMNS=40 tooltype opts a door in: c64 session launches it', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), testDoor({ toolTypes: { MIN_COLUMNS: '40' } }));
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
  });

  it('installed-68K doorInfo.minColumns opts in the same way', async () => {
    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), testDoor({ doorInfo: { minColumns: 40 } } as any));
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
  });
});

describe('formatDoorLine 40-ok marker', () => {
  it('marks a MIN_COLUMNS=40 door with [40] and leaves others unmarked', () => {
    const marked = formatDoorLine({ name: 'Theme', command: 'THEME', type: 'TS', toolTypes: { MIN_COLUMNS: '40' } }, false);
    const unmarked = formatDoorLine({ name: 'Chess', command: 'GMASTER', type: 'TS' }, false);
    expect(marked).toContain('[40]');
    expect(unmarked).not.toContain('[40]');
  });

  it('the [40] token lives inside the existing 30-char name column - the row never widens', () => {
    const marked = formatDoorLine({ name: 'Theme', command: 'THEME', type: 'TS', toolTypes: { MIN_COLUMNS: '40' } }, false);
    const unmarked = formatDoorLine({ name: 'Theme', command: 'THEME', type: 'TS' }, false);
    expect(marked.length).toBe(unmarked.length);
  });

  it('a long 40-ok door name truncates rather than widening the row', () => {
    const longName = 'A Door With A Very Long Name Indeed';
    const marked = formatDoorLine({ name: longName, command: 'LONG', type: 'TS', minColumns: 40 }, false);
    const unmarked = formatDoorLine({ name: longName, command: 'LONG', type: 'TS' }, false);
    expect(marked.length).toBe(unmarked.length);
  });
});
