/**
 * VIC-II C64 color palette + PETSCII color code -> VIC index mapping.
 *
 * The C64's VIC-II chip does not have a fixed, standardized RGB palette -
 * every emulator/monitor combination looks slightly different. Colodore and
 * Pepto are the two most widely used "reference" palettes for emulation and
 * display purposes; Colodore is the default here because it is the closer
 * match to a properly calibrated composite/S-Video display.
 *
 * The ONE copy: web/backend/src/utils/c64-palette.ts and packages/terminal re-export from here.
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

/**
 * THE C128's 80-COLUMN PALETTE, in VIC colour order.
 *
 * The VDC is not a VIC-II: it has sixteen RGBI colours, and a C128 in
 * 80-column mode shows a PETSCII colour byte in whichever of them its KERNAL
 * translates that byte to. The mapping is NOT a nearest-colour search - it is
 * a table (KERNAL $CE5C), corroborated cell for cell by CTerm's Table 19
 * (thoughts/shared/research/2026-09-06_c128-80-column-petscii.md), and it has
 * four surprises in it that a nearest-match would never produce:
 *
 *   PETSCII orange     ($81) shows as CGA 5,  MAGENTA
 *   PETSCII dark grey  ($97) shows as CGA 3,  CYAN
 *   PETSCII brown      ($95) shows as CGA 6,  brown - the one that survives
 *   PETSCII light grey ($9B) shows as CGA 7,  light grey, where mid grey
 *                            ($98) takes CGA 8, the darker one
 *
 * Written in VIC colour order, because that is what the rest of this board
 * indexes with: entry N is what a C128 puts on the glass for the byte the
 * VIC-II would have drawn in colour N.
 */
export const C128_VDC_PALETTE: readonly string[] = [
  '#000000', // 0  black       -> CGA 0  black
  '#FFFFFF', // 1  white       -> CGA 15 white
  '#AA0000', // 2  red         -> CGA 4  red
  '#55FFFF', // 3  cyan        -> CGA 11 light cyan
  '#FF55FF', // 4  purple      -> CGA 13 light magenta
  '#00AA00', // 5  green       -> CGA 2  green
  '#0000AA', // 6  blue        -> CGA 1  blue
  '#FFFF55', // 7  yellow      -> CGA 14 yellow
  '#AA00AA', // 8  orange      -> CGA 5  MAGENTA (the famous one)
  '#AA5500', // 9  brown       -> CGA 6  brown
  '#FF5555', // 10 light red   -> CGA 12 light red
  '#00AAAA', // 11 dark grey   -> CGA 3  CYAN
  '#555555', // 12 mid grey    -> CGA 8  dark grey
  '#55FF55', // 13 light green -> CGA 10 light green
  '#5555FF', // 14 light blue  -> CGA 9  light blue
  '#AAAAAA', // 15 light grey  -> CGA 7  light grey
];

/** The palettes a PETSCII screen can be painted with, by the name the wire uses. */
export const PETSCII_PALETTES = {
  /** A C64's own colours. The 40-column screen is always this. */
  vic: C64_PALETTE_COLODORE,
  /** What a C128 shows on its 80-column screen. */
  vdc: C128_VDC_PALETTE,
} as const;

export type PetsciiPaletteName = keyof typeof PETSCII_PALETTES;

/** The palette for a name, falling back to the C64's when the name is unknown. */
export function petsciiPaletteFor(name: string | null | undefined): readonly string[] {
  return name === 'vdc' ? C128_VDC_PALETTE : C64_PALETTE_COLODORE;
}

// PETSCII color control byte -> VIC color index
export const PETSCII_COLOR_TO_VIC: { [key: number]: number } = {
  0x90: 0, 0x05: 1, 0x1C: 2, 0x9F: 3, 0x9C: 4, 0x1E: 5, 0x1F: 6, 0x9E: 7,
  0x81: 8, 0x95: 9, 0x96: 10, 0x97: 11, 0x98: 12, 0x99: 13, 0x9A: 14, 0x9B: 15,
};

/** '#RRGGBB' -> [r, g, b]. The ONE copy: the transducer's nearest-color search imports it from here. */
export function hexToRgb(hex: string): [number, number, number] {
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
