/**
 * VIC-II C64 color palette + PETSCII color code -> VIC index mapping.
 *
 * The C64's VIC-II chip does not have a fixed, standardized RGB palette -
 * every emulator/monitor combination looks slightly different. Colodore and
 * Pepto are the two most widely used "reference" palettes for emulation and
 * display purposes; Colodore is the default here because it is the closer
 * match to a properly calibrated composite/S-Video display.
 *
 * Twin of web/backend/src/utils/c64-palette.ts — keep values in sync.
 *
 * References: reference doc `thoughts/shared/research/2026-09-01_true-petscii-reference.md` section 3.
 */

// Colodore (default) - https://www.colodore.com/
export const C64_PALETTE_COLODORE: readonly string[] = [
  '#000000', '#FFFFFF', '#813338', '#75CEC8', '#8E3C97', '#56AC4D', '#2E2C9B', '#EDF171',
  '#8E5029', '#553800', '#C46C71', '#4A4A4A', '#7B7B7B', '#A9FF9F', '#706DEB', '#B2B2B2',
];

// Pepto (classic VICE default palette)
export const C64_PALETTE_PEPTO: readonly string[] = [
  '#000000', '#FFFFFF', '#68372B', '#70A4B2', '#6F3D86', '#588D43', '#352879', '#B8C76F',
  '#6F4F25', '#433900', '#9A6759', '#444444', '#6C6C6C', '#9AD284', '#6C5EB5', '#959595',
];

// PETSCII color control byte -> VIC color index
export const PETSCII_COLOR_TO_VIC: { [key: number]: number } = {
  0x90: 0, 0x05: 1, 0x1C: 2, 0x9F: 3, 0x9C: 4, 0x1E: 5, 0x1F: 6, 0x9E: 7,
  0x81: 8, 0x95: 9, 0x96: 10, 0x97: 11, 0x98: 12, 0x99: 13, 0x9A: 14, 0x9B: 15,
};

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function vicToSgrForeground(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  const [r, g, b] = hexToRgb(palette[vic & 0x0F]);
  return `\x1b[38;2;${r};${g};${b}m`;
}

export function vicToSgrBackground(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  const [r, g, b] = hexToRgb(palette[vic & 0x0F]);
  return `\x1b[48;2;${r};${g};${b}m`;
}
