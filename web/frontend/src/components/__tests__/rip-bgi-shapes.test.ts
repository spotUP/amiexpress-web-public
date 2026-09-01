/**
 * Pixel-level tests for the two RIPtermJS shape gaps its own README admits
 * to ("filled circles/ovals/pies slightly wrong") that this board's RIP
 * files actually hit: 149 filled ovals (|o) across 11 files, 6 pies.
 *
 * BGI draws into a plain byte buffer (one palette index per pixel), so the
 * whole thing runs headless: a fake 2D context supplies only what
 * initContext() and initMouseHandlers() touch, and the assertions read
 * bgi.getpixel() - the same buffer bgi.refresh() would copy to a canvas.
 *
 * The label-position gap is deliberately NOT covered: every one of the 276
 * button styles in the board's 144 RIP files is center-oriented with no
 * justification bits, and the center math is only ever off by a pixel.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { BGI } from '@amiexpress/terminal/rip/vendor/BGI';

const W = 320;
const H = 240;
const FILL = 5;
const BORDER = 15;

function makeBGI(): any {
  const canvas = {
    width: W,
    height: H,
    addEventListener: () => undefined,
  };
  const ctx = {
    canvas,
    createImageData: (w: number, h: number) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4),
    }),
  };
  const bgi: any = new (BGI as any)({ ctx });
  bgi.setcolor(BORDER);
  bgi.setfillstyle(1 /* SOLID_FILL */, FILL);
  return bgi;
}

/** Count pixels of a colour, optionally outside a predicate region. */
function count(bgi: any, colour: number, outside?: (x: number, y: number) => boolean): number {
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (bgi.getpixel(x, y) === colour && (!outside || outside(x, y))) n++;
    }
  }
  return n;
}

let bgi: any;
beforeEach(() => {
  bgi = makeBGI();
});

describe('fillellipse', () => {
  it('reaches the top and bottom tips of the ellipse', () => {
    // A tall ellipse is where the Bresenham fill loop stops early: it
    // steps x from -xr to 0 and carries y along, so the rows near cy +/- yr
    // were never filled ("finish tip of ellipse (likely not needed?)").
    bgi.fillellipse(100, 100, 6, 20);
    for (let y = 80; y <= 120; y++) {
      let rowHas = false;
      for (let x = 90; x <= 110; x++) {
        if (bgi.getpixel(x, y) === FILL) { rowHas = true; break; }
      }
      expect(rowHas, `row y=${y} has no fill`).toBe(true);
    }
  });

  it('covers the full horizontal extent on the centre row', () => {
    bgi.fillellipse(100, 100, 6, 20);
    for (let x = 94; x <= 106; x++) {
      expect(bgi.getpixel(x, 100), `x=${x} on the centre row`).toBe(FILL);
    }
  });

  it('stays inside its own bounding box', () => {
    bgi.fillellipse(100, 100, 6, 20);
    const outsideBox = (x: number, y: number) =>
      x < 100 - 6 - 1 || x > 100 + 6 + 1 || y < 100 - 20 - 1 || y > 100 + 20 + 1;
    expect(count(bgi, FILL, outsideBox)).toBe(0);
  });
});

describe('sector (pie slices)', () => {
  it('fills the interior of a quarter pie', () => {
    bgi.sector(100, 100, 0, 90, 30, 20);
    // A point at the middle angle, half way out: (45 deg, r/2).
    const x = 100 + Math.round(15 * Math.cos(Math.PI / 4));
    const y = 100 - Math.round(10 * Math.sin(Math.PI / 4));
    expect(bgi.getpixel(x, y)).toBe(FILL);
  });

  it('does not paint outside the wedge', () => {
    bgi.sector(100, 100, 0, 90, 30, 20);
    // Third quadrant is fully outside a 0..90 pie.
    expect(bgi.getpixel(90, 110)).not.toBe(FILL);
    expect(bgi.getpixel(85, 105)).not.toBe(FILL);
  });

  it('fills a thin slice instead of giving up', () => {
    // The old seed-point flood fill picked one point half way along the
    // middle angle; on a thin slice that lands on (or beside) the wedge's
    // own border and the fill exits without painting anything.
    bgi.sector(100, 100, 0, 10, 60, 45);
    expect(count(bgi, FILL)).toBeGreaterThan(20);
  });

  it('never escapes the ellipse', () => {
    // Bresenham arcs meet the wedge lines with occasional one-pixel gaps;
    // a flood fill walks straight through such a gap and floods the screen.
    for (const [st, en] of [[0, 90], [10, 170], [200, 340], [0, 10], [45, 46]] as const) {
      const b = makeBGI();
      b.sector(100, 100, st, en, 30, 20);
      const outsideBox = (x: number, y: number) =>
        x < 100 - 30 - 1 || x > 100 + 30 + 1 || y < 100 - 20 - 1 || y > 100 + 20 + 1;
      expect(count(b, FILL, outsideBox), `sector ${st}..${en} escaped`).toBe(0);
    }
  });

  it('a full 0..360 sector fills the whole ellipse around the seam', () => {
    bgi.sector(100, 100, 0, 360, 30, 20);
    // Both radius lines land on angle 0, so a border-coloured seam runs
    // from the centre to (cx + xr, cy) - real BGI draws it too. Everything
    // off the seam is fill.
    expect(bgi.getpixel(100, 100)).toBe(BORDER);
    expect(bgi.getpixel(115, 100)).toBe(BORDER);
    expect(bgi.getpixel(75, 100)).toBe(FILL);
    expect(bgi.getpixel(100, 85)).toBe(FILL);
    expect(bgi.getpixel(100, 115)).toBe(FILL);
    expect(bgi.getpixel(115, 95)).toBe(FILL);
    expect(bgi.getpixel(115, 105)).toBe(FILL);
  });
});
