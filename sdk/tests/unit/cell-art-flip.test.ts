/**
 * Mirroring cells.
 *
 * A flip is the cheapest way to make a car face the way it drives without
 * authoring a second set of frames, but it is also the easiest thing to get
 * subtly wrong: reversing the cells of a half-block sprite is correct
 * horizontally and WRONG vertically, because the upper and lower half
 * blocks are each other upside down. A vertical flip that only reverses the
 * rows renders as something that looks plausible and is inside out.
 */

import {
  Cell, CellBuffer, flipCellsH, flipCellsV, compilePixels, decompilePixels,
} from '../../engines/graphics/cell-art';

const c = (char: string, fg = 7, bg = 0): Cell => ({ char, fg, bg });
const chars = (buffer: CellBuffer): string[] =>
  buffer.map(row => row.map(cell => (cell === null ? '.' : cell.char)).join(''));

describe('flipCellsH', () => {
  it('reverses each row', () => {
    const src: CellBuffer = [[c('a'), c('b'), c('c')]];
    expect(chars(flipCellsH(src))).toEqual(['cba']);
  });

  it('mirrors characters that are not their own reflection', () => {
    const src: CellBuffer = [[c('('), c('<'), c('/'), c('▌')]];
    expect(chars(flipCellsH(src))).toEqual(['▐\\>)']);
  });

  it('leaves the half blocks alone, since they are symmetric left to right', () => {
    const src: CellBuffer = [[c('▀'), c('█'), c('▄')]];
    expect(chars(flipCellsH(src))).toEqual(['▄█▀']);
  });

  it('keeps transparent cells transparent and in their mirrored place', () => {
    const src: CellBuffer = [[c('a'), null, c('b')]];
    expect(chars(flipCellsH(src))).toEqual(['b.a']);
  });

  it('does not touch the source', () => {
    const src: CellBuffer = [[c('a'), c('b')]];
    flipCellsH(src);
    expect(chars(src)).toEqual(['ab']);
  });

  it('is its own inverse', () => {
    const src: CellBuffer = [[c('('), c('a'), null, c('▌')]];
    expect(chars(flipCellsH(flipCellsH(src)))).toEqual(chars(src));
  });

  it('preserves colours', () => {
    const src: CellBuffer = [[c('a', 1, 2), c('b', 3, 4)]];
    const out = flipCellsH(src);
    expect(out[0][0]).toMatchObject({ char: 'b', fg: 3, bg: 4 });
    expect(out[0][1]).toMatchObject({ char: 'a', fg: 1, bg: 2 });
  });

  it('mirrors a whole sprite frame left to right', () => {
    // A shape that is obviously asymmetric: filled on the left only.
    const frame = compilePixels([
      [1, 1, null, null],
      [1, null, null, null],
    ]);
    const flipped = flipCellsH(frame);
    const pixels = decompilePixels(flipped);
    expect(pixels).not.toBeNull();
    expect(pixels).toEqual([
      [null, null, 1, 1],
      [null, null, null, 1],
    ]);
  });
});

describe('flipCellsV', () => {
  it('reverses the row order', () => {
    const src: CellBuffer = [[c('a')], [c('b')], [c('c')]];
    expect(chars(flipCellsV(src))).toEqual(['c', 'b', 'a']);
  });

  it('swaps the upper and lower half blocks', () => {
    const src: CellBuffer = [[c('▀'), c('▄'), c('█')]];
    expect(chars(flipCellsV(src))).toEqual(['▄▀█']);
  });

  it('turns a half-block sprite upside down, pixel for pixel', () => {
    // Top row filled, bottom row empty: upside down it must be the reverse.
    const frame = compilePixels([
      [1, 1],
      [null, null],
    ]);
    const pixels = decompilePixels(flipCellsV(frame));
    expect(pixels).toEqual([
      [null, null],
      [1, 1],
    ]);
  });

  it('does not touch the source', () => {
    const src: CellBuffer = [[c('▀')], [c('▄')]];
    flipCellsV(src);
    expect(chars(src)).toEqual(['▀', '▄']);
  });

  it('is its own inverse', () => {
    const src: CellBuffer = [[c('▀'), c('a')], [c('▄'), null]];
    expect(chars(flipCellsV(flipCellsV(src)))).toEqual(chars(src));
  });
});
