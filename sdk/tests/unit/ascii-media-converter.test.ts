/**
 * The image-to-text converter and its emitters (MAG linked media, M2).
 * Plain 16-colour ANSI: ASCII characters only, fg and bg per cell.
 */

import {
  frameToAnsiCells,
  cellsToAnsiRows,
  cellsToPetsciiRows,
  cellsToBlessedTags,
  isC64Safe,
  encodeRichFrame,
  decodeRichFrame,
  type AnsiCellGrid,
  type PixelSource,
} from '../../media/ascii';
import { asciiToPetsciiByte } from '../../petscii/ascii-to-petscii';
import { vicColorToPetscii } from '../../petscii/ansi-to-petscii';

const W = 32;
const H = 24;

/** Left-to-right gray gradient with a hard vertical edge in the middle and a red block. */
function testImage(): PixelSource {
  const data = new Uint8Array(W * H * 3);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      let v = Math.round((x / (W - 1)) * 255);
      if (x >= W / 2) v = 255 - v;
      let r = v, g = v, b = v;
      if (x >= 4 && x < 10 && y >= 4 && y < 10) { r = 220; g = 20; b = 20; }
      data[i] = r; data[i + 1] = g; data[i + 2] = b;
    }
  }
  return { data, width: W, height: H, channels: 3 };
}

const allCells = (g: AnsiCellGrid) => g.flat();

describe('frameToAnsiCells', () => {
  for (const mode of ['ascii', 'hsv'] as const) {
    it(`amiga16 ${mode}: size, printable ASCII, colours 0-15, bg 0-7`, () => {
      const grid = frameToAnsiCells(testImage(), 40, 12, { palette: 'amiga16', mode });
      expect(grid).toHaveLength(12);
      for (const row of grid) expect(row).toHaveLength(40);
      for (const c of allCells(grid)) {
        expect(c.char).toHaveLength(1);
        const code = c.char.charCodeAt(0);
        expect(code).toBeGreaterThanOrEqual(0x20);
        expect(code).toBeLessThan(0x7f);
        expect(c.fg).toBeGreaterThanOrEqual(0);
        expect(c.fg).toBeLessThanOrEqual(15);
        expect(c.bg).toBeGreaterThanOrEqual(0);
        expect(c.bg).toBeLessThan(8);
      }
    });
  }

  it('is not a flat image: the gradient and the edge produce several characters and colours', () => {
    const grid = frameToAnsiCells(testImage(), 32, 24, { palette: 'amiga16', mode: 'hsv' });
    expect(new Set(allCells(grid).map((c) => c.char)).size).toBeGreaterThan(3);
    expect(new Set(allCells(grid).map((c) => c.fg)).size).toBeGreaterThan(1);
  });

  it('c64 never uses the forbidden characters and keeps one (black) background', () => {
    for (const mode of ['ascii', 'hsv'] as const) {
      const grid = frameToAnsiCells(testImage(), 40, 12, { palette: 'c64', mode });
      for (const c of allCells(grid)) {
        expect(isC64Safe(c.char)).toBe(true);
        expect('\\_{}~|`"'.includes(c.char)).toBe(false);
        expect(c.bg).toBe(0);
        expect(c.fg).toBeLessThanOrEqual(15);
      }
    }
  });

  it('single-channel input works', () => {
    const gray = new Uint8Array(W * H).fill(128);
    const grid = frameToAnsiCells({ data: gray, width: W, height: H, channels: 1 }, 16, 8, { palette: 'amiga16' });
    expect(grid).toHaveLength(8);
    expect(grid[0]).toHaveLength(16);
  });
});

describe('emitters', () => {
  const grid: AnsiCellGrid = [
    [
      { char: 'A', fg: 1, bg: 0 },
      { char: 'B', fg: 1, bg: 0 },
      { char: 'C', fg: 9, bg: 4 },
    ],
  ];

  it('cellsToAnsiRows writes SGR only on colour change, bold for bright, and resets', () => {
    expect(cellsToAnsiRows(grid)).toEqual(['\x1b[0;31;40mAB\x1b[0;1;31;44mC\x1b[0m']);
  });

  it('cellsToPetsciiRows writes a colour byte on fg change then PETSCII bytes', () => {
    const c64: AnsiCellGrid = [
      [
        { char: 'A', fg: 2, bg: 0 },
        { char: 'B', fg: 2, bg: 0 },
        { char: '-', fg: 5, bg: 0 },
      ],
    ];
    const [row] = cellsToPetsciiRows(c64);
    expect(Array.from(row)).toEqual([
      vicColorToPetscii(2),
      asciiToPetsciiByte(0x41, 1).byte,
      asciiToPetsciiByte(0x42, 1).byte,
      vicColorToPetscii(5),
      asciiToPetsciiByte(0x2d, 1).byte,
    ]);
  });

  it('cellsToBlessedTags joins rows with newlines', () => {
    const text = cellsToBlessedTags([grid[0], grid[0]]);
    expect(text.split('\n')).toHaveLength(2);
    expect(text).toContain('A');
  });
});

describe('rich frame codec', () => {
  it('round-trips a keyframe and a delta', () => {
    const w = 8, h = 4, n = w * h;
    const f1 = { dots: new Uint8Array(n).map((_, i) => i % 7), colors: new Uint8Array(n).map((_, i) => (i * 3) % 16) };
    const key = decodeRichFrame(encodeRichFrame(f1, w, h));
    expect(key).not.toBeNull();
    expect(key!.width).toBe(w);
    expect(Array.from(key!.frame.dots)).toEqual(Array.from(f1.dots));
    expect(Array.from(key!.frame.colors)).toEqual(Array.from(f1.colors));

    const f2 = { dots: f1.dots.slice(), colors: f1.colors.slice() };
    f2.dots[5] = 99;
    f2.colors[9] = 3;
    const delta = decodeRichFrame(encodeRichFrame(f2, w, h, f1), f1);
    expect(Array.from(delta!.frame.dots)).toEqual(Array.from(f2.dots));
    expect(Array.from(delta!.frame.colors)).toEqual(Array.from(f2.colors));
  });
});
