/**
 * Sixteen ANSI colours, made to look like more than sixteen.
 *
 * A webcam scene is mostly low-saturation - skin, walls, hair - and the
 * only low-saturation entries in the ANSI palette are black, gray, white
 * and lightwhite. Nearest-neighbour matching collapsed nearly everything to
 * those four, and skin sits right on the boundary between `white` and
 * `lightred`, so a face came out flat grey with arbitrary red patches
 * wherever a pixel happened to cross it ("there seem to be no logic to how
 * the red color applied", "i never see 16 colors", 2026-08-26).
 *
 * Dithering picks between the two NEAREST entries according to where the
 * pixel really sits between them, using a fixed pattern based on position.
 * The eye mixes the result.
 */

import {
  pickColor,
  pickColorDithered,
  STICKINESS,
} from '../../../../Doors/livechat/video-hysteresis';
import { PALETTE } from '../../../../Doors/livechat/video-encoders';

/** Skin: almost exactly between `white` and `lightred`. */
const SKIN = { r: 205, g: 158, b: 145 };

function ditherArea(r: number, g: number, b: number, size = 8): number[] {
  const chosen: number[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      chosen.push(pickColorDithered(PALETTE, r, g, b, x, y, []));
    }
  }
  return chosen;
}

describe('dithering the ANSI palette', () => {
  it('uses the standard ANSI colours, unchanged', () => {
    // The BBS look depends on these being the real ANSI/VGA values.
    const byName = new Map(PALETTE.map(p => [p[0], [p[1], p[2], p[3]]]));

    expect(byName.get('black')).toEqual([0, 0, 0]);
    expect(byName.get('red')).toEqual([170, 0, 0]);
    expect(byName.get('yellow')).toEqual([170, 85, 0]);
    expect(byName.get('white')).toEqual([170, 170, 170]);
    expect(byName.get('gray')).toEqual([85, 85, 85]);
    expect(byName.get('lightred')).toEqual([255, 85, 85]);
    expect(byName.get('lightwhite')).toEqual([255, 255, 255]);
    expect(PALETTE).toHaveLength(16);
  });

  it('breaks a flat skin tone into more than one colour', () => {
    // Undithered, every cell of a flat area picks the same entry - which is
    // why faces were flat grey.
    const flat = new Set([pickColor(PALETTE, SKIN.r, SKIN.g, SKIN.b, [])]);
    const dithered = new Set(ditherArea(SKIN.r, SKIN.g, SKIN.b));

    expect(flat.size).toBe(1);
    expect(dithered.size).toBeGreaterThan(1);
  });

  it('mixes the two colours the tone actually lies between', () => {
    // Not arbitrary colours: the two NEAREST entries.
    const dithered = new Set(ditherArea(SKIN.r, SKIN.g, SKIN.b));
    const names = Array.from(dithered).map(i => PALETTE[i][0]).sort();

    expect(names.every(n => ['white', 'lightred', 'lightwhite', 'yellow'].includes(n))).toBe(true);
  });

  it('mixes in proportion to where the tone sits', () => {
    // A tone very close to one entry should be mostly that entry, not an
    // even split - otherwise the picture is just noise.
    const nearlyWhite = ditherArea(172, 172, 172);
    const whiteIndex = PALETTE.findIndex(p => p[0] === 'white');
    const share = nearlyWhite.filter(i => i === whiteIndex).length / nearlyWhite.length;

    expect(share).toBeGreaterThan(0.75);
  });

  it('leaves an exact palette colour completely alone', () => {
    // Pure black must stay pure black, not speckle.
    const blackIndex = PALETTE.findIndex(p => p[0] === 'black');
    expect(new Set(ditherArea(0, 0, 0))).toEqual(new Set([blackIndex]));
  });

  it('is the same every time for the same position', () => {
    // The pattern depends on position, never on time - a still picture must
    // still encode as a still picture, because frames are sent as deltas.
    const first = ditherArea(SKIN.r, SKIN.g, SKIN.b);
    const second = ditherArea(SKIN.r, SKIN.g, SKIN.b);

    expect(first).toEqual(second);
  });

  it('still holds a colour steady when the pixel barely moves', () => {
    // Temporal stickiness survives dithering: a cell that already shows a
    // near-enough colour keeps it rather than flickering.
    const incumbent = PALETTE.findIndex(p => p[0] === 'white');
    const chosen = pickColorDithered(
      PALETTE, SKIN.r, SKIN.g, SKIN.b, 0, 0, [incumbent], STICKINESS
    );

    expect(chosen).toBe(incumbent);
  });

  it('gives way when the colour really changes', () => {
    const incumbent = PALETTE.findIndex(p => p[0] === 'white');
    const chosen = pickColorDithered(PALETTE, 0, 0, 200, 0, 0, [incumbent]);

    expect(chosen).not.toBe(incumbent);
  });
});
