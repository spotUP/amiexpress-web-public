/**
 * The real command-dispatch chain, wired for a test.
 *
 *   initializeDoors -> setCommandExecutionDependencies
 *   -> handleCommand -> processCommand -> executeDoor
 *
 * Extracted from width-gate-fall-through.test.ts so the W-door tests (W7, W10,
 * W14) drive the same chain instead of copying it. `createAllDropFiles` is the
 * launch sentinel: executeDoor calls it immediately before the door-type
 * switch, so "not called" means no door was launched.
 *
 * Importing this module registers the jest.mock calls below for the importing
 * test file (jest.mock paths resolve from THIS file). Import it before any
 * handler module, then call installDispatchHarness() once at the top level.
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

import { executeDoor, initializeDoors, getDoors, setHelpers } from '../../src/handlers/door.handler';
import { processBBSCommand } from '../../src/handlers/command.handler';
import { setCommandExecutionDependencies, commandCache } from '../../src/handlers/command-execution.handler';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { config } from '../../src/config';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

/**
 * A door type nothing routes, so executeDoor reaches its launch sentinel and
 * stops - the dispatch is what is under test, not the 68K runtime.
 */
export const UNROUTED = 'unrouted-fall-through-test-type';

export const doorOver = (name: string, toolTypes: Record<string, string> = {}) => ({
  name,
  type: UNROUTED,
  location: `Doors/${name}/${name}`,
  access: undefined,
  toolTypes: { LOCATION: `Doors:${name}/${name}`, TYPE: 'XIM', ...toolTypes },
});

export async function register(...defs: any[]) {
  commandCache.bbscmd.clear();
  for (const d of defs) commandCache.bbscmd.set(d.name.toUpperCase(), d);
  await initializeDoors();
  // server/initialization.ts hands the executors over: that makes BBSCMD
  // outrank the internal switch. The door list itself is door.handler's alone.
  setCommandExecutionDependencies(executeDoor, processBBSCommand);
}

/**
 * ONE root for the whole file, deliberately. The BBSCMD freshness stamp
 * (command-execution.handler.ts bbsCommandDirsStamp) contains the search-path
 * STRINGS, so a fresh temp root per test reads as "the command directories
 * changed", wipes the seeded cache mid-suite and quietly turns a door test
 * into an internal-command test.
 *
 * Registers beforeAll/afterAll/beforeEach/afterEach for the calling file.
 * `seedRoot` runs once with the temp root, to lay out files the test needs.
 */
export function installDispatchHarness(seedRoot?: (root: string) => void): void {
  let root = '';
  const realConfigGet = config.get.bind(config);

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-harness-'));
    mockRootRef.value = root;
    seedRoot?.(root);
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  beforeEach(() => {
    jest.spyOn(config, 'get').mockImplementation((key: any) =>
      key === 'dataDir' ? root : realConfigGet(key)
    );
    (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
}

export function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `fall-through-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

export const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

/**
 * Output including text still sitting in the per-socket ANSI buffer. Internal
 * commands write through emitText (buffered); only a flush puts it on the
 * socket. allOutput alone is enough for door launches and refusals.
 */
export const flushedOutput = (socket: any) => {
  flushAllBuffers();
  return allOutput(socket);
};

/** A user the ACS answers yes for: 'T' in every flag position the handlers ask about. */
export const permissiveUser = {
  id: 'u1',
  username: 'C64USER',
  secLevel: 10,
  securityFlags: 'T'.repeat(64),
};

export function c64Session(commandText: string): any {
  return {
    state: 'loggedon',
    subState: LoggedOnSubState.PROCESS_COMMAND,
    user: permissiveUser,
    nodeId: 1,
    terminalType: 'c64',
    petsciiMode: true,
    screenWidth: 40,
    screenHeight: 25,
    currentConf: 1,
    tempData: {},
    commandHistory: [],
    historyIndex: 0,
    historyCycle: 0,
    commandText,
  };
}

export function ansiSession(commandText: string): any {
  return { ...c64Session(commandText), terminalType: 'ansi', petsciiMode: false, screenWidth: 80 };
}

export { doorDropFileManager, executeDoor, getDoors };
