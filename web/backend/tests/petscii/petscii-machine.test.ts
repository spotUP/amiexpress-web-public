import { PetsciiMachine } from '../../../../packages/terminal/src/petscii/petscii-machine';

const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];
const color = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * 40 + x];

describe('PetsciiMachine', () => {
  it('powers on: up/gfx charset, pen light blue, blue bg, clear screen', () => {
    const m = new PetsciiMachine();
    expect(m.state.charsetBank).toBe(0);
    expect(m.state.pen).toBe(14);
    expect(m.state.background).toBe(6);
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
});
