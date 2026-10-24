/**
 * The board never paints an explicit black background (macOS Terminal draws the
 * default background transparent). Black must come out as SGR 49 from every
 * shared SDK emitter; a coloured background is unchanged.
 */
import { bgCode, bgParams } from '../../core/ansi-background';
import { cellsToAnsiRows } from '../../media/ascii/emit';
import { bg as blessedBg } from '../../engines/ui/blessed/core/colors';

describe('SDK emitters never paint a black background', () => {
  it('bgCode: black is 49, red is 41, bright black stays 100', () => {
    expect(bgCode(0)).toBe(49);
    expect(bgCode(1)).toBe(41);
    expect(bgCode(8)).toBe(100);
    expect(bgParams(16)).toEqual([49]);
    expect(bgParams(196)).toEqual([48, 5, 196]);
  });

  it('cellsToAnsiRows: black cell emits 49, red cell emits 41', () => {
    const rows = cellsToAnsiRows([[
      { char: 'a', fg: 7, bg: 0 },
      { char: 'b', fg: 7, bg: 1 },
    ]] as never);
    expect(rows[0]).toContain(';49m');
    expect(rows[0]).not.toContain(';40m');
    expect(rows[0]).toContain(';41m');
  });

  it('blessed bg(): black is 49, red is 41', () => {
    expect(blessedBg('black')).toBe('\x1b[49m');
    expect(blessedBg('red')).toBe('\x1b[41m');
  });
});
