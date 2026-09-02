/**
 * Task OC-8 of `thoughts/shared/plans/2026-09-02-petscii-oracle-at-the-choke.md`:
 * a 68K door's XIM bytes, stated and pinned.
 *
 * THE STATEMENT (no new code - this suite is the proof it is already true).
 * A 68K door writes everything through XIM as `ansi-output`
 * (`amiga-emulation/XIMProtocol.ts:1526-1661`,
 * `amiga-emulation/xim/system-commands.ts:609-677,1525-1545,1759-1761`,
 * `amiga-emulation/LibraryManager.ts:592,601`,
 * `amiga-emulation/AmigaDoorSession.ts:780,808`). On a 40-column PETSCII
 * session with an ADAPTED door, `executeAmigaDoor` installs the C64 frame
 * adapter (`handlers/door.handler.ts:3068`), which patches `socket.emit`
 * (`server/c64-door-adapter.ts:293`) and captures the emit it FOUND as its
 * downstream (`:260`). The choke was installed at registration
 * (`server/socket-handlers.ts`, `utils/petscii-session-model.ts`
 * `installPetsciiModelChoke`), so the emit the adapter found IS the choke: the
 * adapter wraps ABOVE it and calls DOWN into it when it re-emits the
 * reconstructed frame as 40-column `ansi-output` (`c64-door-adapter.ts:201`).
 *
 * The consequence, which is what this suite pins: the session's ONE terminal
 * model sees the door's frames AS THE CALLER SEES THEM - 40 columns,
 * adapter-reduced - and never the door's 80-column originals, which end inside
 * the adapter's `FrameReconstructor` and are never emitted. Non-adapted doors
 * and every ANSI door reach the choke unwrapped, because
 * `installC64DoorAdapter` returns null without touching `socket.emit`
 * (`c64-door-adapter.ts:253`).
 *
 * Every test drives the PRODUCT'S top-level entry point - the real Enter
 * dispatch, `handleCommand` -> `executeDoor` -> `executeAmigaDoor`, the same
 * chain `tests/doors/door-min-columns-dispatch.test.ts` drives - and asserts a
 * CALL COUNT on `AnsiToPetsciiTransducer.prototype`, never on a module export
 * (ts-jest/swc bind intra-module calls locally, so a module-export spy records
 * zero whether the path runs or not). `c64AdapterFor(socket)` captured INSIDE
 * the door's run is the "the adapter was really on the wire" sentinel:
 * everything is uninstalled by the time `executeDoor` returns.
 *
 * Fixtures are byte arrays built in code. Never write a `.seq` fixture through
 * Edit/Write: the UTF-8 round-trip destroys every high-bit byte.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The repo-wide idiom for a suite that pulls in door.handler: without it,
// importing `src/index` boots the server IIFE in-process and its heartbeat
// timer hangs the jest worker (CI runs with no --forceExit). `BBSState` is the
// only VALUE this chain takes from that module.
jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');

// executeAmigaDoor resolves the executable under amigaDoorManager.bbsRoot, so
// the stub carries the same temp root config.get('dataDir') returns.
const mockInstalledRecords: any[] = [];
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
 * The door's own bytes: an 80-column screen with absolute cursor addressing,
 * a rule far wider than a C64's 40 columns, and text starting at column 60 -
 * i.e. content no 40-column terminal can hold unreduced.
 *
 * This is the XIM seam itself: `xim/io.ts`'s `directEmit` IS
 * `this.socket.emit('ansi-output', ...)` and looks `socket.emit` up LIVE per
 * call, which is why patching the socket's emit in place puts the adapter on
 * the door's wire.
 */
const DOOR_CHUNKS = [
  '\x1b[2J\x1b[H',
  '\x1b[3;1H' + '-'.repeat(76),
  '\x1b[5;60H\x1b[33mRIGHT EDGE TEXT',
  '\x1b[12;1H\x1b[36mHELLO FROM A 68K DOOR',
];

/** `c64AdapterFor(socket)` as it was WHILE the door ran, per run. */
const mockAdapterDuringRun: unknown[] = [];
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: any;
    constructor(socket: any) {
      this.socket = socket;
    }
    async start() {
      const { c64AdapterFor } = require('../../src/server/c64-door-adapter');
      mockAdapterDuringRun.push(c64AdapterFor(this.socket));
      for (const chunk of DOOR_CHUNKS) this.socket.emit('ansi-output', chunk);
      // Real timers: the adapter's quiet-gap tick (30 ms) has to actually fire.
      await new Promise((r) => setTimeout(r, 120));
    }
    getExitState() {
      return {};
    }
    isDoorRunning() {
      return false;
    }
  },
}));

import { AnsiToPetsciiTransducer, PetsciiMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { executeDoor, initializeDoors, getDoors, setHelpers } from '../../src/handlers/door.handler';
import { handleCommand } from '../../src/handlers/command.handler';
import { setDoors as setDoorsForCommandHandler } from '../../src/handlers/command-handler/dependency-injection';
import { displayScreen } from '../../src/handlers/screen.handler';
import { petsciiMachineFor } from '../../src/handlers/petscii-screen.render';
import { installPetsciiModelChoke } from '../../src/utils/petscii-session-model';
import { doorDropFileManager } from '../../src/services/DoorDropFileManager';
import { config } from '../../src/config';
import { LoggedOnSubState } from '../../src/constants/bbs-states';

interface Emit {
  event: string;
  data: any;
}

// executeDoor writes the caller's activity through these; without them the
// launch throws before the door starts.
setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

let root: string;
const realConfigGet = config.get.bind(config);

/** The adapted door: TYPE=XIM plus the sysop's C64_ADAPT=40 promise. */
const C64_CMD = {
  name: 'C64DOOR',
  type: 'XIM',
  location: 'Doors/C64Door/C64Door',
  access: 0,
  toolTypes: { LOCATION: 'Doors:C64Door/C64Door', TYPE: 'XIM', C64_ADAPT: '40' },
};

/**
 * A 68K door the gate lets in at 40 columns but the ADAPTER never touches:
 * MIN_COLUMNS=40 opens it, `doorOpensForC64` is false (no C64_ADAPT), so
 * `installC64DoorAdapter` is never called and the door's own bytes go straight
 * to the choke. The board warns about exactly this claim at registration
 * (`initializeDoors`, pinned in door-min-columns-dispatch.test.ts).
 */
const UNADAPTED_CMD = {
  name: 'RAW68K',
  type: 'XIM',
  location: 'Doors/C64Door/C64Door',
  access: 0,
  toolTypes: { LOCATION: 'Doors:C64Door/C64Door', TYPE: 'XIM', MIN_COLUMNS: '40' },
};

async function register(defs: any[]) {
  const { commandCache } = require('../../src/handlers/command-execution.handler');
  commandCache.bbscmd.clear();
  for (const d of defs) commandCache.bbscmd.set(d.name, d);
  await initializeDoors();
  // server/initialization.ts:660 - the live handoff from the door registry to
  // the command dispatcher. Without it, Enter can never find the door.
  setDoorsForCommandHandler(getDoors());
}

beforeEach(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'oc8-door-frames-'));
  mockRootRef.value = root;
  jest.spyOn(config, 'get').mockImplementation((key: any) =>
    key === 'dataDir' ? root : realConfigGet(key),
  );
  (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  mockAdapterDuringRun.length = 0;
  // executeAmigaDoor refuses a door whose executable is missing. Amiga hunk
  // magic, so the native-GCC branch is not taken either.
  fs.mkdirSync(path.join(root, 'Doors', 'C64Door'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'Doors', 'C64Door', 'C64Door'),
    Buffer.from([0x00, 0x00, 0x03, 0xf3]),
  );
  await register([C64_CMD, UNADAPTED_CMD]);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

/**
 * A socket with the session's terminal model choke on it, the way
 * `registerSocketHandlers` installs it on every real web socket - at
 * REGISTRATION, before login and before any door, which is why the adapter
 * installed later finds it and calls down into it.
 *
 * PROTOTYPE-BACKED, the socket.io shape: a real Socket carries `emit` on its
 * PROTOTYPE and every wrapper assigns an own property over it (the shape
 * `tests/petscii-frame/c64-door-adapter.test.ts:264` pins). It matters here
 * because it is what makes "the adapter captured the emit it FOUND" a
 * falsifiable claim: the emit below the choke is still reachable through the
 * prototype, so an adapter that captured THAT would emit around the choke and
 * the model would never see the door.
 */
function makeSocket(session: any) {
  const emitted: Emit[] = [];
  /**
   * The session model's state as it was when each emit reached the BOTTOM of
   * the wrapper stack - i.e. after the choke fed it and before the caller's
   * terminal saw the bytes. Aligned index-for-index with `emitted`, so the
   * model can be compared with the terminal at EVERY step rather than only at
   * the end: a full repaint (`ESC[2J ESC[H`, which the menu does the moment a
   * door returns) re-homes both machines, so an end-state-only comparison
   * would pass even for a model that never saw the door at all.
   */
  const oracleTrace: Array<Record<string, unknown> | null> = [];
  const proto = {
    emit(event: string, data?: unknown) {
      emitted.push({ event, data });
      oracleTrace.push(oracleState(session));
      return true;
    },
    on() {
      return this;
    },
    off() {
      return this;
    },
    removeListener() {
      return this;
    },
  };
  const socket: any = Object.create(proto);
  socket.id = `oc8-socket-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  socket.session = session;
  socket.emitted = emitted;
  socket.oracleTrace = oracleTrace;
  expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);
  installPetsciiModelChoke(socket);
  expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(true);
  return socket;
}

const c64Session = (over: Record<string, any> = {}): any => ({
  state: 'loggedon',
  subState: LoggedOnSubState.PROCESS_COMMAND,
  user: { id: 'u1', username: 'C64USER', secLevel: 255 },
  nodeId: 0,
  currentConf: 0,
  terminalType: 'c64',
  petsciiMode: true,
  screenWidth: 40,
  screenHeight: 25,
  tempData: {},
  commandText: 'C64DOOR',
  ...over,
});

const ansiOutput = (socket: any): string[] =>
  socket.emitted.filter((e: Emit) => e.event === 'ansi-output').map((e: Emit) => String(e.data));

/**
 * A fresh terminal fed EVERYTHING this socket put on the wire, consumed the
 * way a real one consumes it. Copied verbatim from
 * `tests/petscii/oracle-at-the-choke.test.ts` (itself copied from
 * `seq-pause-and-colour.test.ts`) - it is the definition of "what the terminal
 * has".
 */
function wireMirror(emits: Emit[]): PetsciiMachine {
  const terminal = new AnsiToPetsciiTransducer();
  for (const e of emits) {
    if (e.event === 'petscii-bytes') {
      terminal.observe(Buffer.from(e.data, 'base64'));
    } else if (
      (e.event === 'ansi-output' || e.event === 'petscii-output') &&
      typeof e.data === 'string'
    ) {
      terminal.transduce(e.data);
    }
  }
  return terminal.machine;
}

/** The five fields that decide where and how a `.seq` value is encoded. */
function stateOf(machine: PetsciiMachine): Record<string, unknown> {
  return {
    x: machine.state.cursorX,
    y: machine.state.cursorY,
    bank: machine.state.charsetBank,
    pen: machine.state.pen,
    rvs: machine.state.reverse,
  };
}

/** The session model's state right now, or null while it does not exist yet. */
function oracleState(session: any): Record<string, unknown> | null {
  const model = session.petsciiTransducer;
  return model ? stateOf(model.machine) : null;
}

/** Events a terminal model consumes; everything else passes it by. */
const MODELLED = new Set(['ansi-output', 'petscii-output', 'petscii-bytes']);

/**
 * The model must equal the terminal at EVERY step of the wire, not merely
 * after it. This is the assertion the adapter's frames need: they are followed
 * by the menu's absolute repaint, which re-homes both machines.
 */
function expectOracleTracksWire(socket: any): void {
  const emits: Emit[] = socket.emitted;
  const trace: Array<Record<string, unknown> | null> = socket.oracleTrace;
  let checked = 0;
  for (let i = 0; i < emits.length; i++) {
    if (!MODELLED.has(emits[i].event) || typeof emits[i].data !== 'string') continue;
    expect({ step: i, state: trace[i] }).toEqual({
      step: i,
      state: stateOf(wireMirror(emits.slice(0, i + 1))),
    });
    checked++;
  }
  // Never vacuous: something was on the wire, and it moved the terminal.
  expect(checked).toBeGreaterThan(0);
}

/** The session's oracle must equal a fresh terminal fed the whole wire. */
function expectOracleMatchesWire(session: any, emits: Emit[]): void {
  // The oracle the render encodes against, against the whole wire.
  expect(stateOf(petsciiMachineFor(session))).toEqual(stateOf(wireMirror(emits)));
}

/** Fixture builder: latin1 strings, single bytes and byte arrays, in order. */
function seqBytes(...parts: Array<string | number | number[]>): Buffer {
  const out: number[] = [];
  for (const part of parts) {
    if (typeof part === 'string') out.push(...Array.from(Buffer.from(part, 'latin1')));
    else if (typeof part === 'number') out.push(part);
    else out.push(...part);
  }
  return Buffer.from(out);
}

/**
 * The `.seq` under test: the express.e gate byte, a space the tokenizer eats,
 * then ONE substituted value (`~N` - the caller's name) and one art byte. The
 * value is clipped and placed against the oracle, so it is the thing a drifted
 * model breaks. Named so it is NOT in `SCREENS_REQUIRE_CLEAR`, i.e. no `$93`
 * hides the drift.
 */
const VALUE_SEQ = seqBytes(0x7e, 0x20, '~N|', 'Z');

function writeSeq(): string {
  const file = path.join(root, 'T.SEQ');
  fs.writeFileSync(file, VALUE_SEQ);
  return file;
}

/**
 * The widest run of printable characters between escape sequences and line
 * breaks - the adapter's rows can never exceed the caller's columns.
 */
function widestPrintableRun(text: string): number {
  const withoutEscapes = text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, ' ').replace(/\x1b./g, ' ');
  return withoutEscapes
    .split(/[ \r\n]+/)
    .reduce((widest, run) => Math.max(widest, run.length), 0);
}

describe('OC-8: a 68K door reaches the session model as the caller sees it', () => {
  it("a 68K door's frames move the oracle, reduced to 40 columns", async () => {
    const session = c64Session();
    const socket = makeSocket(session);
    const door = getDoors().find((d) => d.command === 'C64DOOR');

    // `executeDoor` rather than the Enter dispatch on purpose: it is the entry
    // point that runs the door and STOPS there, so the last thing on the wire
    // is the adapter's final frame. Coming back through `handleCommand` the
    // menu repaints with an absolute `ESC[2J ESC[H`, and an absolute repaint
    // re-homes both machines - which would let this equality pass even if the
    // model had never seen the door at all. The Enter dispatch is driven by
    // the next test, whose assertion survives the repaint.
    await executeDoor(socket as any, session, door as any);

    // The gate let it in, the launch proceeded, and the adapter was on the
    // socket WHILE the door ran.
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(mockAdapterDuringRun).toHaveLength(1);
    expect(mockAdapterDuringRun[0]).not.toBeNull();

    // The model exists and is the session's ONE model...
    const model = session.petsciiTransducer;
    expect(model).toBeInstanceOf(AnsiToPetsciiTransducer);
    // ...the door really painted, so the comparison below is not two fresh
    // machines agreeing about an empty screen...
    const wire = wireMirror(socket.emitted);
    expect(wire.state.cursorY).toBeGreaterThan(0);
    // ...the oracle equalled the terminal at every single step of the wire,
    // the adapter's frames included...
    expectOracleTracksWire(socket);
    // ...and it equals a fresh terminal fed the whole wire - the frames the
    // ADAPTER emitted, not the door's 80-column originals.
    expectOracleMatchesWire(session, socket.emitted);
    // A C64 cursor can never be past column 40.
    expect(petsciiMachineFor(session).state.cursorX).toBeLessThan(40);
  });

  it("the door's own 80-column bytes never reach the model", async () => {
    const session = c64Session();
    const socket = makeSocket(session);

    // The sentinel is on the PROTOTYPE: a spy on the module export
    // `transducePetsciiAtChoke` would record zero whether the path runs or not.
    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');

    await handleCommand(socket as any, session, '');

    const fedToModel = transduce.mock.calls.map((c) => String(c[0]));
    const fedInstances = transduce.mock.instances;
    const onTheWire = ansiOutput(socket);

    // The adapter's frames reached the model...
    expect(fedToModel.length).toBeGreaterThan(0);
    // ...every feed went to THIS session's one model...
    for (const instance of fedInstances) expect(instance).toBe(session.petsciiTransducer);
    // ...and the model was fed EXACTLY the wire, in wire order: nothing the
    // caller did not see, nothing the caller saw that the model missed.
    expect(fedToModel).toEqual(onTheWire);

    // The door's 80-column rule was written to the adapter's reconstructor and
    // never emitted: neither the model nor the wire ever carried it.
    expect(fedToModel.join('')).not.toContain('-'.repeat(41));
    expect(onTheWire.join('')).not.toContain('-'.repeat(41));
    // No frame the model was fed is wider than the caller's 40 columns.
    for (const frame of fedToModel) expect(widestPrintableRun(frame)).toBeLessThanOrEqual(40);
  });

  it("the adapter's uninstall leaves the choke on the socket, and a later .seq is still fed", async () => {
    const session = c64Session();
    const socket = makeSocket(session);
    const { c64AdapterFor } = require('../../src/server/c64-door-adapter');

    await handleCommand(socket as any, session, '');

    // The adapter is gone (it restored the emit it FOUND - the choke)...
    expect(c64AdapterFor(socket)).toBeNull();
    // ...the socket-keyed choke marker is still set, so a re-install is a
    // no-op and no second choke can be stacked on this socket...
    const chokeMarks = Object.getOwnPropertySymbols(socket).filter(
      (s) => s.description === 'petsciiModelChoke',
    );
    expect(chokeMarks).toHaveLength(1);
    expect((socket as any)[chokeMarks[0]]).toBe(true);
    const emitAfterDoor = socket.emit;
    installPetsciiModelChoke(socket);
    expect(socket.emit).toBe(emitAfterDoor);

    // ...and the choke is still live. The next PAINT proves it: a `.TXT`
    // displayed through `displayScreen` emits `ansi-output`, which only the
    // choke can turn into a `transduce` on this session's model.
    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
    const txt = path.join(root, 'AFTER.TXT');
    fs.writeFileSync(txt, Buffer.from('AFTER THE DOOR\r\n', 'latin1'));
    expect(await displayScreen(socket, session, txt)).toBe(true);
    expect(transduce.mock.calls.length).toBeGreaterThan(0);
    for (const instance of transduce.mock.instances) {
      expect(instance).toBe(session.petsciiTransducer);
    }
    transduce.mockRestore();

    // ...so the `.seq` shown after the door is encoded against the cursor the
    // door actually left the caller's screen at.
    expect(await displayScreen(socket, session, writeSeq())).toBe(true);
    expectOracleMatchesWire(session, socket.emitted);
  });

  it('an unadapted 68K door still reaches the model, unreduced', async () => {
    const session = c64Session({ commandText: 'RAW68K' });
    const socket = makeSocket(session);
    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');

    await handleCommand(socket as any, session, '');

    // The door ran with NO adapter on the socket...
    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    expect(mockAdapterDuringRun).toEqual([null]);
    // ...its own 80-column bytes went straight to the choke, contiguous...
    const fedToModel = transduce.mock.calls.map((c) => String(c[0]));
    expect(fedToModel).toContain(DOOR_CHUNKS[1]);
    expect(ansiOutput(socket).join('')).toContain('-'.repeat(76));
    // ...and the model still equals the terminal.
    expectOracleMatchesWire(session, socket.emitted);
  });

  it('an ANSI session running the same door is byte-identical, with no model at all', async () => {
    const session = c64Session({
      petsciiMode: false,
      terminalType: 'modern',
      screenWidth: 80,
      screenHeight: 24,
    });
    const socket = makeSocket(session);
    const transduce = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'transduce');
    const observe = jest.spyOn(AnsiToPetsciiTransducer.prototype, 'observe');

    await handleCommand(socket as any, session, '');

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    // No adapter, and the door's exact bytes reached the wire contiguous and
    // in order - the 80-column non-negotiable.
    expect(mockAdapterDuringRun).toEqual([null]);
    expect(ansiOutput(socket).join('')).toContain(DOOR_CHUNKS.join(''));
    // The choke cost this session nothing: no transduce, no observe, no model.
    expect(transduce).toHaveBeenCalledTimes(0);
    expect(observe).toHaveBeenCalledTimes(0);
    expect(session.petsciiTransducer).toBeUndefined();
  });
});
