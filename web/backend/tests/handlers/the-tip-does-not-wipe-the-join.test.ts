/**
 * The tip door must not erase what the join just drew.
 *
 * TIP is a modal: it clears the screen, draws its frame and waits for a key.
 * It runs at the end of the login flow, and on this board the flow's last act
 * before it is the conference bulletin's second `~SP` segment - which, in
 * `Themes/607080/Conf/1/bull20.txt`, is:
 *
 *     ~f
 *     ~CC_ctop
 *     ~XISUBSCAN
 *
 * the conference top and the new-topic listing. Both were drawn and wiped in
 * the same breath. The sysop, 2026-09-14: "something draws before tip of the
 * day without a pause prompt so its not readable".
 *
 * The pause was not missing - it was spent in the wrong place. joinConference
 * sets `menuPause` precisely so the join's output is read before the next
 * screen, and the DISPLAY_MENU branch checked it AFTER running TIP, on a menu
 * that an expert user is never shown anyway.
 *
 * EXPERT MODE IS THE CASE THAT MATTERS, so it is the one driven here. The
 * menu's own pause is gated on `shouldDisplayMenu`, which is false for
 * `expert:"X"` (express.e:26119) - the sysop's own setting, and why he saw no
 * pause at all. A test written with a non-expert caller passes on the broken
 * code, because that caller's pause happened to fire further down.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';

/** The tip door, never actually opened - reaching it is the whole question. */
const executeDoor = jest.fn(async () => {});
jest.mock('../../src/handlers/door.handler', () => ({
  executeDoor: (...args: any[]) => executeDoor(...(args as [])),
  doorAvailableTo: () => true,
  displayDoorMenu: jest.fn(),
}));

/** The menu, likewise: this test is about what happens BEFORE it. */
const displayMainMenu = jest.fn(async () => {});
jest.mock('../../src/handlers/command-handler/menu', () => ({
  ...jest.requireActual('../../src/handlers/command-handler/menu'),
  displayMainMenu: (...args: any[]) => displayMainMenu(...(args as [])),
}));

import { advanceDisplayFlow } from '../../src/handlers/command.handler';
import { setDoors } from '../../src/handlers/command-handler/dependency-injection';

interface Emit { event: string; data: string }

function aCallerLeavingTheJoin(expert: string) {
  const emits: Emit[] = [];
  const socket = {
    // Keyed per caller: the output buffer is keyed by socket id, so a shared
    // id flushes one test's bytes into another's socket.
    id: `tip-pause-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) =>
      emits.push({ event, data: typeof data === 'string' ? data : '' }),
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.DISPLAY_MENU,
    currentConf: 1,
    relConfNum: 1,
    // What joinConference leaves behind: the pause it owes the caller for the
    // output it just drew.
    menuPause: true,
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert },
    tempData: {},
  } as any;
  return { socket, session, emits };
}

const wire = (emits: Emit[]) => emits.map((e) => e.data).join('');

describe('the tip of the day, at the end of a login', () => {
  beforeEach(() => {
    executeDoor.mockClear();
    displayMainMenu.mockClear();
    setDoors([{ command: 'TIP', enabled: true, accessLevel: 0, conferenceId: null }] as any);
  });

  it('does not open before the caller has dismissed the join', async () => {
    const { socket, session } = aCallerLeavingTheJoin('X');

    await advanceDisplayFlow(socket, session);

    expect(executeDoor).not.toHaveBeenCalled();
  });

  it('leaves a pause on screen for the expert who was given none', async () => {
    // The bug in one assertion: with the pause spent after TIP, an expert
    // caller reached the wipe having been asked nothing at all.
    const { socket, session, emits } = aCallerLeavingTheJoin('X');

    await advanceDisplayFlow(socket, session);

    expect(session.paginatedScreen).toBeTruthy();
    expect(wire(emits).length).toBeGreaterThan(0);
  });

  it('opens once the pause is answered', async () => {
    const { socket, session } = aCallerLeavingTheJoin('X');

    await advanceDisplayFlow(socket, session);
    // What the keypress does: the pause is gone and the flow runs on.
    session.paginatedScreen = undefined;
    await advanceDisplayFlow(socket, session);

    expect(executeDoor).toHaveBeenCalledTimes(1);
  });

  it('spends the pause once, not before every screen', async () => {
    // `menuPause` is cleared by the pause it caused. A second trip through
    // DISPLAY_MENU must not stop again, or the login never ends.
    const { socket, session } = aCallerLeavingTheJoin('X');

    await advanceDisplayFlow(socket, session);
    expect(session.menuPause).toBe(false);
  });

  it('asks nothing extra of a login that drew nothing', async () => {
    // No join, no owed pause: TIP opens straight away, as it did before.
    const { socket, session } = aCallerLeavingTheJoin('X');
    session.menuPause = false;

    await advanceDisplayFlow(socket, session);

    expect(executeDoor).toHaveBeenCalledTimes(1);
  });

  it('protects a non-expert caller too', async () => {
    // The same wipe, the same owed pause - the only difference is that this
    // caller would also have been shown the menu afterwards.
    const { socket, session } = aCallerLeavingTheJoin('N');

    await advanceDisplayFlow(socket, session);

    expect(executeDoor).not.toHaveBeenCalled();
    expect(session.paginatedScreen).toBeTruthy();
  });
});
