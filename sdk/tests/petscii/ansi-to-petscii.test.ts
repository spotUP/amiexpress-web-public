import { AnsiToPetsciiTransducer, nearestVicForRgb, sgrColorToVic, xterm256ToRgb } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';
import { C64_PALETTE_COLODORE, C64_PALETTE_PEPTO } from '../../petscii/c64-palette';

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
  expect([a.state.cursorX, a.state.cursorY, a.state.charsetBank, a.state.reverse, a.state.pen,
    a.state.background, a.state.border])
    .toEqual([b.state.cursorX, b.state.cursorY, b.state.charsetBank, b.state.reverse, b.state.pen,
      b.state.background, b.state.border]);
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

describe('AnsiToPetsciiTransducer cursor, erase and graphics', () => {
  it('ESC[H is one HOME byte; ESC[r;cH is deltas from the oracle cursor', () => {
    expect(run('ab\x1b[H').out.slice(-1)).toEqual([0x13]);
    const { out, display } = run('\x1b[3;5H');
    expect(out).toEqual([0x11, 0x11, 0x1D, 0x1D, 0x1D, 0x1D]);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([4, 2]);
  });

  it('cursor down at the bottom row does not scroll; cursor right at column 39 does not wrap', () => {
    const { display } = run('\x1b[25;1Hbottom\x1b[5B');
    expect(display.state.cursorY).toBe(24);
    expect(cell(display, 0, 24)).toBe(scLower('b'));
    const right = run('\x1b[1;40H\x1b[3C').display;
    expect([right.state.cursorX, right.state.cursorY]).toEqual([39, 0]);
  });

  it('CHA (G), VPA (d), CUF (C), CUB (D) and HOME land on the right oracle cell', () => {
    const g = run('\x1b[5;20H\x1b[10G').display;
    expect([g.state.cursorX, g.state.cursorY]).toEqual([9, 4]);
    const d = run('\x1b[5;20H\x1b[12d').display;
    expect([d.state.cursorX, d.state.cursorY]).toEqual([19, 11]);
    const cd = run('\x1b[1;10H\x1b[4C\x1b[6D').display;
    expect([cd.state.cursorX, cd.state.cursorY]).toEqual([7, 0]);
    const f = run('\x1b[7;8f').display;
    expect([f.state.cursorX, f.state.cursorY]).toEqual([7, 6]);
    const home = run('\x1b[5;20H\x1b[H').display;
    expect([home.state.cursorX, home.state.cursorY]).toEqual([0, 0]);
  });

  it('out-of-range positioning (80-col authored) clamps to 40x25', () => {
    const { display } = run('\x1b[30;70H');
    expect([display.state.cursorX, display.state.cursorY]).toEqual([39, 24]);
  });

  it('ESC[2J clears the screen and restores the cursor; ESC[2J ESC[H homes', () => {
    const { display } = run('\x1b[3;3Habc\x1b[2J');
    expect(cell(display, 2, 2)).toBe(0x20);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([5, 2]);
    const homed = run('abc\x1b[2J\x1b[H').display;
    expect([homed.state.cursorX, homed.state.cursorY]).toEqual([0, 0]);
  });

  it('ESC[K erases to end of row without moving the cursor; reverse is not painted into the blanks but survives for the next printable', () => {
    const { display } = run('\x1b[7mhello world\x1b[6D\x1b[K');
    expect(cell(display, 4, 0) & 0x80).toBe(0x80);
    for (let x = 5; x < 40; x++) expect(cell(display, x, 0)).toBe(0x20);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([5, 0]);
    expect(display.state.reverse).toBe(false);
    const next = run('\x1b[7mhello world\x1b[6D\x1b[KZ').display;
    expect(cell(next, 5, 0)).toBe(scUpper('Z') | 0x80);
  });

  it('ESC[1K and ESC[2K erase before / the whole row', () => {
    const one = run('abcdef\x1b[4D\x1b[1K').display;
    expect(cell(one, 0, 0)).toBe(0x20);
    expect(cell(one, 2, 0)).toBe(0x20);
    expect(cell(one, 3, 0)).toBe(scLower('d'));
    expect([one.state.cursorX, one.state.cursorY]).toEqual([2, 0]);
    const two = run('abcdef\x1b[2K').display;
    for (let x = 0; x < 40; x++) expect(cell(two, x, 0)).toBe(0x20);
    expect([two.state.cursorX, two.state.cursorY]).toEqual([6, 0]);
  });

  it('ESC[nX blanks n cells from the cursor without moving it', () => {
    const { display } = run('abcdef\x1b[6D\x1b[3X');
    expect(cell(display, 0, 0)).toBe(0x20);
    expect(cell(display, 2, 0)).toBe(0x20);
    expect(cell(display, 3, 0)).toBe(scLower('d'));
    expect([display.state.cursorX, display.state.cursorY]).toEqual([0, 0]);
  });

  it('ESC[K then CRLF lands on the very next row even though the fill linked it (the KERNAL RETURN trap)', () => {
    const { display } = run('abc\x1b[K\r\nN');
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(1);
  });

  it('ESC[J from the cursor erases to the end of screen but never the bottom-right cell', () => {
    const { display } = run('\x1b[25;40H\x1b[2;1Hxy\x1b[2;1H\x1b[J');
    expect(cell(display, 0, 1)).toBe(0x20);
    expect(cell(display, 1, 1)).toBe(0x20);
    expect(display.state.cursorY).toBe(1);
  });

  it('ESC[1J erases from the top of the screen through the cursor cell', () => {
    const { display } = run('\x1b[1;1Hrow0\x1b[2;1Hrow1\x1b[2;3H\x1b[1J');
    expect(cell(display, 0, 0)).toBe(0x20);
    expect(cell(display, 2, 1)).toBe(0x20);
    expect(cell(display, 3, 1)).toBe(0x31);   // the '1' of 'row1' survives
    expect([display.state.cursorX, display.state.cursorY]).toEqual([2, 1]);
  });

  it('the alternate screen (?1049h / ?47h) clears', () => {
    const { display } = run('abc\x1b[?1049h');
    expect(cell(display, 0, 0)).toBe(0x20);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([0, 0]);
    const alt = run('abc\x1b[?47l').display;
    expect(cell(alt, 0, 0)).toBe(0x20);
  });

  it('save/restore cursor (ESC[s ESC[u and ESC 7 ESC 8) returns to the saved cell', () => {
    const a = run('\x1b[4;6H\x1b[s\x1b[10;1Hx\x1b[uY').display;
    expect(cell(a, 5, 3)).toBe(scUpper('Y'));
    const b = run('\x1b[4;6H\x1b7\x1b[10;1Hx\x1b8Y').display;
    expect(cell(b, 5, 3)).toBe(scUpper('Y'));
  });

  it('OSC, DCS and private modes are swallowed; mouse-enable sequences never print', () => {
    expect(run('\x1b]9999;sfx;{"x":1}\x07a').out).toEqual([0x0E, 0x41]);
    expect(run('\x1b[?1000h\x1b[?25la').out).toEqual([0x0E, 0x41]);
  });

  it('box drawing renders as PETSCII line graphics identical in both charset banks', () => {
    const { display } = run('┌─┐\r\n│x│\r\n└─┘');
    expect(cell(display, 0, 0)).toBe(0x70); // top-left corner screen code
    expect(cell(display, 1, 0)).toBe(0x40); // horizontal
    expect(cell(display, 0, 1)).toBe(0x5D); // vertical
    expect(cell(display, 2, 2)).toBe(0x7D); // bottom-right corner
    expect(display.state.charsetBank).toBe(1);
  });

  it('a full block is a reverse space and reverse is restored afterwards', () => {
    const { display, out } = run('█a');
    expect(cell(display, 0, 0)).toBe(0xA0);
    expect(cell(display, 1, 0)).toBe(scLower('a'));
    expect(out).toContain(0x12);
    expect(out).toContain(0x92);
  });

  it('unsupported glyphs and ASCII without a PETSCII code are substituted, never dropped', () => {
    const { display } = run('é\\_|');
    expect(cell(display, 0, 0)).toBe(0x3F);       // e-acute -> ?
    expect(cell(display, 1, 0)).toBe(0x2F);       // backslash -> /
    expect(cell(display, 2, 0)).toBe(0x64);       // underscore -> lower eighth block
    expect(cell(display, 3, 0)).toBe(0x5D);       // pipe -> vertical bar
  });

  it('legacy PUA glyphs: reverse per glyph, bank per page', () => {
    expect(run(String.fromCodePoint(0xE081, 0xE001)).out).toEqual([0x12, 0x41, 0x92, 0x41]);
    expect(run(String.fromCodePoint(0xE141)).out[0]).toBe(0x0E);
    expect(run('\x1b[7m' + String.fromCodePoint(0xE001)).out).toEqual([0x12, 0x92, 0x41]);
  });
});

describe('AnsiToPetsciiTransducer CCGMS screen background ($02 <colour>)', () => {
  it('an ANSI background active at a full clear becomes the screen background: $93 then $02 <colour>', () => {
    const { t, out, display } = run('\x1b[44m\x1b[2J');
    // CLR, background/border := blue (VIC 6), then the pen re-asserted: a client
    // WITHOUT the CCGMS convention ($02 inert) would otherwise have taken $1F as a pen change.
    expect(out).toEqual([0x93, 0x02, 0x1F, 0x9A]);
    expect(t.machine.state.background).toBe(6);
    expect(t.machine.state.border).toBe(6);
    expect(display.state.background).toBe(6);
  });

  it('text after a coloured clear re-sends $02 <colour> after the $0E the bank switch emits', () => {
    const { out, display } = run('\x1b[44m\x1b[2Jhi');
    expect(out).toEqual([0x93, 0x02, 0x1F, 0x9A, 0x0E, 0x02, 0x1F, 0x9A, 0x48, 0x49]);
    expect(display.state.background).toBe(6);       // $0E blacked it, the re-send restored it
    expect(display.state.border).toBe(6);
    expect(display.state.charsetBank).toBe(1);
  });

  it('a clear with no ANSI background commits BLACK, and costs no bytes when the screen is already black', () => {
    const { out, display } = run('abc\x1b[2J');
    expect(out.filter((b) => b === 0x02)).toEqual([]);
    // $93 then the cursor walked back to column 3 (ANSI 2J does not home).
    expect(out.slice(out.indexOf(0x93))).toEqual([0x93, 0x1D, 0x1D, 0x1D]);
    expect(display.state.background).toBe(0);
  });

  it('a per-cell background without a clear sends no $02 (plan decision 5: per-cell bg is dropped)', () => {
    const { out, display } = run('\x1b[44mhi');
    expect(out).toEqual([0x0E, 0x48, 0x49]);
    expect(display.state.background).toBe(0);
  });

  it('the alternate screen carries the background too, and SGR 49 / SGR 0 clear it again', () => {
    expect(Array.from(run('\x1b[41m\x1b[?1049h').out)).toEqual([0x93, 0x02, 0x1C, 0x9A]);
    const t = new AnsiToPetsciiTransducer();
    t.transduce('\x1b[44m\x1b[2J');
    expect(t.machine.state.background).toBe(6);
    // SGR 49 IS the BBS asking for the terminal default, which on CCGMS is black:
    // the next clear must take the screen back to black, not strand the blue.
    expect(Array.from(t.transduce('\x1b[49m\x1b[2J'))).toEqual([0x93, 0x02, 0x90, 0x9A]);
    expect(t.machine.state.background).toBe(0);
    const t2 = new AnsiToPetsciiTransducer();
    expect(Array.from(t2.transduce('\x1b[44m\x1b[0m\x1b[2J'))).toEqual([0x05, 0x93]); // SGR 0 drops the bg (white pen); screen already black, no bytes
  });

  it('256-colour and truecolor backgrounds map through the same nearest-VIC path', () => {
    expect(Array.from(run('\x1b[48;5;2m\x1b[2J').out)).toEqual([0x93, 0x02, 0x1E, 0x9A]);       // xterm green -> VIC 5
    expect(Array.from(run('\x1b[48;2;46;44;155m\x1b[2J').out)).toEqual([0x93, 0x02, 0x1F, 0x9A]); // exact Colodore blue -> VIC 6
  });

  it('a later clear with no ANSI background takes the screen back to black instead of stranding it', () => {
    // The stranded-background bug: `screenBg = ansiBg` (null) left the oracle on
    // blue with no intent, so an arbitrary later $0E blacked the screen mid-art.
    const t = new AnsiToPetsciiTransducer();
    t.transduce('\x1b[44m\x1b[2Jhi');
    expect(t.machine.state.background).toBe(6);
    const out = Array.from(t.transduce('\x1b[0m\x1b[2J'));
    // white pen, CLR, bg := black, pen re-asserted, cursor walked back to column 2 (2J does not home)
    expect(out).toEqual([0x05, 0x93, 0x02, 0x90, 0x05, 0x1D, 0x1D]);
    expect(t.machine.state.background).toBe(0);
    expect(t.machine.state.border).toBe(0);
    // ...and nothing later can resurrect the blue.
    t.transduce('\x1b[8mx');
    expect(t.machine.state.background).toBe(0);
  });

  it('ESC c (RIS) blacks the screen background instead of restoring it on the next bank switch', () => {
    const t = new AnsiToPetsciiTransducer();
    t.transduce('\x1b[44m\x1b[2Jhi');
    const out = Array.from(t.transduce('\x1bca'));
    expect(out).toEqual([0x93, 0x02, 0x90, 0x9A, 0x41]); // CLR, bg := black, pen re-asserted, 'A'
    expect(t.machine.state.background).toBe(0);
    expect(t.machine.state.border).toBe(0);
  });

  it('reset() forgets the screen background', () => {
    const t = new AnsiToPetsciiTransducer();
    t.transduce('\x1b[44m\x1b[2J');
    t.reset();
    expect(t.machine.state.background).toBe(0);
    expect(Array.from(t.transduce('hi'))).toEqual([0x0E, 0x48, 0x49]);
  });
});

describe('AnsiToPetsciiTransducer deferred wrap (xterm pending-wrap parity)', () => {
  it('exactly 40 printable columns then CRLF lands the next line on row 1, not row 2', () => {
    const { t, out, display } = run('a'.repeat(40) + '\r\nN');
    expect(out.filter((b) => b === 0x0D)).toHaveLength(0);   // the wrap already moved the cursor; no RETURN
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(cell(display, 0, 2)).toBe(0x20);                  // row 2 stays untouched (no eaten blank row)
    expect([display.state.cursorX, display.state.cursorY]).toEqual([1, 1]);
    expect([t.machine.state.cursorX, t.machine.state.cursorY]).toEqual([1, 1]);
  });

  it('80 printable columns then CRLF lands on row 2', () => {
    const { display } = run('a'.repeat(80) + '\r\nN');
    expect(cell(display, 0, 2)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(2);
  });

  it('39 printable columns then CRLF still takes the ordinary RETURN path to row 1', () => {
    const { out, display } = run('a'.repeat(39) + '\r\nN');
    expect(out).toContain(0x0D);
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(display.state.cursorY).toBe(1);
  });

  it('a RELATIVE cursor move after the 40th column runs from the column ANSI holds, not the row the KERNAL crossed to', () => {
    // CUF from a pending wrap: an ANSI terminal is on (39,0) and clamps to
    // (39,0); the CRLF then puts the next line on row 1. This used to assert
    // row 2, which was the KERNAL's already-crossed (0,1) leaking into a
    // RELATIVE move - the same deferred-wrap defect class as the bottom-right
    // scroll, and a divergence from `petscii/frame/ansi-screen.ts`, which
    // `blessed-repaint.test.ts` now pins cell-for-cell.
    const { display } = run('a'.repeat(40) + '\x1b[5C\r\nN');
    expect(cell(display, 0, 1)).toBe(scUpper('N'));
    expect(cell(display, 0, 2)).toBe(0x20);
    expect([display.state.cursorX, display.state.cursorY]).toEqual([1, 1]);
  });
});

describe('AnsiToPetsciiTransducer malformed string sequences never stall the stream', () => {
  it('a well-formed OSC (BEL or ST terminated) is still consumed silently', () => {
    expect(run('\x1b]0;title\x07a').out).toEqual([0x0E, 0x41]);
    expect(run('\x1b]0;title\x1b\\a').out).toEqual([0x0E, 0x41]);
  });

  it('an unterminated OSC broken by a newline is dropped and the text after the newline is emitted', () => {
    const { display } = run('\x1b]0;no terminator\r\nOK');
    expect(cell(display, 0, 1)).toBe(scUpper('O'));
    expect(cell(display, 1, 1)).toBe(scUpper('K'));
  });

  it('a runaway OSC past the 256-byte cap is dropped instead of being held for ever', () => {
    const t = new AnsiToPetsciiTransducer();
    expect(Array.from(t.transduce('\x1b]' + 'p'.repeat(300)))).toEqual([]);
    expect(Array.from(t.transduce('OK'))).toEqual([0x0E, 0xCF, 0xCB]);
  });

  it('an unterminated OSC under the cap is still held across chunks and completed later', () => {
    const t = new AnsiToPetsciiTransducer();
    expect(Array.from(t.transduce('\x1b]0;ti'))).toEqual([]);
    expect(Array.from(t.transduce('tle\x07a'))).toEqual([0x0E, 0x41]);
  });
});

describe('AnsiToPetsciiTransducer SGR extended color parsing', () => {
  it('a truncated truecolor SGR does not re-parse its own parameters as SGR codes', () => {
    const short2 = run('\x1b[31m\x1b[38;2;255;0mR').display;
    expect(color(short2, 0, 0)).toBe(2);   // still red; the trailing 0 is a truecolor parameter, not a reset
    const short5 = run('\x1b[31m\x1b[38;5mR').display;
    expect(color(short5, 0, 0)).toBe(2);
  });

  it('xterm256ToRgb resolves indices 0-15 through the caller palette', () => {
    expect(xterm256ToRgb(1)).toEqual([0x81, 0x33, 0x38]);                      // Colodore red (default)
    expect(xterm256ToRgb(1, C64_PALETTE_PEPTO)).toEqual([0x68, 0x37, 0x2B]);   // Pepto red
    expect(xterm256ToRgb(196)).toEqual([255, 0, 0]);                           // 6x6x6 cube, palette-independent
  });

  it('the transducer resolves 256-color indices 0-15 through its own palette, not a hardcoded Colodore', () => {
    const weird = C64_PALETTE_COLODORE.map((c, i) => (i === 2 ? '#00FF00' : c));
    const t = new AnsiToPetsciiTransducer({ palette: weird });
    const display = new PetsciiMachine();
    display.feed(t.transduce('\x1b[38;5;1mR'));
    expect(color(display, 0, 0)).toBe(2);
  });
});
