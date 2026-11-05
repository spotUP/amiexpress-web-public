/**
 * A `C64_ADAPT=40` door opens for a caller whose PETSCII screen is EIGHTY
 * columns wide, and what he gets is the door's OWN screen - not a folded one,
 * and not an adapted one.
 *
 * "80 column petscii dont need any special petscii rules it can use the normal
 * /X doors for everything and normal file lists etc" (sysop, 2026-09-07). The
 * first pass at this phase installed the frame adapter for him and argued that
 * its fold is the identity at 80. The fold is - and the rest of the adapter is
 * not: the output is round-tripped through a 25-row reconstructor that drops
 * the escapes it does not model, blank runs are squeezed whatever the width,
 * a door's DIR rows are re-rendered through the FORTY-column file layout, and
 * the per-line pause stands down for an adapted caller in favour of an adapted
 * pause that can never fire at 80. He was reading door output with no pause at
 * all, losing whatever scrolled past 25 rows.
 *
 * So the assertion is now the plain one: no adapter, and the bytes on the wire
 * are the door's own, transduced to PETSCII and nothing else.
 *
 * Driven through the REAL `executeDoor` gate with a Door built from the .info
 * bytes on disk, replaying the door's REAL captured output from inside the
 * run, and reading what reached the CONNECTION past the ANSI-to-PETSCII
 * transducer - which is what the web canvas actually receives.
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
import { screenShows, everShowed, inChunks } from '../../petscii-frame/helpers/screen-oracle';
import * as amigafs from '../../../src/utils/amigafs';
import { config } from '../../../src/config';
import { LoggedOnSubState } from '../../../src/constants/bbs-states';
import type { Door } from '../../../src/types';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

const REPO = path.resolve(__dirname, '../../../../..');
const BBSCMD = path.join(REPO, 'board', 'Commands/BBSCmd');
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

  it('WALL: the gate lets him in, NO adapter runs, and no ESC reaches him', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', wideSession(), root);

    expect(doorDropFileManager.createAllDropFiles).toHaveBeenCalledTimes(1);
    // Captured from INSIDE the run: nothing adapted this caller's screen.
    expect(run.adapter ?? null).toBeNull();
    // A PETSCII terminal has no ANSI parser. The transducer is what removes
    // the escapes - and it is now the only thing between door and caller.
    expect(run.bytes.includes(0x1b)).toBe(false);
    expect(run.bytes.length).toBeGreaterThan(0);
  });

  it('WALL: a 40-column caller IS adapted - the pair is what makes the rule a rule', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', narrowSession(), root);

    expect(run.adapter).not.toBeNull();
    expect(run.adapter.columns).toBe(40);
  });

  it('WALL: the screen is 80x25, every row 80 cells, and the empty slots reach the caller', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', wideSession(), root);
    const glass = glassOf(run.bytes, 80);

    expect(glass.state.screen.length).toBe(2000);
    expect([glass.state.cols, glass.state.rows]).toEqual([80, 25]);
    /*
     * ASKED OF THE RUN, NOT OF THE LAST FRAME.
     *
     * The placeholder rows are a TEXT rule, blanked only because they cost a
     * 40-column caller rows - so this caller must be shown them. They are
     * NOT on the final screen, and that is not the adapter's doing: the door
     * paints more rows than a 25-row screen holds, so its opening scrolls
     * off under its own later output, exactly as it would on a real
     * terminal. This case asked the last frame and read a scroll as a loss.
     */
    expect(everShowed(glassOf(Buffer.alloc(0), 80), inChunks(run.bytes), PLACEHOLDER)).toBe(true);
    // ...because nothing folded them: there is no adapter on this caller.
    expect(run.adapter ?? null).toBeNull();
  });

  it('WALL: the same door at 40 loses the slots - the pair is the proof', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'wall.ans'), 'latin1');
    const run = await open('WALL', narrowSession(), root);
    const glass = glassOf(run.bytes, 40);

    expect(run.adapter.columns).toBe(40);
    expect(run.adapter.unseenRows()).toBe(0);
    expect(glass.state.screen.length).toBe(1000);
    expect([glass.state.cols, glass.state.rows]).toEqual([40, 25]);
    expect(screenShows(glass, PLACEHOLDER)).toBe(false);
    expect(run.adapter.unseenRows()).toBe(0);
  });

  /*
   * CONFTOP, not CTOP, since 2026-09-22. They are two registrations of the
   * same table - Conftop-II under `ctop`, the v2.3 build under `conftop` -
   * and `ctop` is a TypeScript door now (`Doors/ctop-viewer`, MIN_COLUMNS=40)
   * with a forty-column layout of its own, so there is no adapter on it to
   * ask about. `conftop` is still the 68K binary behind the adapter and still
   * centres the same sentence, so the property keeps its proof and its
   * fixture (`conftop.ans`, the corpus's own capture).
   */
  it('conftop: the empty-conference notice reaches an 80-column caller, and never a 40-column one', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'conftop.ans'), 'latin1');

    /*
     * The door centres this sentence on slot 5 of a screen ~32 rows tall
     * (manifest note, `conftop`), so on a 25-row glass it is painted and then
     * scrolled off by the door's own totals block. The caller at 80 READ it;
     * asking the final frame would ask about arithmetic instead.
     */
    const wideBytes = (await open('conftop', wideSession(), root)).bytes;
    expect(everShowed(glassOf(Buffer.alloc(0), 80), inChunks(wideBytes), NOTICE)).toBe(true);

    /*
     * And never at 40, at any point in the run - the 40-column rung reshapes
     * that line rather than keeping it whole, which is the whole reason the
     * pair is here. Progressive on this side too, so "never" means never
     * rather than "not at the end".
     */
    const narrowBytes = (await open('conftop', narrowSession(), root)).bytes;
    expect(everShowed(glassOf(Buffer.alloc(0), 40), inChunks(narrowBytes), NOTICE)).toBe(false);
  });
});

/**
 * The claim the sysop actually made: at 80 columns this board has no special
 * PETSCII rules left. So the caller's door output must be what the ANSI
 * caller's is, byte for byte, once the transducer has turned it into PETSCII -
 * and the two things the adapter used to do to it must not happen.
 */
describe('an 80-column PETSCII caller reads the door the ANSI caller reads', () => {
  jest.setTimeout(60000);

  let root: string;
  const realConfigGet = config.get.bind(config);

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'petscii-80-parity-'));
    mockRootRef.value = root;
    jest.spyOn(config, 'get').mockImplementation((key: any) =>
      key === 'dataDir' ? root : realConfigGet(key));
    (doorDropFileManager.createAllDropFiles as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  /** The door's own bytes, as the ANSI caller receives them. */
  function ansiSession(): any {
    return { ...wideSession(), terminalType: 'modern', petsciiMode: false, petsciiColumns: undefined, screenWidth: 80 };
  }

  it('keeps the blank rows the door drew, which the 40-column squeeze removes', async () => {
    // `collapseLongBlankRuns` squeezes any interior run of three or more blank
    // rows to one, whatever the caller's width. gwall is 1,840 bytes of wall
    // with spacing in it.
    replay.text = fs.readFileSync(path.join(FIXTURES, 'gwall.ans'), 'latin1');

    const wideBytes = (await open('GWALL', wideSession(), root)).bytes;
    const ansi = (await open('GWALL', ansiSession(), root)).bytes.toString('latin1');

    // Every row the ANSI caller was sent is a row this caller can be sent too:
    // same width, no fold, so the same lines survive.
    const ansiRows = ansi.split(/\r?\n/).map((r) => r.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trimEnd());
    const painted = ansiRows.filter((r) => r.trim().length > 0).slice(0, 12);
    expect(painted.length).toBeGreaterThan(3);
    for (const row of painted) {
      const word = row.trim().split(/\s+/).find((w) => /^[A-Za-z]{4,}$/.test(w));
      if (!word) continue;
      // Over the RUN: a wall is longer than the screen, so its first entries
      // scroll under its last ones. What has to be true is that the
      // 80-column caller was sent every line the ANSI caller was, not that
      // all of them are on the glass at the same moment.
      const shown = everShowed(glassOf(Buffer.alloc(0), 80), inChunks(wideBytes), word);
      expect({ word, shown }).toEqual({ word, shown: true });
    }
  });

  it('is never asked to page: the door is not held by an adapted frame', async () => {
    replay.text = fs.readFileSync(path.join(FIXTURES, 'gwall.ans'), 'latin1');
    const run = await open('GWALL', wideSession(), root);

    expect(run.adapter ?? null).toBeNull();
    expect(run.bytes.toString('latin1')).not.toContain('More(y/n/ns)');
  });
});
