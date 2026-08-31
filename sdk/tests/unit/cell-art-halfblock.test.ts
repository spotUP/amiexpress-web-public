/**
 * The half-block codec: how sprite pixels become terminal cells.
 *
 * This is the exact encoding the Pengo art was authored in, extracted from
 * the throwaway generator into the engine so the studio's pixel mode edits
 * the same thing the generator wrote. The invariant worth pinning is the
 * ROUND TRIP: compile(decompile(f)) must reproduce a half-block frame
 * exactly, or the studio corrupts art just by opening and saving it.
 */

import { Cell, CellBuffer } from '../../engines/graphics/cell-art/cells';
import {
  PixelGrid,
  compilePixels,
  decompilePixels,
} from '../../engines/graphics/cell-art/halfblock';

describe('compilePixels', () => {
  it('encodes the four pixel-pair cases', () => {
    const pixels: PixelGrid = [
      [9,    null, 9,  null],
      [null, 9,    9,  null],
    ];
    const [row] = compilePixels(pixels);
    expect(row[0]).toEqual({ char: '▀', fg: 9, bg: 0 });   // top only
    expect(row[1]).toEqual({ char: '▄', fg: 9, bg: 0 });   // bottom only
    expect(row[2]).toEqual({ char: '█', fg: 9, bg: 9 });   // both, same
    expect(row[3]).toBeNull();                              // neither
  });

  it('encodes split colours as upper-half over background', () => {
    const [row] = compilePixels([[9], [11]]);
    expect(row[0]).toEqual({ char: '▀', fg: 9, bg: 11 });
  });

  it('rejects an odd pixel-row count - half a cell row cannot exist', () => {
    expect(() => compilePixels([[9]])).toThrow(/even/);
  });
});

describe('decompilePixels', () => {
  it('round-trips every compiled form', () => {
    const pixels: PixelGrid = [
      [9, null, 3,    9],
      [11, 9,   null, 9],
    ];
    const frame = compilePixels(pixels);
    expect(decompilePixels(frame)).toEqual(pixels);
    expect(compilePixels(decompilePixels(frame)!)).toEqual(frame);
  });

  it('returns null for a frame that is not pure half-blocks', () => {
    const frame: CellBuffer = [[{ char: 'A', fg: 7, bg: 0 } as Cell]];
    expect(decompilePixels(frame)).toBeNull();
  });

  it('round-trips the shipped Pengo art, which was authored this way', () => {
    // Read one real frame through the real loader - the studio will.
    const { loadSpriteSheet } = require('../../engines/graphics/cell-art/load');
    const path = require('path');
    const sheet = loadSpriteSheet(
      path.join(__dirname, '..', '..', '..', 'Doors', 'pengo', 'sprites')
    );
    const frame = sheet['pengo'].animations['walk-right'].frames[0];
    const pixels = decompilePixels(frame);
    expect(pixels).not.toBeNull();
    expect(compilePixels(pixels!)).toEqual(frame);
  });
});
