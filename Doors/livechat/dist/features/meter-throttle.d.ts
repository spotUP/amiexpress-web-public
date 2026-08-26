/**
 * Deciding whether a microphone meter is worth redrawing.
 *
 * Audio levels arrive continuously from the browser's AnalyserNode. Calling
 * screen.render() for each one froze every tab that had voice open - a full
 * redraw, video tiles included, dozens of times a second (2026-08-26).
 *
 * Two facts make almost all of those redraws pointless: the meter is a
 * handful of characters wide, so it has only that many distinct appearances,
 * and nobody can read a bar that changes sixty times a second anyway. So a
 * redraw happens only when the DRAWN value would change, and never more
 * often than the interval allows.
 *
 * Pure and time-injected, so the throttle can be tested without waiting.
 */
export interface MeterState {
    /** Last level actually drawn, in columns. -1 before anything is drawn. */
    lastStep: number;
    /** When that happened, in ms. */
    lastDrawAt: number;
}
export interface MeterDecision {
    /** Whether to redraw at all. */
    draw: boolean;
    /** The quantised level to draw, 0..1. Only meaningful when draw is true. */
    level: number;
    /** State to carry into the next reading. */
    next: MeterState;
}
export declare function newMeterState(): MeterState;
/**
 * Turn a microphone reading into something a meter can show.
 *
 * Speech sits around 0.05-0.2 RMS, and a shout barely reaches 0.4 - so a
 * linear meter spends its whole range on volumes nobody produces and shows
 * one block for ordinary talking, which reads as "not working".
 *
 * A square root spreads the quiet end out, the way every VU meter ever
 * built does: 0.1 becomes a third of the bar rather than a twelfth of it.
 */
export declare function perceptualLevel(reading: number): number;
/**
 * Decide whether this reading changes what the meter shows.
 *
 * `width` is the meter in columns, `minIntervalMs` the floor between
 * redraws, and `now` the current time in ms.
 */
export declare function meterTick(state: MeterState, reading: number, width: number, minIntervalMs: number, now: number): MeterDecision;
