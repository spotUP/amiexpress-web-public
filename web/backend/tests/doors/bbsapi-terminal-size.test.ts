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
});
