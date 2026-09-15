/**
 * TWO OWNERS, ONE BOUNDARY, ONE PROMPT.
 *
 * "glc has double promts" (sysop, live, 2026-09-15) - two
 * `(Pause)...Space To Resume:` lines stacked under the global last-callers
 * list. The board's own trace named both emitters, two milliseconds apart and
 * with no keypress between them:
 *
 *   [PAUSE-TRACE] site=door-exit      ... segments=3 subState=display_bull
 *   [PAUSE-TRACE] site=segment-resume ... segments=3 subState=display_bull
 *
 * The logon screen is `~CC_gl ~SP`, so the door runs from inside a segment.
 * `processNextScreenSegment` calls `runScreenCommands`, the door exits and
 * arms the boundary pause on its way out, and then that same frame - still
 * holding the same segment state - arms it again the moment the command
 * returns. `doorExitOwesThePause` knew about the INLINE walker as an owner and
 * not about the segment runner, so the second owner was invisible to it.
 *
 * A boundary is a PLACE in the screen, not an event: it owes exactly one
 * prompt however many owners believe they must arm it. Enforced in
 * `armSegmentBoundaryPause`, which is the single definition both of them go
 * through.
 */
process.env.SKIP_DB_INIT = '1';

import { armSegmentBoundaryPause } from '../../src/handlers/screen.handler';

/**
 * A socket per case, with an id of its own: `ansi-buffer.util` keeps one
 * buffer per `socket.id` in a module-level map, so two sockets sharing a name
 * share a buffer and the second one's output lands on the first one's wire.
 */
let sockets = 0;
function aSocket() {
  const wire: string[] = [];
  return {
    wire,
    id: `double-pause-test-${++sockets}`,
    emit: (event: string, data: unknown) => {
      if (event === 'ansi-output' && typeof data === 'string') wire.push(data);
    },
    on: () => {},
  };
}

/** A screen mid-flight with `remaining` pieces still to draw. */
function aSessionWithSegments(remaining: number): any {
  return {
    nodeId: 1,
    screenSegments: {
      segments: Array.from({ length: remaining }, (_, i) => `piece ${i + 2}`),
      eventName: 'ansi-output',
    },
  };
}

const prompts = (socket: { wire: string[] }) =>
  (socket.wire.join('').match(/Space To Resume/g) ?? []).length;

describe('a boundary owes exactly one pause', () => {
  it('prompts once when the door and the segment runner both arm it', () => {
    const socket = aSocket();
    // Three pieces left, exactly as the live trace reported.
    const session = aSessionWithSegments(3);

    // The door exits from inside the segment...
    expect(armSegmentBoundaryPause(socket as any, session, 'door-exit')).toBe(true);
    // ...and the frame that ran it arms the same boundary two lines later.
    expect(armSegmentBoundaryPause(socket as any, session, 'segment-resume')).toBe(true);

    expect(prompts(socket)).toBe(1);
  });

  it('still holds the caller after the duplicate - the gate is the first one', () => {
    const socket = aSocket();
    const session = aSessionWithSegments(3);

    armSegmentBoundaryPause(socket as any, session, 'door-exit');
    const gate = session.paginatedScreen;
    armSegmentBoundaryPause(socket as any, session, 'segment-resume');

    // The second arm must not replace the gate: a replacement is how the
    // first pause's continuation gets lost.
    expect(session.paginatedScreen).toBe(gate);
    expect(session.paginatedScreen?.kind).toBe('doPause');
    expect(session.lastScreenHadPause).toBe(true);
  });

  it('does not spend a segment for either arm', () => {
    const socket = aSocket();
    const session = aSessionWithSegments(3);

    armSegmentBoundaryPause(socket as any, session, 'door-exit');
    armSegmentBoundaryPause(socket as any, session, 'segment-resume');

    expect(session.screenSegments.segments).toHaveLength(3);
  });

  it('prompts again at the NEXT boundary, once this one is answered', () => {
    const socket = aSocket();
    const session = aSessionWithSegments(3);

    armSegmentBoundaryPause(socket as any, session, 'door-exit');
    armSegmentBoundaryPause(socket as any, session, 'segment-resume');

    // The keypress clears the gate (handlePaginationInput), the next piece is
    // drawn, and the boundary after it is a different boundary.
    session.paginatedScreen = undefined;
    session.screenSegments.segments.shift();

    expect(armSegmentBoundaryPause(socket as any, session, 'segment-resume')).toBe(true);
    expect(prompts(socket)).toBe(2);
  });

  it('is over when the pieces are, and arms nothing', () => {
    const socket = aSocket();
    const session = aSessionWithSegments(0);

    expect(armSegmentBoundaryPause(socket as any, session, 'segment-resume')).toBe(false);
    expect(prompts(socket)).toBe(0);
  });

  it('does not swallow a pause while a More(y/n/ns) gate is up', () => {
    // A pagination gate is not a boundary pause, and suppressing on any gate
    // at all would lose the prompt the boundary genuinely owes.
    const socket = aSocket();
    const session = aSessionWithSegments(2);
    session.paginatedScreen = { lines: [], nextIndex: 0, pageSize: 23, eventName: 'ansi-output', commands: [] };

    expect(armSegmentBoundaryPause(socket as any, session, 'segment-resume')).toBe(true);
    expect(prompts(socket)).toBe(1);
  });
});
