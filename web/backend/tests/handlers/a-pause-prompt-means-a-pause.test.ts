/**
 * A pause prompt on screen must actually stop the flow.
 *
 * `advanceDisplayFlow` is entered more than once for the same keystroke:
 * `continueJoinAfterBull` kicks it when the join finishes, and `handleCommand`
 * kicks it again when the pagination that ran the join reports itself done.
 * Whichever ran first could install a pause - and the second walked straight
 * over it, printing `(Pause)...Space To Resume:` and continuing in the same
 * breath.
 *
 * The sysop, 2026-09-14: "there is a pause prompt but no pause". His live log
 * shows it with no keystroke between the lines:
 *
 *     [DISPLAY FLOW] pause before TIP
 *     [DISPLAY FLOW] advance state=display_menu menuPause=N
 *     [DISPLAY FLOW] running TIP before MENU
 *
 * That is the pause 996397e14 added being spent by the re-entry instead of by
 * him - a prompt he never got the chance to answer, and the tip door wiping
 * the join listing again behind it.
 *
 * The tip door is no longer run by the flow (a screen runs it, `~CC_TIP`, at
 * the sysop's word on 2026-09-29), so the step the second kick must not reach
 * is now the menu itself.
 *
 * THIS ONE IS DRIVEN FROM THE LIVE SIGNATURE. Three earlier attempts at the
 * neighbouring double-pause bug were abandoned because their fixtures passed
 * on broken code; this file reproduces the exact sequence the board logged -
 * advance, pause installed, advance again with no key - and fails without the
 * guard.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';

/** The menu: reaching it before the pause is answered IS the defect. */
const displayMainMenu = jest.fn(async () => {});
jest.mock('../../src/handlers/command-handler/menu', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/menu'),
  displayMainMenu: (...args: any[]) => displayMainMenu(...(args as [])),
}));

import { advanceDisplayFlow } from '../../src/handlers/command.handler';

interface Emit { event: string; data: string }

function aCallerLeavingAJoin() {
  const emits: Emit[] = [];
  const socket = {
    id: `pause-real-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) =>
      emits.push({ event, data: typeof data === 'string' ? data : '' }),
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.DISPLAY_MENU,
    currentConf: 2,
    relConfNum: 2,
    // What joinConference leaves behind: the pause it owes for what it drew.
    menuPause: true,
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert: 'N' },
    tempData: {},
  } as any;
  return { socket, session, emits };
}

const wire = (emits: Emit[]) => emits.map((e) => e.data).join('');

describe('the flow being kicked twice for one keystroke', () => {
  beforeEach(() => {
    displayMainMenu.mockClear();
  });

  it('does not draw the menu the second kick would have reached', async () => {
    // Red before the guard: the first call installs the pause, the second
    // ignores it and draws the menu over the screen the prompt was on.
    const { socket, session } = aCallerLeavingAJoin();

    await advanceDisplayFlow(socket, session);   // continueJoinAfterBull's kick
    await advanceDisplayFlow(socket, session);   // handleCommand's kick

    expect(displayMainMenu).not.toHaveBeenCalled();
  });

  it('leaves the pause standing for him to answer', async () => {
    const { socket, session } = aCallerLeavingAJoin();

    await advanceDisplayFlow(socket, session);
    await advanceDisplayFlow(socket, session);

    expect(session.paginatedScreen).toBeTruthy();
  });

  /*
   * A PROMPT-COUNTING CASE WAS TRIED HERE AND REMOVED. The prompt goes out
   * through the batching output buffer, so counting it from a stub socket
   * measures the buffer's timer rather than the board's behaviour - it read
   * zero whether the guard was in place or not. "Leaves the pause standing"
   * above asserts the same thing against state the board actually keeps.
   */

  it('still advances once the pause has been answered', async () => {
    // The round trip: standing still must not strand him. Clearing
    // `paginatedScreen` is what the keypress path does.
    const { socket, session } = aCallerLeavingAJoin();

    await advanceDisplayFlow(socket, session);
    session.paginatedScreen = undefined;
    await advanceDisplayFlow(socket, session);

    expect(displayMainMenu).toHaveBeenCalledTimes(1);
  });

  it('is not tripped by a flow with no pause outstanding', async () => {
    // Every other board, every other login: nothing owed, nothing standing,
    // the flow runs exactly as before.
    const { socket, session } = aCallerLeavingAJoin();
    session.menuPause = false;

    await advanceDisplayFlow(socket, session);

    expect(displayMainMenu).toHaveBeenCalledTimes(1);
  });
});
