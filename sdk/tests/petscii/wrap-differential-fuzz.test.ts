/**
 * Differential fuzz: the transducer against the reference ANSI terminal.
 *
 * The bottom-right scroll, the relative moves, the erases and the index were
 * each found one at a time and each closed with a hand-written pin. This closes
 * the CLASS: a seeded, deterministic walk over the operations that read or move
 * the cursor, with 40-column rows in the mix so the deferred-wrap latch is
 * exercised constantly, asserting that the C64 glass equals what an ANSI
 * terminal would show - glyph and reverse, every cell, every case.
 *
 * It is deterministic by construction (mulberry32 seeded from a constant), so a
 * failure is reproducible from the case index printed with it.
 *
 * NOT in the alphabet, each for a stated reason:
 *  - `ESC M` at row 0: an ANSI terminal scrolls the screen DOWN; the KERNAL
 *    screen editor has no reverse scroll and no byte that asks for one.
 *  - TAB: the transducer PAINTS the skipped cells (`printByte`), so under
 *    `ESC[7m` they come out reverse-video where the reference leaves them
 *    untouched. Pre-existing, recorded in the SDD ledger, not this task.
 *  - DEL (0x7F): folded into backspace here on purpose (Amiga CON: sends it for
 *    the key) and ignored by the reference on purpose. Documented divergence.
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { screenCodeToPetscii } from '../../petscii/screen-codes';
import { FrameReconstructor } from '../../petscii/frame/ansi-screen';

const COLS = 40;
const ROWS = 25;
const CASES = 4000;
const SEED = 0x9e3779b9;

/** mulberry32 - small, fast, and exactly reproducible across runs and machines. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

const ansiGrid = (r: FrameReconstructor): Glyph[][] =>
  r.snapshot().cells.map((row) => row.map((c) => ({ ch: c.ch, rvs: c.rvs })));

const asText = (g: Glyph[][]): string[] => g.map((r) => r.map((c) => c.ch).join('').replace(/ +$/, ''));

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** One operation, biased hard towards the shapes that produce a pending wrap. */
function nextOp(r: () => number): string {
  const pick = Math.floor(r() * 20);
  const row = 1 + Math.floor(r() * ROWS);
  const col = 1 + Math.floor(r() * COLS);
  const step = 1 + Math.floor(r() * 6);
  const text = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) s += LETTERS[Math.floor(r() * LETTERS.length)];
    return s;
  };
  switch (pick) {
    case 0: case 1: case 2:
      return text(COLS);                            // exactly one full row: the latch
    case 3: case 4:
      return text(1 + Math.floor(r() * 44));        // anything, sometimes past the edge
    case 5: return '\x1b[' + row + ';' + col + 'H'; // CUP
    case 6: return '\x1b[' + step + 'A';            // CUU
    case 7: return '\x1b[' + step + 'B';            // CUD
    case 8: return '\x1b[' + step + 'C';            // CUF
    case 9: return '\x1b[' + step + 'D';            // CUB
    case 10: return '\x1b[' + col + 'G';            // CHA
    case 11: return '\x1b[' + row + 'd';            // VPA
    case 12: return '\x1b[' + Math.floor(r() * 3) + 'K'; // EL 0/1/2
    case 13: return '\x1b[' + Math.floor(r() * 3) + 'J'; // ED 0/1/2
    case 14: return '\x1b7';                        // save
    case 15: return '\x1b8';                        // restore
    case 16: return '\x1bD';                        // IND
    case 17: return '\r';
    case 18: return '\n';
    default: return '\b';
  }
}

describe('differential fuzz against the reference ANSI terminal at 40x25', () => {
  it(`${CASES} seeded programs leave the C64 glass equal to an ANSI terminal, cell for cell`, () => {
    const r = rng(SEED);
    const failures: string[] = [];

    for (let c = 0; c < CASES && failures.length < 3; c++) {
      const ops: string[] = [];
      const n = 2 + Math.floor(r() * 9);
      for (let i = 0; i < n; i++) ops.push(nextOp(r));

      const t = new AnsiToPetsciiTransducer();
      const display = new PetsciiMachine();
      const ref = new FrameReconstructor({ cols: COLS, rows: ROWS });
      for (const op of ops) {
        display.feed(t.transduce(op));
        ref.write(op);
      }

      const a = c64Grid(display);
      const b = ansiGrid(ref);
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        failures.push(
          `case ${c} ops=${JSON.stringify(ops)}\nC64:\n${asText(a).join('\n')}\nANSI:\n${asText(b).join('\n')}`,
        );
      }
    }

    expect(failures).toEqual([]);
  });
});
