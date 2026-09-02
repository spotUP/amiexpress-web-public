/**
 * ONE MIN_COLUMNS source for the marker and the gate.
 *
 * The bug this pins: the door-list row is formatted from the entry
 * displayDoorMenu built, which carries the installed 68K record as
 * `doorInfo` - but pressing Enter does NOT hand that entry to executeDoor.
 * It re-dispatches BY COMMAND NAME (door.handler.ts handleDoorSelectInput
 * sets session.commandText and calls handleCommand), and command.handler's
 * `getDoors().find(...)` returns a Door built by initializeDoors() which has
 * no `doorInfo` at all. A door marked MIN_COLUMNS=40 only in its installed
 * .info record therefore printed [40] and was then refused at launch.
 *
 * This drives the REAL chain - initializeDoors() -> getDoors() ->
 * setDoorsForCommandHandler() (the exact wiring server/initialization.ts:660
 * performs) -> handleCommand() -> executeDoor() - and asserts the marker and
 * the launch agree. createAllDropFiles is the launch sentinel: executeDoor
 * calls it immediately before the door-type switch.
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

// The installed-door registry. Only the MIN_COLUMNS=40 marking lives here -
// the BBSCMD CommandDefinition seeded below carries no MIN_COLUMNS at all,
// which is exactly the split that used to make marker and gate disagree.
const INSTALLED_RECORD = {
  command: 'GATE40',
  name: 'Gate40 Door',
  location: 'Doors:Gate40/Gate40',
  resolvedPath: '/nonexistent/Gate40',
  access: 0,
  type: 'unrouted-dispatch-test-type',
  installed: true,
  minColumns: 40,
  toolTypes: { LOCATION: 'Doors:Gate40/Gate40', TYPE: 'XIM' },
};
// Mutable so a test can add a second installed record (the C64_ADAPT case
// below registers one whose tooltype exists ONLY here, never in BBSCMD).
const mockInstalledRecords: any[] = [INSTALLED_RECORD];
// executeAmigaDoor resolves the executable under amigaDoorManager.bbsRoot, so
// the stub has to carry the same temp root config.get('dataDir') returns.
const mockRootRef = { value: '' };
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRootRef.value,
    scanInstalledDoors: async () => mockInstalledRecords,
    getCachedDoors: () => mockInstalledRecords,
    isCachePopulated: () => true,
  }),
}));

/**
 * The 68K runtime, replaced by a door that paints one 80-column rule on the
 * socket it was handed and exits. It records what was installed on that socket
 * WHILE it ran, which is the only way to prove the adapter was actually on the
 * wire rather than merely constructed: everything is uninstalled by the time
 * executeDoor returns.
 */
const mockAdapterDuringRun: unknown[] = [];
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: any;
    constructor(socket: any) { this.socket = socket; }
    async start() {
      const { c64AdapterFor } = require('../../src/server/c64-door-adapter');
      mockAdapterDuringRun.push(c64AdapterFor(this.socket));
      this.socket.emit('ansi-output', '\x1b[2J\x1b[H');
      this.socket.emit('ansi-output', '-'.repeat(76) + '\r\n');
      // Real timers: the adapter's quiet-gap tick has to actually fire.
      await new Promise((r) => setTimeout(r, 120));
    }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

import {
  executeDoor,
  formatDoorLine,
  initializeDoors,
  getDoors,
  setHelpers,
} from '../../src/handlers/door.handler';
import { handleCommand } from '../../src/handlers/command.handler';
import { setDoors as setDoorsForCommandHandler } from '../../src/handlers/command-handler/dependency-injection';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

// The BBSCMD side of the registration: no MIN_COLUMNS anywhere in it.
const UNROUTED = 'unrouted-dispatch-test-type';
const bbsCmdDefinition = {
  name: 'GATE40',
  type: UNROUTED,
  location: 'Doors/Gate40/Gate40',
  access: 0,
  toolTypes: { LOCATION: 'Doors:Gate40/Gate40', TYPE: 'XIM' },
};

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'min-col-dispatch-'));
  mockRootRef.value = root;
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key)
  );
  (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();

  // Seed the BBSCMD command cache initializeDoors() reads, exactly as
  // loadCommands() would after parsing Commands/BBSCmd/GATE40.info.
  const { commandCache } = require('../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
  commandCache.bbscmd.set('GATE40', bbsCmdDefinition);

  await initializeDoors();
  // server/initialization.ts:660 - the live handoff from the door registry to
  // the command dispatcher. Without it, Enter can never find the door.
  setDoorsForCommandHandler(getDoors());
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

function makeSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  return {
    id: `dispatch-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

function c64Session(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 'u1', username: 'C64USER', secLevel: 10 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true,
    screenWidth: 40, screenHeight: 25, tempData: {},
    commandText: 'GATE40',
  };
}

describe('the [40] marker and the gate read one MIN_COLUMNS source', () => {
  it('registers the installed record MIN_COLUMNS onto the Door the dispatcher will find', () => {
    const door = getDoors().find((d) => d.command === 'GATE40');
    expect(door).toBeDefined();
    // The BBSCMD definition carries no MIN_COLUMNS - this value can only have
    // come from the installed record, resolved once at registration.
    expect(door!.toolTypes?.['MIN_COLUMNS']).toBeUndefined();
    expect((door as any).minColumns).toBe(40);
  });

  it('marks that same Door [40] in the door list', () => {
    const door = getDoors().find((d) => d.command === 'GATE40');
    expect(formatDoorLine(door, false)).toContain('[40]');
  });

  it('opens for a C64 through the real Enter dispatch (handleCommand -> executeDoor)', async () => {
    const socket = makeSocket();
    const session = c64Session();

    await handleCommand(socket as any, session, '');

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
  });

  it('marker and launch agree: [40] shown AND the door actually opens for the C64', async () => {
    const door = getDoors().find((d) => d.command === 'GATE40');
    const marked = formatDoorLine(door, false).includes('[40]');

    const socket = makeSocket();
    await executeDoor(socket as any, c64Session(), door as any);
    const launched = (doorDropFileManager.createAllDropFiles as jest.Mock).mock.calls.length === 1;

    expect({ marked, launched }).toEqual({ marked: true, launched: true });
  });

  it('an unmarked door registered the same way is still closed at 40 (default-closed survives)', async () => {
    const { commandCache } = require('../../src/handlers/command-execution.handler');
    commandCache.bbscmd.clear();
    commandCache.bbscmd.set('PLAIN', { ...bbsCmdDefinition, name: 'PLAIN' });
    await initializeDoors();
    setDoorsForCommandHandler(getDoors());

    const door = getDoors().find((d) => d.command === 'PLAIN');
    expect((door as any).minColumns).toBeUndefined();
    expect(formatDoorLine(door, false)).not.toContain('[40]');

    const socket = makeSocket();
    const session = { ...c64Session(), commandText: 'PLAIN' };
    await handleCommand(socket as any, session, '');

    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });
});


/**
 * Reachability for the C64 adapter gate hook (Phase 3 Task 5).
 *
 * Same chain as above - initializeDoors() -> getDoors() ->
 * setDoorsForCommandHandler() -> handleCommand() -> executeDoor() - so nothing
 * here is a source pin. createAllDropFiles is the "launch proceeded" sentinel
 * and c64AdapterFor(socket) captured INSIDE the door's run is the "the adapter
 * was on the wire" sentinel.
 */
describe('a C64_ADAPT door reached through the real Enter dispatch', () => {
  const C64_CMD = {
    name: 'C64DOOR',
    type: 'XIM',
    location: 'Doors/C64Door/C64Door',
    access: 0,
    toolTypes: { LOCATION: 'Doors:C64Door/C64Door', TYPE: 'XIM', C64_ADAPT: '40' },
  };
  const PLAIN_68K = {
    name: 'PLAIN68K',
    type: 'XIM',
    location: 'Doors/C64Door/C64Door',
    access: 0,
    toolTypes: { LOCATION: 'Doors:C64Door/C64Door', TYPE: 'XIM' },
  };

  async function register(defs: any[]) {
    const { commandCache } = require('../../src/handlers/command-execution.handler');
    commandCache.bbscmd.clear();
    for (const d of defs) commandCache.bbscmd.set(d.name, d);
    await initializeDoors();
    setDoorsForCommandHandler(getDoors());
  }

  beforeEach(async () => {
    mockAdapterDuringRun.length = 0;
    // executeAmigaDoor refuses a door whose executable is missing. Amiga hunk
    // magic, so the native-GCC branch is not taken either.
    fs.mkdirSync(path.join(root, 'Doors', 'C64Door'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'C64Door', 'C64Door'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    await register([C64_CMD, PLAIN_68K]);
  });

  afterEach(() => {
    mockInstalledRecords.length = 1;
  });

  it('opens for a C64 session and runs it through the adapter, which is gone afterwards', async () => {
    const socket = makeSocket();
    const originalEmit = socket.emit;
    const { c64AdapterFor } = require('../../src/server/c64-door-adapter');

    await handleCommand(socket as any, { ...c64Session(), commandText: 'C64DOOR' }, '');

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
    // The adapter was on the socket while the door ran...
    expect(mockAdapterDuringRun).toHaveLength(1);
    expect(mockAdapterDuringRun[0]).not.toBeNull();
    // ...it reduced the door's 80-column rule...
    expect(allOutput(socket)).not.toContain('-'.repeat(70));
    // ...and it was uninstalled on the way out.
    expect(c64AdapterFor(socket)).toBeNull();
    expect(socket.emit).toBe(originalEmit);
  });

  it('an ANSI session on the SAME door launches identically with no adapter and untouched bytes', async () => {
    const socket = makeSocket();
    const originalEmit = socket.emit;
    const { c64AdapterFor } = require('../../src/server/c64-door-adapter');

    await handleCommand(
      socket as any,
      { ...c64Session(), petsciiMode: false, terminalType: 'modern', screenWidth: 80, screenHeight: 24, commandText: 'C64DOOR' },
      '',
    );

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(mockAdapterDuringRun).toEqual([null]);
    expect(allOutput(socket)).toContain('-'.repeat(76));
    expect(c64AdapterFor(socket)).toBeNull();
    expect(socket.emit).toBe(originalEmit);
  });

  it('a C64 session on a 68K door WITHOUT the tooltype is still refused', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, { ...c64Session(), commandText: 'PLAIN68K' }, '');
    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(mockAdapterDuringRun).toHaveLength(0);
  });

  // The bug this pins (Task 3 review): a local copy of the per-door predicate
  // that read only the two tooltype MAPS would say "no" here - the Door the
  // Enter-by-command-name path hands executeAmigaDoor carries neither, only
  // the value initializeDoors() resolved onto it - so the gate would let the
  // door in and it would then run UNADAPTED, 80-column bytes at a C64. Marker,
  // gate and install site must all read the one resolved value.
  it('marker, gate AND the adapter install agree when C64_ADAPT lives ONLY in the installed 68K record', async () => {
    mockInstalledRecords.push({
      command: 'INSTONLY',
      name: 'Installed Only',
      location: 'Doors:C64Door/C64Door',
      resolvedPath: path.join(root, 'Doors', 'C64Door', 'C64Door'),
      access: 0,
      type: 'XIM',
      installed: true,
      toolTypes: { LOCATION: 'Doors:C64Door/C64Door', TYPE: 'XIM', C64_ADAPT: '40' },
    });
    await register([{ ...PLAIN_68K, name: 'INSTONLY' }]);

    const door = getDoors().find((d) => d.command === 'INSTONLY');
    expect(door!.toolTypes?.['C64_ADAPT']).toBeUndefined();
    const marked = formatDoorLine(door, false).includes('[C64]');

    const socket = makeSocket();
    await handleCommand(socket as any, { ...c64Session(), commandText: 'INSTONLY' }, '');
    const launched = (doorDropFileManager.createAllDropFiles as jest.Mock).mock.calls.length === 1;
    const adapted = mockAdapterDuringRun.length === 1 && mockAdapterDuringRun[0] !== null;

    expect({ marked, launched, adapted }).toEqual({ marked: true, launched: true, adapted: true });
    // And the door's 80-column rule never reached the caller.
    expect(allOutput(socket)).not.toContain('-'.repeat(70));
  });
});
