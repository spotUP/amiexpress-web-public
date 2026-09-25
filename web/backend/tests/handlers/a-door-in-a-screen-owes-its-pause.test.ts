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

import { armSegmentBoundaryPause, doorExitOwesThePause } from '../../src/handlers/screen.handler';

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

describe('whether the door exit owes the pause, or the walker does', () => {
  it('owes it when a caller-typed command launched the door and pieces remain', () => {
    // `J` joining a conference while a bulletin is half-shown: nobody is
    // coming back to finish the screen but this exit.
    const session: any = { screenSegments: { segments: ['piece 2'], eventName: 'ansi-output' } };
    expect(doorExitOwesThePause(session)).toBe(true);
  });

  it('does NOT owe it when the inline walker launched the door', () => {
    /*
     * `~CC_gl ~SP`: the walker is awaiting the command and arms the boundary
     * pause itself when the door returns. Arming here too gave the caller two
     * `Space To Resume` prompts with no key between - the board's own trace
     * on 2026-09-15: `site=door-exit` then `site=segment-resume`.
     */
    const session: any = {
      screenSegments: { segments: ['piece 2'], eventName: 'ansi-output' },
      inlineScreenCommandDepth: 1,
    };
    expect(doorExitOwesThePause(session)).toBe(false);
  });

  it('does NOT owe it when a screen\'s queued command launched the door', () => {
    /*
     * CONF_BULL's `~XISUBSCAN`, run as the caller answers its pause. The
     * runner's caller draws the next segment the moment the door returns, so
     * a gate armed here was never shown - and the menu then waited behind it
     * for a key nobody asked for (the sysop, 2026-09-25).
     */
    const session: any = {
      screenSegments: { segments: ['piece 2'], eventName: 'ansi-output' },
      executingScreenCommand: true,
    };
    expect(doorExitOwesThePause(session)).toBe(false);
  });

  it('owes nothing when the screen is over', () => {
    const session: any = { screenSegments: { segments: [], eventName: 'ansi-output' } };
    expect(doorExitOwesThePause(session)).toBe(false);
  });
});
