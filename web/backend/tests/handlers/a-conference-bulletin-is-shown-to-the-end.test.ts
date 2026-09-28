/**
 * Everything after a bulletin's `~SP` must still be shown.
 *
 * A conference bulletin split by `~SP` becomes SEGMENTS: displayScreen renders
 * the first one, parks the rest on `session.screenSegments`, and deliberately
 * sets `lastScreenHadPause = false` because "pauseDisplayFlow will handle the
 * pause" (screen.handler.ts:2322).
 *
 * Nothing handled it. The DISPLAY_CONF_BULL branch advanced straight to
 * AUTO_REJOIN, so the pause was never armed and every segment after the first
 * was dropped.
 *
 * That is not a cosmetic loss. This board's conference bulletins end:
 *
 *     ...art...
 *     ~SP
 *     ~f
 *     ~CC_ctop
 *
 * so the `~CC_ctop` that runs Conftop on every join lives in the SECOND
 * segment and had been silently dead. The live log said it without ambiguity
 * on 2026-09-14: "SETUP: 2 segments", "Processing segment 0/2", then
 * "advance state=display_menu queued=0" - segment 1 never processed, no pause,
 * no command.
 *
 * It went unnoticed because nothing fails: the art draws, the caller reaches
 * the menu, and the only symptom is a door that quietly never runs.
 *
 * Every case here drives the real code: displayScreen on a split screen
 * written to a temp board, advanceDisplayFlow, the keypress entry point
 * handleCommand, and executeDoor with the 68K runtime replaced by a door that
 * simply exits (the technique of tests/transport/browser-door-gate). What is
 * asserted is what reached the caller's socket and whether a pause stands.
 */
process.env.SKIP_DB_INIT = '1';

import 'reflect-metadata';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../../src/index', () => {
  const states = require('../../src/constants/bbs-states');
  return { BBSState: states.BBSState, LoggedOnSubState: states.LoggedOnSubState, LOCALHOST_IPS: [] };
});
jest.mock('../../src/services/DoorDropFileManager');
jest.mock('../../src/services/CallersLogManager');
jest.mock('../../src/amiga-emulation/AmigaDoorSession', () => ({
  AmigaDoorSession: class {
    async start(): Promise<void> { /* JoinCnf runs and exits */ }
    getExitState() { return {}; }
    isDoorRunning() { return false; }
  },
}));
const mockRoot = { value: '' };
jest.mock('../../src/doors/amigaDoorManager', () => ({
  getAmigaDoorManager: () => ({
    bbsRoot: mockRoot.value,
    scanInstalledDoors: async () => [],
    getCachedDoors: () => [],
    isCachePopulated: () => true,
  }),
}));
// Real, but replaceable per case: a screen that will not finish.
jest.mock('../../src/handlers/screen.handler', () => {
  const actual = jest.requireActual('../../src/handlers/screen.handler');
  return { ...actual, armSegmentBoundaryPause: jest.fn(actual.armSegmentBoundaryPause) };
});

import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { advanceDisplayFlow, handleCommand } from '../../src/handlers/command.handler';
import { displayScreen, armSegmentBoundaryPause } from '../../src/handlers/screen.handler';
import { executeDoor, setHelpers, type Door } from '../../src/handlers/door.handler';
import { flushAllBuffers } from '../../src/utils/ansi-buffer.util';
import * as amigafs from '../../src/utils/amigafs';
import { config } from '../../src/config';

setHelpers({
  callersLog: async () => undefined,
  getRecentCallerActivity: async () => [],
});

const FIRST = 'FIRST HALF OF THE BULLETIN';
const SECOND = 'SECOND HALF OF THE BULLETIN';

let root: string;
const originalDataDir = config.get('dataDir');

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-bull-to-the-end-'));
  mockRoot.value = root;
  config.set('dataDir', root);
  fs.mkdirSync(path.join(root, 'Screens'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  // The conference bulletin. The leading `~` is express.e's per-file MCI
  // gate (express.e:6800-6806).
  fs.writeFileSync(
    path.join(root, 'Conf1', 'BULL.TXT'),
    `~ ${FIRST}\r\n~SP\r\n${SECOND}\r\n`,
    'latin1',
  );
  fs.mkdirSync(path.join(root, 'Doors', 'JoinCnf'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Doors', 'JoinCnf', 'JoinCnf'), Buffer.from([0x00, 0x00, 0x03, 0xf3]));
  (armSegmentBoundaryPause as jest.Mock).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
  config.set('dataDir', originalDataDir);
  fs.rmSync(root, { recursive: true, force: true });
});

function aCaller(subState: LoggedOnSubState) {
  const emits: string[] = [];
  const socket = {
    // Per-caller id: the output buffer is keyed by socket id.
    id: `conf-bull-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') emits.push(data);
      return true;
    },
    on: () => undefined,
  } as any;
  const session = {
    nodeId: 1,
    state: BBSState.LOGGEDON,
    subState,
    currentConf: 1,
    relConfNum: 1,
    ansiEnabled: true,
    screenWidth: 80,
    user: { id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  const wire = () => { flushAllBuffers(); return emits.join(''); };
  return { socket, session, wire };
}

/** A bulletin half-shown: the first segment on screen, the rest parked. */
async function aHalfShownBulletin(subState: LoggedOnSubState) {
  const caller = aCaller(subState);
  await displayScreen(caller.socket, caller.session, 'CONF_BULL');
  return caller;
}

describe('the segment machinery the flow depends on', () => {
  it('parks later segments on the session for someone to drain', async () => {
    // If displayScreen ever stops deferring, the guards below become dead
    // code rather than silently wrong.
    const { session, wire } = await aHalfShownBulletin(LoggedOnSubState.PROCESS_COMMAND);

    expect(wire()).toContain(FIRST);
    expect(wire()).not.toContain(SECOND);
    expect(session.screenSegments?.segments.join('')).toContain(SECOND);
  });
});

/**
 * The advanceDisplayFlow loop, which is where BOTH routes into a conference
 * meet - the login display flow and the `J` command.
 *
 * The guard lived in the DISPLAY_CONF_BULL branch first and that was wrong:
 * only the login route passes through that state, so joining with `J` still
 * lost the segment. The live log showed it failing identically with the fix
 * in place (2026-09-14, subState=process_command).
 */
describe('a screen with a ~SP left half-shown', () => {
  it('does not advance while segments are still waiting: it arms the pause and stops', async () => {
    // DISPLAY_MENU, not DISPLAY_CONF_BULL: the loop must hold in ANY display
    // flow state, which is what makes it cover the `J` route too.
    const { socket, session, wire } = await aHalfShownBulletin(LoggedOnSubState.DISPLAY_MENU);
    session.subState = LoggedOnSubState.DISPLAY_MENU;

    await advanceDisplayFlow(socket, session);

    expect(session.paginatedScreen).toBeTruthy();
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
    expect(wire()).not.toContain(SECOND);
  });

  it('shows the rest when the caller answers the pause', async () => {
    // The other half of the route: the keypress completes the pagination and
    // drains the remaining segments. Without it the armed pause would hold a
    // key and then show nothing.
    const { socket, session, wire } = await aHalfShownBulletin(LoggedOnSubState.DISPLAY_MENU);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    await advanceDisplayFlow(socket, session);

    await handleCommand(socket, session, '\r');

    expect(wire()).toContain(SECOND);
  });

  it('does not re-arm over a pause that is already up', async () => {
    // Without this it would install a second pause on top of a paginated
    // screen that is already waiting for a key.
    const { socket, session } = await aHalfShownBulletin(LoggedOnSubState.DISPLAY_MENU);
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    const standing = { already: 'waiting for a key' };
    session.paginatedScreen = standing;

    await advanceDisplayFlow(socket, session);

    expect(session.paginatedScreen).toBe(standing);
  });
});

/**
 * THE ROUTE THAT ACTUALLY BROKE, and the third place I had to put this.
 *
 * `J` is a DOOR on this board - JoinCnf takes over the command - so joining a
 * conference runs a door while the bulletin is mid-segment, and comes back
 * through door.handler's completion path rather than the display-flow loop.
 * That path restored the subState and logged "continuing segments" without
 * continuing anything, and the restored state (process_command) is not a
 * display flow state, so the loop guard could never fire.
 *
 * Live log, 2026-09-14, with the loop guard already deployed:
 *
 *     [SEGMENT] SETUP: 2 segments for CONF_BULL
 *     [SEGMENT]   1: "~f\n~CC_ctop\n~XISUBS..."
 *     [SCREEN] Processing segment 0/2
 *     [executeDoor] Door J completed during segment processing - continuing segments
 *     [menu] displayMenuPrompt called subState=display_menu
 *
 * Segment 1 never processed. A log line that says it is continuing is not the
 * same as code that continues.
 */
describe('a door that exits while a screen is half-shown', () => {
  const JOINCNF = {
    id: 'joincnf', name: 'JoinCnf', description: '', command: 'J',
    path: 'Doors/JoinCnf/JoinCnf', accessLevel: 0, enabled: true, type: 'XIM',
  } as unknown as Door;

  /**
   * A TypeScript door that runs and exits. executeTypeScriptDoor reaches its
   * completion path only once the door module has loaded, through
   * `import('file://<entry>?t=<Date.now()>')`; with the clock held still that
   * name is known, and the door is registered under it as a virtual module.
   */
  async function runTypeScriptDoor(socket: unknown, session: unknown): Promise<void> {
    const NOW = 1_700_000_000_000;
    const entry = path.join(root, 'Doors', 'ctop', 'index.ts');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, '');
    const now = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.doMock(
      `file://${amigafs.resolvePath(entry)}?t=${NOW}`,
      () => ({
        __esModule: true,
        default: { getConfig: () => ({ name: 'ctop' }), execute: async () => undefined },
      }),
      { virtual: true },
    );
    const savedDataDir = process.env.BBS_DATA_DIR;
    process.env.BBS_DATA_DIR = root;   // where executeTypeScriptDoor looks for the door
    try {
      await executeDoor(socket, session as never, {
        id: 'ctop', name: 'ctop', description: '', command: 'CTOP',
        path: 'Doors/ctop', accessLevel: 0, enabled: true, type: 'typescript',
      } as unknown as Door);
    } finally {
      process.env.BBS_DATA_DIR = savedDataDir;
      now.mockRestore();
    }
  }

  it('HANDS THE SEGMENTS ON rather than only saying it will', async () => {
    /*
     * This used to require `await processNextScreenSegment(socket, session)`,
     * because the bug it was written for was segments DROPPED - the caller
     * went straight to the menu with half the screen unshown.
     *
     * Drawing the next piece immediately turned out to be the wrong way to
     * keep them, and cost a different bug: a segment boundary exists BECAUSE
     * the screen had a `~SP` there, so the caller is owed that pause, and
     * drawing straight on spends it silently. "global last callers is missing
     * a pause prompt" (sysop, 2026-09-15) - `~CC_gl ~SP` ran the door and the
     * next segment wiped its output with nothing in between.
     *
     * The property this protects: the remaining segments are handed to
     * something that will show them - the same pause any other `~SP` arms -
     * and the next piece waits for the caller's key.
     */
    const { socket, session, wire } = await aHalfShownBulletin(LoggedOnSubState.PROCESS_COMMAND);

    await executeDoor(socket, session, JOINCNF);

    expect(session.subState).toBe(LoggedOnSubState.PROCESS_COMMAND);
    expect(session.paginatedScreen).toBeTruthy();
    // And it must NOT go back to drawing the next piece itself.
    expect(wire()).not.toContain(SECOND);

    await handleCommand(socket, session, '\r');
    expect(wire()).toContain(SECOND);
  });

  it('does not let a broken screen swallow the door exit, on either path', async () => {
    // The caller is back at the board either way; a screen that will not
    // finish must not take the exit path with it.
    const err = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // Each path labels its arm; the throwing call is the path's own.
    const runners: Array<[string, (socket: unknown, session: unknown) => Promise<void>]> = [
      ['door-exit', (socket, session) => executeDoor(socket, session as never, JOINCNF)],
      ['door-exit-ts', runTypeScriptDoor],
    ];

    for (const [name, run] of runners) {
      const { socket, session } = await aHalfShownBulletin(LoggedOnSubState.PROCESS_COMMAND);
      (armSegmentBoundaryPause as jest.Mock).mockClear().mockImplementationOnce(() => {
        throw new Error('a screen that will not finish');
      });

      await expect(run(socket, session).then(() => name)).resolves.toBe(name);
      expect((armSegmentBoundaryPause as jest.Mock).mock.calls[0][2]).toBe(name);
    }
    err.mockRestore();
  });

  it('does the same on the TypeScript door completion path', async () => {
    const { socket, session, wire } = await aHalfShownBulletin(LoggedOnSubState.PROCESS_COMMAND);

    await runTypeScriptDoor(socket, session);

    // The door really ran: its exit restored the cursor it hid on entry.
    expect(wire()).toContain('\x1b[?25h');
    expect(armSegmentBoundaryPause).toHaveBeenCalledWith(socket, session, 'door-exit-ts');
    expect(session.paginatedScreen).toBeTruthy();
    expect(wire()).not.toContain(SECOND);
  });
});
