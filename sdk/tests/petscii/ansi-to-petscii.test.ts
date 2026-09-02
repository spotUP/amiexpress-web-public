import { AnsiToPetsciiTransducer, nearestVicForRgb, sgrColorToVic } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';

/** Run text through a fresh transducer and replay its output into a fresh machine (the display side). */
export function run(text: string) {
  const t = new AnsiToPetsciiTransducer();
  const out = Array.from(t.transduce(text));
  const display = new PetsciiMachine();
  display.feed(out);
  return { t, out, display };
}
export const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];
export const color = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * 40 + x];
/** Screen code of an ASCII letter printed in charset bank 1. */
export const scUpper = (ch: string) => 0x41 + (ch.charCodeAt(0) - 0x41);
export const scLower = (ch: string) => 0x01 + (ch.charCodeAt(0) - 0x61);

function sameState(a: PetsciiMachine, b: PetsciiMachine) {
  expect(Array.from(a.state.screen)).toEqual(Array.from(b.state.screen));
  expect(Array.from(a.state.colorRam)).toEqual(Array.from(b.state.colorRam));
  expect([a.state.cursorX, a.state.cursorY, a.state.charsetBank, a.state.reverse, a.state.pen])
    .toEqual([b.state.cursorX, b.state.cursorY, b.state.charsetBank, b.state.reverse, b.state.pen]);
}

describe('AnsiToPetsciiTransducer core', () => {
  it('oracle lockstep: a display machine fed the output is state-identical to the transducer machine', () => {
    const frames = [
      'Username: ', 'spot\r\n', '\x1b[1;32mWelcome\x1b[0m back\r\n',
      '\x1b[7mREV\x1b[27m plain\r\n', 'abc\rX', 'tab\there\r\n', '\x1b[31m' + 'w'.repeat(60) + '\r\nnext',
    ];
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();
    for (const f of frames) display.feed(t.transduce(f));
    sameState(t.machine, display);
  });

  it('login prompt: charset prelude once, case-swapped text, cursor after the prompt', () => {
    const { t, out, display } = run('Username: ');
    expect(out[0]).toBe(0x0E);
    expect(out.slice(1)).toEqual([0xD5, 0x53, 0x45, 0x52, 0x4E, 0x41, 0x4D, 0x45, 0x3A, 0x20]);
    expect(cell(display, 0, 0)).toBe(scUpper('U'));
    expect(cell(display, 1, 0)).toBe(scLower('s'));
    expect(display.state.cursorX).toBe(10);
    expect(Array.from(t.transduce('x'))).toEqual([0x58]); // no second prelude
  });

  it('CRLF is one RETURN, lone LF is one RETURN', () => {
    expect(run('a\r\nb').out).toEqual([0x0E, 0x41, 0x0D, 0x42]);
    expect(run('a\nb').out).toEqual([0x0E, 0x41, 0x0D, 0x42]);
  });

  it('lone CR returns to column 0 of the SAME row (the flag-pause overwrite idiom)', () => {
    const { display } = run('abc\rX');
    expect(cell(display, 0, 0)).toBe(scUpper('X'));
    expect(cell(display, 1, 0)).toBe(scLower('b'));
    expect(display.state.cursorY).toBe(0);
  });

  it('backspace-space-backspace erases the last typed character', () => {
    const { display } = run('ab\b \b');
    expect(cell(display, 0, 0)).toBe(scLower('a'));
    expect(cell(display, 1, 0)).toBe(0x20);
    expect(display.state.cursorX).toBe(1);
  });

  it('SGR foreground colors land in color RAM; bg and unknown SGR are dropped', () => {
    const { display } = run('\x1b[31mR\x1b[44;33mY\x1b[0mW');
    expect(color(display, 0, 0)).toBe(2);  // red
    expect(color(display, 1, 0)).toBe(7);  // yellow (bg 44 ignored)
    expect(color(display, 2, 0)).toBe(1);  // SGR 0 -> white
  });

  it('bold + basic color selects the bright VIC color; truecolor and 256-color snap to nearest', () => {
    expect(sgrColorToVic(31, true)).toBe(10);   // light red
    expect(sgrColorToVic(31, false)).toBe(2);
    expect(nearestVicForRgb(129, 51, 56)).toBe(2);   // exact Colodore red
    expect(nearestVicForRgb(90, 172, 80)).toBe(5);   // near Colodore green
    expect(color(run('\x1b[38;5;10mg').display, 0, 0)).toBe(13); // 256-color bright green -> light green
  });

  it('a color byte is only emitted when the pen actually changes', () => {
    const { out } = run('\x1b[31m\x1b[31mab');
    expect(out.filter((b) => b === 0x1C)).toHaveLength(1);
  });

  it('reverse survives RETURN: the KERNAL cancels it, the transducer re-asserts it for the next printable', () => {
    const { out, display } = run('\x1b[7mA\r\nB\x1b[27mC');
    expect(cell(display, 0, 0) & 0x80).toBe(0x80);
    expect(cell(display, 0, 1) & 0x80).toBe(0x80);
    expect(cell(display, 1, 1) & 0x80).toBe(0);
    expect(out.filter((b) => b === 0x12)).toHaveLength(2);
  });

  it('a 60-column line wraps onto a linked row and RETURN lands on the row after (no corruption)', () => {
    const { display } = run('w'.repeat(60) + '\r\nN');
    expect(cell(display, 19, 1)).toBe(scLower('w'));
    expect(cell(display, 0, 2)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(2);
  });

  it('escape split across chunks is held, never printed as garbage', () => {
    const t = new AnsiToPetsciiTransducer();
    const a = Array.from(t.transduce('x\x1b[3'));
    const b = Array.from(t.transduce('1mR'));
    expect(a).toEqual([0x0E, 0x58]);
    expect(b).toEqual([0x1C, 0xD2]);
  });

  it('CR at a chunk end is held until the next chunk decides CRLF vs lone CR; flush resolves it', () => {
    const t = new AnsiToPetsciiTransducer();
    expect(Array.from(t.transduce('ab\r'))).toEqual([0x0E, 0x41, 0x42]);
    expect(Array.from(t.transduce('\nc'))).toEqual([0x0D, 0x43]);
    t.transduce('x\r');                                   // cursor is now (2,1): 'c', 'x'
    expect(Array.from(t.flush())).toEqual([0x9D, 0x9D]);  // lone CR: back to column 0 of the same row
  });

  it('RETURN from the first row of a KERNAL-linked pair goes to the next physical row, as ANSI does', () => {
    // 60 chars wrap and link row 1 to row 0; cursor up onto row 0; a RETURN there would jump to row 2 on a C64.
    const { display, t } = run('w'.repeat(60) + '\x1b[Ax\r\nN');
    expect(t.machine.logicalLineEndRow(0)).toBe(1);
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(1);
  });

  it('observe() keeps the oracle in step with raw .seq bytes that bypassed the transducer', () => {
    const t = new AnsiToPetsciiTransducer();
    t.transduce('a');                 // bank 1, pen 14
    t.observe([0x8E, 0x1C]);          // the .seq switched to graphics bank and red
    expect(Array.from(t.transduce('b'))).toEqual([0x0E, 0x42]); // bank back to 1; the pen stays red until ANSI asks otherwise
    expect(t.machine.state.pen).toBe(2);
  });
});
