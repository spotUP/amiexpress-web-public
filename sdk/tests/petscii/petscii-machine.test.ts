import { PetsciiMachine } from '../../petscii/petscii-machine';

const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];
const color = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * 40 + x];

describe('PetsciiMachine', () => {
  it('powers on: up/gfx charset, pen light blue, black bg/border (C64 terminal default, not KERNAL BASIC), clear screen', () => {
    const m = new PetsciiMachine();
    expect(m.state.charsetBank).toBe(0);
    expect(m.state.pen).toBe(14);
    expect(m.state.background).toBe(0);
    expect(m.state.border).toBe(0);
    expect(cell(m, 0, 0)).toBe(0x20);
  });

  it('prints a letter as its screen code with current pen in color RAM', () => {
    const m = new PetsciiMachine();
    m.feed([0x1C, 0x41]); // red, 'A'
    expect(cell(m, 0, 0)).toBe(0x01);
    expect(color(m, 0, 0)).toBe(2);
    expect(m.state.cursorX).toBe(1);
  });

  it('charset flip is GLOBAL: existing cells keep screen codes, repaint fires', () => {
    const m = new PetsciiMachine();
    let repaints = 0;
    m.onUpdate = (full) => { if (full) repaints++; };
    m.feed([0x41, 0x0E]); // 'A', switch to lowercase bank
    expect(cell(m, 0, 0)).toBe(0x01);   // screen code unchanged
    expect(m.state.charsetBank).toBe(1); // glyph resolution changes at render time
    expect(repaints).toBeGreaterThan(0);
  });

  it('reverse video sets bit 7 of the screen code; RETURN cancels it', () => {
    const m = new PetsciiMachine();
    m.feed([0x12, 0x41, 0x0D, 0x41]);
    expect(cell(m, 0, 0)).toBe(0x81);
    expect(cell(m, 0, 1)).toBe(0x01);
  });

  it('wraps at column 40 onto a linked continuation row', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(41).fill(0x41));
    expect(cell(m, 0, 1)).toBe(0x01);
    expect(m.state.cursorX).toBe(1);
    expect(m.state.cursorY).toBe(1);
  });

  it('DELETE is destructive: pulls the rest of the logical line left', () => {
    const m = new PetsciiMachine();
    m.feed([0x41, 0x42, 0x43, 0x9D, 0x9D, 0x14]); // ABC, left x2 (cursor at B), DEL
    // KERNAL DEL at position 1 removes the char left of cursor... C64 DEL deletes
    // the character UNDER the cursor after moving back: result is 'BC' shifted:
    expect(cell(m, 0, 0)).toBe(0x02); // 'B'
    expect(cell(m, 1, 0)).toBe(0x03); // 'C'
    expect(cell(m, 2, 0)).toBe(0x20);
  });

  it('INSERT pushes the rest of the logical line right', () => {
    const m = new PetsciiMachine();
    m.feed([0x41, 0x42, 0x13, 0x94]); // AB, home, insert
    expect(cell(m, 0, 0)).toBe(0x20);
    expect(cell(m, 1, 0)).toBe(0x01);
    expect(cell(m, 2, 0)).toBe(0x02);
  });

  it('cursor-down at the bottom row scrolls the screen and color RAM', () => {
    const m = new PetsciiMachine();
    m.feed([0x1C, 0x41]);              // red 'A' at (0,0)
    m.feed(new Array(25).fill(0x11));  // down x24 reaches row 24; the 25th scrolls
    expect(cell(m, 0, 0)).toBe(0x20);  // row 0 now holds what was row 1 (blank) - 'A' scrolled off the top
    expect(m.state.cursorY).toBe(24);  // cursor stays on the bottom row
  });

  it('HOME homes without clearing; CLR clears and homes', () => {
    const m = new PetsciiMachine();
    m.feed([0x41, 0x13]);
    expect(cell(m, 0, 0)).toBe(0x01);
    expect(m.state.cursorX).toBe(0);
    m.feed([0x93]);
    expect(cell(m, 0, 0)).toBe(0x20);
  });

  it('cursor-left at column 0 moves to the end of the previous row', () => {
    const m = new PetsciiMachine();
    m.feed([0x11, 0x9D]); // down, left
    expect(m.state.cursorY).toBe(0);
    expect(m.state.cursorX).toBe(39);
  });

  it('pi ($FF) prints as screen code $5E', () => {
    const m = new PetsciiMachine();
    m.feed([0xFF]);
    expect(cell(m, 0, 0)).toBe(0x5E);
  });

  it('unhandled control codes are no-ops', () => {
    const m = new PetsciiMachine();
    m.feed([0x0A, 0x0F, 0x80, 0x8F]);
    expect(m.state.cursorX).toBe(0);
    expect(cell(m, 0, 0)).toBe(0x20);
  });

  it('RETURN on a wrapped multi-row logical line lands below the LAST linked row', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(41).fill(0x41)); // fills row 0, wraps 1 char onto row 1
    expect(m.state.cursorY).toBe(1);
    m.feed([0x91]); // cursor-up: back to row 0, the FIRST physical row of the logical line
    expect(m.state.cursorY).toBe(0);
    m.feed([0x0D]);
    // Correct: walks the link chain from row 0 forward to its end (row 1),
    // then lands one below that -> row 2. A naive "cursorY+1 from wherever
    // the cursor happens to be" implementation would land on row 1 instead,
    // since the cursor was moved back to row 0 before RETURN fired.
    expect(m.state.cursorY).toBe(2);
  });

  it('DELETE at column 0 of a linked continuation row joins the previous row, pulling content left across the boundary', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(40).fill(0x41)); // fills row 0 with 'A' (0x01), wraps to row 1
    m.feed([0x42, 0x43]);             // 'B','C' at row1 col0/col1; cursor now at row1 col2
    m.feed([0x9D, 0x9D]);             // cursor-left x2: back to row1 col0
    expect(m.state.cursorX).toBe(0);
    expect(m.state.cursorY).toBe(1);
    m.feed([0x14]);                   // DELETE: moves to row0 col39, then pulls row1 left across the boundary
    expect(m.state.cursorX).toBe(39);
    expect(m.state.cursorY).toBe(0);
    expect(cell(m, 39, 0)).toBe(0x02); // 'B' pulled into row0's last cell
    expect(cell(m, 0, 1)).toBe(0x03);  // 'C' pulled into row1 col0
    expect(cell(m, 1, 1)).toBe(0x20);  // vacated cell is a space
  });

  it('scrolling a linked line off the top shifts rowLinked flags together with content', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(41).fill(0x41)); // row0 full of 'A', row1 col0 = 'A' (linked continuation), cursorY=1
    m.feed(new Array(24).fill(0x11)); // 23 downs reach row 24, the 24th triggers exactly one scroll
    expect(m.state.cursorY).toBe(24);
    m.feed(new Array(24).fill(0x91)); // back up to the now-top row (former row 1)
    expect(m.state.cursorY).toBe(0);
    m.feed([0x0D]);
    // If scroll had failed to shift the rowLinked table with the content,
    // a stale rowLinked[1]=true would make RETURN skip an extra row (land
    // on 2 instead of 1).
    expect(m.state.cursorY).toBe(1);
  });

  it('0x8E when already on bank 0 does not fire a full repaint', () => {
    const m = new PetsciiMachine();
    let repaints = 0;
    m.onUpdate = (full) => { if (full) repaints++; };
    m.feed([0x8E]);
    expect(m.state.charsetBank).toBe(0);
    expect(repaints).toBe(0);
  });

  it('logicalLineEndRow follows the link chain a wrapping print created', () => {
    const m = new PetsciiMachine();
    m.feed(new Array(45).fill(0x41)); // 45 printables: row 1 is a continuation of row 0
    expect(m.logicalLineEndRow(0)).toBe(1);
    expect(m.logicalLineEndRow(1)).toBe(1);
    expect(m.logicalLineEndRow(5)).toBe(5);
  });
});
