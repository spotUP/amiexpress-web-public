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

/**
 * HOW OFTEN A SCRAMBLED FRAME GOES OUT - one number for both animations.
 *
 * The waiting noise ran on a 125ms interval and the settling on 60ms
 * frames, so the reveal churned at twice the speed of the wait and the
 * change of pace read as a glitch: "when it switches from scrambling to the
 * revealing scrambling it scrambles faster" (sysop, 2026-09-16). It is one
 * animation to a caller - noise that resolves - so it is one cadence here.
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

export interface SettleOptions {
  /** Off leaves the plain paint: one write per row, no frames. */
  animate: boolean;
  /** How many frames the table takes to settle. More frames, slower fade. */
  frames?: number;
  /** Milliseconds between frames. Without this the frames arrive together. */
  frameMs?: number;
  random?: Random;
  /** Injected so a test does not wait in real time. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Rows that are already what they will be - the rules and the legend
   * under the table. `still[i]` true means row `i` starts settled and is
   * never drawn as noise; the page's frame holds while the values in it
   * resolve.
   */
  still?: readonly boolean[];
}

/** One frame of every row, over the rows already on screen. */
function paintFrame(wire: Wire, lines: readonly string[], onScreen: number): void {
  if (onScreen > 0) wire.emit('ansi-output', rewind(onScreen));
  for (const line of lines) wire.emit('ansi-output', overwrite(line) + '\r\n');
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  if (typeof timer.unref === 'function') timer.unref();
});

/**
 * Write `lines` over `onScreen` placeholder rows, settling as they go.
 *
 * ASYNCHRONOUS, and that is the whole difference between an animation and a
 * redraw. The first cut emitted every frame in one synchronous loop: the
 * terminal received them back to back and painted the last, so the table
 * appeared all at once and the sysop said so - "the scramble animation reveals
 * all real characters at the same time". A frame is only a frame if there is
 * time between them.
 *
 * Returns how many rows are on screen afterwards, so a caller can clear the
 * placeholders its shorter list did not reach.
 */
export async function settleOnto(
  wire: Wire,
  lines: readonly string[],
  onScreen: number,
  options: SettleOptions,
): Promise<number> {
  const frames = Math.max(1, options.frames ?? 10);
  const frameMs = Math.max(0, options.frameMs ?? SCRAMBLE_FRAME_MS);
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? wait;

  if (options.animate && lines.length > 0) {
    const masks = lines.map((line, i) => (
      options.still?.[i]
        ? nothingSettled(visibleLength(line)).map(() => true)
        : nothingSettled(visibleLength(line))
    ));
    const longest = Math.max(...masks.map((m, i) => (options.still?.[i] ? 0 : m.length)), 1);

    /*
     * A FEW CHARACTERS PER FRAME, not a share of the row.
     *
     * Settling `length / frames` at a time finishes every row on the same
     * frame, however long it is, which is the "all at once" the sysop saw in
     * miniature: the last frame does most of the work. Settling a small
     * constant share means a short cell finishes early and a long one goes on
     * moving - which is what makes it read as a cross-fade rather than a wipe.
     */
    const perFrame = Math.max(1, Math.round(longest / frames));

    for (let frame = 0; frame < frames && masks.some(stillMoving); frame++) {
      for (let i = 0; i < masks.length; i++) masks[i] = settleSome(masks[i], perFrame, random);
      paintFrame(wire, lines.map((line, i) => scrambleFrame(line, masks[i], random)), onScreen);
      // Every frame after the first writes over the frame before it, not over
      // the placeholders.
      onScreen = lines.length;
      await sleep(frameMs);
    }
  }

  // The last write is always the real table, whatever the frames did.
  paintFrame(wire, lines, onScreen);
  return lines.length;
}

/**
 * NOISE WHILE THE SCENEWALL IS ASKED.
 *
 * The placeholder rows are redrawn as scrambled characters until the answer
 * lands, so a caller can see the door is working rather than guessing at a
 * still screen. Nothing settles during the wait - every frame is noise, and
 * the settling happens once, onto the real rows, in `settleOnto`. The rows
 * marked `still` (the rules, the legend) are drawn as themselves: the page's
 * frame holds while the values inside it churn.
 *
 * Shares `paintFrame` and the cadence with the settling, because to a caller
 * it is the same animation either side of the answer.
 *
 * Returns the stop function. The timer is unref'd - a door must not hold the
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
