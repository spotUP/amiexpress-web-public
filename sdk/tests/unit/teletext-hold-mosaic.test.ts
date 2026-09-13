/**
 * ETSI EN 300 706 s.12.3: changing alpha/mosaic mode releases the held
 * mosaic. The state machine kept it, so a held cell after a colour change
 * painted the mosaic from BEFORE the change where the spec says a space.
 */
import { processPage } from '../../teletext/marco/state-machine/state-machine';

const ALPHA_GREEN = 0x02;
const MOSAIC_GREEN = 0x12;
const HOLD_MOSAIC = 0x1e;
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
  it('is released when the row changes to alpha', () => {
    // mosaic green, a mosaic cell, hold, then ALPHA green: the held cell
    // must not be painted at the alpha control's own position.
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, ALPHA_GREEN]));
    const cell = grid[1][3];
    expect(cell.char).toBe(0x20);
  });

  it('is released when the row changes back to mosaic colour', () => {
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, MOSAIC_GREEN]));
    const cell = grid[1][3];
    expect(cell.char).toBe(0x20);
  });

  it('still holds across a control that is not a mode change', () => {
    // FLASH (0x08) is not an alpha/mosaic change, so the hold survives it.
    const grid = processPage(row([MOSAIC_GREEN, MOSAIC_CELL, HOLD_MOSAIC, 0x08]));
    const cell = grid[1][3];
    expect(cell.char).toBe(MOSAIC_CELL);
  });
});
