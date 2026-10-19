/**
 * ETSI EN 300 706 s.12.2 Table 26, as the board's teletext renderer draws it.
 *
 * - Set-At codes (09 Steady, 0C Normal Size, 18 Conceal, 19 Contiguous,
 *   1A Separated, 1C Black Background, 1D New Background, 1E Hold) change
 *   their OWN cell. The renderer applied all but Hold one cell late, so a
 *   New Background cell was drawn in the old background.
 * - Every other spacing attribute is Set-After: its own cell keeps the old
 *   state.
 * - A double-height row's lower row ignores its own transmitted data: it
 *   shows the lower halves and, elsewhere, only the background of the cell
 *   above. The renderer kept the lower row's own text in the gaps.
 */
import { processPage, processRow } from '../../teletext/marco/state-machine/state-machine';

const ALPHA_RED = 0x01;
const FLASH = 0x08;
const STEADY = 0x09;
const NORMAL_SIZE = 0x0c;
const DOUBLE_HEIGHT = 0x0d;
const CONCEAL = 0x18;
const SEPARATED = 0x1a;
const BLACK_BACKGROUND = 0x1c;
const NEW_BACKGROUND = 0x1d;

const RED = 1;
const BLACK = 0;
const WHITE = 7;

function line(bytes: number[]): number[] {
  const out = new Array(40).fill(0x20);
  bytes.forEach((b, i) => (out[i] = b));
  return out;
}

function page(rows: Record<number, number[]>): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < 25; i++) out.push(line(rows[i] ?? []));
  return out;
}

const ch = (s: string): number => s.charCodeAt(0);

describe('Set-At spacing attributes change their own cell', () => {
  it('New Background paints its own cell in the new background', () => {
    const cells = processRow(line([ALPHA_RED, NEW_BACKGROUND, ch('A')]));
    expect(cells[1].bgColor).toBe(RED);
  });

  it('Black Background paints its own cell black', () => {
    const cells = processRow(line([ALPHA_RED, NEW_BACKGROUND, BLACK_BACKGROUND, ch('A')]));
    expect(cells[2].bgColor).toBe(BLACK);
  });

  it('Normal Size, Steady and Conceal reach their own cell', () => {
    const size = processRow(line([DOUBLE_HEIGHT, ch('A'), NORMAL_SIZE]));
    expect(size[2].doubleHeight).toBe(false);
    const steady = processRow(line([FLASH, ch('A'), STEADY]));
    expect(steady[2].flash).toBe(false);
    expect(processRow(line([CONCEAL]))[0].conceal).toBe(true);
    expect(processRow(line([SEPARATED]))[0].mosaicType).toBe(1);
  });

  it('Set-After codes leave their own cell in the old state', () => {
    const cells = processRow(line([ALPHA_RED, FLASH, DOUBLE_HEIGHT, 0x0a, 0x0b, ch('A')]));
    expect(cells[0].fgColor).toBe(WHITE);
    expect(cells[1].flash).toBe(false);
    expect(cells[2].doubleHeight).toBe(false);
    expect(cells[5]).toMatchObject({ fgColor: RED, flash: true, doubleHeight: true });
  });
});

describe('the row below a double-height row', () => {
  const grid = processPage(page({
    1: [ALPHA_RED, NEW_BACKGROUND, DOUBLE_HEIGHT, ch('A'), ch('B')],
    // The lower row's own data, double height included, must be ignored.
    2: [DOUBLE_HEIGHT, ...Array.from('XXXXXXXXXXXXXXXXXXXX', ch)],
    3: [ch('Q')],
  }));

  it('shows the lower halves of the double-height cells', () => {
    expect(grid[2][3]).toMatchObject({ char: ch('A'), doubleHeightBottom: true });
    expect(grid[2][4]).toMatchObject({ char: ch('B'), doubleHeightBottom: true });
  });

  it('shows only the background of the cell above anywhere else, ignoring its own text', () => {
    expect(grid[2][0]).toMatchObject({ char: 0x20, bgColor: BLACK, doubleHeightBottom: false });
    expect(grid[2][2]).toMatchObject({ char: 0x20, bgColor: RED, doubleHeightBottom: false });
    expect(grid[2][10]).toMatchObject({ char: 0x20, bgColor: RED, flash: false, conceal: false });
  });

  it('ignores the lower row\'s own double height, so the row after it is drawn as sent', () => {
    expect(grid[3][0]).toMatchObject({ char: ch('Q'), doubleHeightBottom: false });
  });
});
