/**
 * A `~XI` door in a screen's SECOND half must actually open.
 *
 * A screen split by `~SP` becomes segments: displayScreen shows the first and
 * parks the rest on `session.screenSegments`. displayScreen also RUNS the
 * commands parseMciCodes found (`~XI<door>`, `~XC_<cmd>`) - and
 * processNextScreenSegment, which shows every later segment, parsed the same
 * commands out of it and dropped them on the floor.
 *
 * This board's conference bulletins end:
 *
 *     ~SP
 *     ~f
 *     ~CC_ctop
 *     ~XISUBS
 *
 * so joining a conference logged, on 2026-09-14:
 *
 *     [SCREEN] [MCI] *** FOUND ~XI DOOR: SUBS
 *     [SCREEN] [MCI] Added XIM door to execution queue
 *     [SCREEN] [MCI] Total commands to execute: 1
 *     [SCREEN] All segments processed for CONF_BULL
 *
 * and SUBS never opened. The sysop: "i see no subs launched".
 *
 * It hid because the `~CC_ctop` on the line ABOVE it DID run: inline mode
 * executes `~CC_` through a sentinel during the parse, never through the
 * returned command list. So the segment looked like it ran its commands, and
 * only the `~XI` door - the one thing that goes through the list - was lost.
 *
 * Driven through the product: a real screen file on disk, displayScreen,
 * doPause, and the keypress function the socket handler calls.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * The board's own command entry point, stubbed. A door is what this test is
 * about REACHING; running one would drag the emulator in.
 */
const handleCommand = jest.fn(async () => {});
jest.mock('../../src/handlers/command-handler/core', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/core'),
  handleCommand: (...args: any[]) => handleCommand(...(args as [])),
}));

import {
  displayScreen,
  doPause,
  handlePaginatedScreenInput,
} from '../../src/handlers/screen.handler';
import { config } from '../../src/config';

interface Emit { event: string; data: any }

/**
 * The real shape, off this board's conference bulletins.
 *
 * The leading `~` is express.e's per-file MCI gate (express.e:6800-6806): a
 * screen whose first line does not start with one is raw art and no code in it
 * means anything. A fixture without it tests the raw path and proves nothing.
 */
const BULLETIN = '~ ART ON THE FIRST PAGE\r\n~SP\r\n~f\r\n~XISUBS\r\n';

/** A board on disk with that bulletin where CONF_BULL looks: `Conf<n>/BULL.TXT`. */
function aBoardWith(bulletin: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'door-after-pause-'));
  fs.mkdirSync(path.join(root, 'Conf1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Conf1', 'BULL.TXT'), bulletin, 'latin1');
  return root;
}

const aCaller = (): any => ({
  nodeId: 0,
  currentConf: 1,
  relConfNum: 1,
  user: { username: 'Spot', name: 'Spot', secLevel: 255 },
});

function makeSocket(emits: Emit[], session: any) {
  return {
    id: `door-after-pause-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    session,
    emit: (event: string, data: any) => emits.push({ event, data }),
    on: () => {},
  } as any;
}

/** Every command string the board was asked to run, in order. */
const commandsRun = (): string[] => handleCommand.mock.calls.map((c: any[]) => c[2]);

let previousDataDir: string;

beforeEach(() => {
  handleCommand.mockClear();
  previousDataDir = config.get('dataDir');
});

afterEach(() => {
  config.set('dataDir', previousDataDir);
});

describe('a bulletin whose door lives after the ~SP', () => {
  it('opens the door once the caller dismisses the pause', async () => {
    config.set('dataDir', aBoardWith(BULLETIN));
    const session = aCaller();
    const socket = makeSocket([], session);

    expect(await displayScreen(socket, session, 'CONF_BULL')).toBe(true);
    expect(session.screenSegments?.segments).toHaveLength(1);

    doPause(socket, session);
    await handlePaginatedScreenInput(socket, session, '');

    // RED before the fix: the segment parsed `~XISUBS` into result.commands
    // and returned without ever looking at it.
    expect(commandsRun()).toContain('SUBS');
  });

  it('does not open it before the caller has seen the art', async () => {
    // Ordering, not decoration: a door paints over the screen, so running it
    // with the first page still up would wipe the page the pause is holding.
    config.set('dataDir', aBoardWith(BULLETIN));
    const session = aCaller();
    const socket = makeSocket([], session);

    await displayScreen(socket, session, 'CONF_BULL');
    expect(commandsRun()).not.toContain('SUBS');

    doPause(socket, session);
    await handlePaginatedScreenInput(socket, session, '');
    expect(commandsRun()).toContain('SUBS');
  });

  it('opens it again on a SECOND join, not just the first', async () => {
    /*
     * runQueuedScreenCommands remembers the last command list it ran
     * (`lastScreenCommandsHash`) and skips a repeat - and nothing ever resets
     * it. Draining a segment through THAT would show the bulletin on every
     * join and launch SUBS once per session, which is the same bug wearing a
     * different coat. The segment path runs its commands without that guard;
     * this is what says so.
     */
    config.set('dataDir', aBoardWith(BULLETIN));

    const join = async () => {
      const session = aCaller();
      const socket = makeSocket([], session);
      await displayScreen(socket, session, 'CONF_BULL');
      doPause(socket, session);
      await handlePaginatedScreenInput(socket, session, '');
    };

    await join();
    const afterFirst = commandsRun().filter((c) => c === 'SUBS').length;
    await join();
    const afterSecond = commandsRun().filter((c) => c === 'SUBS').length;

    expect([afterFirst, afterSecond]).toEqual([1, 2]);
  });

  it('runs it for a caller who answers `ns` at the pause too', async () => {
    // The no-stop answer drains every remaining segment in its own loop,
    // which had the identical gap. A caller must not get a different board
    // for pressing a different key.
    config.set('dataDir', aBoardWith(BULLETIN));
    const session = aCaller();
    const socket = makeSocket([], session);

    await displayScreen(socket, session, 'CONF_BULL');
    doPause(socket, session);
    await handlePaginatedScreenInput(socket, session, 'ns');

    expect(commandsRun()).toContain('SUBS');
  });

  it('still runs a door in the FIRST segment, as it always did', async () => {
    // The other half of the contract: this must not move where displayScreen's
    // own commands run.
    config.set('dataDir', aBoardWith('~ ART\r\n~XISUBS\r\n'));
    const session = aCaller();
    const socket = makeSocket([], session);

    await displayScreen(socket, session, 'CONF_BULL');
    // displayScreen defers its commands through setImmediate.
    await new Promise((resolve) => setImmediate(resolve));
    await session.pendingScreenCommand;

    expect(commandsRun()).toContain('SUBS');
  });
});
