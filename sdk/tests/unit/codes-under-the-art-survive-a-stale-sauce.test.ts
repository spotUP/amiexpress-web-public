/**
 * A SCREEN IS ART PLUS THE CODES BELOW IT, and SAUCE describes only the art.
 *
 * "i only see the tag above the logo not the ones under it" (sysop,
 * 2026-09-18). `Conf2/bull20.txt` on the live board is 3542 bytes; its SAUCE
 * record says fileSize 3378, because that is the drawing the artist saved.
 * The 35 bytes between are the board's own program - `~SP`, `~f`, `~CC_ctop`,
 * `~XISUBSCAN` - appended by the MCI carry, which does not restamp a record it
 * did not write.
 *
 * `loadANSFile` cut the file at fileSize, so the editor showed one code (the
 * `~f` above the logo) and not the four beneath it. Worse than showing: the
 * canvas is what a save writes back, so opening the screen and saving it
 * deleted them.
 *
 * The board's own reader cuts at the SAUCE MARKER and nothing else
 * (`web/backend/src/utils/amiga-text-decode.util.ts`), which is what a caller
 * is served. The editor reads the same bytes now.
 */
import { loadANSFile, saveANSFile } from '../../engines/ui/ansi-editor/core/file-ops';
import type { Cell } from '../../engines/ui/ansi-editor/types';

/** The shape of a board screen: a code, art, the codes the board runs, EOF, SAUCE. */
function screenWithStaleSauce(): Uint8Array {
  const art = '~f\r\nTHE LOGO\r\n';
  const codes = '~SP\r\n~f\r\n~CC_ctop\r\n~XISUBSCAN\r\n';
  const content = new TextEncoder().encode(art + codes);

  const sauce = new Uint8Array(128);
  sauce.set(new TextEncoder().encode('SAUCE00'), 0);
  // fileSize: the DRAWING only, which is what an art program stamps.
  new DataView(sauce.buffer).setUint32(90, art.length, true);
  new DataView(sauce.buffer).setUint16(96, 80, true);   // tInfo1: width
  new DataView(sauce.buffer).setUint16(98, 2, true);    // tInfo2: the art's rows

  const file = new Uint8Array(content.length + 1 + sauce.length);
  file.set(content, 0);
  file[content.length] = 0x1a;
  file.set(sauce, content.length + 1);
  return file;
}

const textOf = (canvas: Cell[][]): string[] =>
  canvas.map(row => row.map(cell => cell.char ?? ' ').join('').trimEnd());

describe('a screen is the art AND the codes under it', () => {
  it('reads the lines below the drawing, which SAUCE does not count', async () => {
    const { canvas } = await loadANSFile(screenWithStaleSauce());
    const lines = textOf(canvas);

    expect(lines[0]).toBe('~f');
    expect(lines[1]).toBe('THE LOGO');
    expect(lines.slice(2, 6)).toEqual(['~SP', '~f', '~CC_ctop', '~XISUBSCAN']);
  });

  it('saving what it read keeps every code - the canvas IS what a save writes', async () => {
    const { canvas } = await loadANSFile(screenWithStaleSauce());
    const written = new TextDecoder('latin1').decode(saveANSFile(canvas));

    for (const code of ['~f', '~SP', '~CC_ctop', '~XISUBSCAN']) {
      expect(written).toContain(code);
    }
  });

  it('still strips the record itself, and the EOF marker in front of it', async () => {
    const { canvas } = await loadANSFile(screenWithStaleSauce());
    const lines = textOf(canvas);

    expect(lines.join('\n')).not.toContain('SAUCE00');
    expect(lines.join('\n')).not.toContain('\x1a');
  });
});
