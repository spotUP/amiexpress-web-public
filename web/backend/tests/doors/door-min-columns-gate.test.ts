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

/**
 * The 68K runtime, replaced by a door that paints one screen of captured
 * 80-column art on the socket it was handed and exits. This is what makes the
 * C64-adapter case below a RUNTIME proof rather than a source pin: the ONLY
 * thing between the fixture bytes and the assertions is the real executeDoor
 * -> executeAmigaDoor path and whatever it installed on that socket. No
 * emulator is started.
 */
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: any;
    constructor(socket: any) { this.socket = socket; }
    async start() {
      const raw = require('fs').readFileSync(
        require('path').resolve(__dirname, '../../../../sdk/tests/petscii/frame/fixtures/what.txt'),
        'latin1',
      );
      // Deliberately NO leading clear: the fixture carries no escape sequence at
      // all, so a `\x1b[2J\x1b[H` anywhere in the caller's output can only have
      // come from the adapter's own full-paint render. Emitting one here would
      // make the assertion below pass whether or not the adapter ever ran.
      for (let i = 0; i < raw.length; i += 64) this.socket.emit('ansi-output', raw.slice(i, i + 64));
      // Real timers: the adapter's quiet-gap tick must actually fire. dispose()
      // clearing both timers is proven by the adapter unit test's case (9), so
      // this can never leave a live handle behind.
      await new Promise((r) => setTimeout(r, C64_ADAPT_TICK_MS * 3));
    }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

import { executeDoor, formatDoorLine, setHelpers } from '../../src/handlers/door.handler';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { DOOR_NEEDS_80_NOTICE } from '../../src/utils/door-min-columns.util';
import { config } from '../../src/config';
import { C64_ADAPT_TICK_MS, c64AdapterFor } from '../../src/server/c64-door-adapter';
import { AnsiToPetsciiTransducer } from '@amiexpress/bbs-door-sdk/petscii';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import type { Door } from '../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

// ONE root for the whole file, not one per test: getAmigaDoorManager() is a
// module-level singleton that captures config.get('dataDir') the first time it
// is constructed, so a root that changed between tests would leave the door
// manager pointing at a deleted directory for every test after the first.
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'min-col-gate-'));
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

/**
 * The ansi-output the DOOR produced: everything up to the `door-active false`
 * the handler emits on the way out. Past that point the board repaints its own
 * menu (for a PETSCII caller that is a clear plus the 80-column art-skip
 * token), which would wipe the door's screen off the oracle below and has
 * nothing to do with the adapter.
 */
function doorOutput(socket: any): string {
  const end = socket.emitted.findIndex((e: any) => e.event === 'door-active' && e.data === false);
  const upTo = end === -1 ? socket.emitted : socket.emitted.slice(0, end);
  return upTo.filter((e: any) => e.event === 'ansi-output').map((e: any) => e.data).join('');
}

/**
 * A C64 screen code (bit 7 = reverse) back to the character it shows, for the
 * subset the fixture uses: @ A-Z [ \\ ] ^ _ and the whole 0x20-0x3F band
 * (space, punctuation, digits).
 */
function screenCodeToChar(sc: number): string {
  const c = sc & 0x7f;
  if (c === 0) return '@';
  if (c <= 0x1f) return String.fromCharCode(64 + c);          // A-Z [ \\ ] ^ _
  if (c <= 0x3f) return String.fromCharCode(c);               // space ! " ... 0-9 : ; < = > ?
  // 0x41-0x5A is the SHIFTED charset's letter band. The transducer case-swaps
  // (a C64 in shifted mode shows uppercase ASCII there), so the door's letters
  // land here, not in 0x01-0x1A.
  if (c >= 0x41 && c <= 0x5a) return String.fromCharCode(c);
  return '.';
}

/** What a real C64 would be showing after eating `ansi` through the SDK transducer. */
function petsciiScreenRows(ansi: string): string[] {
  // transduce() feeds the transducer's OWN PetsciiMachine as it goes (it is the
  // KERNAL oracle every dedup decision is made against), so `machine.state` is
  // already what a real C64 would be showing. Feeding the output bytes back in
  // would paint everything twice.
  const transducer = new AnsiToPetsciiTransducer();
  transducer.transduce(ansi);
  const { screen, cols, rows } = transducer.machine.state;
  const out: string[] = [];
  for (let y = 0; y < rows; y++) {
    let row = '';
    for (let x = 0; x < cols; x++) row += screenCodeToChar(screen[y * cols + x]);
    out.push(row);
  }
  return out;
}

/**
 * The RUNTIME install proof (Phase 3 Task 3, step 9). Not a source pin: this
 * drives the product's own top-level door entry point and asserts on what the
 * CALLER received.
 *
 * MIN_COLUMNS=40 rides along with C64_ADAPT because Task 1's gate is
 * default-closed and would refuse a c64 session before executeAmigaDoor is
 * ever reached. Task 5 makes C64_ADAPT imply 40-ok; until it does, the two
 * tooltypes are declared together.
 */
describe('executeDoor installs the C64 door adapter for a 40-column caller', () => {
  // executeAmigaDoor refuses to launch a door whose executable is missing, so
  // the fake 68K runtime above needs a real file to be "found". Amiga hunk
  // magic, so the ELF/Mach-O native-execution branch is not taken either.
  beforeEach(() => {
    fs.mkdirSync(path.join(root, 'Doors', 'GateTest'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Doors', 'GateTest', 'GateTest'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
  });

  const c64AdaptDoor = () =>
    testDoor({
      type: 'XIM' as any,
      path: 'Doors/GateTest/GateTest',
      toolTypes: { C64_ADAPT: '40', MIN_COLUMNS: '40' },
    });

  it('a c64 session entering a C64_ADAPT door is served 40-column frames, and the adapter is gone afterwards', async () => {
    const socket = makeSocket();
    const originalEmit = socket.emit;
    await executeDoor(socket as any, c64Session(), c64AdaptDoor());
    const out = doorOutput(socket);

    // The adapter rendered, and its FIRST frame is a full paint. The door itself
    // emits no escape sequences (see the mock), so these bytes are the
    // adapter's or nobody's.
    expect(out.startsWith('\x1b[2J\x1b[H')).toBe(true);

    // Every cursor address the caller received is inside a C64 screen.
    const cups = [...out.matchAll(/\x1b\[(\d+);(\d+)H/g)];
    expect(cups.length).toBeGreaterThan(0);
    for (const m of cups) {
      expect(Number(m[1])).toBeLessThanOrEqual(25);
      expect(Number(m[2])).toBeLessThanOrEqual(40);
    }

    // No 80-column row survived: the fixture's rules are 76 dashes wide.
    expect(out).not.toContain('-'.repeat(70));

    // And what a real C64 ends up showing is a 25x40 screen carrying the door.
    const rows = petsciiScreenRows(out);
    expect(rows).toHaveLength(25);
    for (const row of rows) expect(row).toHaveLength(40);
    expect(rows.join('\n')).toContain('WHAT');

    // Uninstalled on the way out - emit restored, nothing left on the socket.
    expect(c64AdapterFor(socket)).toBeNull();
    expect(socket.emit).toBe(originalEmit);
  });

  it('an 80-column session entering the same door sees the door 80-column bytes untouched', async () => {
    const socket = makeSocket();
    const originalEmit = socket.emit;
    await executeDoor(socket as any, eightyColSession(), c64AdaptDoor());
    expect(doorOutput(socket)).toContain('-'.repeat(70));
    expect(doorOutput(socket)).not.toContain('\x1b[2J');   // nothing rendered a frame
    expect(c64AdapterFor(socket)).toBeNull();
    expect(socket.emit).toBe(originalEmit);
  });

  it('a c64 session in a door WITHOUT C64_ADAPT gets the raw 80-column bytes (Task 5 extends the predicate)', async () => {
    const socket = makeSocket();
    await executeDoor(
      socket as any,
      c64Session(),
      testDoor({ type: 'XIM' as any, path: 'Doors/GateTest/GateTest', toolTypes: { MIN_COLUMNS: '40' } }),
    );
    expect(doorOutput(socket)).toContain('-'.repeat(70));
    expect(c64AdapterFor(socket)).toBeNull();
  });
});
