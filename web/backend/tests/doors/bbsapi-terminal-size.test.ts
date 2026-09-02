/**
 * Regression: the geometry a TypeScript door is handed must agree with the
 * one every other door surface uses (C64/40-col plan, Task 3).
 *
 * `BBSApi.getTerminalSize()` is the only geometry a blessed door ever sees -
 * the SDK's `createScreen()` sizes the blessed Screen from it
 * (sdk/utils/blessed-helpers.ts:923), and a width of 40 is what puts the
 * door on the XXS tier. It used to read `session.screenWidth || 80` raw,
 * which answered 80 for a PETSCII session whose width was missing or still
 * carried the stale 80 a web caller's xterm reported before the caller
 * answered `P` - exactly the disagreement `doorScreenWidth()` exists to end
 * (BB_SCRWIDTH and launch-time lineWrap already route through it).
 *
 * The 80-column half of every case below is the no-change guard.
 */
import { createBBSApi } from '../../src/doors/BBSApi';

class StubSocket {
  emit(): boolean {
    return true;
  }
  on(): this {
    return this;
  }
  off(): this {
    return this;
  }
}

function sizeFor(session: any): { width: number; height: number } {
  return createBBSApi(new StubSocket() as any, session).getTerminalSize();
}

describe('BBSApi.getTerminalSize', () => {
  it('a PETSCII session is 40x25', () => {
    expect(sizeFor({ petsciiMode: true, screenWidth: 40, screenHeight: 25 })).toEqual({
      width: 40,
      height: 25,
    });
  });

  it('a PETSCII session whose width was never recorded is still 40', () => {
    expect(sizeFor({ petsciiMode: true }).width).toBe(40);
  });

  it('a PETSCII session carrying a stale 80 from the web terminal is still 40', () => {
    // A browser caller reports its xterm size before answering `P` at the
    // graphics prompt; the door must not inherit that 80.
    expect(sizeFor({ petsciiMode: true, screenWidth: 80, screenHeight: 25 }).width).toBe(40);
  });

  it('a PETSCII session carrying a stale 24 rows is still 25', () => {
    // Same argument as the width: a C64 text screen is 25 rows by
    // definition, and a browser terminal reports 24 before `P` is answered.
    expect(sizeFor({ petsciiMode: true, screenWidth: 40, screenHeight: 24 })).toEqual({
      width: 40,
      height: 25,
    });
  });

  it('an ordinary ANSI session is unchanged at 80', () => {
    expect(sizeFor({ screenWidth: 80, screenHeight: 24 })).toEqual({ width: 80, height: 24 });
  });

  it('a bare session still defaults to 80x25', () => {
    expect(sizeFor({})).toEqual({ width: 80, height: 25 });
  });

  it('a wide ANSI terminal keeps its reported width', () => {
    expect(sizeFor({ screenWidth: 132, screenHeight: 43 })).toEqual({ width: 132, height: 43 });
  });

  // BINDING RULE (a): a non-PETSCII caller NEVER narrows. socket-handlers.ts
  // writes the reported cols unfiltered for every web socket, so a phone in
  // portrait really does arrive here at 40 - and createScreen() turns a width
  // under 41 into the XXS single-column profile. Floored at 80, the same rule
  // sessionColumns() applies at the door gate.
  it('a NARROW ANSI terminal is floored at 80 - the gate and the canvas agree', () => {
    expect(sizeFor({ screenWidth: 40, screenHeight: 25 })).toEqual({ width: 80, height: 25 });
    expect(sizeFor({ screenWidth: 24, screenHeight: 20 })).toEqual({ width: 80, height: 20 });
    expect(sizeFor({ screenWidth: 79, screenHeight: 24 })).toEqual({ width: 80, height: 24 });
  });
});

/**
 * THE SEAM, WITH NOTHING STUBBED IN THE MIDDLE.
 *
 * bbsapi-terminal-size proved the left half and compact-40/doorman-layout
 * proved the right half - but the right half ran against a stub `bbs` whose
 * getTerminalSize() hardcoded {width:40,height:25}, i.e. it stubbed the very
 * value under test. Between them a real regression fitted: Task 3 made
 * createScreen() flip `responsive` on for isCompactWidth (< 41) and added the
 * XXS tier at 41, so a narrow ANSI caller who used to get the fixed 80-column
 * layout started getting the C64 single-column profile.
 *
 * This drives the REAL createBBSApi -> the REAL createScreen with a
 * non-PETSCII session at screenWidth 40 and asserts the 80-column frame.
 */
describe('createBBSApi -> createScreen, no stub between them', () => {
  const { createScreen } = require('../../../../sdk/utils/blessed-helpers');

  function screenFor(session: any) {
    return createScreen(createBBSApi(new StubSocket() as any, session) as any, {
      smartCSR: true,
      title: 'seam',
    });
  }

  it('a NON-PETSCII session reporting 40 columns gets the 80-column frame', () => {
    const screen = screenFor({ screenWidth: 40, screenHeight: 25, petsciiMode: false });
    try {
      expect(screen.width).toBe(80);
      // Not merely 80 wide: not on the responsive/compact tier at all.
      expect(screen.responsive).not.toBe(true);
    } finally {
      screen.destroy();
    }
  });

  it('a NON-PETSCII session reporting 40 columns builds the SAME frame as one reporting 80', () => {
    const narrow = screenFor({ screenWidth: 40, screenHeight: 25 });
    const wide = screenFor({ screenWidth: 80, screenHeight: 25 });
    try {
      expect([narrow.width, narrow.height, narrow.responsive]).toEqual([
        wide.width,
        wide.height,
        wide.responsive,
      ]);
    } finally {
      narrow.destroy();
      wide.destroy();
    }
  });

  it('a PETSCII session at 40 still gets the 40-column canvas through the same seam', () => {
    const screen = screenFor({ screenWidth: 40, screenHeight: 25, petsciiMode: true });
    try {
      expect(screen.width).toBe(40);
    } finally {
      screen.destroy();
    }
  });
});
