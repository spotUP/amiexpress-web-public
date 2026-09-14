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
import { ANSI_PALETTE } from '../utils/ansi-palette';
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

  it('rings an MCI code across every cell it covers, and a dead one in the alert colour', () => {
    const canvas = createCanvas(20, 1);

    const live = recordingContext();
    paintScreen(live.ctx, canvas, null, [{ x: 4, y: 0, length: 9 }]);
    expect(live.strokes).toHaveLength(1);
    expect(live.strokes[0].args[2]).toBeCloseTo(9 * CELL_WIDTH - 1);
    expect(live.strokes[0].fill).toBe('#FFFF55');

    const dead = recordingContext();
    paintScreen(dead.ctx, canvas, null, [{ x: 0, y: 0, length: 4, broken: true }]);
    expect(dead.strokes[0].fill).toBe('#FF5555');
  });

  it("leaves the code's own characters visible - a highlight rings, never fills", () => {
    const canvas = createCanvas(8, 1);
    setCell(canvas, 0, 0, { char: '~', fg: 7, bg: 0 });

    const { ctx, glyphs } = recordingContext();
    paintScreen(ctx, canvas, null, [{ x: 0, y: 0, length: 4 }]);

    expect(glyphs[0]).toMatchObject({ char: '~' });
  });

  it('draws the art in Topaz, with a fallback stack behind it', () => {
    // The board's screens were drawn on an Amiga in this face. The rest of the
    // stack matters as much: a CP437 block Topaz has no glyph for falls back
    // for that CHARACTER, not for the line.
    const { ctx } = recordingContext();
    paintScreen(ctx, createCanvas(2, 1));

    expect(ctx.font).toMatch(/Topaz/);
    expect(ctx.font).toMatch(/monospace/);
  });

  it('clears the whole grid before drawing it', () => {
    const { ctx, rects } = recordingContext();
    paintScreen(ctx, createCanvas(80, 25));

    expect(rects[0]).toEqual({
      fill: '#000000', args: [0, 0, 80 * CELL_WIDTH, 25 * CELL_HEIGHT],
    });
  });
});

/**
 * The Amiga preview: eight pens, which is what console.device had.
 *
 * AmiExpress on a real Amiga showed eight colours - sixteen needed `ibmcon`,
 * which almost nobody ran - and the Amiga had no iCE colours, so a bright
 * BACKGROUND was never something a caller could be shown (sysop,
 * 2026-09-14). An artist drawing here has all sixteen, because the web and
 * telnet callers have all sixteen; this is how they see the other half of
 * the board before publishing rather than after.
 */
describe('the Amiga preview', () => {
  function screenWith(fg: number, bg: number) {
    const canvas = createCanvas(1, 1);
    setCell(canvas, 0, 0, { char: 'A', fg, bg, bold: false, blink: false });
    return canvas;
  }

  it('draws a bright foreground on the pen it collapses to', () => {
    const amiga = recordingContext();
    paintScreen(amiga.ctx, screenWith(11, 0), null, [], 'amiga');
    // Bright yellow (11) is yellow (3) on eight pens.
    expect(amiga.glyphs[0].fill).toBe(ANSI_PALETTE[3]);

    const full = recordingContext();
    paintScreen(full.ctx, screenWith(11, 0), null, [], 'full');
    expect(full.glyphs[0].fill).toBe(ANSI_PALETTE[11]);
  });

  it('collapses a bright background too, because the Amiga had no iCE', () => {
    const amiga = recordingContext();
    paintScreen(amiga.ctx, screenWith(7, 12), null, [], 'amiga');
    // The LAST cell-sized rect: on a one-cell screen the initial clear is
    // exactly the same size, and it is black.
    const cellFill = amiga.rects.filter(
      (rect: Call) => rect.args[2] === CELL_WIDTH && rect.args[3] === CELL_HEIGHT,
    ).at(-1);
    // Bright blue (12) is blue (4).
    expect(cellFill?.fill).toBe(ANSI_PALETTE[4]);
  });

  it('leaves the eight it already had alone', () => {
    const amiga = recordingContext();
    paintScreen(amiga.ctx, screenWith(2, 1), null, [], 'amiga');
    expect(amiga.glyphs[0].fill).toBe(ANSI_PALETTE[2]);
  });

  it('keeps the editor own marks in full colour', () => {
    // The cursor and the MCI rungs are the TOOL talking, not the art: dimming
    // them makes them hard to find and shows the artist nothing.
    const amiga = recordingContext();
    paintScreen(amiga.ctx, screenWith(7, 0), { x: 0, y: 0 }, [{ x: 0, y: 0, length: 1 }], 'amiga');
    const strokeColours = amiga.strokes.map((stroke: Call) => stroke.fill);
    expect(strokeColours).toContain(ANSI_PALETTE[11]); // the rung
    expect(strokeColours).toContain(ANSI_PALETTE[15]); // the cursor
  });

  it('paints in full colour when nothing asks otherwise', () => {
    const plain = recordingContext();
    paintScreen(plain.ctx, screenWith(10, 0));
    expect(plain.glyphs[0].fill).toBe(ANSI_PALETTE[10]);
  });
});
