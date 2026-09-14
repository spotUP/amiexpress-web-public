/**
 * `ESC[1;33m` is BRIGHT YELLOW. It was coming in brown.
 *
 * An artist compared a drawing in Moebius against the same file in this
 * board's editor and every colour in ours was the dim twin of the real one
 * (2026-09-14): bright yellow as brown, bright green as dark green, bright
 * cyan as teal. Not the palette - that table is right - but the parser.
 *
 * Both of the SDK's ANSI readers walked the parameters in order and applied
 * `1` as "add 8 to whatever colour is current". In `ESC[1;33m` that
 * brightens the PREVIOUS colour and then 33 overwrites it with plain brown.
 * Bold is an attribute, not an operation: it applies to the colour named
 * beside it, before or after, and it persists until a reset or `22`.
 *
 * That spelling is not an edge case. It is how ANSI art has been written
 * since the 80s - Moebius, PabloDraw, TheDraw and ACiDDraw all emit
 * `ESC[1;3Xm` - so this was every bright colour in every drawing the board
 * has ever imported.
 */

import { loadANSFile } from '../../engines/ui/ansi-editor/core/file-ops';
import * as Canvas from '../../engines/ui/ansi-editor/core/canvas';

/** A drawing, written the way an art program writes one. */
function ansi(text: string): Uint8Array {
  return new Uint8Array(Buffer.from(text, 'binary'));
}

/** The cell a drawing put at (x, y). */
async function cellAt(text: string, x: number, y: number): Promise<any> {
  const { canvas } = await loadANSFile(ansi(text));
  return canvas[y][x];
}

describe('bold brightens the colour beside it', () => {
  it('reads ESC[1;33m as bright yellow, not brown', async () => {
    expect((await cellAt('\x1b[1;33mX', 0, 0)).fg).toBe(11);
  });

  it('reads the other order too, ESC[33;1m', async () => {
    expect((await cellAt('\x1b[33;1mX', 0, 0)).fg).toBe(11);
  });

  it('keeps bold across a later colour change, the way a terminal does', async () => {
    // One bold, then three colours: every one of them is the bright shade.
    const art = '\x1b[1m\x1b[32mA\x1b[36mB\x1b[35mC';
    expect((await cellAt(art, 0, 0)).fg).toBe(10); // bright green
    expect((await cellAt(art, 1, 0)).fg).toBe(14); // bright cyan
    expect((await cellAt(art, 2, 0)).fg).toBe(13); // bright magenta
  });

  it('lets a reset put the dim colours back', async () => {
    const art = '\x1b[1;33mA\x1b[0m\x1b[33mB';
    expect((await cellAt(art, 0, 0)).fg).toBe(11);
    expect((await cellAt(art, 1, 0)).fg).toBe(3);
  });

  it('lets ESC[22m put them back without dropping the colour', async () => {
    const art = '\x1b[1;36mA\x1b[22mB';
    expect((await cellAt(art, 0, 0)).fg).toBe(14);
    expect((await cellAt(art, 1, 0)).fg).toBe(6);
  });

  it('still reads a plain dim colour as dim', async () => {
    expect((await cellAt('\x1b[33mX', 0, 0)).fg).toBe(3);
  });

  it('still reads an outright bright colour, ESC[93m', async () => {
    expect((await cellAt('\x1b[93mX', 0, 0)).fg).toBe(11);
  });
});

/**
 * The second reader - the one that draws a fragment onto an existing canvas -
 * had the same loop and the same fault.
 */
describe('the canvas reader agrees with the file reader', () => {
  it('draws ESC[1;33m bright', () => {
    const canvas = Canvas.createCanvas(10, 2);
    Canvas.parseANSIToCanvas(canvas, '\x1b[1;33mX', 0, 0);
    expect(canvas[0][0].fg).toBe(11);
  });

  it('keeps bold across a colour change', () => {
    const canvas = Canvas.createCanvas(10, 2);
    Canvas.parseANSIToCanvas(canvas, '\x1b[1m\x1b[32mA\x1b[36mB', 0, 0);
    expect(canvas[0][0].fg).toBe(10);
    expect(canvas[0][1].fg).toBe(14);
  });
});
