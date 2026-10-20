/**
 * Image conditioning passes on a luminance map (values 0-1): Sobel edges,
 * CLAHE, temporal smoothing, unsharp mask, Lanczos resampling.
 * Lifted unchanged from the backend `video:data` handler.
 */

/** Per-stream memory for temporal smoothing. A still image passes none. */
export interface TemporalState {
  luma: Float32Array | null;
  /** The shape matcher's previous cells (glyph-match.ts), packed glyph/fg/bg. */
  cells?: Int32Array | null;
}

export function createTemporalState(): TemporalState {
  return { luma: null, cells: null };
}

/** 4x4 Bayer matrix for ordered dithering, centred on 0. */
export const BAYER_4X4: readonly (readonly number[])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((row) => row.map((v) => v / 16 - 0.5));

/** Sobel gradient magnitude. */
export function detectEdges(lumaMap: Float32Array, w: number, h: number): Float32Array {
  const edges = new Float32Array(w * h);
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let gx = 0;
      let gy = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const luma = lumaMap[(y + ky) * w + (x + kx)];
          gx += luma * sobelX[ky + 1][kx + 1];
          gy += luma * sobelY[ky + 1][kx + 1];
        }
      }
      edges[y * w + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

/** Contrast Limited Adaptive Histogram Equalisation. */
export function applyCLAHE(
  lumaMap: Float32Array,
  w: number,
  h: number,
  tileSize = 8,
  clipLimit = 2.5,
): Float32Array {
  const enhanced = new Float32Array(w * h);
  const tilesX = Math.ceil(w / tileSize);
  const tilesY = Math.ceil(h / tileSize);
  const cdfs: number[][][] = [];
  for (let ty = 0; ty < tilesY; ty++) {
    cdfs[ty] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Array<number>(256).fill(0);
      let count = 0;
      for (let y = ty * tileSize; y < Math.min((ty + 1) * tileSize, h); y++) {
        for (let x = tx * tileSize; x < Math.min((tx + 1) * tileSize, w); x++) {
          hist[Math.floor(lumaMap[y * w + x] * 255)]++;
          count++;
        }
      }
      const clipVal = (clipLimit * count) / 256;
      let clipped = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipVal) {
          clipped += hist[i] - clipVal;
          hist[i] = clipVal;
        }
      }
      const redistribution = clipped / 256;
      for (let i = 0; i < 256; i++) hist[i] += redistribution;
      const cdf = new Array<number>(256);
      cdf[0] = hist[0];
      for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
      for (let i = 0; i < 256; i++) cdf[i] = cdf[i] / count;
      cdfs[ty][tx] = cdf;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const bin = Math.floor(lumaMap[idx] * 255);
      const tileX = x / tileSize;
      const tileY = y / tileSize;
      const tx = Math.min(tilesX - 1, Math.floor(tileX));
      const ty = Math.min(tilesY - 1, Math.floor(tileY));
      const fx = tileX - tx;
      const fy = tileY - ty;
      const tx1 = Math.min(tilesX - 1, tx + 1);
      const ty1 = Math.min(tilesY - 1, ty + 1);
      const v0 = cdfs[ty][tx][bin] * (1 - fx) + cdfs[ty][tx1][bin] * fx;
      const v1 = cdfs[ty1][tx][bin] * (1 - fx) + cdfs[ty1][tx1][bin] * fx;
      enhanced[idx] = v0 * (1 - fy) + v1 * fy;
    }
  }
  return enhanced;
}

/**
 * Exponential moving average against the previous frame (alpha 0.65 current)
 * to stop flickering pixels. The first frame, or a size change, passes
 * through and primes `state`.
 */
export function applyTemporalSmoothing(
  currentLuma: Float32Array,
  state: TemporalState,
  alpha = 0.65,
): Float32Array {
  const cached = state.luma;
  if (!cached || cached.length !== currentLuma.length) {
    state.luma = new Float32Array(currentLuma);
    return currentLuma;
  }
  const smoothed = new Float32Array(currentLuma.length);
  for (let i = 0; i < currentLuma.length; i++) {
    smoothed[i] = alpha * currentLuma[i] + (1 - alpha) * cached[i];
  }
  state.luma = new Float32Array(smoothed);
  return smoothed;
}

/** Sharpen: original + amount * (original - 3x3 Gaussian blur). */
export function applyUnsharpMask(lumaMap: Float32Array, w: number, h: number, amount = 1.5): Float32Array {
  const sharpened = new Float32Array(w * h);
  const kernel = [[1, 2, 1], [2, 4, 2], [1, 2, 1]];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let blurred = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = Math.max(0, Math.min(h - 1, y + ky));
          const nx = Math.max(0, Math.min(w - 1, x + kx));
          blurred += lumaMap[ny * w + nx] * kernel[ky + 1][kx + 1];
        }
      }
      blurred /= 16;
      const original = lumaMap[y * w + x];
      sharpened[y * w + x] = Math.max(0, Math.min(1, original + amount * (original - blurred)));
    }
  }
  return sharpened;
}

function lanczosKernel(x: number, a = 3): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= a) return 0;
  const piX = Math.PI * x;
  return (a * Math.sin(piX) * Math.sin(piX / a)) / (piX * piX);
}

/**
 * Lanczos-3 resample of one channel. When shrinking, the kernel support is
 * widened by the scale factor so every source pixel under a destination cell
 * contributes (a fixed 7x7 window aliased a photograph down to 80 columns).
 */
export function lanczosDownsample(
  src: Float32Array,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Float32Array {
  // The 2-D kernel is the product of two 1-D kernels, so the normalised sum
  // is a row pass then a column pass with each axis's weights computed once.
  // Summed per output pixel over the whole window it took about 4 s to shrink
  // a 1200x800 picture to one sidecar size, on the board's main thread.
  const tapsX = lanczosTaps(srcW, dstW);
  const tapsY = lanczosTaps(srcH, dstH);
  const rowsOut = new Float32Array(dstW * srcH);
  for (let j = 0; j < srcH; j++) {
    const row = j * srcW;
    for (let x = 0; x < dstW; x++) {
      const { first, weights } = tapsX[x];
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += src[row + first + k] * weights[k];
      rowsOut[j * dstW + x] = sum;
    }
  }
  const out = new Float32Array(dstW * dstH);
  for (let y = 0; y < dstH; y++) {
    const { first, weights } = tapsY[y];
    for (let x = 0; x < dstW; x++) {
      let sum = 0;
      for (let k = 0; k < weights.length; k++) sum += rowsOut[(first + k) * dstW + x] * weights[k];
      out[y * dstW + x] = sum;
    }
  }
  return out;
}

/**
 * The source pixels and normalised Lanczos-3 weights for each destination
 * pixel along one axis. All-zero weights stay zero, so that pixel comes out 0.
 */
function lanczosTaps(srcN: number, dstN: number): { first: number; weights: Float64Array }[] {
  const a = 3;
  const scale = srcN / dstN;
  const f = Math.max(1, scale);
  const sup = a * f;
  const taps: { first: number; weights: Float64Array }[] = [];
  for (let d = 0; d < dstN; d++) {
    const centre = (d + 0.5) * scale;
    const first = Math.max(0, Math.floor(centre - sup));
    const last = Math.min(srcN - 1, Math.ceil(centre + sup));
    const weights = new Float64Array(Math.max(0, last - first + 1));
    let total = 0;
    for (let i = first; i <= last; i++) {
      const w = lanczosKernel((centre - i - 0.5) / f, a);
      weights[i - first] = w;
      total += w;
    }
    if (total !== 0) for (let k = 0; k < weights.length; k++) weights[k] /= total;
    taps.push({ first, weights });
  }
  return taps;
}
