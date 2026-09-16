import { type Random } from './scramble';
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
export declare const SCRAMBLE_FRAME_MS = 125;
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
export declare function settleOnto(wire: Wire, lines: readonly string[], onScreen: number, options: SettleOptions): Promise<number>;
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
export declare function waitingScramble(wire: Wire, placeholders: readonly string[], still: readonly boolean[], options?: {
    frameMs?: number;
    random?: Random;
}): () => void;
//# sourceMappingURL=settle-paint.d.ts.map