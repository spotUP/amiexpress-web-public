/**
 * Picture to text cells: one converter for the live video relay and for
 * still images. An image is one frame with no temporal state.
 *
 * Plain 16-colour ANSI: every cell is one ASCII character plus a foreground
 * and a background index into a 16-colour palette. No 24-bit colour and no
 * block, braille or half-block glyphs.
 *
 * Lifted from the backend `video:data` handler (ascii and hsv modes).
 */

import {
  AMIGA16_RGB,
  getLuminance,
  nearestPaletteIndex,
  rgbToHsv,
  type Hsv,
  type PaletteName,
} from './color';
import {
  BAYER_4X4,
  applyCLAHE,
  applyTemporalSmoothing,
  applyUnsharpMask,
  detectEdges,
  lanczosDownsample,
  type TemporalState,
} from './dsp';

export interface PixelSource {
  /** Row-major bytes: RGB triples (channels 3, the default) or grey (channels 1). */
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
  channels?: 1 | 3;
}

export interface AnsiCell {
  char: string;
  /** Foreground palette index 0-15. */
  fg: number;
  /** Background palette index 0-15 (0-7 for Amiga ANSI unless bgLevels is 16; always 0 for c64). */
  bg: number;
}

export type AnsiCellGrid = AnsiCell[][];

/**
 * 'ascii': contrast-conditioned density ramp, nearest-colour fg and dimmed bg.
 * 'hsv': value-ramp characters, Sobel edge-direction characters, retro hue colour.
 */
export type AsciiMode = 'ascii' | 'hsv';

export interface ConvertOptions {
  palette: PaletteName;
  mode?: AsciiMode;
  /** Pass the stream's state to smooth flicker between frames; omit for a still image. */
  state?: TemporalState;
  /** Flip left-right (a webcam is un-mirrored). */
  mirror?: boolean;
  /** Background choices: 8 (default, what Amiga ANSI can draw) or 16. Ignored for c64. */
  bgLevels?: 8 | 16;
}

/** Density ramp, ordered by measured visual weight rather than ASCII order. */
const CHARSET_CALIBRATED = ' .`\'-_,^":;~!>+<i|?/\\Il1)(}{[]tfjrxnuvcz*XYUJCLQ0OoZmwqpbdkhao#MW&8%N@$';
/** The hsv value ramp, light to dense. */
const VALUE_CHARS = ' .-=+*x#$&X@';

/**
 * Characters the C64 charset cannot show as themselves, plus the double
 * quote: it switches the C64 into quote mode, where colour codes print as
 * glyphs instead of changing colour.
 */
const C64_FORBIDDEN = '\\_{}~|`"';
export const isC64Safe = (ch: string): boolean => !C64_FORBIDDEN.includes(ch);

function rampFor(palette: PaletteName): string {
  return palette === 'c64' ? [...CHARSET_CALIBRATED].filter(isC64Safe).join('') : CHARSET_CALIBRATED;
}

/** Edge-direction characters; the c64 set swaps out the ones its charset lacks. */
function edgeChar(angle: number, palette: PaletteName): string {
  const c64 = palette === 'c64';
  if ((angle >= 22.5 && angle <= 67.5) || (angle >= -157.5 && angle <= -112.5)) return c64 ? 'x' : '\\';
  if ((angle >= 67.5 && angle <= 112.5) || (angle >= -112.5 && angle <= -67.5)) return c64 ? '-' : '_';
  if ((angle >= 112.5 && angle <= 157.5) || (angle >= -67.5 && angle <= -22.5)) return '/';
  return c64 ? '!' : '|';
}

/** Skin-tone aware 16-colour pick, as Amiga palette indices. */
function retroColorIndex(hsv: Hsv): number {
  if (hsv.saturation < 0.15) {
    if (hsv.value < 0.2) return 0;
    if (hsv.value < 0.4) return 8;
    if (hsv.value < 0.7) return 7;
    return 15;
  }
  const skinHue = hsv.hue <= 50 || hsv.hue >= 340;
  if (skinHue && hsv.saturation >= 0.15 && hsv.saturation < 0.55) {
    if (hsv.value < 0.3) return 1;
    if (hsv.value < 0.5) return 3;
    if (hsv.value < 0.7) return 11;
    return 15;
  }
  const hueIndex = Math.round(hsv.hue / 60) % 6;
  const dark = [1, 3, 2, 6, 4, 5];
  const light = [9, 11, 10, 14, 12, 13];
  return (hsv.value >= 0.5 ? light : dark)[hueIndex];
}

const AMIGA_TO_C64 = AMIGA16_RGB.map((rgb) => nearestPaletteIndex(rgb[0], rgb[1], rgb[2], 'c64'));

/** Resample (when the picture is not already cols x rows) and mirror into RGB bytes. */
function toRgbGrid(src: PixelSource, cols: number, rows: number, mirror: boolean): Uint8Array {
  const channels = src.channels ?? 3;
  const { width, height } = src;
  const planes: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const plane = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) plane[i] = src.data[i * channels + c];
    planes.push(width === cols && height === rows ? plane : lanczosDownsample(plane, width, height, cols, rows));
  }
  const out = new Uint8Array(cols * rows * 3);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const sx = mirror ? cols - 1 - x : x;
      const o = (y * cols + x) * 3;
      for (let c = 0; c < 3; c++) {
        const v = planes[channels === 1 ? 0 : c][y * cols + sx];
        out[o + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return out;
}

export function frameToAnsiCells(
  pixels: PixelSource,
  cols: number,
  rows: number,
  opts: ConvertOptions,
): AnsiCellGrid {
  const { palette, mode = 'ascii', state, mirror = false } = opts;
  const bgLimit = palette === 'c64' ? 1 : (opts.bgLevels ?? 8);
  const rgb = toRgbGrid(pixels, cols, rows, mirror);
  const px = (x: number, y: number): [number, number, number] => {
    const o = (y * cols + x) * 3;
    return [rgb[o], rgb[o + 1], rgb[o + 2]];
  };
  const grid: AnsiCellGrid = [];

  if (mode === 'hsv') {
    const gray = new Float32Array(cols * rows);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const [r, g, b] = px(x, y);
        gray[y * cols + x] = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      }
    }
    const sobelX = new Float32Array(cols * rows);
    const sobelY = new Float32Array(cols * rows);
    const Gx = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
    const Gy = [[1, 2, 1], [0, 0, 0], [-1, -2, -1]];
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 1; x < cols - 1; x++) {
        let gx = 0;
        let gy = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const luma = gray[(y + ky) * cols + (x + kx)];
            gx += luma * Gx[ky + 1][kx + 1];
            gy += luma * Gy[ky + 1][kx + 1];
          }
        }
        sobelX[y * cols + x] = gx;
        sobelY[y * cols + x] = gy;
      }
    }
    const edgeThreshold = 1.5;
    for (let y = 0; y < rows; y++) {
      const line: AnsiCell[] = [];
      for (let x = 0; x < cols; x++) {
        const idx = y * cols + x;
        const [r, g, b] = px(x, y);
        const hsv = rgbToHsv(r, g, b);
        const n = VALUE_CHARS.length;
        let ci = Math.floor(hsv.value * hsv.value * n);
        if (ci >= n) ci = n - 1;
        if (ci < 0) ci = 0;
        let char = VALUE_CHARS[ci];
        const sx = sobelX[idx];
        const sy = sobelY[idx];
        if (sx * sx + sy * sy >= edgeThreshold * edgeThreshold) {
          char = edgeChar(Math.atan2(sy, sx) * (180 / Math.PI), palette);
        }
        const amiga = retroColorIndex(hsv);
        line.push({ char, fg: palette === 'c64' ? AMIGA_TO_C64[amiga] : amiga, bg: 0 });
      }
      grid.push(line);
    }
    return grid;
  }

  // ascii mode
  const charset = rampFor(palette);
  const charCount = charset.length;
  const lumaMap = new Float32Array(cols * rows);
  for (let i = 0; i < cols * rows; i++) {
    const [r, g, b] = px(i % cols, Math.floor(i / cols));
    lumaMap[i] = getLuminance(r, g, b) / 255;
  }
  const smoothed = state ? applyTemporalSmoothing(lumaMap, state) : lumaMap;

  // Stretch between the 2nd and 98th percentile so the ramp uses its full range.
  const sorted = Array.from(smoothed).sort((a, b) => a - b);
  const minLuma = sorted[Math.floor(sorted.length * 0.02)];
  const maxLuma = sorted[Math.floor(sorted.length * 0.98)];
  const range = maxLuma - minLuma;
  const stretched = new Float32Array(cols * rows);
  for (let i = 0; i < smoothed.length; i++) {
    stretched[i] = range > 0 ? Math.max(0, Math.min(1, (smoothed[i] - minLuma) / range)) : smoothed[i];
  }
  const enhanced = applyCLAHE(stretched, cols, rows, 8, 1.5);
  const sharpened = applyUnsharpMask(enhanced, cols, rows, 1.5);
  const edgeMap = detectEdges(sharpened, cols, rows);
  let maxEdge = 0;
  for (let i = 0; i < edgeMap.length; i++) if (edgeMap[i] > maxEdge) maxEdge = edgeMap[i];

  for (let y = 0; y < rows; y++) {
    const line: AnsiCell[] = [];
    for (let x = 0; x < cols; x++) {
      const idx = y * cols + x;
      const [r, g, b] = px(x, y);
      let luma = sharpened[idx];
      luma = Math.max(0, Math.min(1, luma + BAYER_4X4[y % 4][x % 4] * 0.06));
      const edgeStrength = maxEdge > 0 ? edgeMap[idx] / maxEdge : 0;
      if (edgeStrength > 0.2) luma = Math.pow(luma, 0.7);
      else if (edgeStrength > 0.1) luma = Math.pow(luma, 0.85);
      luma = luma < 0.5 ? Math.pow(luma, 1.2) : Math.pow(luma, 0.8);
      const char = charset[Math.max(0, Math.min(charCount - 1, Math.floor(luma * (charCount - 1))))];

      const fg = nearestPaletteIndex(
        Math.min(255, Math.floor(r * 1.2)),
        Math.min(255, Math.floor(g * 1.2)),
        Math.min(255, Math.floor(b * 1.2)),
        palette,
      );
      let bg = 0;
      if (bgLimit > 1) {
        // Very dark areas keep a true black background; the rest dims to half.
        const dim: [number, number, number] =
          getLuminance(r, g, b) < 30 ? [0, 0, 0] : [Math.floor(r * 0.5), Math.floor(g * 0.5), Math.floor(b * 0.5)];
        bg = nearestPaletteIndex(dim[0], dim[1], dim[2], palette, true, bgLimit);
      }
      line.push({ char, fg, bg });
    }
    grid.push(line);
  }
  return grid;
}
