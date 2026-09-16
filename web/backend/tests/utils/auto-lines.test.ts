/**
 * "Auto" screen height resolves to a real number, never 0/null.
 *
 * The signup line test and the runtime W command both offer "0 or Enter for
 * Auto". Storing that as 0/null was the bug (the sysop, 2026-09-16): createUser
 * turned 0 into the board default 23, the user-read turned null into 23, and a
 * 23-line account paged a bulletin built to fit. autoLinesFor is the one helper
 * both paths now use - it hands back the height the session measured, less the
 * prompt row, which is exactly the number the line test shows at the top.
 */
import { autoLinesFor } from '../../src/utils/auto-lines.util';
import { DEFAULT_PAUSE_LINES, SHORTEST_TERMINAL_ROWS } from '../../src/screens/screen-rows';

describe('autoLinesFor', () => {
  it('takes the web client\'s reported rows, less the prompt row', () => {
    expect(autoLinesFor({ tempData: { termHeight: 25 } })).toBe(24);
  });

  it('falls back to the telnet screen height when no client rows were reported', () => {
    expect(autoLinesFor({ screenHeight: 25 })).toBe(24);
  });

  it('prefers the measured client rows over the screen height', () => {
    expect(autoLinesFor({ tempData: { termHeight: 30 }, screenHeight: 25 })).toBe(29);
  });

  it('is the standard usable height when nothing was measured', () => {
    expect(autoLinesFor({})).toBe(DEFAULT_PAUSE_LINES);
    expect(autoLinesFor(null)).toBe(DEFAULT_PAUSE_LINES);
    expect(autoLinesFor(undefined)).toBe(DEFAULT_PAUSE_LINES);
  });

  it('never returns 0 or a negative from a degenerate measurement', () => {
    expect(autoLinesFor({ tempData: { termHeight: 1 } })).toBe(DEFAULT_PAUSE_LINES);
    expect(autoLinesFor({ screenHeight: 0 })).toBe(DEFAULT_PAUSE_LINES);
  });
});

describe('the two height constants are distinct on purpose', () => {
  it('a screen fitted to the shortest terminal never pages at the default pause height', () => {
    // Generated screens are fitted to SHORTEST_TERMINAL_ROWS (23); a door with
    // no better information pauses at DEFAULT_PAUSE_LINES (24). The fit must be
    // the smaller of the two, or a bulletin built to fit would still page.
    expect(DEFAULT_PAUSE_LINES).toBe(24);
    expect(DEFAULT_PAUSE_LINES).toBeGreaterThan(SHORTEST_TERMINAL_ROWS);
  });
});
