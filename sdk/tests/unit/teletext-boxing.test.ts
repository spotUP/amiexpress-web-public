/**
 * P1 D4: Start Box (0/B) and End Box (0/A) on a Newsflash (C5) or Subtitle
 * (C6) page. EN 300 706 0/B: "Characters outside this area are not
 * displayed". On a BBS there is no video picture, so the outside is black.
 * A normal page is unchanged (E.13: the codes have no effect without C5/C6).
 */
import { importTti } from '../../teletext/marco/tti/index';
import { renderSubpageLines, subpageToGrid } from '../../teletext/render-session';

const ESC = '\x1b';
const START_BOX = `${ESC}K`; // 0x0B
const END_BOX = `${ESC}J`; // 0x0A
const RED = `${ESC}A`;

const PS_NEWSFLASH = 0x8002;
const PS_SUBTITLE = 0x8004;

function subpageOf(ps: number, lines: string[]) {
  const text = ['PN,10000', 'SC,0000', `PS,${ps.toString(16).toUpperCase()}`, ...lines].join('\n');
  return importTti(text).pages[0].subpages[0];
}

const BOXED_ROW = `OL,5,OUT${START_BOX}${START_BOX}${RED}INSIDE${END_BOX}${END_BOX}AFTER`;

function textOf(grid: ReturnType<typeof subpageToGrid>, row: number): string {
  return grid[row].map(c => String.fromCharCode(c.char)).join('');
}

describe('boxing on newsflash and subtitle pages', () => {
  it.each([
    ['newsflash', PS_NEWSFLASH],
    ['subtitle', PS_SUBTITLE],
  ])('shows only the boxed area of a %s page', (_name, ps) => {
    const grid = subpageToGrid(subpageOf(ps, [BOXED_ROW]));
    const text = textOf(grid, 5);
    expect(text).toContain('INSIDE');
    expect(text).not.toContain('OUT');
    expect(text).not.toContain('AFTER');
    // outside cells are black on black, so the caller sees nothing there
    expect(grid[5][0]).toMatchObject({ char: 0x20, fgColor: 0, bgColor: 0, box: false });
  });

  it('leaves a normal page showing everything', () => {
    const grid = subpageToGrid(subpageOf(0x8000, [BOXED_ROW]));
    const text = textOf(grid, 5);
    expect(text).toContain('OUT');
    expect(text).toContain('INSIDE');
    expect(text).toContain('AFTER');
  });

  it('reaches the caller: the painted line of a newsflash page carries no outside text', () => {
    const lines = renderSubpageLines(subpageOf(PS_NEWSFLASH, [BOXED_ROW]), { mode: 'teletext' });
    const plain = lines[5].replace(/\x1b#[34]/g, '').replace(/\x1b\[[0-9;]*m/g, '');
    expect(plain).toContain('INSIDE');
    expect(plain).not.toContain('OUT');
    expect(plain).not.toContain('AFTER');
  });

  it('starts every row outside the box', () => {
    const grid = subpageToGrid(subpageOf(PS_NEWSFLASH, [`OL,5,${START_BOX}${START_BOX}ONE`, 'OL,6,TWO']));
    expect(textOf(grid, 5)).toContain('ONE');
    expect(textOf(grid, 6)).not.toContain('TWO');
  });
});
