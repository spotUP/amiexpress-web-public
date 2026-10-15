/**
 * The sixteen ANSI colours, in the order a Cell numbers them.
 *
 * The SDK's editor stores `fg`/`bg` as the SGR number minus 30 - red is 1 -
 * and bright as 8 plus that. This is NOT the EGA/BIOS order (`EGA_PALETTE` in
 * the terminal package, where red is 4): indexing one table with the other's
 * number rotates every colour on screen. Anything that renders a Cell reads
 * this table; anything that reads a RIP palette number reads that one.
 */
export const ANSI_PALETTE: readonly string[] = [
  '#000000', // 0 - Black
  '#AA0000', // 1 - Red
  '#00AA00', // 2 - Green
  '#AA5500', // 3 - Yellow (brown at normal intensity)
  '#0000AA', // 4 - Blue
  '#AA00AA', // 5 - Magenta
  '#00AAAA', // 6 - Cyan
  '#AAAAAA', // 7 - White (light grey)
  '#555555', // 8 - Bright black (dark grey)
  '#FF5555', // 9 - Bright red
  '#55FF55', // 10 - Bright green
  '#FFFF55', // 11 - Bright yellow
  '#5555FF', // 12 - Bright blue
  '#FF55FF', // 13 - Bright magenta
  '#55FFFF', // 14 - Bright cyan
  '#FFFFFF', // 15 - Bright white
];

/**
 * What an Amiga caller actually sees.
 *
 * AmiExpress ran on console.device, which has EIGHT pens: `ibmcon` gave a
 * board sixteen, and almost nobody ran it (sysop, 2026-09-14). The Amiga had
 * no iCE colours either, so a bright BACKGROUND is not a thing a caller could
 * be shown - it lands on the same eight.
 *
 * The collapse is the low three bits, which is what dropping the bold
 * attribute does: bright yellow (11) is yellow (3), bright green (10) is
 * green (2). It is a PREVIEW, not a restriction - the art keeps the colour it
 * was drawn in, and a web or telnet caller still sees all sixteen.
 */
export function amigaPen(index: number): number {
  return ((index % 8) + 8) % 8;
}

/** How a preview names its palette. */
export type PaletteMode = 'full' | 'amiga';

/** The colour of a Cell index in the palette a preview is showing. */
export function paletteColor(index: number, mode: PaletteMode = 'full'): string {
  return ansiColor(mode === 'amiga' ? amigaPen(index) : index);
}

/** The colour of a Cell's `fg`/`bg`, with anything out of range read as black. */
export function ansiColor(index: number): string {
  return ANSI_PALETTE[index] ?? ANSI_PALETTE[0];
}

/**
 * What each colour is called, for the pickers. Full words: a sysop choosing a
 * colour should read "Bright magenta", not "BMag".
 */
export const ANSI_COLOR_NAMES: readonly string[] = [
  'Black', 'Red', 'Green', 'Yellow', 'Blue', 'Magenta', 'Cyan', 'White',
  'Bright black', 'Bright red', 'Bright green', 'Bright yellow',
  'Bright blue', 'Bright magenta', 'Bright cyan', 'Bright white',
];
