/**
 * Hold Mosaics, ETSI EN 300 706 s.12.2 Table 26 entry 1/E: the held mosaic
 * is reset to SPACE at the start of each row, on a change of
 * alphanumerics/mosaics MODE, or on a change of SIZE - nothing else.
 *
 * Alpha and mosaic colour codes and Double Height are Set-After, so the mode
 * or size changes (and the held mosaic resets) from the NEXT cell; the code's
 * own cell still shows the held mosaic. Normal Size is Set-At, so a size
 * change by it resets the hold at its own cell.
 *
 * The renderer used to reset the hold on ANY colour code and at the code's
 * own cell, which broke the point of Hold Mosaics: changing mosaic colour
 * between blocks without a gap.
 */
import { processPage } from '../../teletext/marco/state-machine/state-machine';

const ALPHA_GREEN = 0x02;
const MOSAIC_RED = 0x11;
const MOSAIC_GREEN = 0x12;
const HOLD_MOSAIC = 0x1e;
const FLASH = 0x08;
const NORMAL_SIZE = 0x0c;
const DOUBLE_HEIGHT = 0x0d;
const MOSAIC_CELL = 0x3f;

function row(bytes: number[]): number[][] {
  const line = new Array(40).fill(0x20);
  bytes.forEach((b, i) => (line[i] = b));
  const page: number[][] = [];
  for (let i = 0; i < 25; i++) page.push(new Array(40).fill(0x20));
  page[1] = line;
  return page;
}

describe('held mosaic', () => {
  it('fills a mosaic colour change in mosaics mode with the held block, in the new colour after it', () => {
    const grid = processPage(row([MOSAIC_RED, MOSAIC_CELL, HOLD_MOSAIC, MOSAIC_GREEN, FLASH]));
    expect(grid[1][3]).toMatchObject({ char: MOSAIC_CELL, fgColor: 1 });
    expect(grid[1][4]).toMatchObject({ char: MOSAIC_CELL, fgColor: 2 });
  });

  it('shows at an alpha colour code, then is released from the next cell', () => {
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, ALPHA_GREEN, FLASH, MOSAIC_GREEN, FLASH]));
    expect(grid[1][3].char).toBe(MOSAIC_CELL);
    expect(grid[1][4].char).toBe(0x20);
    // Back in mosaics, the block from before the alpha stretch is gone.
    expect(grid[1][6].char).toBe(0x20);
  });

  it('still holds across a control that is not a mode or size change', () => {
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, FLASH]));
    expect(grid[1][3].char).toBe(MOSAIC_CELL);
  });

  it('survives Normal Size reinforcing normal size', () => {
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, NORMAL_SIZE]));
    expect(grid[1][3].char).toBe(MOSAIC_CELL);
  });

  it('is released by Double Height from the next cell', () => {
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, DOUBLE_HEIGHT, FLASH]));
    expect(grid[1][3].char).toBe(MOSAIC_CELL);
    expect(grid[1][4].char).toBe(0x20);
  });

  it('is released by Normal Size after double height at its own cell', () => {
    const grid = processPage(row([DOUBLE_HEIGHT, MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, NORMAL_SIZE]));
    expect(grid[1][4].char).toBe(0x20);
  });
});
