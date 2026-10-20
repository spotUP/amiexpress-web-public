/**
 * Shrinking a picture for the MAG sidecars. The resample runs on the board's
 * main thread at ingest, once per sidecar size: a 2-D window summed per
 * output pixel took about 4 s per size for a 1200x800 picture (32 s per
 * story picture, the 2026-10-20 backfill crawled at minutes per story).
 */

import { lanczosDownsample } from '../../media/ascii';

/** The original 2-D form, kept here as the definition the fast one must match. */
function reference(src: Float32Array, srcW: number, srcH: number, dstW: number, dstH: number): Float32Array {
  const kernel = (x: number, a = 3) => {
    if (x === 0) return 1;
    if (Math.abs(x) >= a) return 0;
    const p = Math.PI * x;
    return (a * Math.sin(p) * Math.sin(p / a)) / (p * p);
  };
  const out = new Float32Array(dstW * dstH);
  const sx = srcW / dstW, sy = srcH / dstH;
  const fx = Math.max(1, sx), fy = Math.max(1, sy);
  const supX = 3 * fx, supY = 3 * fy;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const cx = (x + 0.5) * sx, cy = (y + 0.5) * sy;
      let sum = 0, wsum = 0;
      for (let j = Math.max(0, Math.floor(cy - supY)); j <= Math.min(srcH - 1, Math.ceil(cy + supY)); j++) {
        const wy = kernel((cy - j - 0.5) / fy);
        for (let i = Math.max(0, Math.floor(cx - supX)); i <= Math.min(srcW - 1, Math.ceil(cx + supX)); i++) {
          const w = kernel((cx - i - 0.5) / fx) * wy;
          sum += src[j * srcW + i] * w;
          wsum += w;
        }
      }
      out[y * dstW + x] = wsum !== 0 ? sum / wsum : 0;
    }
  }
  return out;
}

function noise(w: number, h: number): Float32Array {
  const p = new Float32Array(w * h);
  let s = 12345;
  for (let i = 0; i < p.length; i++) { s = (s * 1103515245 + 12345) >>> 0; p[i] = s >>> 24; }
  return p;
}

describe('lanczosDownsample', () => {
  it.each([[300, 200, 77, 28], [97, 61, 40, 30], [64, 48, 64, 96], [50, 40, 7, 3]])(
    'matches the 2-D Lanczos-3 definition, %ix%i to %ix%i',
    (sw, sh, dw, dh) => {
      const src = noise(sw, sh);
      const fast = lanczosDownsample(src, sw, sh, dw, dh);
      const ref = reference(src, sw, sh, dw, dh);
      let worst = 0;
      for (let i = 0; i < ref.length; i++) worst = Math.max(worst, Math.abs(fast[i] - ref[i]));
      expect(worst).toBeLessThan(0.01);
    },
  );

  it('shrinks a 1200x800 picture to a sidecar size in well under a second (was about 4 s)', () => {
    const src = noise(1200, 800);
    const t = Date.now();
    lanczosDownsample(src, 1200, 800, 308, 112);
    expect(Date.now() - t).toBeLessThan(500);
  });
});
