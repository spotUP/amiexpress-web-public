/**
 * A locked-out caller's comment form runs to completion before logoff.
 *
 * User-visible symptom (live, caller coffe): locked out, shown the
 * comment form, answered To:, saw Subject: - then "Thanks you will now
 * be disconnected..." with no chance to write the body. The form was
 * unfillable.
 *
 * Cause: login-post fired beginLogoff (1.5 s guillotine) immediately
 * after starting the C command, which only emits its first prompt and
 * returns - the Subject/body arrive over later keystrokes. express.e
 * runs processCommand('C') to completion INLINE before Thanks + logoff
 * (express.e:29775-29782), so the deferred logoff fires when the flow
 * lands back on DISPLAY_MENU instead.
 *
 * Drives handleCommand (the live funnel), not the units beneath it.
 */
process.env.SKIP_DB_INIT = '1';

import { handleCommand } from '../../src/handlers/command.handler';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';

function fakeSocket() {
  const out: string[] = [];
  const socket: any = {
    id: 'locked-comment',
    emit: (ev: string, data?: unknown) => {
      out.push(String(data ?? ''));
      return true;
    },
    on: () => {},
    disconnect: jest.fn(),
  };
  return { socket, out };
}

function commentSession(extra: Record<string, unknown> = {}): any {
  return {
    state: BBSState.LOGGEDON,
    subState: LoggedOnSubState.POST_MESSAGE_SUBJECT,
    user: { id: 'u9', username: 'coffe', secLevel: 10 },
    nodeId: 1,
    inputBuffer: '',
    tempData: { messageEntry: { toUser: 'sysop', isComment: true, isPrivate: true } },
    logoffAfterComment: true,
    ...extra,
  };
}

describe('locked-out comment runs before the logoff', () => {
  test('aborting at Subject still gets Thanks and a disconnect, not a menu', async () => {
    const { socket, out } = fakeSocket();
    const session = commentSession();
    // Blank subject = abort (enterMSG:10854 back to menu) - the deferred
    // logoff must fire here instead of advancing into the menu.
    await handleCommand(socket, session, '\r');
    const wire = out.join('');
    expect(wire).toContain('Thanks you will now be disconnected');
    expect(session.logoffAfterComment).toBe(false);
    // beginLogoff with the login-post options (finalState AWAIT); the
    // socket disconnect itself rides the 1.5 s timer, not asserted here.
    expect(session.state).toBe(BBSState.AWAIT);
  });

  test('without the flag the same abort leaves no Thanks and no logoff', async () => {
    const { socket, out } = fakeSocket();
    const session = commentSession({ logoffAfterComment: false });
    await handleCommand(socket, session, '\r');
    expect(out.join('')).not.toContain('Thanks you will now be disconnected');
    expect(session.logoffAfterComment).toBe(false);
    expect(session.state).toBe(BBSState.LOGGEDON);
    // The flow left message entry on its own (where the bare-session menu
    // machinery takes it from there is not this fix's business).
    expect(String(session.subState)).not.toMatch(/^POST_MESSAGE_/);
  });
});
