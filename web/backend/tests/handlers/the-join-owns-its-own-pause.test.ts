/**
 * The display flow must not book a second pause after an auto-rejoin.
 *
 * express.e:28574 calls `joinConf` and goes on to the menu. The only pause in
 * between is the one `joinConf` does itself at 5059, after `SCREEN_CONF_BULL`.
 * There is no flow pause after an auto-rejoin at all.
 *
 * `pauseDisplayFlow` did more than nothing here. Seeing the join's pause
 * already on screen it honoured it AND remembered a debt - the behaviour
 * written for a `~SP` INSIDE `NODE_BULL`, where the screen's own pause is not
 * the flow's - and that debt was settled the moment the caller answered,
 * printing a second `(Pause)...Space To Resume:` directly under "Joining
 * Conference" with nothing between them.
 *
 * The sysop, 2026-09-15, of that second prompt: "a hidden prompt?". It
 * appeared only once the join's own pause was put back in its express.e
 * position, which is what made the spare one visible rather than merely
 * misplaced.
 *
 * `menuPause` stays SET: express.e:28579 wants one pause before the menu, and
 * it belongs after the mail scan rather than before it.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';

/**
 * A join that parks its own pause and yields, which is what the real one does
 * for a conference whose bulletin it drew (conference.handler: the pause is
 * installed, `subState` parked at READ_COMMAND, `true` returned).
 */
const joinConference = jest.fn(async (_s: any, session: any) => {
  session.paginatedScreen = { lines: [''], nextIndex: 1, pageSize: 1, kind: 'doPause' };
  /*
   * A SEGMENT STILL TO COME, which is what every conference bulletin on this
   * board leaves: `~f` + art + `~SP` + `~f` + `~CC_ctop` is two segments, and
   * the join's pause lands with the second still pending. Without one
   * remaining, `rememberTheDebtIfSegmentsRemain` books nothing and the case
   * this file is about cannot happen.
   */
  session.screenSegments = { segments: ['~f\r\n~CC_ctop'], screenName: 'CONF_BULL' };
  session.subState = LoggedOnSubState.READ_COMMAND;
  session.menuPause = true;          // express.e:28579
  return true;
});

jest.mock('../../src/handlers/operations/conference.handler', () => ({
  ...jest.requireActual('../../src/handlers/operations/conference.handler'),
  joinConference: (...args: any[]) => joinConference(...(args as [any, any])),
}));

import { advanceDisplayFlow } from '../../src/handlers/command.handler';

/** A caller at the auto-rejoin step of the login flow. */
function aCallerBeingRejoined() {
  const socket = {
    id: `rejoin-${Math.random().toString(36).slice(2)}`,
    emit: () => {},
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.AUTO_REJOIN,
    currentConf: 3,
    relConfNum: 3,
    user: {
      id: 1, username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X',
      confRJoin: 3, msgBaseRJoin: 3,
    },
    tempData: {},
  } as any;
  return { socket, session };
}

describe('an auto-rejoin whose join already paused', () => {
  beforeEach(() => joinConference.mockClear());

  it('books no second pause for the flow to settle later', async () => {
    // The debt is the second prompt. Red before the fix:
    // flowPauseAfterSegments === true, spent under "Joining Conference".
    const { socket, session } = aCallerBeingRejoined();

    await advanceDisplayFlow(socket, session);

    expect(session.flowPauseAfterSegments).toBeFalsy();
  });

  it('leaves the join\'s own pause standing', async () => {
    // The one the caller is looking at must survive - it is express.e:5059's.
    const { socket, session } = aCallerBeingRejoined();

    await advanceDisplayFlow(socket, session);

    expect(session.paginatedScreen).toBeTruthy();
  });

  it('keeps the pause the menu is owed', async () => {
    // express.e:28579 sets menuPause, and it is met after the mail scan.
    // Clearing it here is how the flow used to justify its own extra pause.
    const { socket, session } = aCallerBeingRejoined();

    await advanceDisplayFlow(socket, session);

    expect(session.menuPause).toBe(true);
  });

  it('still joins the conference', async () => {
    // The round trip: none of this may cost the caller the join itself.
    const { socket, session } = aCallerBeingRejoined();

    await advanceDisplayFlow(socket, session);

    expect(joinConference).toHaveBeenCalledTimes(1);
  });
});
