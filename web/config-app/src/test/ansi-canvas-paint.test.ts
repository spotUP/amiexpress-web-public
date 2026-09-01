/**
 * What the renderer actually puts on the screen.
 *
 * jsdom has no 2D backend, so a component test proves only that the paint did
 * not throw. These run the paint against a recording context, because the
 * mistake this code is most likely to make is silent: a Cell numbers its
 * colours in SGR order (red is 1) and the EGA table used elsewhere in the repo
 * numbers them differently (red is 4). Indexing one with the other rotates
 * every colour on a screen and still looks like ANSI art.
 */
import { describe, expect, it } from 'vitest';
import { paintScreen, CELL_WIDTH, CELL_HEIGHT } from '../components/ansi-canvas-paint';
import { createCanvas, setCell } from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/canvas';

interface Call { fill: string; args: number[] }

function recordingContext() {
  const rects: Call[] = [];
  const glyphs: { char: string; fill: string; x: number; y: number }[] = [];
  const strokes: Call[] = [];
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textBaseline: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ fill: String(ctx.fillStyle), args: [x, y, w, h] });
    },
    fillText(char: string, x: number, y: number) {
      glyphs.push({ char, fill: String(ctx.fillStyle), x, y });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      strokes.push({ fill: String(ctx.strokeStyle), args: [x, y, w, h] });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects, glyphs, strokes };
}

describe('painting a screen', () => {
  it('draws a cell where its coordinates say, in the colours the cell names', () => {
    const canvas = createCanvas(4, 2);
    setCell(canvas, 2, 1, { char: 'R', fg: 1, bg: 4 });

    const { ctx, rects, glyphs } = recordingContext();
    paintScreen(ctx, canvas);

    // Red foreground is SGR 31, so fg 1 - and blue background SGR 44, bg 4.
    expect(glyphs).toContainEqual({
      char: 'R', fill: '#AA0000', x: 2 * CELL_WIDTH, y: 1 * CELL_HEIGHT,
    });
    expect(rects).toContainEqual({
      fill: '#0000AA', args: [2 * CELL_WIDTH, 1 * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT],
    });
  });

  it('reads the bright half of the palette as bright, not as a second black', () => {
    const canvas = createCanvas(2, 1);
    setCell(canvas, 0, 0, { char: '█', fg: 12, bg: 0 });

    const { ctx, glyphs } = recordingContext();
    paintScreen(ctx, canvas);

    expect(glyphs[0]).toMatchObject({ char: '█', fill: '#5555FF' });
  });

  it('writes no glyph for a space, only its background', () => {
    const canvas = createCanvas(2, 1);
    setCell(canvas, 0, 0, { char: ' ', fg: 7, bg: 2 });

    const { ctx, rects, glyphs } = recordingContext();
    paintScreen(ctx, canvas);

    expect(glyphs).toHaveLength(0);
    expect(rects).toContainEqual({ fill: '#00AA00', args: [0, 0, CELL_WIDTH, CELL_HEIGHT] });
  });

  it('outlines the cursor cell and ignores a cursor off the grid', () => {
    const canvas = createCanvas(4, 2);

    const on = recordingContext();
    paintScreen(on.ctx, canvas, { x: 1, y: 1 });
    expect(on.strokes).toHaveLength(1);
    expect(on.strokes[0].args[0]).toBeCloseTo(CELL_WIDTH + 0.5);

    const off = recordingContext();
    paintScreen(off.ctx, canvas, { x: 9, y: 9 });
    expect(off.strokes).toHaveLength(0);
  });

  it('clears the whole grid before drawing it', () => {
    const { ctx, rects } = recordingContext();
    paintScreen(ctx, createCanvas(80, 25));

    expect(rects[0]).toEqual({
      fill: '#000000', args: [0, 0, 80 * CELL_WIDTH, 25 * CELL_HEIGHT],
    });
  });
});
