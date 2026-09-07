/**
 * Phase 5 of the 80-column PETSCII plan: a `C64_ADAPT=40` door opens for a
 * caller whose PETSCII screen is EIGHTY columns wide, and what he gets is his
 * own screen rather than a folded one.
 *
 * The claim is "for free": at 80 the frame adapter's fold is the identity, so
 * nothing had to be re-marked and no door had to be told about the wide
 * screen. That is only worth asserting end to end, so this drives the REAL
 * `executeDoor` gate with a Door built from the .info bytes on disk, replays
 * the door's REAL captured output from inside the run (the point where the
 * adapter is installed on the socket - constructing one proves nothing), and
 * reads the bytes that reached the CONNECTION, past the ANSI-to-PETSCII
 * transducer, which is what a C64 or the web canvas actually receives.
 *
 * Three things are asserted about those bytes, and each one is the opposite
 * of what a 40-column caller gets - which is what proves the width gates went
 * in the right place rather than merely existing:
 *
 *  - dRE!WAll keeps its `VIRGIN LINE` slots. At 40 they are blanked, because
 *    each costs a caller with 25 rows two of them
 *    (tests/petscii-frame/the-wall-fits-without-a-pause.test.ts).
 *  - ctop keeps `- NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE -`. At 40 it
 *    never reaches the wire
 *    (tests/petscii-frame/ctop-empty-notice-is-silent-at-40.test.ts).
 *  - Neither door is asked to page: `unseenRows()` is zero, which is the exact
 *    question the pause in xim/io.ts asks before it holds a door.
 *
 * And two things about the shape of the stream itself: no ESC byte survives to
 * the connection (a PETSCII caller has no ANSI parser), and the screen those
 * bytes build is 80x25 with every row 80 cells.
 */
import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));
jest.mock('../../../src/services/DoorDropFileManager');
jest.mock('../../../src/services/CallersLogManager');

/** The fixture the mocked 68K runtime replays, set per test before executeDoor. */
const replay = { text: '', chunk: 64, gapEvery: 512 };
/** The adapter that was on the socket WHILE the door ran, captured from inside. */
const adapterDuringRun: any[] = [];

const realSetTimeout = global.setTimeout;
const wait = (ms: number) => new Promise((resolve) => realSetTimeout(resolve, ms));

/**
 * The 68K runtime, replaced by a door that emits a REAL capture of that
 * door's output. Emitting from here is the whole point: the emit it uses is
 * the one installC64DoorAdapter patched, so the fixture goes through the
 * adapter the gate installed rather than one the test built.
 */
jest.mock('../../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    private socket: any;
    constructor(socket: any) { this.socket = socket; }
    async start() {
      const { c64AdapterFor } = require('../../../src/server/c64-door-adapter');
      adapterDuringRun.push(c64AdapterFor(this.socket));
      const { text, chunk, gapEvery } = replay;
      for (let i = 0; i < text.length; i += chunk) {
        this.socket.emit('ansi-output', text.slice(i, i + chunk));
        if (i % gapEvery === 0) await wait(12); // a quiet gap: the adapter cuts a frame
      }
      await wait(60);
    }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));

const mockRootRef = { value: '' };
jest.mock('../../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRootRef.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));

import { executeDoor, setHelpers } from '../../../src/handlers/door.handler';
import { doorDropFileManager } from '../../../src/services/DoorDropFileManager';
import { loadCommandFromInfo } from '../../../src/utils/amiga-command-parser.util';
import { buildConnectionEmitter } from '../../../src/server/connection-emitter';
import { PetsciiMachine, WideScreenMachine } from '@amiexpress/bbs-door-sdk/petscii';
import { screenShows } from '../../petscii-frame/helpers/screen-oracle';
import * as amigafs from '../../../src/utils/amigafs';
import { config } from '../../../src/config';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import type { Door } from '../../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

const REPO = path.resolve(__dirname, '../../../../..');
const BBSCMD = path.join(REPO, 'Commands/BBSCmd');
const FIXTURES = path.join(REPO, 'sdk/tests/petscii/frame/fixtures');

const NOTICE = 'NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE';
/** One WORD: renderDiff breaks a row into runs, so the phrase is never contiguous. */
const PLACEHOLDER = 'VIRGIN';

function infoPathFor(command: string): string {
  return amigafs.resolvePath(path.join(BBSCMD, `${command}.info`))
    ?? path.join(BBSCMD, `${command}.info`);
}

/** A caller who answered P8 at the graphics prompt: PETSCII bytes, 80 columns. */
function wideSession(): any {
  return {
    state: 'loggedon', subState: LoggedOnSubState.PROCESS_COMMAND,
    user: { id: 'u1', username: 'WIDEUSER', secLevel: 255 },
    nodeId: 1, terminalType: 'c64', petsciiMode: true, petsciiColumns: 80,
    screenWidth: 80, screenHeight: 25, tempData: {}, menuPause: true,
  };
}

/** The same caller at 40, for the assertions that are only meaningful as a pair. */
function narrowSession(): any {
  return { ...wideSession(), petsciiColumns: 40, screenWidth: 40 };
}

interface Run {
  /** Everything that reached the connection: PETSCII bytes, past the transducer. */
  bytes: Buffer;
  adapter: any;
}

/**
 * One door, through the real gate, for one session.
 *
 * The socket handed to executeDoor is the REAL connection emitter, so the
 * door's ANSI goes down the same path a telnet caller's does - adapter, then
 * transducer, then the socket - and `bytes` below is what the caller's
 * terminal receives.
 */
async function open(command: string, session: any, root: string): Promise<Run> {
  const writes: Buffer[] = [];
  const connection: any = {
    sessionId: 'petscii-80',
    session,
    write: (data: Buffer | string) => {
      writes.push(typeof data === 'string' ? Buffer.from(data, 'latin1') : Buffer.from(data));
    },
    on: () => undefined,
    off: () => undefined,
    close: () => undefined,
  };
  // The emitter exposes the connection's own session through a getter, so
  // the session set on `connection` above IS socket.session.
  const socket: any = buildConnectionEmitter(connection);
  expect(socket.session).toBe(session);

  const def = loadCommandFromInfo(infoPathFor(command));
  if (!def) throw new Error(`Commands/BBSCmd/${command}.info did not parse`);
  const full = path.join(root, ...def.location.split('/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.from([0x00, 0x00, 0x03, 0xf3])); // Amiga hunk magic
  const door = {
    id: command.toLowerCase(), name: command, description: '', command,
    path: def.location, accessLevel: 0, enabled: true, type: def.type,
    toolTypes: def.toolTypes,
  } as unknown as Door;

  adapterDuringRun.length = 0;
  await executeDoor(socket, session, door);
  return { bytes: Buffer.concat(writes), adapter: adapterDuringRun[0] };
}

/** The terminal the caller is looking at, after eating these wire bytes. */
function glassOf(bytes: Buffer, columns: 40 | 80): PetsciiMachine {
  const machine = columns === 80 ? new WideScreenMachine() : new PetsciiMachine();
  machine.feed(bytes);
  return machine;
}

describe('a C64_ADAPT door opens for an 80-column PETSCII caller', () => {
  jest.setTimeout(60000);

  let root: string;
  const realConfigGet = config.get.bind(config);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-80-'));
    mockRootRef.value = root;
    jest.spyOn(config, 'get').mockImplementation((key: any) =>
      key === 'dataDir' ? root : realConfigGet(key));
    (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('WALL: the gate lets him in, the adapter runs at 80, and no ESC reaches him', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', wideSession(), root);

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    // Captured from inside the run: the adapter was on the socket, at 80.
    expect(run.adapter).not.toBeNull();
    expect(run.adapter.columns).toBe(80);
    // A PETSCII terminal has no ANSI parser. Nothing the adapter emitted may
    // survive the transducer as an escape.
    expect(run.bytes.includes(0x1b)).toBe(false);
    expect(run.bytes.length).toBeGreaterThan(0);
  });

  it('WALL: the screen is 80x25, every row 80 cells, and the empty slots are still on it', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', wideSession(), root);
    const glass = glassOf(run.bytes, 80);

    expect(glass.state.screen.length).toBe(2000);
    expect([glass.state.cols, glass.state.rows]).toEqual([80, 25]);
    // The placeholder rows are a TEXT rule, blanked only because they cost a
    // 40-column caller rows. This caller has the rows.
    expect(screenShows(glass, PLACEHOLDER)).toBe(true);
    // ...and nothing was folded, so he is never asked to page.
    expect(run.adapter.unseenRows()).toBe(0);
  });

  it('WALL: the same door at 40 loses the slots - the pair is the proof', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', narrowSession(), root);
    const glass = glassOf(run.bytes, 40);

    expect(run.adapter.columns).toBe(40);
    expect(glass.state.screen.length).toBe(1000);
    expect([glass.state.cols, glass.state.rows]).toEqual([40, 25]);
    expect(screenShows(glass, PLACEHOLDER)).toBe(false);
    expect(run.adapter.unseenRows()).toBe(0);
  });

  it('ctop: the empty-conference notice reaches an 80-column caller, and never a 40-column one', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'ctop.ans'), 'latin1');

    const wide = glassOf((await open('ctop', wideSession(), root)).bytes, 80);
    expect(screenShows(wide, NOTICE)).toBe(true);

    const narrow = glassOf((await open('ctop', narrowSession(), root)).bytes, 40);
    expect(screenShows(narrow, NOTICE)).toBe(false);
  });
});
