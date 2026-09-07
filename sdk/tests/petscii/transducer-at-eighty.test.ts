/**
 * The transducer at 80 columns.
 *
 * Every case here has a 40-column sibling somewhere in this directory; what
 * is asserted is that the boundary MOVED - the clamps, the wrap latch, the
 * bottom-right idiom and the erases are written around the caller's own
 * width - and that the one byte the wide screen must never see is not sent.
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';

const wide = (): AnsiToPetsciiTransducer => new AnsiToPetsciiTransducer({ columns: 80 });
const narrow = (): AnsiToPetsciiTransducer => new AnsiToPetsciiTransducer();
const rowText = (t: AnsiToPetsciiTransducer, y: number): string => {
  const { screen, cols } = t.machine.state;
  let out = '';
  for (let x = 0; x < cols; x++) {
    const sc = screen[y * cols + x] & 0x7f;
    out += sc >= 0x01 && sc <= 0x1a ? String.fromCharCode(sc + 0x40) : String.fromCharCode(sc);
  }
  return out;
};

describe('the transducer at 80 columns', () => {
  it('knows its own width, and defaults to the C64s', () => {
    expect(wide().columns).toBe(80);
    expect(narrow().columns).toBe(40);
    expect(wide().machine.state.cols).toBe(80);
  });

  it('a CUP to column 80 lands there instead of clamping to 40', () => {
    // The transducer opens the lowercase bank ($0E), where an uppercase
    // letter's screen code is its PETSCII value - 'X' is 0x58, not 0x18.
    const X = 0x58;
    const t = wide();
    t.transduce('\x1b[1;80HX');
    expect(t.machine.state.screen[79] & 0x7f).toBe(X);
    expect(t.machine.state.screen[39] & 0x7f).toBe(0x20); // nothing at the C64's edge
    // The same escape on a C64 clamps to ITS last column.
    const c = narrow();
    c.transduce('\x1b[1;80HX');
    expect(c.machine.state.screen[39] & 0x7f).toBe(X);
  });

  it('a row of eighty characters fills one row and does not wrap', () => {
    const t = wide();
    t.transduce('B'.repeat(80));
    expect(rowText(t, 0)).toBe('B'.repeat(80));
    expect(rowText(t, 1).trim()).toBe('');
    // The pending-wrap latch is the caller's last column, not the C64's:
    // the eighty-first character is what crosses onto row 1.
    t.transduce('C');
    expect(rowText(t, 1)[0]).toBe('C');
  });

  it('the cursor keys clamp at the wide screens edges', () => {
    const t = wide();
    // Cursor-forward and cursor-down past any bound: the clamps are the
    // caller's own last column and row, so this is the bottom-right cell.
    t.transduce('\x1b[1;1H\x1b[200C\x1b[200B');
    expect([t.machine.state.cursorX, t.machine.state.cursorY]).toEqual([79, 24]);
    t.transduce('X');
    const { screen, cols } = t.machine.state;
    expect(screen[24 * cols + 79] & 0x7f).toBe(0x58);
    // A C64 clamps to its own corner, twenty-five rows down and forty across.
    const c = narrow();
    c.transduce('\x1b[1;1H\x1b[200C\x1b[200B');
    expect([c.machine.state.cursorX, c.machine.state.cursorY]).toEqual([39, 24]);
  });

  it('erase-in-line clears to column 79, and erase-in-display clears two thousand cells', () => {
    const t = wide();
    t.transduce('\x1b[1;1H' + 'Z'.repeat(80));
    t.transduce('\x1b[1;10H\x1b[K');
    expect(rowText(t, 0)).toBe('Z'.repeat(9) + ' '.repeat(71));
    t.transduce('\x1b[2J');
    expect(t.machine.state.screen.every((c) => (c & 0x7f) === 0x20)).toBe(true);
    expect(t.machine.state.screen.length).toBe(2000);
  });

  it('never sends $02 to the wide screen, where it would mean underline', () => {
    const t = wide();
    // A background the door asked for, and a full clear that commits it: at
    // 40 this is exactly when `$02 <colour>` goes out.
    const bytes = t.transduce('\x1b[44m\x1b[2J\x1b[HX');
    expect(Array.from(bytes)).not.toContain(0x02);
    const c = narrow();
    const narrowBytes = c.transduce('\x1b[44m\x1b[2J\x1b[HX');
    expect(Array.from(narrowBytes)).toContain(0x02);
  });
});
