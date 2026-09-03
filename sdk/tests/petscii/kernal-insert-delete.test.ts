/**
 * PetsciiMachine is the oracle every PETSCII byte is decided against, so where
 * it is not the KERNAL it hides bugs rather than catching them. These pin the
 * two places it was not, both found in review of the bottom-right-cell fix and
 * both read off the ROM (skoolkid sk6502 c64rom, Lee Davison's disassembly;
 * the listings are quoted in
 * `.superpowers/sdd/2026-09-03-petscii-blessed-repaint/progress.md`).
 *
 * 1. THE INSERT COUNT $D8. `$94` raises it (E824 `INC $D8`) and every printed
 *    character lowers it (E699-E69D). While it is non-zero the character-output
 *    routine does not EXECUTE control codes - it paints them as reversed
 *    glyphs:
 *      E745  LDX $D8 / BEQ $E74C / JMP $E697      (unshifted, $00-$1F)
 *      E829  LDX $D8 / BEQ $E832 / ORA #$40 / JMP $E697   (shifted, $80-$9F)
 *      E697  ORA #$80 / LDX $D8 / BEQ / DEC $D8 / print / advance
 *    `$0D`/`$8D` (E72A, E7E3) and `$94` itself (E7EE) are tested earlier and
 *    escape it; `$14` is tested at E74C, after E745, and does not.
 *
 * 2. INSERT IS NOT AN UNCONDITIONAL SHIFT. E7F2-E802 asks whether the logical
 *    line has room, and when it has not the line GROWS - which pushes the rows
 *    below down, and scrolls when there is no row left (E965 -> E975
 *    `JSR $E8EA`). A line already 80 characters long cannot grow, so INSERT
 *    does nothing at all (E7FE `CPY #$4F` / E800 `BEQ $E826`).
 */
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { petsciiMoveTo } from '../../petscii/ansi-to-petscii';

const COLS = 40;
const ROWS = 25;

const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * COLS + x];
const colour = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * COLS + x];

/** Walk the cursor with the ONE writer the transducer uses, so no test invents a second one. */
function moveTo(m: PetsciiMachine, x: number, y: number): void {
  const out: number[] = [];
  petsciiMoveTo(m.state, x, y, out);
  m.feed(out);
}

/** Put one PETSCII byte on the glass at (x,y) without disturbing anything else. */
function put(m: PetsciiMachine, x: number, y: number, byte: number): void {
  moveTo(m, x, y);
  m.feed([byte]);
}

/**
 * Put `held` on (38,24) and `corner` on (39,24) without scrolling.
 *
 * A plain print into (39,24) is precisely the thing that scrolls, so the corner
 * is seeded the only way the KERNAL offers: print it one cell left and let a
 * blank-last-cell INSERT slide it over - the plain-shift branch, which
 * "a blank last cell is the plain shift" pins on its own above.
 */
function seedCorner(m: PetsciiMachine, held: number, corner: number): void {
  moveTo(m, COLS - 2, ROWS - 1);
  m.feed([corner, 0x9d, 0x94]);   // corner at (38,24), step back, shift it into (39,24)
  moveTo(m, COLS - 2, ROWS - 1);
  m.feed([held]);                 // and the ONE printable that balances the insert
  expect(m.pendingInserts).toBe(0);
}

const rowText = (m: PetsciiMachine, y: number): number[] =>
  Array.from(m.state.screen.slice(y * COLS, (y + 1) * COLS));

const BLANK_ROW = new Array(COLS).fill(0x20);

describe('the KERNAL insert count $D8', () => {
  it('INSERT raises the count and the next control byte prints as a reversed glyph instead of executing', () => {
    const m = new PetsciiMachine();
    m.feed([0x94]);
    expect(m.pendingInserts).toBe(1);

    const penBefore = m.state.pen;
    m.feed([0x1c]); // RED, an ordinary colour control code in the unshifted range
    // E749 -> E697 `ORA #$80`: the raw byte becomes a reversed screen code...
    expect(cell(m, 0, 0)).toBe(0x1c | 0x80);
    // ...the colour change never happens...
    expect(m.state.pen).toBe(penBefore);
    // ...and E69D pays one off the count.
    expect(m.pendingInserts).toBe(0);
  });

  it('a shifted control byte is folded to uppercase/graphic first, as E82D does', () => {
    const m = new PetsciiMachine();
    m.feed([0x94, 0x9a]); // LIGHT BLUE, in the shifted control range
    // E7D4 `AND #$7F` -> $1A, E82D `ORA #$40` -> $5A, E697 `ORA #$80` -> $DA
    expect(cell(m, 0, 0)).toBe(0xda);
    expect(m.pendingInserts).toBe(0);
  });

  it('an ordinary printable also pays the count down, which is what makes one printable balance one INSERT', () => {
    const m = new PetsciiMachine();
    m.feed([0x94, 0x41]); // 'a' in the text bank
    expect(cell(m, 0, 0)).toBe(0x01);
    expect(m.pendingInserts).toBe(0);
  });

  it('RETURN and INSERT itself are tested ahead of the count and still execute', () => {
    const cr = new PetsciiMachine();
    cr.feed([0x94, 0x0d]);
    expect([cr.state.cursorX, cr.state.cursorY]).toEqual([0, 1]); // the RETURN really ran
    expect(cr.pendingInserts).toBe(1);                            // and did not pay the count

    const twice = new PetsciiMachine();
    twice.feed([0x94, 0x94]);
    expect(twice.pendingInserts).toBe(2);
  });

  it('DELETE is tested AFTER the count, so it is eaten like any other control code', () => {
    const m = new PetsciiMachine();
    put(m, 5, 0, 0x41);
    moveTo(m, 5, 0);
    m.feed([0x94, 0x14]);
    expect(cell(m, 5, 0)).toBe(0x14 | 0x80); // painted, not executed
    expect(m.pendingInserts).toBe(0);
  });
});

describe('INSERT asks whether the logical line has room (ROM E7F2-E826)', () => {
  it('a blank last cell is the plain shift, and it leaves every other row alone', () => {
    const m = new PetsciiMachine();
    put(m, 0, 0, 0x41);
    put(m, 5, 1, 0x42);
    moveTo(m, 0, 0);
    m.feed([0x94]);

    expect(cell(m, 1, 0)).toBe(0x01); // the glyph moved right
    expect(cell(m, 0, 0)).toBe(0x20);
    expect(rowText(m, 1)[5]).toBe(0x02); // the row below never moved
    expect(m.logicalLineEndRow(0)).toBe(0); // and the line was not extended
    expect(m.pendingInserts).toBe(1);
  });

  it('a NON-BLANK last cell opens a line: the row below joins it and the rows under that move down', () => {
    const m = new PetsciiMachine();
    // Printing into (39,0) links row 1 into the line; a RETURN issued from row
    // 0 unlinks it again (E891), leaving row 0 a 40-character line whose last
    // cell is full - the state INSERT cannot shift into.
    put(m, COLS - 1, 0, 0x5a);
    moveTo(m, 0, 0);
    m.feed([0x0d]);
    expect(m.logicalLineEndRow(0)).toBe(0);
    put(m, 5, 1, 0x42);          // something on row 1 that must be pushed to row 2
    moveTo(m, 0, 0);
    m.feed([0x94]);

    expect(m.logicalLineEndRow(0)).toBe(1);   // E6DA: row 1 is now a continuation of row 0
    expect(cell(m, 5, 2)).toBe(0x02);         // E9C8: what was on row 1 is on row 2
    // E9A6 cleared the freed row, and then E805's shift ran over the whole
    // 80-cell line - so row 0's old last cell is now the first cell of row 1,
    // which is exactly what "the logical line grew" means.
    expect(cell(m, 0, 1)).toBe(0x1a);
    expect(rowText(m, 1).slice(1)).toEqual(BLANK_ROW.slice(1));
  });

  it('opening a line at the BOTTOM row scrolls the screen - the trap the corner idiom must not spring', () => {
    const m = new PetsciiMachine();
    put(m, 3, 0, 0x54);                   // 't' on the top row, the scroll witness
    put(m, COLS - 1, ROWS - 1, 0x5a);     // a non-blank bottom-right corner
    moveTo(m, 10, ROWS - 1);
    m.feed([0x94]);

    // E7FE -> E802 JSR $E965 -> E975 JSR $E8EA: the whole screen moved up one.
    expect(cell(m, 3, 0)).toBe(0x20);
    expect(rowText(m, 0)).toEqual(BLANK_ROW);
  });

  it('an 80-character logical line cannot grow, so INSERT does nothing at all', () => {
    const m = new PetsciiMachine();
    // Print through column 39 of row 0 so the KERNAL links row 1 into the line.
    moveTo(m, COLS - 1, 0);
    m.feed([0x41, 0x42]);                 // the wrap links row 1 (cursorRight fromPrint)
    expect(m.logicalLineEndRow(0)).toBe(1);
    put(m, COLS - 1, 1, 0x5a);            // the line's last cell, non-blank
    moveTo(m, 4, 1);
    const before = [rowText(m, 0), rowText(m, 1), rowText(m, 2)];

    m.feed([0x94]);

    // E7FE `CPY #$4F` / E800 `BEQ $E826`: exit without shifting and without
    // touching the count.
    expect([rowText(m, 0), rowText(m, 1), rowText(m, 2)]).toEqual(before);
    expect(m.pendingInserts).toBe(0);
  });

  it('the shift and the vacated cell take the current pen, and the reverse bit travels with the glyph', () => {
    const m = new PetsciiMachine();
    m.feed([0x1c]);           // pen red
    put(m, 0, 0, 0x41);
    m.feed([0x12]);           // reverse on
    put(m, 1, 0, 0x42);
    m.feed([0x92, 0x1e]);     // reverse off, pen green
    moveTo(m, 0, 0);
    m.feed([0x94]);

    expect(cell(m, 1, 0)).toBe(0x01);        // 'a' shifted right
    expect(colour(m, 1, 0)).toBe(2);         // ...keeping red
    expect(cell(m, 2, 0)).toBe(0x02 | 0x80); // the reversed 'b' shifted too
    expect(colour(m, 0, 0)).toBe(5);         // E81F: the vacated cell takes $0286, now green
  });
});

describe('DELETE at the last column (ROM E75C-E777)', () => {
  it('pulls the corner glyph one cell left, blanks the corner, and lands the cursor on it', () => {
    const m = new PetsciiMachine();
    seedCorner(m, 0x48, 0x43);          // 'h' at (38,24), 'c' at (39,24)
    moveTo(m, COLS - 1, ROWS - 1);
    m.feed([0x14]);

    expect(cell(m, COLS - 2, ROWS - 1)).toBe(0x03); // 'c' moved left over 'h'
    expect(cell(m, COLS - 1, ROWS - 1)).toBe(0x20); // E773: the last cell cleared
    expect([m.state.cursorX, m.state.cursorY]).toEqual([COLS - 2, ROWS - 1]);
  });

  it('never scrolls, whatever is on the bottom row', () => {
    const m = new PetsciiMachine();
    put(m, 3, 0, 0x54);
    for (let x = 0; x < COLS - 2; x++) put(m, x, ROWS - 1, 0x5a);
    seedCorner(m, 0x5a, 0x5a);          // the bottom row full, corner included
    moveTo(m, COLS - 1, ROWS - 1);
    m.feed([0x14]);
    expect(cell(m, 3, 0)).toBe(0x14);   // 't' still on the top row
    expect(cell(m, COLS - 1, ROWS - 1)).toBe(0x20);
  });
});
