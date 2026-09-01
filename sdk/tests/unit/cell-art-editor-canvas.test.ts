/**
 * The one conversion between a sprite frame and an ANSIEditor canvas.
 *
 * Task 2 of thoughts/shared/plans/2026-09-01-sprite-editor-on-the-ansi-editor.md.
 * Two transparency models meet here: cell-art says a hole is `null`, the
 * editor says a hole is a cell carrying `transparent: true`. ANSI text
 * carries neither - which is why the editor's own Cell comment forbids
 * wiring transparency into its ANSI codec and points hosts at
 * getCoreCanvas()/setCoreCanvas(). This bridge is that path, so its
 * round-trip fidelity is what stands between the sprite editor and a save
 * that quietly turns painted black into a hole.
 */

import { frameToCanvas, canvasToFrame } from '../../engines/graphics/cell-art/editor-canvas';
import { compilePixels, decompilePixels } from '../../engines/graphics/cell-art/halfblock';
import type { CellBuffer } from '../../engines/graphics/cell-art/cells';

describe('cell-art <-> ANSIEditor canvas bridge', () => {
  it('carries a transparent hole across as an editor transparent cell', () => {
    const frame: CellBuffer = [[null, { char: 'A', fg: 3, bg: 1 }]];
    const canvas = frameToCanvas(frame);
    expect(canvas[0][0].transparent).toBe(true);
    expect(canvas[0][1]).toEqual({ char: 'A', fg: 3, bg: 1 });
  });

  it('brings a transparent editor cell back as null', () => {
    const canvas = [
      [
        { char: ' ', fg: 7, bg: 0, transparent: true },
        { char: 'A', fg: 3, bg: 1 },
      ],
    ];
    expect(canvasToFrame(canvas)).toEqual([[null, { char: 'A', fg: 3, bg: 1 }]]);
  });

  it('round-trips a half-block frame unchanged, black bottom included', () => {
    // compilePixels' black-bottom encoding: a BLACK lower pixel under a
    // coloured upper one is the LOWER glyph with swapped roles, because
    // {▀, fg, bg:0} already means "transparent below". If the bridge lost
    // that distinction, painted black would silently become a hole on every
    // save and reload.
    const frame: CellBuffer = [[
      { char: '▄', fg: 0, bg: 4 },
      { char: '▀', fg: 2, bg: 0 },
      { char: '█', fg: 5, bg: 5 },
      null,
    ]];
    expect(canvasToFrame(frameToCanvas(frame))).toEqual(frame);
  });

  it('keeps a frame decompilable after the trip, pixel for pixel', () => {
    // The end-to-end property the studio actually depends on: pixels ->
    // frame -> editor canvas -> frame -> pixels is the identity. Asserting
    // on the intermediate cells alone would pass even if the bridge and the
    // codec disagreed about what a cell means.
    const pixels = [
      [1, null, 0, 7],
      [null, 2, 0, 7],
    ];
    const frame = compilePixels(pixels);
    expect(decompilePixels(canvasToFrame(frameToCanvas(frame)))).toEqual(pixels);
  });

  it('drops the editor-only blink attribute rather than smuggling it into a sprite', () => {
    const canvas = [[{ char: 'A', fg: 3, bg: 1, blink: true }]];
    expect(canvasToFrame(canvas)).toEqual([[{ char: 'A', fg: 3, bg: 1 }]]);
  });

  it('gives every cell its own object - no shared references', () => {
    const canvas = frameToCanvas([[null, null]]);
    canvas[0][0].char = 'X';
    expect(canvas[0][1].char).toBe(' ');
  });

  it('survives an empty frame and a ragged-free zero-width row', () => {
    expect(frameToCanvas([])).toEqual([]);
    expect(canvasToFrame([])).toEqual([]);
    expect(frameToCanvas([[]])).toEqual([[]]);
  });
});
