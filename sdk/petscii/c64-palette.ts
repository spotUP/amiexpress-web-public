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

/** The VIC colour this RGB is nearest to. An exact hit wins outright. */
export function nearestVicForRgb(r: number, g: number, b: number, palette: readonly string[] = C64_PALETTE_COLODORE): number {
  let best = 0;
  let bestDist = Infinity;
  for (let vic = 0; vic < 16; vic++) {
    const [pr, pg, pb] = hexToRgb(palette[vic]);
    if (pr === r && pg === g && pb === b) return vic;
    const d = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (d < bestDist) { bestDist = d; best = vic; }
  }
  return best;
}

/**
 * A VIC COLOUR AS AN SGR A CELL BUFFER CAN HOLD WITHOUT LOSING IT.
 *
 * `vicToSgrForeground` spells the pen as truecolor, which is right on the wire
 * - an ANSI caller gets the exact C64 hue. It is WRONG into a cell buffer:
 * blessed keeps a palette index per cell, and its matcher is neo-blessed's
 * luminance-weighted one, which puts VIC red (#813338) on xterm 238, a dark
 * grey. A colour a caller picked came out grey on a C64 for that reason alone.
 *
 * The 16-colour SGR pair cannot carry the pen either: `SGR_DIM`/`SGR_BRIGHT`
 * between them name thirteen of the sixteen VIC colours, and the three they
 * miss are orange, brown and mid grey - three colours this board's art uses.
 *
 * So the pen is spelled as xterm-256, chosen HERE by plain Euclidean distance
 * over the 6x6x6 cube and the grey ramp. The index is only ever read back by
 * the transducer's own `xterm256ToRgb` + `nearestVicForRgb`, and the round
 * trip is pinned by a test for all sixteen.
 */
const SGR256_FOR_VIC = new Map<string, number>();

export function vicToSgr256(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  return `\x1b[38;5;${vicToXterm256(vic, palette)}m`;
}

/** The xterm-256 index nearest this VIC colour, from the cube and the grey ramp. */
export function vicToXterm256(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): number {
  const key = `${palette[0]}:${vic & 0x0f}`;
  const cached = SGR256_FOR_VIC.get(key);
  if (cached !== undefined) return cached;

  const [r, g, b] = hexToRgb(palette[vic & 0x0f]);
  let best = -1;
  let bestDistance = Infinity;
  let fallback = 16;
  let fallbackDistance = Infinity;
  // 0-15 are skipped on purpose: what those sixteen look like is the caller's
  // theme, not a colour anyone can measure from here.
  for (let index = 16; index <= 255; index++) {
    const [r2, g2, b2] = xterm256Rgb(index);
    const distance = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (distance < fallbackDistance) { fallbackDistance = distance; fallback = index; }
    /*
     * NEAREST IS NOT ENOUGH - IT HAS TO COME BACK.
     *
     * The index is read back by nearest-VIC, so the only ones worth choosing
     * are those that land on THIS colour again. Plain nearest put VIC red
     * (129,51,56) on xterm 95 (135,95,95), which is nearer to grey than to
     * red and came back as grey.
     */
    if (nearestVicForRgb(r2, g2, b2, palette) !== (vic & 0x0f)) continue;
    if (distance < bestDistance) { bestDistance = distance; best = index; }
  }
  if (best < 0) best = fallback;
  SGR256_FOR_VIC.set(key, best);
  return best;
}

/** The 6x6x6 cube (16-231) and the grey ramp (232-255), by the xterm formula. */
function xterm256Rgb(n: number): [number, number, number] {
  if (n <= 231) {
    const i = n - 16;
    const v = (c: number) => (c === 0 ? 0 : 55 + c * 40);
    return [v(Math.floor(i / 36)), v(Math.floor(i / 6) % 6), v(i % 6)];
  }
  const grey = 8 + 10 * (n - 232);
  return [grey, grey, grey];
}

export function vicToSgrBackground(vic: number, palette: readonly string[] = C64_PALETTE_COLODORE): string {
  const [r, g, b] = hexToRgb(palette[vic & 0x0F]);
  return `\x1b[48;2;${r};${g};${b}m`;
}
