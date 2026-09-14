/**
 * A DOOR INSIDE A SCREEN STILL OWES THE `~SP` THAT FOLLOWS IT.
 *
 * "global last callers is missing a pause prompt" (sysop, live, 2026-09-15).
 * This board's logon screen is
 *
 *     ~SS_BBS:bulletins/bull6.txt| ~SP
 *     ~CC_gl ~SP
 *     ~CC_gwall
 *     ...
 *
 * and a boundary between two segments EXISTS because the screen had a `~SP`
 * there - that is what split it. express.e:5455-5461 stops at the `~SP`
 * wherever it falls, and a command returning is not an exception.
 *
 * The door path rendered the NEXT segment instead of pausing, so the global
 * last-callers list was drawn by the door and wiped by whatever the next
 * segment cleared with, with nothing in between. The board's own log showed
 * it with no pause of any kind between the two:
 *
 *     [executeDoor] Door GL completed during segment processing - continuing segments
 *     [SEGMENT] Processing segment 2/4: "~CC_gwall
 *
 * `armSegmentBoundaryPause` is now the single definition of that pause, used
 * both when a segment's text finishes and when a `~CC_` door exits, so the
 * two are indistinguishable to everything downstream.
 */
process.env.SKIP_DB_INIT = '1';

import { armSegmentBoundaryPause } from '../../src/handlers/screen.handler';

function aSocket() {
  const wire: string[] = [];
  return {
    wire,
    id: 'segment-pause-test',
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

describe('a door inside a screen owes the pause that follows it', () => {
  it('arms the pause when pieces of the screen remain', () => {
    const socket = aSocket();
    const session = aSessionWithSegments(2);

    expect(armSegmentBoundaryPause(socket as any, session, 'door-exit')).toBe(true);

    // The caller sees the same prompt any other `~SP` gives them...
    expect(socket.wire.join('')).toMatch(/Space To Resume/);
    // ...and the board is holding for a key rather than drawing on.
    expect(session.paginatedScreen?.kind).toBe('doPause');
    expect(session.lastScreenHadPause).toBe(true);
  });

  it('does not consume a segment - the key still has one to advance to', () => {
    // The defect was spending the boundary by DRAWING the next piece. The
    // pause must leave every remaining piece untouched.
    const socket = aSocket();
    const session = aSessionWithSegments(2);

    armSegmentBoundaryPause(socket as any, session, 'door-exit');

    expect(session.screenSegments.segments).toHaveLength(2);
  });

  it('says no when the screen is simply over, so nothing waits for a key', () => {
    // A `~CC_` door in the LAST segment: there is no `~SP` after it, and a
    // prompt here would hang the caller in front of a finished screen.
    const socket = aSocket();
    const session = aSessionWithSegments(0);

    expect(armSegmentBoundaryPause(socket as any, session, 'door-exit')).toBe(false);
    expect(socket.wire.join('')).not.toMatch(/Space To Resume/);
    expect(session.paginatedScreen).toBeUndefined();
  });

  it('says no when there is no screen in flight at all', () => {
    const socket = aSocket();
    const session: any = { nodeId: 1 };

    expect(armSegmentBoundaryPause(socket as any, session, 'door-exit')).toBe(false);
    expect(socket.wire.join('')).not.toMatch(/Space To Resume/);
  });
});
