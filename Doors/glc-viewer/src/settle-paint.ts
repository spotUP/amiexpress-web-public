/**
 * Painting a table over its own placeholders, one settling frame at a time.
 *
 * Both widths do the same thing here: walk the cursor back over the rows that
 * are already on screen, and write the new ones on top. What this adds is
 * that the new ones arrive as NOISE and stop on their real characters, which
 * is what the sysop asked for.
 *
 * The whole table settles TOGETHER - every row advances a little per frame -
 * rather than row by row. A row-at-a-time reveal reads as a list being typed;
 * all at once reads as a signal resolving, which is what it is.
 */
import { rewind, overwrite } from './skeleton';
import {
  nothingSettled, scrambleFrame, settleSome, stillMoving, visibleLength, type Random,
} from './scramble';

/** Somewhere to write to - the door's socket, and nothing else about it. */
export interface Wire {
  emit(event: string, payload: string): unknown;
}

export interface SettleOptions {
  /** Off leaves the plain paint: one write per row, no frames. */
  animate: boolean;
  /** How many frames the table takes to settle. */
  frames?: number;
  random?: Random;
}

/** One frame of every row, over the rows already on screen. */
function paintFrame(wire: Wire, lines: readonly string[], onScreen: number): void {
  if (onScreen > 0) wire.emit('ansi-output', rewind(onScreen));
  for (const line of lines) wire.emit('ansi-output', overwrite(line) + '\r\n');
}

/**
 * Write `lines` over `onScreen` placeholder rows.
 *
 * Returns how many rows are on screen afterwards, so a caller can clear the
 * placeholders its shorter list did not reach.
 */
export function settleOnto(
  wire: Wire,
  lines: readonly string[],
  onScreen: number,
  options: SettleOptions,
): number {
  const frames = Math.max(1, options.frames ?? 5);
  const random = options.random ?? Math.random;

  if (options.animate && lines.length > 0) {
    const masks = lines.map((line) => nothingSettled(visibleLength(line)));
    const perFrame = Math.max(
      1,
      Math.ceil(Math.max(...masks.map((m) => m.length), 1) / frames),
    );

    for (let frame = 0; frame < frames && masks.some(stillMoving); frame++) {
      for (let i = 0; i < masks.length; i++) masks[i] = settleSome(masks[i], perFrame, random);
      paintFrame(wire, lines.map((line, i) => scrambleFrame(line, masks[i], random)), onScreen);
      // Every frame after the first writes over the frame before it, not over
      // the placeholders.
      onScreen = lines.length;
    }
  }

  // The last write is always the real table, whatever the frames did.
  paintFrame(wire, lines, onScreen);
  return lines.length;
}
