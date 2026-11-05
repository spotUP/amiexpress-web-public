"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.newMeterState = newMeterState;
exports.perceptualLevel = perceptualLevel;
exports.meterTick = meterTick;
function newMeterState() {
    return { lastStep: -1, lastDrawAt: 0 };
}
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
function perceptualLevel(reading) {
    const raw = Math.max(0, Math.min(1, Number.isFinite(reading) ? reading : 0));
    return Math.min(1, Math.sqrt(raw) * 1.4);
}
/**
 * Decide whether this reading changes what the meter shows.
 *
 * `width` is the meter in columns, `minIntervalMs` the floor between
 * redraws, and `now` the current time in ms.
 */
function meterTick(state, reading, width, minIntervalMs, now) {
    const level = perceptualLevel(reading);
    const step = Math.round(level * width);
    if (step === state.lastStep) {
        return { draw: false, level, next: state };
    }
    if (now - state.lastDrawAt < minIntervalMs) {
        // Too soon. Keep the old step so the change is still pending, and the
        // next reading past the interval will draw it.
        return { draw: false, level, next: state };
    }
    return {
        draw: true,
        level: step / width,
        next: { lastStep: step, lastDrawAt: now },
    };
}
