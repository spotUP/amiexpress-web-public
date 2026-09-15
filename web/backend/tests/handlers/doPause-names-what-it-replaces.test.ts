/**
 * `doPause` must say so when it replaces a screen the caller has not finished.
 *
 * This is instrumentation, not a fix, and the test exists so the
 * instrumentation cannot rot silently before it has answered its question.
 *
 * `armSegmentBoundaryPause` had this defect and it cost a screen: installing
 * a gate by ASSIGNING `session.paginatedScreen` throws away a standing `bbs`
 * gate's remaining `lines` and its queued `commands` (fixed in 1a5291c4c).
 * `doPause` assigns the same way. The display flow cannot reach it -
 * `pauseDisplayFlow` returns early on a live gate BEFORE calling doPause -
 * but ~17 other callers exist, so rather than guess which one, the live board
 * is asked: print the call site when it actually happens.
 *
 * Remove this file when the PAUSE-TRACE instrumentation comes out.
 */
process.env.SKIP_DB_INIT = '1';

import { doPause } from '../../src/handlers/screen.handler';

function aCaller() {
  const session = { nodeId: 1, subState: 'process_command', screenHeight: 25 } as any;
  const socket = {
    id: `dopause-${Math.random().toString(36).slice(2)}`,
    emit: () => {},
    on: () => {},
  } as any;
  return { socket, session };
}

function captureLog(body: () => void): string {
  const lines: string[] = [];
  const real = console.log;
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')); };
  try { body(); } finally { console.log = real; }
  return lines.join('\n');
}

describe('doPause replacing a gate', () => {
  it('names a half-read screen it is about to throw away', () => {
    const { socket, session } = aCaller();
    session.paginatedScreen = {
      lines: ['PAGE-ONE', 'PAGE-TWO', 'PAGE-THREE'],
      nextIndex: 1,
      pageSize: 1,
      eventName: 'ansi-output',
      commands: ['~CC_gl'],
      kind: 'bbs',
    };

    const logged = captureLog(() => doPause(socket, session));

    expect(logged).toContain('PAUSE-CLOBBER');
    expect(logged).toContain('2 page(s) unread');
    expect(logged).toContain('1 command(s) queued');
    // The stack is the point: it names WHICH of the ~17 callers did it.
    expect(logged).toContain('pause-clobber');
  });

  it('says nothing when the standing gate is already spent', () => {
    // Not a clobber: nothing is left to lose.
    const { socket, session } = aCaller();
    session.paginatedScreen = {
      lines: ['PAGE-ONE'],
      nextIndex: 1,
      pageSize: 1,
      eventName: 'ansi-output',
      commands: [],
      kind: 'bbs',
    };

    expect(captureLog(() => doPause(socket, session))).not.toContain('PAUSE-CLOBBER');
  });

  it('says nothing when it is replacing another pause', () => {
    // doPause over doPause is the ordinary case the one-prompt guard covers.
    const { socket, session } = aCaller();
    session.paginatedScreen = {
      lines: ['\r\n'], nextIndex: 0, pageSize: 1,
      eventName: 'ansi-output', commands: [], kind: 'doPause',
    };

    expect(captureLog(() => doPause(socket, session))).not.toContain('PAUSE-CLOBBER');
  });

  it('says nothing on a clean session', () => {
    const { socket, session } = aCaller();

    expect(captureLog(() => doPause(socket, session))).not.toContain('PAUSE-CLOBBER');
  });

  it('still installs its own gate in every case', () => {
    // The instrumentation must not change what doPause does.
    const { socket, session } = aCaller();
    session.paginatedScreen = {
      lines: ['A', 'B'], nextIndex: 0, pageSize: 1,
      eventName: 'ansi-output', commands: [], kind: 'bbs',
    };

    captureLog(() => doPause(socket, session));

    expect(session.paginatedScreen.kind).toBe('doPause');
    expect(session.lastScreenHadPause).toBe(true);
  });
});
