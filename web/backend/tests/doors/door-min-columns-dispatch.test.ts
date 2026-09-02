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
 * MIN_COLUMNS on a 68K door is a claim the BBS cannot check.
 *
 * The gate is type-blind by design (resolveDoorMinColumns reads a number, not
 * a door type), so `MIN_COLUMNS=40` on an XIM binary opens it to a C64 and
 * then serves the raw 80-column bytes - which the gate suite pins as the
 * documented behaviour. The only honest thing the BBS can do is say so at
 * registration, once, where the sysop is looking.
 */
describe('initializeDoors warns about MIN_COLUMNS on an adapter-type door', () => {
  async function registerOnly(name: string, cmdDef: any) {
    const { commandCache } = require('../../src/handlers/command-execution.handler');
    commandCache.bbscmd.clear();
    commandCache.bbscmd.set(name, cmdDef);
    await initializeDoors();
  }

  it('warns for a TYPE=XIM door declaring MIN_COLUMNS=40, naming C64_ADAPT instead', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await registerOnly('LIAR', {
      name: 'LIAR',
      type: 'XIM',
      location: 'Doors/Liar/Liar',
      access: 0,
      toolTypes: { LOCATION: 'Doors:Liar/Liar', TYPE: 'XIM', MIN_COLUMNS: '40' },
    });

    const lines = warn.mock.calls.map((c) => String(c[0]));
    const hit = lines.find((l) => l.includes('LIAR') && l.includes('MIN_COLUMNS=40'));
    expect(hit).toBeDefined();
    expect(hit).toContain('C64_ADAPT=40');
  });

  it('says nothing for a TS door at MIN_COLUMNS=40 - that one lays itself out', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await registerOnly('HONEST', {
      name: 'HONEST',
      type: 'TS',
      location: 'Doors/Honest',
      access: 0,
      toolTypes: { LOCATION: 'Doors:Honest', TYPE: 'TS', MIN_COLUMNS: '40' },
    });

    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('MIN_COLUMNS'))).toEqual([]);
  });

  it('says nothing for a TYPE=XIM door at MIN_COLUMNS=80 - no claim, no lie', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await registerOnly('WIDE', {
      name: 'WIDE',
      type: 'XIM',
      location: 'Doors/Wide/Wide',
      access: 0,
      toolTypes: { LOCATION: 'Doors:Wide/Wide', TYPE: 'XIM', MIN_COLUMNS: '80' },
    });

    expect(warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('MIN_COLUMNS'))).toEqual([]);
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


/**
 * The three doors the sysop marked, read from their REAL
 * `Commands/BBSCmd/<CMD>.info` BYTES (Phase 3 Task 8 / Task 5 Step 6).
 *
 * Not a fabricated tooltype map and not a source pin: the .info file on disk
 * is parsed by `loadCommandFromInfo` - the parser registration itself uses -
 * the definition it returns is seeded into the same `commandCache.bbscmd`
 * `loadCommands()` fills, and the door is then reached the way a user reaches
 * it: `initializeDoors -> getDoors -> setDoorsForCommandHandler ->
 * handleCommand -> executeDoor -> executeAmigaDoor`.
 *
 * Two sentinels, as above: `createAllDropFiles` for "the launch proceeded",
 * and `c64AdapterFor(socket)` captured INSIDE the door's run for "the adapter
 * was actually on the wire" - everything is uninstalled by the time
 * executeDoor returns, so a post-hoc check could never prove it.
 */
describe('WHO, S and WHAT open for a C64 from their real .info bytes', () => {
  const BBSCMD = path.resolve(__dirname, '../../../../Commands/BBSCmd');
  /** Phase 3's three doors, and the binary each one launches. */
  const MARKED: Array<[string, string]> = [
    ['WHO', 'Doors/RTW/RTW'],
    ['S', 'Doors/ustats/stats'],
    ['WHAT', 'Doors/What/What'],
  ];

  function definitionFromDisk(command: string) {
    const { loadCommandFromInfo } = require('../../src/utils/amiga-command-parser.util');
    const def = loadCommandFromInfo(path.join(BBSCMD, `${command}.info`));
    if (!def) throw new Error(`Commands/BBSCmd/${command}.info did not parse`);
    return def;
  }

  /**
   * The real .info BYTES, copied into the temp BBS root and loaded by the real
   * `loadCommands()` - not a hand-seeded cache.
   *
   * Seeding `commandCache.bbscmd` directly does not survive dispatch: every
   * BBSCMD lookup calls `revalidateBbsCommandsIfChanged()` first
   * (command-execution.handler.ts), which re-scans `dataDir/Commands/BBSCmd`
   * whenever its mtime moved and clears whatever was seeded by hand. With the
   * real files on disk the revalidation reads the same bytes back, which is
   * what the live board does.
   */
  async function registerFromDisk(commands: string[]) {
    const { commandCache, loadCommands } = require('../../src/handlers/command-execution.handler');
    commandCache.bbscmd.clear();
    commandCache.syscmd.clear();
    const cmdDir = path.join(root, 'Commands', 'BBSCmd');
    fs.rmSync(cmdDir, { recursive: true, force: true });
    fs.mkdirSync(cmdDir, { recursive: true });
    for (const c of commands) {
      fs.copyFileSync(path.join(BBSCMD, `${c}.info`), path.join(cmdDir, `${c}.info`));
      // The executable executeAmigaDoor refuses to launch without. Amiga hunk
      // magic, so the native-GCC branch is not taken either.
      const full = path.join(root, ...definitionFromDisk(c).location.split('/'));
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, Buffer.from([0x00, 0x00, 0x03, 0xf3]));
    }
    loadCommands(root);
    await initializeDoors();
    setDoorsForCommandHandler(getDoors());
  }

  /** ACCESS=20 on WHO/WHAT, 010 on S - a sysop clears all three. */
  const sysopC64 = (command: string) => ({
    ...c64Session(),
    user: { id: 'u1', username: 'C64USER', secLevel: 255 },
    commandText: command,
  });

  beforeEach(() => {
    mockAdapterDuringRun.length = 0;
    // The live BBSCMD path. server/initialization.ts:665 injects these right
    // after setDoorsForCommandHandler; without them processCommand's BbsCommand
    // branch reports "executeDoor not available" and falls through to the
    // InternalCommand branch - which happens to reach the door for WHO and
    // WHAT (no internal command of that name) but NOT for S, which is an
    // internal command. Wiring it the way the server does exercises the branch
    // a real caller takes for all three.
    const { setCommandExecutionDependencies } = require('../../src/handlers/command-execution.handler');
    const { processBBSCommand } = require('../../src/handlers/command.handler');
    setCommandExecutionDependencies(executeDoor, processBBSCommand);
  });

  afterEach(() => {
    const { setCommandExecutionDependencies } = require('../../src/handlers/command-execution.handler');
    setCommandExecutionDependencies(null, null);
  });

  it.each(MARKED)('%s.info carries C64_ADAPT=40 in its real bytes', (command) => {
    const def = definitionFromDisk(command);
    expect(def.toolTypes?.['C64_ADAPT']).toBe('40');
    // ...and the 68K type that makes the claim meaningful (a TS door paints
    // its own screen and would never cross the adapter's seam).
    expect(def.type).toBe('XIM');
  });

  it('nothing else in Commands/BBSCmd claims C64_ADAPT', () => {
    const marked = MARKED.map(([c]) => c);
    const others = fs
      .readdirSync(BBSCMD)
      .filter((f) => f.endsWith('.info'))
      .filter((f) => !marked.includes(f.slice(0, -'.info'.length)))
      .filter((f) => {
        const def = (() => {
          try { return definitionFromDisk(f.slice(0, -'.info'.length)); } catch { return null; }
        })();
        return def?.toolTypes?.['C64_ADAPT'] !== undefined;
      });
    expect(others).toEqual([]);
  });

  it.each(MARKED)(
    'a C64 session reaches %s through the real Enter dispatch, with the adapter on the wire',
    async (command, location) => {
      await registerFromDisk([command]);
      const socket = makeSocket();
      const originalEmit = socket.emit;
      const { c64AdapterFor } = require('../../src/server/c64-door-adapter');

      await handleCommand(socket as any, sysopC64(command), '');

      // The gate let it in and the launch proceeded...
      expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
      expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
      // ...the adapter was installed on the socket while the door ran...
      expect(mockAdapterDuringRun).toHaveLength(1);
      expect(mockAdapterDuringRun[0]).not.toBeNull();
      // ...it reduced the door's 80-column output...
      expect(allOutput(socket)).not.toContain('-'.repeat(70));
      // ...and it was uninstalled on the way out.
      expect(c64AdapterFor(socket)).toBeNull();
      expect(socket.emit).toBe(originalEmit);
      // The door that ran is the one the .info points at.
      expect(fs.existsSync(path.join(root, ...location.split('/')))).toBe(true);
    },
  );

  it.each(MARKED)(
    'an ANSI session reaches %s with no adapter and byte-identical door output',
    async (command) => {
      await registerFromDisk([command]);
      const socket = makeSocket();
      const originalEmit = socket.emit;
      const { c64AdapterFor } = require('../../src/server/c64-door-adapter');

      await handleCommand(
        socket as any,
        {
          ...sysopC64(command),
          petsciiMode: false,
          terminalType: 'modern',
          screenWidth: 80,
          screenHeight: 24,
        },
        '',
      );

      expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
      expect(mockAdapterDuringRun).toEqual([null]);
      // The exact bytes the door emitted, contiguous and untouched.
      expect(allOutput(socket)).toContain('\x1b[2J\x1b[H' + '-'.repeat(76) + '\r\n');
      expect(c64AdapterFor(socket)).toBeNull();
      expect(socket.emit).toBe(originalEmit);
    },
  );

  it('the DOORS list marks all three [C64] and marks nothing else', async () => {
    await registerFromDisk([...MARKED.map(([c]) => c), 'RTW']);
    const marks = new Map(
      getDoors().map((d) => [d.command, formatDoorLine(d, false).includes('[C64]')]),
    );
    expect(marks.get('WHO')).toBe(true);
    expect(marks.get('S')).toBe(true);
    expect(marks.get('WHAT')).toBe(true);
    // RTW launches the SAME binary as WHO and is deliberately NOT marked -
    // the mark is per registration, not per executable.
    expect(marks.get('RTW')).toBe(false);
  });

  it('RTW - the same binary as WHO, unmarked - is still refused at 40', async () => {
    await registerFromDisk(['RTW']);
    const socket = makeSocket();

    await handleCommand(socket as any, sysopC64('RTW'), '');

    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
    expect(mockAdapterDuringRun).toHaveLength(0);
  });
});
