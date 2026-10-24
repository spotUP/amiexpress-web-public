/**
 * The one place that turns a background colour index into an SGR parameter.
 *
 * The board never paints an explicit black background: macOS Terminal draws
 * the default background transparent, so cells with SGR 40 show as black
 * blocks beside transparent ones. Black (index 0, or index 16 of the 256
 * cube, rgb 0,0,0) becomes SGR 49, the terminal default background.
 */

/** SGR background parameters for a 0-15 index (0-7 normal, 8-15 bright). */
export function bgCode(index: number): number {
  if (index === 0) return 49;
  return index < 8 ? 40 + index : 100 + (index - 8);
}

/** SGR parameter list for a 0-255 background index (256-colour above 15). */
export function bgParams(index: number): number[] {
  if (index < 16) return [bgCode(index)];
  if (index === 16) return [49];
  return [48, 5, index];
}
