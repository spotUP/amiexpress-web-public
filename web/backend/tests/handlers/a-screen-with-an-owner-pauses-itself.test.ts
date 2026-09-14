/**
 * The flow books no pause debt for a screen somebody else is holding.
 *
 * `rememberTheDebtIfSegmentsRemain` exists for a screen the flow shows and
 * then moves past: NODE_BULL is five MultiTops joined by `~SP`, and without
 * the debt the pause owed AFTER the file was spent by the first `~SP`, so
 * ACHIEVETOP's clear took the fifth bulletin away unread.
 *
 * A screen with an `onComplete` is not that. Something is holding the end of
 * it - for a conference join, `joinConference`, which does express.e:5059's
 * doPause there and then prints "Joining Conference" (5079). Booking a debt
 * on top of that gives the screen a SECOND pause, which is the prompt the
 * sysop kept meeting directly under "Joining Conference" (2026-09-15: "a
 * hidden prompt?").
 *
 * The live trace named the borrower, after three wrong guesses at it:
 *
 *   [PAUSE-DEBT] booked site=segments-pending subState=display_menu
 *                segments=1 menuPause=Y
 *
 * `menuPause` is deliberately untouched: the menu still gets its own pause
 * when the flow reaches it, after the join's output, where express.e:28579
 * puts it.
 */
process.env.SKIP_DB_INIT = '1';

import { LoggedOnSubState } from '../../src/constants/bbs-states';
import { advanceDisplayFlow } from '../../src/handlers/command.handler';

/**
 * A caller at the menu step with a bulletin still running - the state the
 * live log showed: `advance state=display_menu menuPause=Y`, one segment
 * pending.
 */
function aCallerWithABulletinStillRunning(owned: boolean) {
  const socket = {
    id: `owner-${Math.random().toString(36).slice(2)}`,
    emit: () => {},
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    state: 'loggedon',
    subState: LoggedOnSubState.DISPLAY_MENU,
    currentConf: 3,
    relConfNum: 3,
    menuPause: true,
    screenSegments: {
      segments: ['~f\r\n~CC_ctop'],
      screenName: 'CONF_BULL',
      // What `joinConference` leaves when it owns the end of the screen.
      ...(owned ? { onComplete: () => {} } : {}),
    },
    user: { username: 'sysop', name: 'sysop', secLevel: 255, expert: 'X' },
    tempData: {},
  } as any;
  return { socket, session };
}

describe('a screen the flow is showing', () => {
  it('gets no debt when a continuation owns its end', async () => {
    // The join's own doPause is the pause for this screen. Red before the
    // fix: flowPauseAfterSegments === true, spent under "Joining Conference".
    const { socket, session } = aCallerWithABulletinStillRunning(true);

    await advanceDisplayFlow(socket, session);

    expect(session.flowPauseAfterSegments).toBeFalsy();
  });

  it('still gets one when nothing owns it', async () => {
    // NODE_BULL's five MultiTops: nobody is waiting on the end, so the flow
    // must remember to pause when the segments run out. Losing this is how
    // the fifth bulletin was wiped unread.
    const { socket, session } = aCallerWithABulletinStillRunning(false);

    await advanceDisplayFlow(socket, session);

    expect(session.flowPauseAfterSegments).toBe(true);
  });

  it('leaves the menu its own pause either way', async () => {
    // express.e:28579. The menu pauses when the flow reaches it, after the
    // join's output - not instead of the screen's pause.
    const { socket, session } = aCallerWithABulletinStillRunning(true);

    await advanceDisplayFlow(socket, session);

    expect(session.menuPause).toBe(true);
  });
});
