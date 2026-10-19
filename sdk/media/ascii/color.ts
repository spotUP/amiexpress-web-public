/**
 * Colour maths and the two 16-colour palettes the converter targets.
 *
 * Lifted out of the backend `video:data` socket closure
 * (web/backend/src/handlers/audio-video.handler.ts) so one copy serves
 * the live video relay, the magazine's linked images and the tests.
 */

import { C64_PALETTE_COLODORE, hexToRgb } from '../../petscii/c64-palette';

export type PaletteName = 'amiga16' | 'c64';

export interface Hsv {
  hue: number; // 0-360
  saturation: number; // 0-1
  value: number; // 0-1
}

/** RGB (0-255) to HSV. Every channel is a byte; nothing is guessed from its size. */
export function rgbToHsv(r: number, g: number, b: number): Hsv {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  const saturation = Math.abs(max) > 1e-4 ? chroma / max : 0;
  let hue = 0;
  if (chroma >= 1e-4) {
    if (max === red) {
      hue = 60 * (((green - blue) / chroma) % 6);
      if (hue < 0) hue += 360;
    } else if (max === green) {
      hue = 60 * (2 + (blue - red) / chroma);
    } else {
      hue = 60 * (4 + (red - green) / chroma);
    }
  }
  return { hue, saturation, value: max };
}

/** CIE L*a*b* (D65), perceptually uniform. */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  r = r / 255;
  g = g / 255;
  b = b / 255;
  r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
  g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
  b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
  let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
  let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
  let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
  x = x / 0.95047;
  y = y / 1.0;
  z = z / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116);
  x = f(x);
  y = f(y);
  z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

/**
 * Names in blessed tag spelling, indexed like ANSI: 0-7 dark, 8-15 bright.
 * The Amiga ANSI palette is this order, so an index here is also the SGR
 * colour number (low 3 bits) plus the bold bit (bit 3).
 */
export const AMIGA16_NAMES: readonly string[] = [
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'lightblack', 'lightred', 'lightgreen', 'lightyellow',
  'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
];

export const AMIGA16_RGB: readonly (readonly [number, number, number])[] = [
  [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0],
  [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
  [85, 85, 85], [255, 85, 85], [85, 255, 85], [255, 255, 85],
  [85, 85, 255], [255, 85, 255], [85, 255, 255], [255, 255, 255],
];

/** C64 colours, indexed by VIC colour number (0 black, 1 white, 2 red ...). */
export const C64_RGB: readonly (readonly [number, number, number])[] =
  C64_PALETTE_COLODORE.map((hex) => hexToRgb(hex));

export function paletteRgb(palette: PaletteName): readonly (readonly [number, number, number])[] {
  return palette === 'c64' ? C64_RGB : AMIGA16_RGB;
}

const LAB_CACHE = new Map<PaletteName, [number, number, number][]>();
function paletteLab(palette: PaletteName): [number, number, number][] {
  let lab = LAB_CACHE.get(palette);
  if (!lab) {
    lab = paletteRgb(palette).map(([r, g, b]) => rgbToLab(r, g, b));
    LAB_CACHE.set(palette, lab);
  }
  return lab;
}

/**
 * Nearest palette index by lightness / chroma / hue distance in LAB.
 *
 * `isBackground` penalises black twelve-fold for a coloured source pixel, so
 * a dim colour keeps a coloured background instead of collapsing to black.
 * `limit` restricts the search to indices below it (an Amiga ANSI background
 * is one of eight).
 */
export function nearestPaletteIndex(
  r: number,
  g: number,
  b: number,
  palette: PaletteName,
  isBackground = false,
  limit = 16,
): number {
  const [L1, A1, B1] = rgbToLab(r, g, b);
  const labs = paletteLab(palette);
  const blackIndex = 0; // black is index 0 in both palettes
  let minDist = Infinity;
  let best = 0;
  for (let i = 0; i < limit; i++) {
    const [L2, A2, B2] = labs[i];
    const dL = L1 - L2;
    const dA = A1 - A2;
    const dB = B1 - B2;
    const C1 = Math.sqrt(A1 * A1 + B1 * B1);
    const C2 = Math.sqrt(A2 * A2 + B2 * B2);
    const dC = C1 - C2;
    const dH = Math.sqrt(Math.max(0, dA * dA + dB * dB - dC * dC));
    let dist = Math.sqrt(dL * dL + dC * dC + dH * dH);
    if (isBackground && i === blackIndex && (r > 10 || g > 10 || b > 10)) dist *= 12.0;
    if (dist < minDist) {
      minDist = dist;
      best = i;
    }
  }
  return best;
}

/** Luminance 0-255 with a 1/1.5 gamma that lifts midtones (faces stay visible). */
export function getLuminance(r: number, g: number, b: number): number {
  const linear = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return Math.pow(linear, 1.0 / 1.5) * 255;
}
