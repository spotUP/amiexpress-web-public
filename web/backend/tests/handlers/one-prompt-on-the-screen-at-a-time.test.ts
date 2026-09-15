/**
 * One `(Pause)...Space To Resume:` on the caller's screen at a time.
 *
 * Four places emit that prompt and each decided for itself. On this board's
 * logon screen `doPause` and `displayScreen-B` both fired for
 * `Screens/flt/003.flt` - the board's own trace, live 2026-09-15:
 *
 *   [PAUSE-TRACE] site=doPause          lastScreenHadPause=N paginated=N segments=2
 *   [PAUSE-TRACE] site=displayScreen-B  lastScreenHadPause=Y paginated=Y segments=2
 *   [PAUSE-TRACE] site=segment-resume-already-armed
 *
 * The caller got a prompt through the middle of the FLT logo and another after
 * it. The third was already suppressed by the boundary guard (c1b1e45e0); this
 * is that same invariant, moved to where all four sites can see it.
 *
 * WHAT IS DELIBERATELY NOT CHANGED: which gate gets installed. An early return
 * at the display sites would drop a screen's QUEUED COMMANDS - a continuation,
 * not a decoration - and that is a worse bug than a doubled prompt. Only the
 * second PROMPT is suppressed.
 */
process.env.SKIP_DB_INIT = '1';

import { aPausePromptIsShowing, doPause } from '../../src/handlers/screen.handler';

let sockets = 0;
function aSocket() {
  const wire: string[] = [];
  return {
    wire,
    // A buffer per socket id: two sockets sharing a name share a buffer, and
    // the second one's output lands on the first one's wire.
    id: `one-prompt-${++sockets}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') wire.push(data);
    },
    on: () => {},
  };
}

const prompts = (s: { wire: string[] }) =>
  (s.wire.join('').match(/Space To Resume/g) ?? []).length;

describe('is a pause prompt showing', () => {
  it('says yes while an unanswered gate is installed', () => {
    expect(aPausePromptIsShowing({ paginatedScreen: { kind: 'doPause' } })).toBe(true);
  });

  it('says no once the key has been pressed and the gate cleared', () => {
    // handlePaginationInput clears the gate, which is what makes this the
    // right question to ask - the state IS "the caller is looking at it".
    expect(aPausePromptIsShowing({ paginatedScreen: undefined })).toBe(false);
  });

  it('says no for a More(y/n/ns) pagination gate, which is not this prompt', () => {
    expect(aPausePromptIsShowing({ paginatedScreen: { lines: [], pageSize: 23 } })).toBe(false);
  });

  it('survives a session with nothing on it', () => {
    expect(aPausePromptIsShowing({})).toBe(false);
    expect(aPausePromptIsShowing(null)).toBe(false);
  });
});

describe('a second pause on a screen that already has one', () => {
  it('prompts once, not twice', () => {
    const socket = aSocket();
    const session: any = { nodeId: 1 };

    doPause(socket as any, session);
    doPause(socket as any, session);

    expect(prompts(socket)).toBe(1);
  });

  it('still installs the gate, so what the pause protected still happens', () => {
    // The suppression is of the PROMPT. A pause that stopped installing its
    // gate would let the flow run on through whatever it was holding back.
    const socket = aSocket();
    const session: any = { nodeId: 1 };

    doPause(socket as any, session);
    doPause(socket as any, session);

    expect(session.paginatedScreen?.kind).toBe('doPause');
    expect(session.lastScreenHadPause).toBe(true);
  });

  it('prompts again once the caller has answered', () => {
    const socket = aSocket();
    const session: any = { nodeId: 1 };

    doPause(socket as any, session);
    session.paginatedScreen = undefined;   // the keypress
    doPause(socket as any, session);

    expect(prompts(socket)).toBe(2);
  });

  it('runs the continuation of the pause that was suppressed', () => {
    // A doPause carries an onComplete. Dropping it would strand the flow.
    const socket = aSocket();
    const session: any = { nodeId: 1 };
    let ran = false;

    doPause(socket as any, session);
    doPause(socket as any, session, () => { ran = true; });

    expect(typeof session.paginatedScreen?.onComplete).toBe('function');
    session.paginatedScreen.onComplete();
    expect(ran).toBe(true);
  });
});
