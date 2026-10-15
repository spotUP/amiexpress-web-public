/**
 * ACCESS=0 on a BBSCmd means the door NEVER runs, and the internal command of
 * the same name answers instead (express.e:4702-4703 `IF access=0 THEN
 * RETURN TRUE`, TRUE=-1=RESULT_FAILURE; processCommand 28250-28255 then falls
 * into processInternalCommand). An ABSENT ACCESS reads -1 (tooltypes.e:176-181)
 * and runs for everyone; a level above the caller's is refused.
 *
 * Same real chain as width-gate-fall-through: handleCommand -> processCommand
 * -> runCommand -> executeDoor, with createAllDropFiles as the launch sentinel.
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
import { handleCommand, processBBSCommand } from '../../src/handlers/command.handler';
import {
  setCommandExecutionDependencies,
  commandCache,
  revalidateBbsCommandsIfChanged,
  commandAccessVerdict,
} from '../../src/handlers/command-execution.handler';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

/** A door type nothing routes, so executeDoor stops at the launch sentinel. */
const UNROUTED = 'unrouted-access-test-type';

/** `access` undefined = the icon has no ACCESS tooltype at all. */
const doorOver = (name: string, access?: number) => ({
  name,
  type: UNROUTED,
  location: `Doors/${name}/${name}`,
  access,
  toolTypes: { LOCATION: `Doors:${name}/${name}`, TYPE: 'XIM', MIN_COLUMNS: '40' },
});

const dirLine = (filename: string, desc: string) =>
  `${filename.padEnd(12)} P   12K  23-Oct-25  ${desc}`;

async function register(...defs: any[]) {
  // A command lookup re-reads the BBSCmd directories whenever their stamp
  // moved since the last check (6db5bfa47), and a door launch or a listing
  // touches the board root. A cache seeded only in memory would then be
  // replaced by the (empty) disk on the NEXT test's first command. Take the
  // pending reload now, before seeding, so the stamp the handler compares is
  // the current one.
  revalidateBbsCommandsIfChanged(root, undefined, 1);
  commandCache.bbscmd.clear();
  for (const d of defs) commandCache.bbscmd.set(d.name.toUpperCase(), d);
  await initializeDoors();
  setCommandExecutionDependencies(executeDoor, processBBSCommand);
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'access-zero-fall-'));
  mockRootRef.value = root;
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1.info'), 'NDIRS=1\n');
  fs.writeFileSync(
    path.join(root, 'Conf1', 'DIR1'),
    [dirLine('CHASE.LHA', 'A demo'), dirLine('SCOOPEX.LHA', 'Another one'), ''].join('\r\n'),
    'latin1'
  );
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

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `access-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

function ansiSession(commandText: string, secLevel: number): any {
  return {
    state: 'loggedon',
    subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 'u1', username: 'CALLER', secLevel, securityFlags: 'T'.repeat(64) },
    nodeId: 1,
    terminalType: 'ansi',
    petsciiMode: false,
    screenWidth: 80,
    screenHeight: 25,
    currentConf: 1,
    tempData: {},
    commandHistory: [],
    historyIndex: 0,
    historyCycle: 0,
    commandText,
  };
}

/** Type `FR A` at the given level with an FR door registered under `access`. */
async function typeFr(access: number | undefined, level: number) {
  await register(doorOver('FR', access));
  const socket = makeSocket();
  await handleCommand(socket as any, ansiSession('FR A', level), '');
  return {
    out: allOutput(socket),
    launched: (doorDropFileManager.createAllDropFiles as jest.Mock).mock.calls.length,
  };
}

describe('BBSCmd ACCESS follows express.e runCommand', () => {
  it('ACCESS=0: the door is not run and the internal FR lists the files', async () => {
    const r = await typeFr(0, 10);
    expect(r.launched).toBe(0);
    expect(r.out).toContain('Reverse scanning directory 1');
    expect(r.out).toContain('CHASE.LHA');
  });

  it('ACCESS=0 refuses even a sysop-level caller (nobody runs it)', async () => {
    const r = await typeFr(0, 255);
    expect(r.launched).toBe(0);
    expect(r.out).toContain('CHASE.LHA');
  });

  it('absent ACCESS: the door runs for a level-10 caller', async () => {
    const r = await typeFr(undefined, 10);
    expect(r.launched).toBe(1);
    expect(r.out).not.toContain('CHASE.LHA');
  });

  it('ACCESS=50 refuses a level-10 caller and does not fall through to the listing', async () => {
    const r = await typeFr(50, 10);
    expect(r.launched).toBe(0);
    expect(r.out).not.toContain('CHASE.LHA');
  });

  it('ACCESS=50 admits a level-50 caller', async () => {
    const r = await typeFr(50, 50);
    expect(r.launched).toBe(1);
  });
});

describe('commandAccessVerdict', () => {
  it.each([
    [undefined, 10, 'allowed'],
    [NaN, 10, 'allowed'],
    [-1, 10, 'allowed'],
    [0, 255, 'fall-through'],
    [50, 10, 'not-allowed'],
    [50, 50, 'allowed'],
  ])('access %p at level %p is %p', (access, level, verdict) => {
    expect(commandAccessVerdict(access as number | undefined, level)).toBe(verdict);
  });
});
