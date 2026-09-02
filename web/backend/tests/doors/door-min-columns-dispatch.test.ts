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
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    scanInstalledDoors: async () => [INSTALLED_RECORD],
    getCachedDoors: () => [INSTALLED_RECORD],
    isCachePopulated: () => true,
  }),
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
