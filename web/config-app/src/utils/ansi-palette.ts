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

/** The colour of a Cell's `fg`/`bg`, with anything out of range read as black. */
export function ansiColor(index: number): string {
  return ANSI_PALETTE[index] ?? ANSI_PALETTE[0];
}
