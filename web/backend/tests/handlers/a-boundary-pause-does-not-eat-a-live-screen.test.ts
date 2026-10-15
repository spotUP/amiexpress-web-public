/**
 * A `~SP` boundary pause must not be armed over a screen that is still being
 * read.
 *
 * `armSegmentBoundaryPause` installs its gate by ASSIGNING
 * `session.paginatedScreen`. When a screen is already paginating - kind
 * `bbs`, holding the rest of its lines, its queued `commands` and its
 * `onComplete` - that assignment throws all of it away and replaces it with a
 * gate whose content is `['']`. The caller loses every page after the one on
 * screen, and the commands that screen was going to run never run.
 *
 * The guard that was there only recognised a `doPause` gate as "this
 * boundary's pause already". A `bbs` gate is just as much an unanswered
 * prompt on the caller's screen - `(Pause)...More(y/n/ns)?` - and answering
 * it leads back to the segments by itself: the pagination-finished branch
 * (screen.handler.ts:3639-3646) checks `screenSegments` and calls
 * `processNextScreenSegment`, which arms the next boundary. So finding ANY
 * gate here means the boundary is already covered.
 *
 * Live trace, the sysop's upload of 2026-09-15:
 *
 *   [PAUSE-TRACE] site=door-exit lastScreenHadPause=Y paginated=Y segments=1
 *                 subState=process_command
 *
 * `site=door-exit` rather than `door-exit-already-armed` is the proof that
 * the gate it walked over was NOT a `doPause` one - and the caller met
 * `FileName 1: ace To Resume:`, a filename prompt written across the tail of
 * a `Space To Resume:` that should never have been printed.
 */
process.env.SKIP_DB_INIT = '1';

import { armSegmentBoundaryPause } from '../../src/handlers/screen.handler';

interface Emit { event: string; data: string }

function aCaller(paginatedScreen?: any, segments: string[] = ['SEGMENT-TWO']) {
  const emits: Emit[] = [];
  const socket = {
    id: `boundary-${Math.random().toString(36).slice(2)}`,
    emit: (event: string, data: unknown) =>
      emits.push({ event, data: typeof data === 'string' ? data : '' }),
    on: () => {},
  } as any;
  const session = {
    nodeId: 1,
    screenHeight: 25,
    paginatedScreen,
    screenSegments: { segments, eventName: 'ansi-output', screenName: 'BULL' },
  } as any;
  return { socket, session, emits };
}

/** A screen the caller is halfway through, with pages and commands pending. */
function aScreenStillBeingRead() {
  return {
    lines: ['PAGE-ONE', 'PAGE-TWO', 'PAGE-THREE', 'PAGE-FOUR'],
    nextIndex: 2,
    pageSize: 2,
    eventName: 'ansi-output',
    commands: ['~CC_gl'],
    kind: 'bbs',
  };
}

const wire = (emits: Emit[]) => emits.map((e) => e.data).join('');

describe('a segment boundary reached while a screen is still paginating', () => {
  it('leaves the half-read screen on the session instead of replacing it', () => {
    const live = aScreenStillBeingRead();
    const { socket, session } = aCaller(live);

    armSegmentBoundaryPause(socket, session, 'door-exit');

    // The gate is the SAME one, with its remaining pages intact. This is the
    // assertion that fails on the old code: `lines` became `['']`.
    expect(session.paginatedScreen.kind).toBe('bbs');
    expect(session.paginatedScreen.lines).toEqual(
      ['PAGE-ONE', 'PAGE-TWO', 'PAGE-THREE', 'PAGE-FOUR'],
    );
    expect(session.paginatedScreen.nextIndex).toBe(2);
    expect(session.paginatedScreen.commands).toEqual(['~CC_gl']);
  });

  it('does not print a second prompt across the one already on screen', () => {
    const { socket, session, emits } = aCaller(aScreenStillBeingRead());

    armSegmentBoundaryPause(socket, session, 'door-exit');

    expect(wire(emits)).not.toContain('Space To Resume');
    expect(emits).toHaveLength(0);
  });

  it('still tells the caller to wait, so the boundary is not walked past', () => {
    // Returning true is what the FIRST arm returned: the caller stops here
    // either way. A false would let the door exit run straight on into the
    // next screen.
    const { socket, session } = aCaller(aScreenStillBeingRead());

    expect(armSegmentBoundaryPause(socket, session, 'door-exit')).toBe(true);
  });

  it('arms and prompts normally when no screen is on the caller', () => {
    // The round trip: with nothing installed, the boundary owes a prompt and
    // must still print it, or every `~SP` loses its pause.
    const { socket, session, emits } = aCaller(undefined);

    expect(armSegmentBoundaryPause(socket, session, 'segment-resume')).toBe(true);
    expect(session.paginatedScreen.kind).toBe('doPause');
    expect(wire(emits)).toContain('Space To Resume');
  });

  it('treats an unanswered doPause gate the same way it always did', () => {
    const gate = { lines: [''], nextIndex: 1, pageSize: 1, eventName: 'ansi-output', commands: [], kind: 'doPause' };
    const { socket, session, emits } = aCaller(gate);

    expect(armSegmentBoundaryPause(socket, session, 'door-exit')).toBe(true);
    expect(session.paginatedScreen).toBe(gate);
    expect(emits).toHaveLength(0);
  });

  it('still prints the prompt when the gate has nothing left to show', () => {
    // THE OTHER SIDE OF THE LINE, and the reason the guard tests pending
    // content rather than "is a gate installed at all".
    //
    // A pagination whose pages are spent is an answered prompt waiting to be
    // cleared, not a screen being read. Suppressing on it would swallow the
    // pause the boundary genuinely owes - which is what
    // `a-boundary-owes-exactly-one-pause` pins with a `More(y/n/ns)` gate.
    const spent = {
      lines: ['PAGE-ONE', 'PAGE-TWO'],
      nextIndex: 2,
      pageSize: 2,
      eventName: 'ansi-output',
      commands: [],
      kind: 'bbs',
    };
    const { socket, session, emits } = aCaller(spent);

    expect(armSegmentBoundaryPause(socket, session, 'door-exit')).toBe(true);
    expect(session.paginatedScreen.kind).toBe('doPause');
    expect(wire(emits)).toContain('Space To Resume');
  });

  it('reports no pause owed when the screen has simply ended', () => {
    // No segments left means no boundary, whatever is on the session.
    const { socket, session, emits } = aCaller(undefined, []);

    expect(armSegmentBoundaryPause(socket, session, 'door-exit')).toBe(false);
    expect(emits).toHaveLength(0);
  });
});
