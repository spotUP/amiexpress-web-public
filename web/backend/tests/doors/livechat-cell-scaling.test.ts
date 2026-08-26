/**
 * Making one broadcast picture fit every viewer's tile.
 *
 * The sender sizes its encode from a byte budget - frame rate is bought
 * with bytes - not from anybody's tile, and one encode goes to viewers
 * whose tiles are all different sizes. Padding it into a larger tile left
 * the picture small in the top-left corner.
 *
 * Cells scale where markup could not: "ASCII cannot be rescaled" was true
 * of `{lightgreen-fg}` fragments, but a cell is a number.
 */

import {
  fitCellsToTile,
  cellsToTags,
  MODE_HALFBLOCK,
} from '../../../../Doors/livechat/video-cells';

/** A picture with a distinct value per cell, so sampling errors show up. */
function ramp(width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = (i % 200) + 1;
  return out;
}

describe('fitting cells to a tile', () => {
  it('returns exactly the tile it was asked for', () => {
    const scaled = fitCellsToTile(ramp(10, 5), 10, 5, 40, 20);
    expect(scaled.length).toBe(40 * 20);
  });

  it('enlarges a small picture instead of leaving it in the corner', () => {
    // The reported symptom. A 2x2 picture in an 8x8 tile should cover far
    // more than four cells.
    const cells = new Uint8Array([1, 2, 3, 4]);
    const scaled = fitCellsToTile(cells, 2, 2, 8, 8);

    expect(scaled.filter(v => v !== 0).length).toBeGreaterThan(16);
  });

  it('centres the picture in whatever space is left over', () => {
    // A square picture in a wide tile: blank columns on BOTH sides, not
    // all of them bunched on the right.
    const scaled = fitCellsToTile(new Uint8Array([9, 9, 9, 9]), 2, 2, 12, 4);

    const row = Array.from(scaled.slice(0, 12));
    const firstPainted = row.findIndex(v => v !== 0);
    const lastPainted = 11 - [...row].reverse().findIndex(v => v !== 0);

    expect(firstPainted).toBeGreaterThan(0);
    expect(11 - lastPainted).toBeGreaterThan(0);
    expect(Math.abs(firstPainted - (11 - lastPainted))).toBeLessThanOrEqual(1);
  });

  it('keeps the shape, so nobody comes out stretched', () => {
    // A 4x2 picture into a 16x16 tile must stay twice as wide as it is
    // tall, not fill the square.
    const scaled = fitCellsToTile(new Uint8Array(8).fill(7), 4, 2, 16, 16);

    let paintedRows = 0;
    for (let y = 0; y < 16; y++) {
      if (scaled.slice(y * 16, y * 16 + 16).some(v => v !== 0)) paintedRows++;
    }
    let paintedCols = 0;
    for (let x = 0; x < 16; x++) {
      let painted = false;
      for (let y = 0; y < 16; y++) if (scaled[y * 16 + x] !== 0) painted = true;
      if (painted) paintedCols++;
    }

    expect(paintedCols / paintedRows).toBeCloseTo(2, 0);
  });

  it('shrinks a picture too big for the tile rather than cropping a head off', () => {
    const scaled = fitCellsToTile(ramp(40, 20), 40, 20, 10, 5);

    expect(scaled.length).toBe(50);
    expect(scaled.some(v => v !== 0)).toBe(true);
  });

  it('leaves a picture that already fits untouched', () => {
    const cells = ramp(8, 4);
    expect(fitCellsToTile(cells, 8, 4, 8, 4)).toBe(cells);
  });

  it('produces rows of exactly the tile width once drawn', () => {
    // Whatever the scaling did, every row must still be the tile's width
    // or the terminal wraps and shears the picture.
    const scaled = fitCellsToTile(ramp(7, 3), 7, 3, 21, 9);
    const rows = cellsToTags(scaled, 21, 9, MODE_HALFBLOCK).split('\n');

    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(row.replace(/\{[^}]*\}/g, '')).toHaveLength(21);
    }
  });

  it('survives a tile with no size', () => {
    expect(fitCellsToTile(ramp(4, 4), 4, 4, 0, 0).length).toBe(0);
  });

  it('survives an empty picture', () => {
    const scaled = fitCellsToTile(new Uint8Array(0), 0, 0, 6, 3);
    expect(scaled.length).toBe(18);
    expect(scaled.every(v => v === 0)).toBe(true);
  });
});
