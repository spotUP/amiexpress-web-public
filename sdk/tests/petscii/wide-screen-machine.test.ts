/**
 * The wide screen is the same model with two KERNAL rules gone.
 *
 * Each assertion below has its 40-column counterpart in this directory; the
 * point of the file is that the two screens disagree exactly where they are
 * supposed to and nowhere else.
 */
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { WideScreenMachine, WIDE_SCREEN_SHAPE } from '../../petscii/wide-screen-machine';

const feed = (m: PetsciiMachine, text: string): void => m.feed([...text].map((c) => c.charCodeAt(0)));
const rowText = (m: PetsciiMachine, y: number): string => {
  const { screen, cols } = m.state;
  let out = '';
  for (let x = 0; x < cols; x++) {
    const sc = screen[y * cols + x] & 0x7f;
    out += String.fromCharCode(sc >= 0x01 && sc <= 0x1a ? sc + 0x40 : sc === 0x20 ? 0x20 : sc);
  }
  return out;
};

describe('the wide PETSCII screen', () => {
  it('is 80x25 with two thousand cells, where the C64 is 40x25 with one', () => {
    const wide = new WideScreenMachine();
    const c64 = new PetsciiMachine();
    expect(WIDE_SCREEN_SHAPE).toEqual({ cols: 80, rows: 25, logicalLines: false, backgroundPrefix: false });
    expect([wide.state.cols, wide.state.rows, wide.state.screen.length]).toEqual([80, 25, 2000]);
    expect([c64.state.cols, c64.state.rows, c64.state.screen.length]).toEqual([40, 25, 1000]);
  });

  it('wraps at column 80, not 40', () => {
    const wide = new WideScreenMachine();
    feed(wide, 'A'.repeat(80));
    // The 80th character lands on row 0; the cursor has wrapped to row 1.
    expect(rowText(wide, 0).trimEnd()).toBe('A'.repeat(80));
    expect([wide.state.cursorX, wide.state.cursorY]).toEqual([0, 1]);
    const c64 = new PetsciiMachine();
    feed(c64, 'A'.repeat(80));
    expect(rowText(c64, 0).trimEnd()).toBe('A'.repeat(40));
    expect(rowText(c64, 1).trimEnd()).toBe('A'.repeat(40));
  });

  it('has no logical lines: a row is a line', () => {
    const wide = new WideScreenMachine();
    const c64 = new PetsciiMachine();
    // On the C64, printing past column 39 LINKS row 1 to row 0, so row 0's
    // line ends at row 1 - which is what RETURN and DELETE then work on.
    feed(c64, 'A'.repeat(41));
    expect(c64.logicalLineEndRow(0)).toBe(1);
    feed(wide, 'A'.repeat(81));
    expect(wide.logicalLineEndRow(0)).toBe(0);
    expect(wide.logicalLineEndRow(7)).toBe(7);
    expect(wide.logicalLineStartRow(7)).toBe(7);
  });

  it('does not read $02 as a background prefix, and paints the byte after it', () => {
    const wide = new WideScreenMachine();
    const c64 = new PetsciiMachine();
    // $02 $1C (red) on a C64 sets background and border red.
    c64.feed([0x02, 0x1c]);
    expect([c64.state.background, c64.state.border]).toEqual([2, 2]);
    // The wide screen reads neither byte as a background command: $02 is
    // dropped ($02 is UNDERLINE ON on a C128 and this screen has no such
    // attribute) and $1C is the ordinary red PEN it is everywhere else.
    wide.feed([0x02, 0x1c]);
    expect([wide.state.background, wide.state.border]).toEqual([0, 0]);
    expect(wide.state.pen).toBe(2);
  });

  it('scrolls at the last row like the C64 does, one row up', () => {
    const wide = new WideScreenMachine();
    feed(wide, 'TOP');
    for (let i = 0; i < 25; i++) wide.feed([0x0d]);
    expect(rowText(wide, 0).trimEnd()).toBe('');
    feed(wide, 'BOTTOM');
    expect(rowText(wide, 24).trimEnd()).toBe('BOTTOM');
    expect(wide.state.screen.length).toBe(2000);
  });
});
