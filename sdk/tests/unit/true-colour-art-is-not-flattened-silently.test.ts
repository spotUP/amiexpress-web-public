/**
 * 24-BIT ART IS RECOGNISED, BECAUSE SAVING IT HERE WOULD FLATTEN IT.
 *
 * PabloDraw and Moebius write true colour as `ESC[0;r;g;bt` (foreground) and
 * `ESC[1;r;g;bt` (background). A `Cell` in this editor holds a 0-15 palette
 * index and has nowhere to put an RGB triple, so the parser consumes those
 * sequences and the codec cannot write them back.
 *
 * That is survivable for LOOKING at a screen and fatal for saving one.
 * Measured on the sysop's own `h7-up_rough_doors.asc` (2026-09-16): 337
 * sequences in, zero out of a load-and-save round trip, 6,838 bytes down to
 * 2,459 - an artist's drawing flattened to sixteen colours with nothing said.
 *
 * `countTrueColourCodes` is what a host asks BEFORE opening an editor on a
 * file, so it can refuse and say why. These cases pin the count it reports and
 * the loss it is there to prevent.
 */
import { loadANSFile, saveANSFile, countTrueColourCodes } from '../../engines/ui/ansi-editor/core/file-ops';

const bytesOf = (text: string) => new Uint8Array(Array.from(text, c => c.charCodeAt(0)));

/** Two rows, the second drawn in 24-bit colour the way PabloDraw writes it. */
const TRUE_COLOUR = bytesOf(
  'plain row\r\n'
  + '\x1b[0;255;128;0tORANGE\x1b[1;0;0;128tON BLUE\r\n',
);

describe('spotting 24-bit colour in a file', () => {
  it('counts both the foreground and the background form', () => {
    expect(countTrueColourCodes(TRUE_COLOUR)).toBe(2);
  });

  it('finds none in ordinary sixteen-colour art', () => {
    const plain = bytesOf('\x1b[0;40;37mplain\r\n\x1b[1;33mbright\r\n');
    expect(countTrueColourCodes(plain)).toBe(0);
  });

  it('is not fooled by other sequences that end in a letter', () => {
    // `t` is the final byte; `m`, `H` and `C` are not it.
    const moves = bytesOf('\x1b[10C\x1b[2;3H\x1b[0m\x1b[K');
    expect(countTrueColourCodes(moves)).toBe(0);
  });

  it('counts a sequence with no parameters at all', () => {
    expect(countTrueColourCodes(bytesOf('\x1b[t'))).toBe(1);
  });

  it('does not run off the end of a truncated sequence', () => {
    expect(() => countTrueColourCodes(bytesOf('\x1b[0;255;128'))).not.toThrow();
    expect(countTrueColourCodes(bytesOf('\x1b[0;255;128'))).toBe(0);
  });
});

describe('why the count is worth asking for', () => {
  it('a load-and-save round trip really does drop the colour', async () => {
    // The loss this guard exists to prevent, proved rather than asserted.
    const { canvas } = await loadANSFile(TRUE_COLOUR);
    const round = saveANSFile(canvas);

    expect(countTrueColourCodes(TRUE_COLOUR)).toBe(2);
    expect(countTrueColourCodes(round)).toBe(0);
  });

  it('but the text survives, which is why the screen still looks drawn', async () => {
    const { canvas } = await loadANSFile(TRUE_COLOUR);
    const text = canvas.map(row => row.map(c => c.char ?? ' ').join('')).join('\n');

    expect(text).toContain('ORANGE');
    expect(text).toContain('ON BLUE');
  });
});
