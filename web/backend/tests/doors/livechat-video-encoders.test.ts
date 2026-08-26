/**
 * LiveChat video encoders (Doors/livechat/video-encoders.ts).
 *
 * Reported 2026-08-26: "every second frame in some render modes in the video
 * mode in LiveChat is broken", with an earlier screenshot showing garbage in
 * the top-left corner. Not all modes - "most".
 *
 * The frame is drawn by concatenating one string per cell into rows, so the
 * contract is exact: `height` rows, each exactly `width` visible columns.
 * TetriNET had a bug of precisely this shape - special blocks were three
 * columns against everyone else's two - and every row carrying one shifted
 * sideways. A row one column too wide wraps and pushes every following row
 * along, which looks like alternating corruption when the content changes.
 */

import {
  renderAscii,
  renderHalfblock,
  renderBraille,
  pixelsPerChar,
} from '../../../../Doors/livechat/video-encoders';

/** Visible width, with blessed colour tags removed. */
function visibleWidth(row: string): number {
  return [...row.replace(/\{[^}]*\}/g, '')].length;
}

/**
 * A pixel buffer the size the door would capture for a given mode: the
 * canvas is sized to charW*px by charH*py (see pixelsPerChar).
 */
function frame(charW: number, charH: number, mode: string): { data: Uint8ClampedArray } {
  const { px, py } = pixelsPerChar(mode);
  const w = charW * px;
  const h = charH * py;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    // Varied content: a flat buffer would hide width bugs that only appear
    // when the encoder emits colour changes.
    data[i * 4] = (i * 37) % 256;
    data[i * 4 + 1] = (i * 91) % 256;
    data[i * 4 + 2] = (i * 13) % 256;
    data[i * 4 + 3] = 255;
  }
  return { data };
}

const MODES: { name: string; render: (w: number, h: number) => string }[] = [
  { name: 'ascii', render: (w, h) => renderAscii(frame(w, h, 'ascii'), w, h, false) },
  { name: 'color', render: (w, h) => renderAscii(frame(w, h, 'color'), w, h, true) },
  { name: 'halfblock', render: (w, h) => renderHalfblock(frame(w, h, 'halfblock'), w, h) },
  { name: 'braille', render: (w, h) => renderBraille(frame(w, h, 'braille'), w, h) },
];

describe('every render mode produces a rectangular frame', () => {
  for (const mode of MODES) {
    describe(mode.name, () => {
      it('emits exactly one row per character row', () => {
        const rows = mode.render(40, 12).split('\n');

        expect(rows).toHaveLength(12);
      });

      it('emits exactly the requested width on every row', () => {
        const rows = mode.render(40, 12).split('\n');

        const wrong = rows
          .map((row, y) => ({ y, width: visibleWidth(row) }))
          .filter(r => r.width !== 40);

        expect(wrong).toEqual([]);
      });

      it('holds its shape at an odd size', () => {
        // The tile is not always a tidy multiple of the packing (halfblock
        // reads two rows per character, braille four).
        const rows = mode.render(37, 9).split('\n');

        expect(rows).toHaveLength(9);
        expect(rows.every(r => visibleWidth(r) === 37)).toBe(true);
      });

      it('produces the same shape twice running', () => {
        // "Every SECOND frame" - if an encoder carried state between calls,
        // consecutive frames would differ in shape.
        const first = mode.render(40, 12).split('\n').map(visibleWidth);
        const second = mode.render(40, 12).split('\n').map(visibleWidth);

        expect(second).toEqual(first);
      });
    });
  }
});

describe('the capture size each mode asks for', () => {
  it('packs the pixels each encoder reads', () => {
    // The canvas is sized from this; if it disagreed with the encoder, the
    // encoder would read past the end of the buffer on the last rows.
    expect(pixelsPerChar('ascii')).toEqual({ px: 1, py: 1 });
    expect(pixelsPerChar('color')).toEqual({ px: 1, py: 1 });
    expect(pixelsPerChar('halfblock')).toEqual({ px: 1, py: 2 });
    expect(pixelsPerChar('braille')).toEqual({ px: 2, py: 4 });
  });

  it('never reads past the buffer it was given', () => {
    // A read past the end yields undefined, and undefined arithmetic gives
    // NaN - which surfaces as a wrong character rather than a crash.
    for (const mode of MODES) {
      const out = mode.render(20, 6);
      expect(out).not.toContain('NaN');
      expect(out).not.toContain('undefined');
    }
  });
});

describe('keeping the camera the right shape', () => {
  const { fitPreservingAspect, pixelAspect } = require('../../../../Doors/livechat/video-encoders');

  /** How the fitted picture LOOKS on screen, width over height. */
  function screenAspect(fit: any, aspect: number): number {
    return (fit.dw / fit.dh) * aspect;
  }

  it('does not stretch a 4:3 camera into a wide tile', () => {
    // The bug: the camera was drawn to fill the canvas, so a wide tile gave
    // everyone a wide face.
    const canvasW = 160, canvasH = 40;
    const fit = fitPreservingAspect(640, 480, canvasW, canvasH, pixelAspect('halfblock'));

    expect(screenAspect(fit, pixelAspect('halfblock'))).toBeCloseTo(640 / 480, 1);
  });

  it('accounts for the terminal cell being twice as tall as it is wide', () => {
    // In ascii mode one canvas pixel IS one cell, so the destination has to
    // be twice as wide in pixels to look square on screen.
    const ascii = fitPreservingAspect(640, 480, 200, 200, pixelAspect('ascii'));
    const halfblock = fitPreservingAspect(640, 480, 200, 200, pixelAspect('halfblock'));

    expect(ascii.dw / ascii.dh).toBeGreaterThan(halfblock.dw / halfblock.dh);
  });

  it('centres the picture in the space it has', () => {
    const fit = fitPreservingAspect(640, 480, 200, 40, pixelAspect('halfblock'));

    expect(fit.dx).toBe(Math.round((200 - fit.dw) / 2));
    expect(fit.dy).toBe(Math.round((40 - fit.dh) / 2));
  });

  it('never draws outside the canvas', () => {
    for (const [cw, ch] of [[160, 40], [40, 160], [80, 24], [7, 3]]) {
      for (const mode of ['ascii', 'color', 'halfblock', 'braille']) {
        const fit = fitPreservingAspect(1280, 720, cw, ch, pixelAspect(mode));

        expect(fit.dx).toBeGreaterThanOrEqual(0);
        expect(fit.dy).toBeGreaterThanOrEqual(0);
        expect(fit.dx + fit.dw).toBeLessThanOrEqual(cw);
        expect(fit.dy + fit.dh).toBeLessThanOrEqual(ch);
      }
    }
  });

  it('survives a camera that has not reported its size yet', () => {
    const fit = fitPreservingAspect(0, 0, 80, 24, pixelAspect('ascii'));

    expect(fit.dw).toBeGreaterThanOrEqual(0);
    expect(fit.dh).toBeGreaterThanOrEqual(0);
  });
});
