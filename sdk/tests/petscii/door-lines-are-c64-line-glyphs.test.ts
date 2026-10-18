/**
 * "THE PETSCII MENU DOESNT USE PROPER PETSCII CHARS THOUGH FOR BORDERS AND
 * STUFF IT TRIES TO LOOK LIKE ASCII."
 *
 * The sysop, 2026-10-18, on the C64 menu. The C doors drew every box and rule
 * in '+', '-' and '|', because a classic Amiga board has nothing better. A C64
 * has real line glyphs, and the web board tells a door its caller is one
 * (AE_CLIENT=petscii). The door then draws its lines in DEC special graphics -
 * ESC ( 0, the letters l k m j q x t u w v n, ESC ( B - the one line-drawing
 * vocabulary every ANSI terminal already speaks. The transducer turns those
 * letters into the C64's own glyphs, and the frame reconstructor (the ANSI
 * side of the same screen) reads them the same way.
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { FrameReconstructor } from '../../petscii/frame/ansi-screen';

const bytes = (text: string) => Array.from(new AnsiToPetsciiTransducer().transduce(text));
/** The byte one plain character prints as (a fresh transducer first selects the board's lowercase bank). */
const letter = (ch: string) => bytes(ch).slice(-1)[0];

describe('a door line drawn in DEC special graphics is a C64 line glyph', () => {
  it('a box in the line set is the C64 corners, edges and tees', () => {
    const out = bytes('\x1b(0lqk\r\nx x\r\ntqu\r\nmqj\x1b(B');
    for (const b of [0xb0, 0xc0, 0xae, 0xdd, 0xab, 0xb3, 0xad, 0xbd]) expect(out).toContain(b);
    /* none of the letters leaked through as letters */
    for (const ch of 'lkmjqxtu') expect(out).not.toContain(letter(ch));
  });

  it('ESC ( B ends the line set: the same letters are letters again', () => {
    const out = bytes('\x1b(0q\x1b(Bq');
    expect(out).toContain(0xc0);
    expect(out[out.length - 1]).toBe(letter('q'));
  });

  it('a stream that never selects the line set keeps its letters', () => {
    expect(bytes('lqk').slice(-3)).toEqual([letter('l'), letter('q'), letter('k')]);
  });

  it('the frame reconstructor reads the same letters as box glyphs', () => {
    const ref = new FrameReconstructor({ cols: 40, rows: 25 });
    ref.write('\x1b(0lqk\x1b(Bq');
    const row = ref.snapshot().cells[0].slice(0, 4).map((c) => c.ch).join('');
    expect(row).toBe('┌─┐q');
  });
});
