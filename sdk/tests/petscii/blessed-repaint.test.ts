/**
 * "The menu row is painted twice and the row below keeps its old tail."
 *
 * The sysop's BUGS screenshot (`Doors/bug-tracker`, a blessed SDK door,
 * MIN_COLUMNS=40) on a web PETSCII session at 40x25, after walking the menu
 * selection to the bottom and back to the top: `>>[N] New Bug Report` on two
 * rows, `[S] Search Bugs` followed by the remnant `ashboard` of `Analytics
 * Dashboard`, and a leftover cell after `List All Bugs`.
 *
 * CAPTURED FIRST, then measured: the door's real byte stream (recorded by
 * `web/backend/tests/petscii-frame/fixtures/capture-bug-tracker.mjs`) contains
 * no ESC[K, no ESC[nX, no relative cursor motion and no insert/delete line -
 * blessed's renderer (`engines/ui/blessed/core/screen.ts` `_diff`) emits only
 * absolute CUP, SGR and characters. Every symptom came from ONE cell.
 *
 * ROOT CAUSE. `_diff` writes cell (39,24) on the first render of every 40x25
 * screen (the whole buffer is diffed against an invalidated `lastBuffer`).
 * Printing there advances the KERNAL cursor off the screen, which SCROLLS -
 * and an ANSI terminal never scrolls on a printable: it holds the cursor at the
 * last column (deferred wrap) and crosses only on the next one. So from its
 * first frame the C64 was one row above what the door believed, and every later
 * diff repaint landed on the row below the one it meant: the previously
 * selected row was never repainted (two `>>`), and each shorter replacement
 * string left the tail of the longer text that had scrolled underneath it.
 *
 * Every test here asserts PARITY with the repo's xterm model
 * (`petscii/frame/ansi-screen.ts`, whose parser is written to mirror the
 * transducer's) at 40x25, glyph and reverse per cell - not just a hand-written
 * expectation.
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { screenCodeToPetscii } from '../../petscii/screen-codes';
import { FrameReconstructor } from '../../petscii/frame/ansi-screen';

const COLS = 40;
const ROWS = 25;

const scUpper = (ch: string) => 0x41 + (ch.charCodeAt(0) - 0x41);

/** One screen code as the glyph a PetMe64 canvas paints for it, in `bank`. */
function screenCodeToChar(sc: number, bank: 0 | 1): string {
  const p = screenCodeToPetscii(sc & 0x7f);
  if (p >= 0x20 && p <= 0x3f) return String.fromCharCode(p);
  if (bank === 1) {
    if (p >= 0x41 && p <= 0x5a) return String.fromCharCode(p - 0x41 + 0x61);
    if (p >= 0xc1 && p <= 0xda) return String.fromCharCode(p - 0xc1 + 0x41);
  } else if (p >= 0x41 && p <= 0x5f) {
    return String.fromCharCode(p);
  }
  if (p === 0x40 || (p >= 0x5b && p <= 0x5f)) return String.fromCharCode(p);
  // A PETSCII graphic with no ASCII name. None of these fixtures produce one,
  // so a '#' appearing in a failure message is itself the report.
  return '#';
}

interface Glyph { ch: string; rvs: boolean }

function c64Grid(m: PetsciiMachine): Glyph[][] {
  const rows: Glyph[][] = [];
  for (let y = 0; y < ROWS; y++) {
    const row: Glyph[] = [];
    for (let x = 0; x < COLS; x++) {
      const code = m.state.screen[y * COLS + x];
      row.push({ ch: screenCodeToChar(code, m.state.charsetBank), rvs: (code & 0x80) !== 0 });
    }
    rows.push(row);
  }
  return rows;
}

function ansiGrid(r: FrameReconstructor): Glyph[][] {
  return r.snapshot().cells.map((row) => row.map((c) => ({ ch: c.ch, rvs: c.rvs })));
}

const asText = (g: Glyph[][]): string[] => g.map((r) => r.map((c) => c.ch).join('').replace(/ +$/, ''));

/**
 * Feed the chunks to the transducer AND to the reference terminal, replay the
 * transducer's OUTPUT into a second machine (so the assertions are about the
 * bytes it emits, not about its own bookkeeping), and return both grids.
 */
function both(chunks: string[]) {
  const t = new AnsiToPetsciiTransducer();
  const display = new PetsciiMachine();
  const ref = new FrameReconstructor({ cols: COLS, rows: ROWS });
  const bytes: number[] = [];
  for (const c of chunks) {
    const out = t.transduce(c);
    bytes.push(...out);
    display.feed(out);
    ref.write(c);
  }
  return {
    display,
    bytes,
    c64: asText(c64Grid(display)),
    ansi: asText(ansiGrid(ref)),
    c64Cells: c64Grid(display),
    ansiCells: ansiGrid(ref),
  };
}

/** The whole 40x25 glass, glyph and reverse per cell, must be what an ANSI terminal would show. */
function expectTerminalParity(chunks: string[]): void {
  const { c64Cells, ansiCells, c64, ansi } = both(chunks);
  expect(c64).toEqual(ansi);
  expect(c64Cells).toEqual(ansiCells);
}

const FULL_BOTTOM_ROW = '\x1b[25;1H' + '-'.repeat(40);

describe('a row painted to column 40 does not scroll the C64 screen', () => {
  it('the bottom row can be filled to all 40 columns without losing the top row', () => {
    const frames = ['\x1b[1;1HTOP', FULL_BOTTOM_ROW];
    const { c64, display } = both(frames);
    expect(c64[0]).toBe('TOP');
    expect(c64[24]).toBe('-'.repeat(40));
    expect([display.state.cursorX, display.state.cursorY]).toEqual([39, 24]);
    expectTerminalParity(frames);
  });

  it('the highlighted menu row is not painted twice when the row below it is repainted', () => {
    const frames = [
      '\x1b[3;1H>>[N] New Bug Report' + FULL_BOTTOM_ROW,
      '\x1b[3;1H  [N] New Bug Report\x1b[4;1H>>[L] List All Bugs',
    ];
    const { c64 } = both(frames);
    expect(c64.filter((row) => row.includes('>>'))).toEqual(['>>[L] List All Bugs']);
    expect(c64[2]).toBe('  [N] New Bug Report');
    expectTerminalParity(frames);
  });

  it('a repainted row does not keep the tail of the longer row that used to sit under it', () => {
    const frames = [
      '\x1b[6;1H  [S] Search Bugs\x1b[7;1H  [A] Analytics Dashboard' + FULL_BOTTOM_ROW,
      '\x1b[6;1H  [S] Search Bugs',
    ];
    const { c64 } = both(frames);
    expect(c64[5]).toBe('  [S] Search Bugs');
    expect(c64[5]).not.toMatch(/ashboard/);
    expectTerminalParity(frames);
  });

  it('the bottom-right glyph itself is on the glass, in its own colour, not dropped', () => {
    const frames = ['\x1b[25;39H\x1b[31mAB'];
    const { display } = both(frames);
    expect(display.state.screen[24 * COLS + 38]).toBe(scUpper('A'));
    expect(display.state.screen[24 * COLS + 39]).toBe(scUpper('B'));
    expect(display.state.colorRam[24 * COLS + 39]).toBe(2); // red, the pen B was printed with
    expectTerminalParity(frames);
  });

  it('the cell left of the bottom-right one survives the insert idiom, colour and all', () => {
    const frames = ['\x1b[25;39H\x1b[32mA', '\x1b[25;40H\x1b[31mB'];
    const { display } = both(frames);
    expect(display.state.screen[24 * COLS + 38]).toBe(scUpper('A'));
    expect(display.state.colorRam[24 * COLS + 38]).toBe(5); // green
    expect(display.state.screen[24 * COLS + 39]).toBe(scUpper('B'));
    expect(display.state.colorRam[24 * COLS + 39]).toBe(2); // red
    expectTerminalParity(frames);
  });

  it('the held wrap is crossed exactly once: the next printable scrolls, as an ANSI terminal does', () => {
    const frames = ['\x1b[1;1HTOP' + FULL_BOTTOM_ROW + 'Z'];
    const { c64 } = both(frames);
    expect(c64[23]).toBe('-'.repeat(40));
    expect(c64[24]).toBe('Z');
    expectTerminalParity(frames);
  });

  it('a newline on a filled bottom row scrolls once, and one on the row above still does not', () => {
    expectTerminalParity([FULL_BOTTOM_ROW + '\r\nAFTER']);
    expectTerminalParity(['\x1b[24;1H' + '-'.repeat(40) + '\r\nAFTER']);
  });
});

describe('the bottom-right idiom is safe on the KERNAL, not just on the grid', () => {
  // The oracle models $D8 and the fullness test now (see
  // `kernal-insert-delete.test.ts`), so these run against a machine that would
  // scroll, or paint a control byte as a glyph, if the idiom were wrong.

  it('a non-blank bottom-right cell can be replaced without a scroll', () => {
    const frames = [
      '\x1b[1;1HTOP\x1b[25;39H\x1b[32mHC',   // seed (38,24)='H' green, (39,24)='C' green
      '\x1b[25;40H\x1b[31mX',                 // replace the corner with a red 'X'
    ];
    const { c64, display } = both(frames);
    expect(c64[0]).toBe('TOP');                                  // nothing scrolled
    expect(display.state.screen[24 * COLS + 39]).toBe(scUpper('X'));
    expect(display.state.colorRam[24 * COLS + 39]).toBe(2);      // red
    expect(display.state.screen[24 * COLS + 38]).toBe(scUpper('H'));
    expect(display.state.colorRam[24 * COLS + 38]).toBe(5);      // still green
    expectTerminalParity(frames);
  });

  it('the row above the last row is untouched by the corner idiom', () => {
    const frames = [
      '\x1b[24;1H' + 'R'.repeat(40) + '\x1b[25;39H\x1b[32mHC',
      '\x1b[25;40H\x1b[31mX',
    ];
    const { c64 } = both(frames);
    expect(c64[23]).toBe('R'.repeat(40));
    expectTerminalParity(frames);
  });

  it('the idiom leaves no insert pending, so the next control byte is executed and not painted', () => {
    const { display } = both(['\x1b[25;39H\x1b[32mHC', '\x1b[25;40H\x1b[31mX']);
    expect(display.pendingInserts).toBe(0);
  });

  it('exactly one printable follows the INSERT it emits - nothing the insert count could eat', () => {
    const { bytes } = both(['\x1b[1;1HTOP\x1b[25;39H\x1b[32mHC', '\x1b[25;40H\x1b[31mX']);
    const inserts = bytes.reduce((n, b) => (b === 0x94 ? n + 1 : n), 0);
    expect(inserts).toBeGreaterThan(0);
    bytes.forEach((b, i) => {
      if (b !== 0x94) return;
      const next = bytes[i + 1];
      expect(next).toBeDefined();
      // A control code here would be painted as a reversed glyph (ROM E745 /
      // E829 -> E697) and would eat the insert.
      expect(next < 0x20 || (next >= 0x80 && next <= 0x9f)).toBe(false);
    });
  });
});

describe('erase reaches the bottom-right cell', () => {
  it('erasing the bottom row clears its last cell', () => {
    const frames = [FULL_BOTTOM_ROW, '\x1b[25;1H\x1b[K'];
    const { display } = both(frames);
    for (let x = 0; x < COLS; x++) expect(display.state.screen[24 * COLS + x]).toBe(0x20);
    expectTerminalParity(frames);
  });

  it('a full clear and an erase-to-end-of-screen leave the bottom-right cell blank too', () => {
    expectTerminalParity([FULL_BOTTOM_ROW, '\x1b[20;1H\x1b[J']);
    expectTerminalParity([FULL_BOTTOM_ROW, '\x1b[2J']);
  });
});

describe('the deferred wrap is honoured by every operation, not only by newline', () => {
  it('backspace after a row painted to column 40 lands on column 39, not column 40', () => {
    const frames = ['a'.repeat(40) + '\bZ'];
    const { display } = both(frames);
    expect(display.state.screen[38]).toBe(scUpper('Z'));
    expectTerminalParity(frames);
  });

  it('a lone carriage return after a row painted to column 40 stays on that row', () => {
    const frames = ['a'.repeat(40) + '\rZ'];
    const { display } = both(frames);
    expect(display.state.screen[0]).toBe(scUpper('Z'));
    expect(display.state.screen[COLS]).toBe(0x20);
    expectTerminalParity(frames);
  });

  it('a tab after a row painted to column 40 does not step onto the row below', () => {
    expectTerminalParity(['a'.repeat(40) + '\tZ']);
  });

  it('a relative cursor move after a row painted to column 40 runs from the column ANSI holds', () => {
    for (const move of ['\x1b[A', '\x1b[B', '\x1b[2C', '\x1b[3D', '\x1b[E', '\x1b[F']) {
      expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + move + 'Z']);
    }
  });

  it('a semi-absolute move keeps the axis ANSI holds, not the one the KERNAL crossed to', () => {
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1b[10G' + 'Z']);  // CHA keeps the row
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1b[12d' + 'Z']);  // VPA keeps the column
  });

  it('erase to end of line after a row painted to column 40 clears the tail of THAT row', () => {
    expectTerminalParity(['\x1b[3;1H' + 'b'.repeat(40) + '\x1b[4;1H' + 'c'.repeat(20) + '\x1b[3;20H' + 'a'.repeat(21) + '\x1b[K']);
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1b[X']);
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1b[J']);
  });

  it('ESC M steps up from the row ANSI holds, and ESC 7 saves the column it holds', () => {
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1bMZ']);
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1b7\x1b[10;10HX\x1b8Z']);
  });

  it('ESC D indexes from the row ANSI holds, not the one the KERNAL crossed to', () => {
    expectTerminalParity(['\x1b[3;1H' + 'a'.repeat(40) + '\x1bDZ']);
  });
});

describe('sequences the transducer used to drop or misread', () => {
  it('a private-prefix CSI is not read as an attribute reset', () => {
    const frames = ['\x1b[31m\x1b[>4;2mR'];
    const { display } = both(frames);
    expect(display.state.colorRam[0]).toBe(2); // still red; ESC[>4;2m is not an SGR
    expectTerminalParity(frames);
  });

  it('ESC D moves down one row and scrolls on the bottom row', () => {
    expectTerminalParity(['\x1b[3;5HX\x1bDY']);
    expectTerminalParity(['\x1b[1;1HTOP\x1b[25;1HBOTTOM\x1b[25;1H\x1bD']);
  });

  it('ESC E is a newline: column 0 of the next row', () => {
    expectTerminalParity(['\x1b[3;5HX\x1bEY']);
  });
});
