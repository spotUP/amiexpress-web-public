/**
 * The menu prompt must not print in the middle of the join's own tail.
 *
 * On a manual `J 3` the sysop got this, 2026-09-15 (his screenshot):
 *
 *     (Pause)...Space To Resume:
 *     Joining Conference: Console Demoscene
 *     AmiExpress Web BBS [3:Console Demoscene] Menu (59 mins. left):
 *     Console Demoscene  3 messages, 3 new for you
 *       #166 ... Type SUBS to read them
 *     AmiExpress Web BBS [3:Console Demoscene] Menu (59 mins. left):
 *
 * The menu prompt lands BETWEEN "Joining Conference" and the conference's
 * mail scan, and is then drawn a second time after it.
 *
 * WHY: the pause-dismissal continuation is fired and forgotten.
 * `handlePaginatedScreenInput` calls `paged.onComplete()` without awaiting it,
 * and the join's continuation (`continueJoinAfterBull`) is async: it emits
 * "Joining Conference", then AWAITS the mail scan. At that await, control
 * returns through `handlePaginatedScreenInput` to `handleCommand`, which sees
 * no pause left and a display-flow subState and advances the flow - drawing
 * the menu while the join is still running. express.e:25181 `joinConf` blocks,
 * so nothing there can interleave.
 *
 * The pause is answered by ONE keystroke, so this drives the real top-level
 * entry point with that one keystroke, and asserts the ORDER on the wire.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';

const displayMainMenu = jest.fn(async (socket: any) => {
  socket.emit('ansi-output', '<MENU>');
});
jest.mock('../../src/handlers/command-handler/menu', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/menu'),
  displayMainMenu: (socket: any) => displayMainMenu(socket),
}));

import { handleCommand } from '../../src/handlers/command.handler';
import { setDoors } from '../../src/handlers/door.handler';

interface Emit { event: string; data: string }

/**
 * A caller standing at the join's pause, with the rest of the join parked on
 * the pause's `onComplete` - the shape `joinConference` leaves behind, and
 * `handleJoinConferenceCommand`'s DISPLAY_MENU over the top of it.
 */
function aCallerAtTheJoinsPause(emits: Emit[]) {
  const socket = {
    id: `join-tail-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) =>
      emits.push({ event, data: typeof data === 'string' ? data : '' }),
    on: () => {},
  } as any;

  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.DISPLAY_MENU,
    currentConf: 3,
    relConfNum: 3,
    menuPause: false,
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
    paginatedScreen: {
      lines: ['\r\n'],
      nextIndex: 0,
      pageSize: 1,
      eventName: 'ansi-output',
      commands: [],
      kind: 'doPause',
      // continueJoinAfterBull in miniature: a line, an await, then the scan.
      onComplete: async () => {
        socket.emit('ansi-output', '<JOINING>');
        await new Promise((resolve) => setImmediate(resolve));
        socket.emit('ansi-output', '<MAILSCAN>');
        session.subState = LoggedOnSubState.DISPLAY_MENU;
      },
    },
  } as any;

  return { socket, session };
}

const order = (emits: Emit[]) =>
  emits
    .map((e) => e.data)
    .join('')
    .match(/<JOINING>|<MAILSCAN>|<MENU>/g) ?? [];

describe('the keystroke that dismisses the join pause', () => {
  beforeEach(() => {
    displayMainMenu.mockClear();
    setDoors([] as any);
  });

  it('prints the whole join before the menu prompt', async () => {
    const emits: Emit[] = [];
    const { socket, session } = aCallerAtTheJoinsPause(emits);

    await handleCommand(socket, session, '\r');
    // Anything the continuation still owes settles on the next tick.
    await new Promise((resolve) => setImmediate(resolve));

    // Red before the fix: <JOINING>, <MENU>, <MAILSCAN> - the prompt sits
    // above the conference's new-mail listing.
    expect(order(emits)).toEqual(['<JOINING>', '<MAILSCAN>', '<MENU>']);
  });

  it('draws the menu once, not once per kick', async () => {
    const emits: Emit[] = [];
    const { socket, session } = aCallerAtTheJoinsPause(emits);

    await handleCommand(socket, session, '\r');
    await new Promise((resolve) => setImmediate(resolve));

    expect(order(emits).filter((m) => m === '<MENU>')).toHaveLength(1);
  });

  it('still reaches the menu when the continuation is synchronous', async () => {
    // A join with nothing to await - and every other pause on the board -
    // must be unaffected: the flow advances as it always did.
    const emits: Emit[] = [];
    const { socket, session } = aCallerAtTheJoinsPause(emits);
    session.paginatedScreen.onComplete = () => {
      socket.emit('ansi-output', '<JOINING>');
      socket.emit('ansi-output', '<MAILSCAN>');
      session.subState = LoggedOnSubState.DISPLAY_MENU;
    };

    await handleCommand(socket, session, '\r');
    await new Promise((resolve) => setImmediate(resolve));

    expect(order(emits)).toEqual(['<JOINING>', '<MAILSCAN>', '<MENU>']);
  });
});
