import { createCanvas, parseANSIToCanvas } from '../../engines/ui/ansi-editor/core/canvas';
import { renderNativeTti } from '../../teletext/render-native';

describe('parseANSIToCanvas on a full-width row', () => {
  it('lays a rendered teletext page out one row per line, one cell per sextant', () => {
    // Row 1: a full 40-column text row. Row 2: graphics mode, then a solid
    // mosaic (0x7f), which renders as an astral-plane sextant or a block.
    const tti = `PN,10000\nOL,1,${'A'.repeat(40)}\nOL,2,\x97\x7f\x7fZ\n`;
    const rendered = renderNativeTti(tti);
    expect(rendered).not.toBeNull();
    const canvas = createCanvas(40, 24);
    parseANSIToCanvas(canvas, rendered!.ansi);

    // Deferred wrap: the full row and its newline cost one row, not two.
    expect(canvas[1].map((cell) => cell.char).join('')).toBe('A'.repeat(40));
    // Code points: the two mosaics are two cells, and Z lands in column 3.
    expect(canvas[2][3].char).toBe('Z');
    expect(Array.from(canvas[2][1].char)).toHaveLength(1);
  });

  it('still wraps a long line onto the next row when text follows', () => {
    const canvas = createCanvas(4, 3);
    parseANSIToCanvas(canvas, 'ABCDEF');
    expect(canvas[0].map((cell) => cell.char).join('')).toBe('ABCD');
    expect(canvas[1][0].char).toBe('E');
  });
});
