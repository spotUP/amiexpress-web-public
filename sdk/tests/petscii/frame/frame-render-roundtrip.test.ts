/**
 * The pipeline the adapter feeds: Frame -> renderDiff -> AnsiToPetsciiTransducer
 * -> PetsciiMachine. The machine's screen codes and colour RAM must equal the
 * frame's cells - for the first paint and for every diff after it.
 */
import { renderDiff } from '../../../petscii/frame/frame-render';
import { textToFrame, makeFrame, Frame, Cell, blankCell } from '../../../petscii/frame/types';
import { AnsiToPetsciiTransducer } from '../../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../../petscii/petscii-machine';
import { UNICODE_TO_PETSCII } from '../../../petscii/unicode-to-petscii';
import { printablePetsciiToScreenCode } from '../../../petscii/screen-codes';

/** Screen code (bank 1, no reverse bit) the transducer prints for `ch`, or null when it substitutes. */
function expectedScreenCode(ch: string): number | null {
  const code = ch.codePointAt(0) as number;
  if (code >= 0x61 && code <= 0x7A) return 0x01 + (code - 0x61);
  if (code >= 0x41 && code <= 0x5A) return 0x41 + (code - 0x41);
  if ((code >= 0x20 && code <= 0x3F) || code === 0x40 || code === 0x5B || code === 0x5D) return printablePetsciiToScreenCode(code);
  const mapped = UNICODE_TO_PETSCII.get(ch);
  return typeof mapped === 'number' ? printablePetsciiToScreenCode(mapped) : null;
}

function assertMachineShowsFrame(m: PetsciiMachine, f: Frame) {
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < 40; x++) {
      if (x === 39 && y === 24) continue;
      const c = f.cells[y][x];
      const idx = y * 40 + x;
      const sc = expectedScreenCode(c.ch);
      expect(sc).not.toBeNull();
      expect({ x, y, sc: m.state.screen[idx] }).toEqual({ x, y, sc: (sc as number) | (c.rvs ? 0x80 : 0) });
      if (c.ch !== ' ' || c.rvs) expect({ x, y, fg: m.state.colorRam[idx] }).toEqual({ x, y, fg: c.fg });
    }
  }
  expect([m.state.cursorX, m.state.cursorY]).toEqual([f.cursor.x, f.cursor.y]);
}

function colourful(): Frame {
  const boxed = (s: string) => '│' + s.padEnd(38) + '│';
  const lines = [
    'Menu of the day: [A]bout [B]ulletins [Q]',
    '┌' + '─'.repeat(38) + '┐',
    boxed(' handle  calls  ratio   last on'),
    boxed(' Sysop   1234   1:3     Thu 02-Sep-26'),
    '└' + '─'.repeat(38) + '┘',
    'the quick brown fox jumps over the lazy',
    '',
    'Press RETURN:',
  ];
  const cells: Cell[][] = lines.map((line, y) => Array.from(line).map((ch, x) => ({
    ...blankCell(), ch, fg: (x + y) % 16, rvs: y === 3 && x > 0 && x < 39, bold: y === 0,
  })));
  return makeFrame(40, 25, cells, { x: 13, y: 7 });
}

describe('frame -> ANSI -> transducer -> machine', () => {
  it('first paint reproduces every cell, colour and reverse bit, and parks the cursor', () => {
    const f = colourful();
    const t = new AnsiToPetsciiTransducer();
    const m = new PetsciiMachine();
    m.feed(t.transduce(renderDiff(null, f)));
    assertMachineShowsFrame(m, f);
  });

  it('a diff after the first paint brings the machine to the new frame with the same transducer', () => {
    const a = colourful();
    const t = new AnsiToPetsciiTransducer();
    const m = new PetsciiMachine();
    m.feed(t.transduce(renderDiff(null, a)));
    const cells = a.cells.map((row) => row.map((c) => ({ ...c })));
    cells[3][9] = { ...blankCell(), ch: '9', fg: 7, rvs: true };
    for (let x = 0; x < 40; x++) cells[5][x] = blankCell();
    Array.from('Bye').forEach((ch, x) => { cells[7][x] = { ...blankCell(), ch, fg: 5 }; });
    for (let x = 3; x < 13; x++) cells[7][x] = blankCell();
    const b = makeFrame(40, 25, cells, { x: 3, y: 7 });
    m.feed(t.transduce(renderDiff(a, b)));
    assertMachineShowsFrame(m, b);
  });

  it('an identical frame sends no printable byte', () => {
    const f = colourful();
    const t = new AnsiToPetsciiTransducer();
    t.transduce(renderDiff(null, f));
    const bytes = Array.from(t.transduce(renderDiff(f, f)));
    // PETSCII printables are $20-$7F and $A0-$FF; everything else is a control byte (colour, reverse, cursor, HOME).
    expect(bytes.filter((b) => (b >= 0x20 && b < 0x80) || b >= 0xA0)).toEqual([]);
  });

  it('content at (39,24) never scrolls the machine', () => {
    const f = textToFrame(['top', ...Array(23).fill(''), ' '.repeat(39) + 'Q'], 40, 25);
    const t = new AnsiToPetsciiTransducer();
    const m = new PetsciiMachine();
    m.feed(t.transduce(renderDiff(null, f)));
    expect(m.state.screen[0]).toBe(expectedScreenCode('t'));
    expect(m.state.screen[24 * 40 + 39]).toBe(0x20);
  });
});
