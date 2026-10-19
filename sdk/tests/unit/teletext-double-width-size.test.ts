/**
 * Levels plan D1 + D2: double width (0x0E), double size (0x0F) and separated
 * mosaics, ETSI EN 300 706 s.12.2 Table 26 and Annex C.3.
 *
 * State machine: the left cell keeps its character, the cell on its right is
 * its right half (own content ignored, own bytes kept for the ANSI fallback),
 * a wide character in column 39 reduces to single width, Normal Size ends it.
 * Reachability: renderSubpageLines in teletext mode writes the font contract's
 * private-use halves / quarters and U+1CE51-1CE8F; in ANSI mode the bytes stay
 * normal width and contiguous.
 */
import { processRow, processPage } from '../../teletext/marco/state-machine/state-machine';
import { renderSubpageLines } from '../../teletext/render-session';
import { createEmptySubpage, controlToken, charToken, fillToken } from '../../teletext/marco/model/factories';
import type { TeletextSubpage, TeletextToken } from '../../teletext/marco/model/types';

const NORMAL_SIZE = 0x0c;
const DOUBLE_WIDTH = 0x0e;
const DOUBLE_SIZE = 0x0f;
const MOSAIC_WHITE = 0x17;
const SEPARATED = 0x1a;

function line(bytes: number[]): number[] {
  const out = new Array(40).fill(0x20);
  bytes.forEach((b, i) => (out[i] = b));
  return out;
}
const codes = (s: string) => Array.from(s).map(c => c.charCodeAt(0));

describe('double width in the state machine', () => {
  it('is set-after: the code cell is single, the next cell is the left half, then its right half', () => {
    const cells = processRow(line([DOUBLE_WIDTH, ...codes('AB')]));
    expect(cells[0].width).toBe('single');
    expect(cells[1]).toMatchObject({ char: 0x41, width: 'double-left' });
    expect(cells[2]).toMatchObject({ char: 0x42, width: 'double-right', fgColor: cells[1].fgColor });
  });

  it('pairs cells two by two across a run, and Normal Size (set-at) ends it', () => {
    const cells = processRow(line([DOUBLE_WIDTH, ...codes('ABCD'), NORMAL_SIZE, ...codes('E')]));
    expect(cells.slice(1, 5).map(c => c.width)).toEqual(['double-left', 'double-right', 'double-left', 'double-right']);
    expect(cells[5].width).toBe('single'); // the Normal Size cell itself
    expect(cells[6].width).toBe('single');
  });

  it('takes the right half colour and background from the left cell', () => {
    const cells = processRow(line([DOUBLE_WIDTH, 0x01, ...codes('A'), 0x02, ...codes('B')]));
    // col1 is the red code cell (left), col2 its right half; col3 'A' is now fresh.
    expect(cells[1].width).toBe('double-left');
    expect(cells[2]).toMatchObject({ width: 'double-right', fgColor: cells[1].fgColor });
  });

  it('reduces a wide character in column 39 to single width', () => {
    const row = line([]);
    row[38] = DOUBLE_WIDTH;
    row[39] = 0x41;
    expect(processRow(row)[39].width).toBe('single');
  });

  it('double size is wide and tall; its lower row repeats the width', () => {
    const grid = processPage([line([DOUBLE_SIZE, ...codes('HI')]), line([]), ...Array.from({ length: 22 }, () => line([]))]);
    expect(grid[0][1]).toMatchObject({ doubleHeight: true, width: 'double-left' });
    expect(grid[0][2]).toMatchObject({ doubleHeight: true, width: 'double-right' });
    expect(grid[1][1]).toMatchObject({ doubleHeightBottom: true, width: 'double-left' });
  });

  it('reduces double size on row 23 to double width (Annex C.3)', () => {
    const rows = Array.from({ length: 24 }, () => line([]));
    rows[23] = line([DOUBLE_SIZE, ...codes('HI')]);
    const cell = processPage(rows)[23][1];
    expect(cell).toMatchObject({ doubleHeight: false, width: 'double-left' });
  });
});

function pageWith(rows: Record<number, TeletextToken[]>): TeletextSubpage {
  const subpage = createEmptySubpage(0);
  for (const [index, tokens] of Object.entries(rows)) {
    const at = Number(index);
    subpage.rows[at] = { index: at, tokens: [...tokens, fillToken(40)] };
  }
  return subpage;
}
const text = (s: string): TeletextToken[] => Array.from(s).map(ch => charToken(ch.charCodeAt(0)));
const plain = (l: string) => l.replace(/\x1b\[[0-9;]*m/g, '').replace(/^\x1b#[0-9]/, '');
const cps = (l: string) => Array.from(plain(l)).map(c => c.codePointAt(0)!);

describe('D1 + D2 reach the caller through renderSubpageLines', () => {
  const subpage = pageWith({
    3: [controlToken(DOUBLE_WIDTH), ...text('AB')],
    5: [controlToken(DOUBLE_SIZE), ...text('H')],
    8: [controlToken(MOSAIC_WHITE), controlToken(SEPARATED), charToken(0x23)],
  });

  it('teletext mode: halves, quarters and the separated sextant', () => {
    const lines = renderSubpageLines(subpage, { mode: 'teletext' });
    // 'A' = 0x41 -> index 0x21; wide: left E500+, right E600+ of the SAME character (B ignored).
    expect(cps(lines[3]).slice(1, 3)).toEqual([0xe500 + 0x21, 0xe600 + 0x21]);
    // 'H' = 0x48 -> index 0x28; top row TL/TR, bottom row BL/BR.
    expect(cps(lines[5]).slice(1, 3)).toEqual([0xe800 + 0x28, 0xe900 + 0x28]);
    expect(cps(lines[6]).slice(1, 3)).toEqual([0xea00 + 0x28, 0xeb00 + 0x28]);
    // 0x23 = pattern 3, separated: U+1CE50 + 3.
    expect(cps(lines[8])[2]).toBe(0x1ce53);
  });

  it('ANSI mode: no private-use glyphs, no separated sextants, the page text intact', () => {
    const lines = renderSubpageLines(subpage, { mode: 'ansi', mosaicStyle: 'sextant' });
    const all = lines.map(cps).flat();
    expect(all.some(c => c >= 0xe000 && c <= 0xf8ff)).toBe(false);
    expect(all.some(c => c >= 0x1ce51 && c <= 0x1ce8f)).toBe(false);
    expect(String.fromCodePoint(...cps(lines[3]).slice(0, 4))).toBe(' AB ');
    expect(cps(lines[8])[2]).toBe(0x1fb02); // pattern 3, contiguous
  });
});
