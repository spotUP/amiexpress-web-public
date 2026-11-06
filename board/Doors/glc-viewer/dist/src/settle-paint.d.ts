import { type Random } from './scramble';
/**
 * HOW OFTEN A SCRAMBLED FRAME GOES OUT while the scenewall is asked.
 *
 * Eight frames a second: enough to read as movement, and forty columns of
 * ten rows is under four hundred bytes a frame, which a 19200 line carries
 * without noticing.
 */
export declare const SCRAMBLE_FRAME_MS = 125;
/** Somewhere to write to - the door's socket, and nothing else about it. */
export interface Wire {
    emit(event: string, payload: string): unknown;
}
/**
 * Write `lines` over `onScreen` placeholder rows, in this tick.
 *
 * SYNCHRONOUS on purpose: no timer, no frame, no await. Returns how many rows
 * are on screen afterwards, so a caller can clear the placeholders its
 * shorter list did not reach.
 */
export declare function paintOnto(wire: Wire, lines: readonly string[], onScreen: number): number;
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
export declare function waitingScramble(wire: Wire, placeholders: readonly string[], still: readonly boolean[], options?: {
    frameMs?: number;
    random?: Random;
}): () => void;
//# sourceMappingURL=settle-paint.d.ts.map