/**
 * Painting a table over its own placeholders, and noise while it is awaited.
 *
 * Both widths do the same thing here: walk the cursor back over the rows that
 * are already on screen, and write the real ones on top. The noise covers the
 * WAIT only (`waitingScramble`); once the data is in hand the real table is
 * written at once, with no reveal frames after it - the caller already
 * waited for the network and the sysop asked that nothing be added to that
 * (2026-11-06).
 */
import { rewind, overwrite } from './skeleton';
import { nothingSettled, scrambleFrame, visibleLength, type Random } from './scramble';

/**
 * HOW OFTEN A SCRAMBLED FRAME GOES OUT while the scenewall is asked.
 *
 * Eight frames a second: enough to read as movement, and forty columns of
 * ten rows is under four hundred bytes a frame, which a 19200 line carries
 * without noticing.
 */
export const SCRAMBLE_FRAME_MS = 125;

/** Somewhere to write to - the door's socket, and nothing else about it. */
export interface Wire {
  emit(event: string, payload: string): unknown;
}

/** One frame of every row, over the rows already on screen. */
function paintFrame(wire: Wire, lines: readonly string[], onScreen: number): void {
  if (onScreen > 0) wire.emit('ansi-output', rewind(onScreen));
  for (const line of lines) wire.emit('ansi-output', overwrite(line) + '\r\n');
}

/**
 * Write `lines` over `onScreen` placeholder rows, in this tick.
 *
 * SYNCHRONOUS on purpose: no timer, no frame, no await. Returns how many rows
 * are on screen afterwards, so a caller can clear the placeholders its
 * shorter list did not reach.
 */
export function paintOnto(wire: Wire, lines: readonly string[], onScreen: number): number {
  paintFrame(wire, lines, onScreen);
  return lines.length;
}

/**
 * NOISE WHILE THE SCENEWALL IS ASKED.
 *
 * The placeholder rows are redrawn as scrambled characters until the answer
 * lands, so a caller can see the door is working rather than guessing at a
 * still screen. Every frame is noise; the real rows are written once, by `paintOnto`. The rows
 * marked `still` (the rules, the legend) are drawn as themselves: the page's
 * frame holds while the values inside it churn.
 *
 *  * Returns the stop function. The timer is unref'd - a door must not hold the
 * process open - and stopping it is the CALLER's job in a `finally`, or a
 * frame arriving after the table would overwrite it.
 */
export function waitingScramble(
  wire: Wire,
  placeholders: readonly string[],
  still: readonly boolean[],
  options: { frameMs?: number; random?: Random } = {},
): () => void {
  if (placeholders.length === 0) return () => {};
  const random = options.random ?? Math.random;
  const masks = placeholders.map((row) => nothingSettled(visibleLength(row)));

  const timer = setInterval(() => {
    paintFrame(
      wire,
      placeholders.map((row, i) => (still[i] ? row : scrambleFrame(row, masks[i], random))),
      placeholders.length,
    );
  }, Math.max(0, options.frameMs ?? SCRAMBLE_FRAME_MS));
  if (typeof timer.unref === 'function') timer.unref();

  return () => clearInterval(timer);
}
