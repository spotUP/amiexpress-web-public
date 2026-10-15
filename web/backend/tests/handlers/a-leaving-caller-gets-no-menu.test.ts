/**
 * A door that exits while the caller is logging off must not repaint the menu.
 *
 * express.e has one flag for "this caller is gone" - `reqState` set to
 * `REQ_STATE_LOGOFF` - and `checkOnlineStatus()` (express.e:467-477) turns it
 * into `RESULT_NO_CARRIER` for every loop that asks, so nothing draws a menu
 * after it. This port had no equivalent at the door-exit sites.
 *
 * The sysop's logoff, live 2026-09-15, drew the main menu twice at a caller
 * who was already leaving:
 *
 *   Door exit: CARDLOBBY   -> menu
 *   Door exit: LOGOFF1     -> menu
 *
 * `LOGOFF1` is express.e:8230-8231 itself - `StringF(tempstr,'LOGOFF\d',node)`
 * then `processSysCommand(tempstr)` - which real AmiExpress runs deep inside
 * the logoff sequence, AFTER `clearUser()` at 8182. There is no menu to
 * return to at that point by construction.
 *
 * Driven through `applyPostDoorMenuAction` with a stub menu function, the
 * seam that exists precisely because `executeAmigaDoor` cannot run under jest.
 */
process.env.SKIP_DB_INIT = '1';

import {
  applyPostDoorMenuAction,
  postDoorMenuAction,
  theCallerIsLeaving,
} from '../../src/handlers/door.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function aCaller(over: Record<string, unknown> = {}) {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.DISPLAY_MENU,
    user: { id: 1, username: 'sysop' },
    ...over,
  } as any;
}

describe('a caller who is logging off', () => {
  it('is recognised by the LOGOFF subState the sequence runs under', () => {
    expect(theCallerIsLeaving(aCaller({ subState: LoggedOnSubState.LOGOFF }))).toBe(true);
  });

  it('is recognised once the socket is draining or hanging up', () => {
    expect(theCallerIsLeaving(aCaller({ state: BBSState.LOGGING_OFF }))).toBe(true);
    expect(theCallerIsLeaving(aCaller({ state: BBSState.HANGUP }))).toBe(true);
  });

  it('is not confused with a caller sitting at the menu', () => {
    expect(theCallerIsLeaving(aCaller())).toBe(false);
  });

  it('outranks every other reason the door exit might have had', () => {
    // A leaving caller can also be mid-pagination or mid-segment. Whatever
    // else is true, nobody is reading the screen.
    const leaving = aCaller({
      subState: LoggedOnSubState.LOGOFF,
      paginatedScreen: { lines: ['x'], nextIndex: 0, pageSize: 1, commands: [] },
      screenSegments: { segments: ['y'] },
      inChat: true,
    });

    expect(postDoorMenuAction(leaving)).toBe('leaving');
  });

  it('gets no menu drawn at it when a door exits', async () => {
    const drawn: string[] = [];
    const session = aCaller({ subState: LoggedOnSubState.LOGOFF });

    await applyPostDoorMenuAction({} as any, session, async () => {
      drawn.push('menu');
    });

    expect(drawn).toHaveLength(0);
  });

  it('is not put back into the command loop by the door exit', async () => {
    // The worse half of the bug: DISPLAY_MENU on a session that has gone.
    const session = aCaller({ subState: LoggedOnSubState.LOGOFF });

    await applyPostDoorMenuAction({} as any, session, async () => {});

    expect(session.subState).toBe(LoggedOnSubState.LOGOFF);
  });

  it('still gets the menu when the caller is actually staying', async () => {
    // The round trip. Every ordinary door exit must still repaint.
    const drawn: string[] = [];
    const session = aCaller();

    await applyPostDoorMenuAction({} as any, session, async () => {
      drawn.push('menu');
    });

    expect(drawn).toEqual(['menu']);
    expect(session.subState).toBe(LoggedOnSubState.DISPLAY_MENU);
  });
});
