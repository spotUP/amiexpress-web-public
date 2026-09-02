/**
 * phreakwars at 40 columns (C64/PETSCII XXS tier) - C64 40-col plan, Task 6.
 *
 * RED (the literal the door emitted before this change, on both its title
 * screens):
 *
 *   '+==============================================================+'
 *   '|                    PHREAK WARS                              |'
 *
 * 64 characters on a 40-column row: the frame folded onto a second row of
 * `=` with a stray `|` mid-line, twice. The rest of this door's output is
 * menu rows under 40 and prose, which wraps.
 *
 * The box is now drawn to the caller's real width, recorded per game state
 * at door start (gameStates is shared across nodes, so a module-level width
 * would hand an 80-column caller the C64 banner). At 80 the box is the
 * 64-wide one it has always been.
 */
const { titleBox, stateWidth } = require('../../../../../Doors/phreakwars/lib/ui');

const LINES = [
  { text: 'PHREAK WARS', colour: '\x1b[32m' },
  { text: 'THE UNDERGROUND BBS EMPIRE', colour: '\x1b[33m' },
];

const printable = (s: string): number =>
  s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n$/, '').length;

describe('phreakwars title box', () => {
  it('fits a 40-column screen, frame included', () => {
    const rows = titleBox(LINES, 40);
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(printable(row)).toBe(40);
    }
  });

  it('a title longer than the box is clipped, not folded', () => {
    const [, wide] = titleBox([{ text: 'A'.repeat(80), colour: '' }], 40);
    expect(printable(wide)).toBe(40);
  });

  it('the frame closes on both sides at every width', () => {
    for (const width of [40, 64, 80]) {
      for (const row of titleBox(LINES, width)) {
        const bare = row.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n$/, '');
        expect(bare[0]).toMatch(/[+|]/);
        expect(bare[bare.length - 1]).toMatch(/[+|]/);
      }
    }
  });

  it('80 columns: the box is the 64-wide one the door has always drawn', () => {
    const rows = titleBox(LINES, 80);
    for (const row of rows) {
      expect(printable(row)).toBe(64);
    }
    const bare = rows[0].replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r\n$/, '');
    expect(bare).toBe('+' + '='.repeat(62) + '+');
  });

  it('a state with no recorded width falls back to the board default', () => {
    expect(stateWidth({})).toBe(80);
    expect(stateWidth({ terminalWidth: 40 })).toBe(40);
  });
});
