/**
 * A teletext caller's 68K door is told it has forty columns.
 *
 * The door reads the COPY launchAmigaDoor builds, not the caller's session,
 * and `texttvMode` was missing from that copy: BB_SCRWIDTH answered 80 while
 * `lineWrap`, derived from the real session two lines above, answered 40.
 * TEXTTV drew an 80-column reader onto a 40-column teletext screen - every
 * row ran off the right edge and its tail reappeared at column one below.
 */
import {
  doorSessionGeometry,
  doorScreenWidth,
  doorScreenHeight,
  C64_COLUMNS,
  C64_ROWS,
} from '../../src/amiga-emulation/xim/screen-width.util';

describe('the geometry a 68K door is launched with', () => {
  it('carries teletext through, so the door reads 40 columns and 25 rows', () => {
    const caller = { texttvMode: true, screenWidth: 80, screenHeight: 24 };
    const copy = doorSessionGeometry(caller, 80);

    expect(copy.texttvMode).toBe(true);
    expect(copy.lineWrap).toBe(C64_COLUMNS);
    // The round trip is the point: what the door's own BB_SCRWIDTH reads off
    // the copy must be what the board wrapped at.
    expect(doorScreenWidth(copy, 80)).toBe(C64_COLUMNS);
    expect(doorScreenHeight({ ...copy, screenHeight: 24 }, 24)).toBe(C64_ROWS);
  });

  it('still carries PETSCII, and still answers 80 for an ANSI caller', () => {
    const c64 = doorSessionGeometry({ petsciiMode: true, screenWidth: 40 }, 80);
    expect(c64.petsciiMode).toBe(true);
    expect(c64.texttvMode).toBe(false);
    expect(doorScreenWidth(c64, 80)).toBe(C64_COLUMNS);

    const ansi = doorSessionGeometry({ screenWidth: 132 }, 132);
    expect(ansi.lineWrap).toBe(132);
    expect(ansi.petsciiMode).toBe(false);
    expect(ansi.texttvMode).toBe(false);
    expect(doorScreenWidth(ansi, 80)).toBe(80);
  });

  it('keeps the caller screen width for the fields that still read it', () => {
    expect(doorSessionGeometry({ texttvMode: true, screenWidth: 80 }, 80).screenWidth).toBe(80);
    expect(doorSessionGeometry(undefined, 80)).toEqual({
      lineWrap: 80, petsciiMode: false, texttvMode: false, screenWidth: undefined,
    });
  });
});
