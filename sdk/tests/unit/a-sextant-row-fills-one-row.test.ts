/**
 * A 40-cell teletext row is one row on a 40-column screen.
 *
 * Teletext art in the MAG door draws with sextant glyphs (U+1FB00..), which
 * sit outside the BMP: two UTF-16 units each. The blessed engine measured
 * width with `.length`, so a 40-cell row measured 45, wrapped, and left a
 * phantom blank row that pushed every later row down; the renderer also put
 * each surrogate half in a cell of its own (2026-10-19). The rule is one
 * terminal cell per code point, in the width helper, the wrapper and the
 * screen buffer alike.
 */

import { describe, it, expect } from '@jest/globals';
import { Screen } from '../../engines/ui/blessed/core/screen';
import { Box } from '../../engines/ui/blessed/widgets/box';
import { textWidth } from '../../engines/ui/blessed/core/colors';
import { wrapAnsiText } from '../../engines/ui/blessed/core/wrap-text';

const SEXTANTS = '\u{1FB00}\u{1FB0F}\u{1FB3B}\u{1FB1E}';
// 40 cells: 10 sextants, 20 ASCII, 10 more sextants, in colour.
const ROW = '\x1b[33m' + SEXTANTS.repeat(2) + '\u{1FB00}\u{1FB01}'
  + 'x'.repeat(20) + SEXTANTS.repeat(2) + '\u{1FB02}\u{1FB03}\x1b[0m';
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function paint(content: string): string[] {
  const screen: any = new Screen({ title: 'sextants', width: 40, height: 5, responsive: true } as any);
  new Box({ parent: screen, top: 0, left: 0, width: 40, height: 5, content } as any);
  screen.render();
  const rows = screen.buffer.slice(0, 5).map((row: any[]) => row.map((cell: any) => cell[1]));
  screen.destroy();
  return rows.map((cells: string[]) => cells.join(''));
}

describe('a sextant row on a 40-column screen', () => {
  it('measures 40 cells', () => {
    expect(textWidth(ROW)).toBe(40);
  });

  it('renders as exactly one row, with the next line right under it', () => {
    const rows = paint(ROW + '\nnext');
    expect([...rows[0]]).toHaveLength(40);
    expect(rows[0].startsWith(SEXTANTS)).toBe(true);
    expect(rows[1].startsWith('next')).toBe(true);
    expect(rows.some((r) => LONE_SURROGATE.test(r))).toBe(false);
  });

  it('wraps a wider row between glyphs, never between surrogate halves', () => {
    const lines = wrapAnsiText('\u{1FB00}'.repeat(45), 40, textWidth);
    expect(lines.map(textWidth)).toEqual([40, 5]);
    expect(lines.some((l) => LONE_SURROGATE.test(l))).toBe(false);
  });
});
