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

  it('rejects a ragged row pair - a longer bottom row must not silently truncate', () => {
    // The column loop used to run over top.length only, so a bottom row
    // longer than its top row had its extra cells dropped with no error.
    const pixels: PixelGrid = [
      [9, 9],
      [9, 9, 9],
    ];
    expect(() => compilePixels(pixels)).toThrow(/ragged/);
  });

  it('keeps painted black distinct from transparency, both orientations', () => {
    const pairs: PixelGrid = [
      [9, 0],
      [0, 9],
    ];
    const frame = compilePixels(pairs);
    expect(frame[0][0]).toEqual({ char: '▄', fg: 0, bg: 9 });  // black UNDER colour
    expect(frame[0][1]).toEqual({ char: '▀', fg: 0, bg: 9 });  // black OVER colour
    expect(decompilePixels(frame)).toEqual(pairs);
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

  it('accepts a non-canonical half-block cell instead of returning null', () => {
    // {char:'▄', fg:5, bg:5} is not the canonical encoding of a solid
    // colour (compilePixels always emits '█' for fg===bg), but it is
    // still a valid pair of pixels: decompilePixels must read it, not
    // reject the whole frame the way a genuinely non-block glyph does.
    const frame: CellBuffer = [[{ char: '▄', fg: 5, bg: 5 } as Cell]];
    const pixels = decompilePixels(frame);
    expect(pixels).toEqual([[5], [5]]);
    // Re-compiling re-encodes it canonically - same pixels, same visual,
    // not necessarily the same bytes.
    expect(compilePixels(pixels!)).toEqual([[{ char: '█', fg: 5, bg: 5 }]]);
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
