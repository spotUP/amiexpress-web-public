/**
 * P0 L4: the cell grid carries row 24 (EN 300 706 s.9.3.1) when the page has
 * it, a Level 1 page still renders 24 rows, and the new Cell fields default
 * to Level 1 values so existing output does not move.
 */
import { importTti } from '../../teletext/marco/tti/index';
import { renderSubpageLines, subpageToGrid } from '../../teletext/render-session';

const ESC = '\x1b';
const DOUBLE_HEIGHT = `${ESC}M`; // MRG escape form of 0x0D
const DH_BOTTOM = `${ESC}#4`;

function subpageOf(lines: string[]) {
  return importTti(['PN,10000', 'SC,0000', 'PS,8000', ...lines].join('\n')).pages[0].subpages[0];
}

function plain(line: string): string {
  return line.replace(/\x1b#[34]/g, '').replace(/\x1b\[[0-9;]*m/g, '');
}

describe('row 24 in the page grid', () => {
  it('renders 25 lines when the page carries OL,24', () => {
    const lines = renderSubpageLines(subpageOf(['OL,1,TOP', 'OL,24,FASTEXT ROW']), { mode: 'teletext' });
    expect(lines).toHaveLength(25);
    expect(plain(lines[24]).trimEnd()).toBe('FASTEXT ROW');
  });

  it('renders 24 lines for a Level 1 page without row 24', () => {
    expect(renderSubpageLines(subpageOf(['OL,1,TOP']), { mode: 'teletext' })).toHaveLength(24);
  });

  it('never makes row 24 the lower half of a double-height row 23', () => {
    const lines = renderSubpageLines(subpageOf([`OL,23,${DOUBLE_HEIGHT}TALL`, 'OL,24,OWN TEXT']), { mode: 'teletext' });
    expect(lines[24].startsWith(DH_BOTTOM)).toBe(false);
    expect(plain(lines[24]).trimEnd()).toBe('OWN TEXT');
  });

  it('fills the Level 2.5 cell fields with Level 1 defaults', () => {
    const grid = subpageToGrid(subpageOf(['OL,1,\x1bAred']));
    const cell = grid[1][2];
    expect(cell).toMatchObject({ fgColor: 1, bgColor: 0, width: 'single', charset: 'G0', underline: false, invert: false, box: false });
    for (const row of grid) for (const c of row) {
      expect(c.fgColor).toBeLessThan(8);
      expect(c.bgColor).toBeLessThan(8);
    }
  });
});
