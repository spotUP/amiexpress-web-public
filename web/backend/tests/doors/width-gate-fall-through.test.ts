/**
 * A door the width gate refuses must not take the COMMAND down with it.
 *
 * The sysop's report, three days open: "I cannot list files on my C64."
 * `Commands/BBSCmd/f.info`, `fr.info` and `scan.info` register the 68K door
 * AquaScan over F/FR/N, `Z.info` registers one over Z, and dispatch asks
 * BBSCMD before the internal switch (express.e:28228). So on a 40-column
 * PETSCII session the door won the command, `executeDoor`'s MIN_COLUMNS gate
 * printed THIS DOOR NEEDS AN 80 COLUMN SCREEN, and the caller went back to the
 * menu - while this board's own file listing, which it renders perfectly well
 * at 40 columns, sat one tier below and was never reached.
 *
 * The ruling (open backlog 11.1, sysop 2026-09-06): a refused door falls
 * through to the internal command of the same name. A command with NO internal
 * equivalent is refused exactly as before - a refusal never becomes silence.
 *
 * Everything here drives the REAL chain, the same one door-min-columns-dispatch
 * pins: initializeDoors() -> getDoors() -> setDoorsForCommandHandler() ->
 * setCommandExecutionDependencies() (server/initialization.ts:757, the wiring
 * that makes BBSCMD outrank the internal switch) -> handleCommand() ->
 * processCommand() -> executeDoor(). The assertions are on what the CALLER
 * receives, because the whole bug was that the right code existed and was
 * unreachable. `createAllDropFiles` is the launch sentinel: executeDoor calls
 * it immediately before the door-type switch, so "not called" means the door
 * really was refused.
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
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

/**
 * A door type nothing routes, so executeDoor reaches its launch sentinel and
 * stops - the gate is what is under test, not the 68K runtime. The gate is
 * type-blind by design (resolveDoorMinColumns reads a number), so this door is
 * refused at 40 columns for exactly the reason AquaScan is: it declares no
 * MIN_COLUMNS, and unclassified is closed.
 */
const UNROUTED = 'unrouted-fall-through-test-type';

const doorOver = (name: string, toolTypes: Record<string, string> = {}) => ({
  name,
  type: UNROUTED,
  location: `Doors/${name}/${name}`,
  access: 0,
  toolTypes: { LOCATION: `Doors:${name}/${name}`, TYPE: 'XIM', ...toolTypes },
});

/** One DIR entry in the on-disk format express.e writes: 12-char name, space, status. */
const dirLine = (filename: string, desc: string) =>
  `${filename.padEnd(12)} P   12K  23-Oct-25  ${desc}`;

async function register(...defs: any[]) {
  commandCache.bbscmd.clear();
  for (const d of defs) commandCache.bbscmd.set(d.name.toUpperCase(), d);
  await initializeDoors();
  // server/initialization.ts:660 + :757 - the two handoffs that make a typed
  // command find the door AND make BBSCMD outrank the internal switch.
  setDoorsForCommandHandler(getDoors());
  setCommandExecutionDependencies(executeDoor, processBBSCommand);
}

/**
 * ONE root for the whole file, deliberately. The BBSCMD freshness stamp
 * (command-execution.handler.ts bbsCommandDirsStamp) contains the search-path
 * STRINGS, so a fresh temp root per test reads as "the command directories
 * changed", wipes the seeded cache mid-suite and quietly turns a door test
 * into an internal-command test.
 */
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'width-gate-fall-'));
  mockRootRef.value = root;
  // The conference the caller is in, with two files in directory 1. No
  // ConfConfig.info, so conferenceDir() falls back to Conf<n> (its documented
  // default for a board that has never been renumbered).
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
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
    id: `fall-through-socket-${Math.random()}`,
    emitted,
    emit(event: string, data?: unknown) { emitted.push({ event, data }); return true; },
    on() { return this; },
  };
}

const allOutput = (socket: any) =>
  socket.emitted.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');

/** A user the ACS answers yes for: 'T' in every flag position the handlers ask about. */
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

function ansiSession(commandText: string): any {
  return { ...c64Session(commandText), terminalType: 'ansi', petsciiMode: false, screenWidth: 80 };
}

describe('a 40-column caller who types FR gets the file list', () => {
  beforeEach(async () => {
    await register(doorOver('FR'));
  });

  it('receives the listing, not THIS DOOR NEEDS AN 80 COLUMN SCREEN', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('FR'), '');

    const out = allOutput(socket);
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    // FR is the reverse listing (express.e:24883) - F below is the forward one.
    expect(out).toContain('Reverse scanning directory 1');
    expect(out).toContain('CHASE.LHA');
    expect(out).toContain('SCOOPEX.LHA');
  });

  it('still refuses the DOOR - the fall-through is a refusal, not an opening', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('FR'), '');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('leaves the door serving 80-column callers exactly as before', async () => {
    const socket = makeSocket();
    await handleCommand(socket as any, ansiSession('FR'), '');

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(allOutput(socket)).not.toContain('canning directory 1');
  });

  it('clears the fall-through arm off the session when the command is done', async () => {
    const session = c64Session('FR');
    await handleCommand(makeSocket() as any, session, '');
    expect(session.widthGateFallThrough).toBeUndefined();
  });
});

describe('a 40-column caller who types F gets the file list', () => {
  it('reaches the internal F handler the same way FR does', async () => {
    await register(doorOver('F'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('F'), '');

    const out = allOutput(socket);
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).toContain('Scanning directory 1');
    expect(out).toContain('CHASE.LHA');
  });
});

describe('a 40-column caller who types Z reaches the zippy search', () => {
  it('is asked for a search string instead of being sent back to the menu', async () => {
    await register(doorOver('Z'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('Z'), '');

    const out = allOutput(socket);
    expect(out).not.toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).toContain('Enter string to search for:');
  });

  /**
   * A command that prompts keeps its prompt after a door is refused for width.
   *
   * The sysop's follow-up the same day: "z takes a hotkey instead of a string."
   * The fall-through above is what first brought him to this prompt, and the
   * prompt then consumed a single keypress - his C was the whole search string.
   * The fall-through hands the internal handler the command and nothing else:
   * the sub-state it sets is the caller's to answer, one LINE at a time
   * (utils/line-input.util LINE_PROMPT_SUBSTATES, express.e:26151).
   */
  it('lets me type a whole search string at that prompt, not one key', async () => {
    await register(doorOver('Z'));
    const socket = makeSocket();
    const session = c64Session('Z');
    await handleCommand(socket as any, session, '');

    for (const ch of 'CHASE') {
      await handleCommand(socket as any, session, ch);
      // Every letter of it is still the search string being typed.
      expect(session.subState).toBe(LoggedOnSubState.ZIPPY_SEARCH_INPUT);
    }
    await handleCommand(socket as any, session, '\r');
    for (const ch of '1\r') {
      await handleCommand(socket as any, session, ch);
    }

    const out = allOutput(socket);
    expect(out).toContain('Enter string to search for: CHASE');
    expect(out).toContain('CHASE.LHA');
  });
});

describe('a command with no internal equivalent still refuses', () => {
  it('prints THIS DOOR NEEDS AN 80 COLUMN SCREEN and returns to the menu', async () => {
    // DOORMAN is a door and nothing else - it is not one of the commands the
    // BBS answers itself, so there is no tier below to fall to.
    await register(doorOver('DOORMAN'));
    const socket = makeSocket();
    const session = c64Session('DOORMAN');
    await handleCommand(socket as any, session, '');

    const out = allOutput(socket);
    expect(out).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(out).not.toContain('No such command!!');
    expect(doorDropFileManager.createAllDropFiles).not.toHaveBeenCalled();
  });

  it('says it once, not once per dispatch tier', async () => {
    await register(doorOver('DOORMAN'));
    const socket = makeSocket();
    await handleCommand(socket as any, c64Session('DOORMAN'), '');

    const hits = allOutput(socket).split('THIS DOOR NEEDS AN 80 COLUMN SCREEN').length - 1;
    expect(hits).toBe(1);
  });
});

describe('the arm belongs to one launch and is never inherited', () => {
  it('is cleared by a door that PASSES the gate, so a door it launches cannot use it', async () => {
    await register(doorOver('WIDE40', { MIN_COLUMNS: '40' }));
    const door = getDoors().find((d) => d.command === 'WIDE40');
    const session = c64Session('WIDE40');
    session.widthGateFallThrough = 'ARMED';

    await executeDoor(makeSocket() as any, session, door as any);

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(session.widthGateFallThrough).toBeUndefined();
  });

  it('reports REFUSED only to a caller that armed it, and prints nothing then', async () => {
    await register(doorOver('FR'));
    const door = getDoors().find((d) => d.command === 'FR');
    const socket = makeSocket();
    const session = c64Session('FR');
    session.widthGateFallThrough = 'ARMED';

    await executeDoor(socket as any, session, door as any);

    expect(session.widthGateFallThrough).toBe('REFUSED');
    expect(allOutput(socket)).not.toContain('THIS DOOR NEEDS');
  });

  it('prints the notice when nobody armed it - executeDoor reached any other way', async () => {
    await register(doorOver('FR'));
    const door = getDoors().find((d) => d.command === 'FR');
    const socket = makeSocket();
    const session = c64Session('FR');

    await executeDoor(socket as any, session, door as any);

    expect(allOutput(socket)).toContain('THIS DOOR NEEDS AN 80 COLUMN SCREEN');
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
