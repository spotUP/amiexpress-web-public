/**
 * "THERE IS NO MENU BAR ... THE TEXTS ARE BLACK WHEN NOT HOVERED."
 *
 * The sysop, 2026-09-23, on LIVE CHAT at forty columns. The SDK menu bar is
 * drawn the way the sysop asked for it on an ANSI screen - "the menu bg color
 * should be the primary theme color and the texts and slashes black"
 * (2026-09-03) - so every label is black ink on a coloured cell.
 *
 * A C64 has no per-cell background. The transducer dropped the ANSI one
 * ("per-cell background has no C64 equivalent and is dropped"), which left
 * black ink on the black screen: the bar was not dim, it was ABSENT. Hovering
 * swapped the two colours, so the hovered menu appeared - which is exactly the
 * report.
 *
 * A C64 fills a cell with REVERSE VIDEO: reverse on, pen set to the fill
 * colour, and the glyph is drawn in the screen background. That is the one
 * fill the machine has, and it is what the board's own rules already name
 * (`.claude/skills/door-three-screens`: "Reverse video is the only way to fill
 * a cell"). So an ANSI background that differs from the committed screen
 * background is not dropped any more - it is that fill.
 *
 * Nothing changes for a stream that never asks for a background, which is
 * most of the board: the last test here pins that.
 */
import { AnsiToPetsciiTransducer } from '../../petscii/ansi-to-petscii';
import { PetsciiMachine } from '../../petscii/petscii-machine';

/** Run text through a fresh transducer and replay its output into a display machine. */
function run(text: string) {
  const t = new AnsiToPetsciiTransducer();
  const out = Array.from(t.transduce(text));
  const display = new PetsciiMachine();
  display.feed(out);
  return { t, out, display };
}
const cell = (m: PetsciiMachine, x: number, y: number) => m.state.screen[y * 40 + x];
const color = (m: PetsciiMachine, x: number, y: number) => m.state.colorRam[y * 40 + x];
const scUpper = (ch: string) => 0x41 + (ch.charCodeAt(0) - 0x41);

const RED = 2;
const BLUE = 6;
const reversed = (code: number) => (code & 0x80) !== 0;

describe('a bar of dark ink on a coloured bar', () => {
  it('is drawn as a filled cell when the ink would be invisible', () => {
    const { display } = run('\x1b[30;41mM\x1b[0m');
    expect(reversed(cell(display, 0, 0))).toBe(true);
    expect(color(display, 0, 0)).toBe(RED);
    expect(cell(display, 0, 0) & 0x7f).toBe(scUpper('M'));
  });

  it('gives the cells after it back to the caller\'s own pen', () => {
    const { display } = run('\x1b[30;41mM\x1b[0m\x1b[31mX');
    expect(reversed(cell(display, 0, 0))).toBe(true);
    expect(reversed(cell(display, 1, 0))).toBe(false);
    expect(color(display, 1, 0)).toBe(RED);
  });

  it('leaves a background alone when the text on it can be seen', () => {
    // White on blue: a C64 has ONE colour per cell, so one of the two goes.
    // The caller's TEXT is the half worth keeping - and the board kept it for
    // years. Only ink that would be invisible is worth a fill.
    const { display } = run('\x1b[44mM');
    expect(reversed(cell(display, 0, 0))).toBe(false);
    expect(color(display, 0, 0)).not.toBe(BLUE);
  });

  it('still honours reverse video the stream asked for itself', () => {
    const { display } = run('\x1b[7m\x1b[44mM');
    expect(reversed(cell(display, 0, 0))).toBe(true);
  });

  it('leaves an ERASE plain: a fill is something a door prints, not something it clears', () => {
    // The repo's reference terminal blanks with default cells, the adapter's
    // rule ladder reads that model, and a FULL clear commits its colour as the
    // screen background through `$02` instead. See fillRow().
    const { display } = run('\x1b[41m\x1b[K');
    expect(reversed(cell(display, 5, 0))).toBe(false);
  });

  it('leaves a stream that asks for no background byte-for-byte alone', () => {
    const plain = '\x1b[1;32mWelcome\x1b[0m back\r\n\x1b[7mREV\x1b[27m plain';
    const t = new AnsiToPetsciiTransducer();
    expect(Array.from(t.transduce(plain))).toEqual([
      0x99, 0x0E, 0xD7, 0x45, 0x4C, 0x43, 0x4F, 0x4D, 0x45, 0x05, 0x20,
      0x42, 0x41, 0x43, 0x4B, 0x0D, 0x12, 0xD2, 0xC5, 0xD6, 0x92, 0x20,
      0x50, 0x4C, 0x41, 0x49, 0x4E,
    ]);
  });

  it('does not fill when the background is the one the screen already has', () => {
    const t = new AnsiToPetsciiTransducer();
    const display = new PetsciiMachine();
    display.feed(t.transduce('\x1b[40m\x1b[2J'));
    display.feed(t.transduce('\x1b[40mM'));
    expect(reversed(display.state.screen[0])).toBe(false);
  });
});
