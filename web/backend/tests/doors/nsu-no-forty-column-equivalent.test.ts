/**
 * A width refusal has to say whether anything took the door's place.
 *
 * The sysop's report, the day after the fall-through landed (6c021d85e):
 * "nsu says it needs an 80 column screen still". He read the notice as the
 * fix having missed a case. It had not - NSU genuinely has nowhere to fall
 * to - but the notice could not tell him that, because it says THIS DOOR and
 * names neither the command nor the outcome.
 *
 * WHAT NSU AND CS ARE. `Commands/BBSCmd/{nsu,cs,scan}.info` all register
 * `Doors:AquaScan/AquaScan.000`, and AquaScan's own help
 * (`Doors/AquaScan/AquaScan.Help.NSU.txt`, `.CS.txt`) gives all three the same
 * synopsis: "Scan all confs since day of last call". They are the door's
 * ALL-CONFERENCES new-files scan, the same lister it runs for F, FR and N.
 *
 * WHY THERE IS NO INTERNAL EQUIVALENT TO FALL TO, and why one is not being
 * invented here. express.e's internal dispatch is `processInternalCommand`
 * (express.e:28285-28398) and it is a closed list: the file commands in it are
 * F, FR, FM, FS, N and Z. There is no NSU, no CS and no SCAN - on a real /X
 * board without AquaScan installed those three names answer "No such
 * command!!". express.e DOES have the behaviour, but only as a loop, in
 * `confScan()` (express.e:28066-28114): for every conference the caller can
 * reach and `checkFileConfScan()` allows, it sets `currentConf` and runs
 * `runSysCommand('N','S U')` - which is where the name NSU comes from. This
 * port already runs that loop at logon
 * (`handlers/message/message-scan.handler.ts`).
 *
 * (When this was written there was a second reason: that loop's `N` read the
 * SQL `file_entries` mirror, which only a web upload writes, so an internal
 * NSU would have answered "No new files found" for a conference full of DIR
 * records. That is fixed as of 2026-09-07 - `N` reads the DIR files - so the
 * refusal now rests on the dispatch list alone, which is the reason that was
 * always load-bearing.)
 *
 * So the refusal stands, and the refusal gets HONEST: it names the command and
 * says the board has no version of it at this width, in express.e's own words
 * for the same situation ("Use '?' for command list.", express.e:28397).
 *
 * The chain driven here is the real one, as in `width-gate-fall-through.test.ts`:
 * initializeDoors() -> getDoors() -> setDoorsForCommandHandler() ->
 * setCommandExecutionDependencies() -> handleCommand() -> processCommand() ->
 * executeDoor(). Assertions are on what the CALLER receives.
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
import { setDoors as setDoorsForCommandHandler } from '../../src/handlers/command-handler/dependency-injection';
import { setCommandExecutionDependencies, commandCache } from '../../src/handlers/command-execution.handler';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { DOOR_NEEDS_80_NOTICE } from '../../src/utils/door-min-columns.util';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

/** A door type nothing routes: executeDoor reaches its launch sentinel and stops. */
const UNROUTED = 'unrouted-nsu-test-type';

/** AquaScan's registration shape - no MIN_COLUMNS, no C64_ADAPT, so the gate closes. */
const aquaScanOver = (name: string) => ({
  name,
  type: UNROUTED,
  location: 'Doors/AquaScan/AquaScan.000',
  access: 0,
  toolTypes: { LOCATION: 'Doors:AquaScan/AquaScan.000', TYPE: 'XIM', ACCESS: '20' },
});

async function register(...defs: any[]) {
  commandCache.bbscmd.clear();
  for (const d of defs) commandCache.bbscmd.set(d.name.toUpperCase(), d);
  await initializeDoors();
  setDoorsForCommandHandler(getDoors());
  setCommandExecutionDependencies(executeDoor, processBBSCommand);
}

const dirLine = (filename: string, desc: string) =>
  `${filename.padEnd(12)} P   12K  23-Oct-25  ${desc}`;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'nsu-no-equiv-'));
  mockRootRef.value = root;
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'Conf1', 'DIR1'),
    [dirLine('CHASE.LHA', 'A demo'), ''].join('\r\n'),
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
    id: `nsu-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

const permissiveUser = {
  id: 'u1',
  username: 'C64USER',
  secLevel: 10,
  securityFlags: 'T'.repeat(64),
};

function c64Session(commandText: string): any {
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

describe('NSU tells me this board has no 40 column NSU', () => {
  beforeEach(async () => {
    await register(aquaScanOver('NSU'));
  });

  it('names the command I typed instead of only saying THIS DOOR', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('NSU'), '');

    const out = allOutput(socket);
    expect(out).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).toContain('THE BOARD HAS NO 40 COLUMN NSU.');
  });

  it("points me at ? for the command list, the way express.e does", async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('NSU'), '');
    expect(allOutput(socket)).toContain("USE '?' FOR THE COMMAND LIST.");
  });

  it('still refuses the door - the honest notice is not an opening', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('NSU'), '');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('leaves the fall-through channel clean for the next command', async () => {
    const session = c64Session('NSU');
    await handleCommand(makeSocket() as any, session, '');
    expect(session.widthGateFallThrough).toBeUndefined();
  });
});

describe('CS and SCAN are the same door and get the same answer', () => {
  it.each(['CS', 'SCAN'])('%s names itself in the refusal', async (name) => {
    await register(aquaScanOver(name));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session(name), '');
    expect(allOutput(socket)).toContain(`THE BOARD HAS NO 40 COLUMN ${name}.`);
  });
});

describe('the notice quotes the caller\'s own width, never a hardcoded 40', () => {
  /**
   * `sessionColumns()` is the ONE width source the gate consults, and the
   * notice has to quote the SAME number or it contradicts the refusal it is
   * explaining. A 132-column xterm is not refused by the default gate (80), so
   * the door under test declares MIN_COLUMNS=200 to make the refusal real.
   */
  it('tells a 132 column caller 132', async () => {
    await register({ ...aquaScanOver('NSU'), toolTypes: { LOCATION: 'Doors:AquaScan/AquaScan.000', TYPE: 'XIM', MIN_COLUMNS: '200' } });
    const socket = makeSocket();
    const session = c64Session('NSU');
    session.petsciiMode = false;
    session.terminalType = 'ansi';
    session.screenWidth = 132;

    await handleCommand(socket as any, session, '');
    expect(allOutput(socket)).toContain('THE BOARD HAS NO 132 COLUMN NSU.');
  });
});

describe('a command the board DOES answer keeps falling through silently', () => {
  it('FR gets the listing and no "no 40 column" line', async () => {
    await register(aquaScanOver('FR'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('FR'), '');

    const out = allOutput(socket);
    expect(out).toContain('CHASE.LHA');
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).not.toContain('THE BOARD HAS NO');
  });
});

describe('the DOORS menu refusal is untouched', () => {
  it('an unarmed refusal is byte for byte the notice it always was', async () => {
    await register(aquaScanOver('NSU'));
    const door = getDoors().find((d) => d.command === 'NSU');
    const socket = makeSocket();
    const session = c64Session('NSU');

    // executeDoor entered directly, as displayDoorMenu / a ~CC_ screen does:
    // nothing arms the channel, so there is no tier below to report on.
    await executeDoor(socket as any, session, door as any);

    expect(allOutput(socket)).toBe(DOOR_NEEDS_80_NOTICE);
  });
});
