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
