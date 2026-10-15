/**
 * The microphone meter must not redraw the screen on every reading.
 *
 * Wiring the meter straight to `audio:levels` froze every tab that had
 * voice open: the browser's AnalyserNode reports continuously, and each
 * report triggered a full screen render with video tiles in it.
 */

import { meterTick, newMeterState, perceptualLevel } from '../../../../Doors/livechat/features/meter-throttle';

const WIDTH = 12;
const INTERVAL = 100;

describe('microphone meter throttle', () => {
  it('draws the first reading', () => {
    const decision = meterTick(newMeterState(), 0.5, WIDTH, INTERVAL, 1000);
    expect(decision.draw).toBe(true);
  });

  it('skips a reading that would draw the same bar', () => {
    // Two readings inside one column of each other: identical on screen.
    const first = meterTick(newMeterState(), 0.50, WIDTH, INTERVAL, 1000);
    const second = meterTick(first.next, 0.51, WIDTH, INTERVAL, 5000);

    expect(second.draw).toBe(false);
  });

  it('skips a changed reading that arrives too soon', () => {
    const first = meterTick(newMeterState(), 0.1, WIDTH, INTERVAL, 1000);
    const tooSoon = meterTick(first.next, 0.9, WIDTH, INTERVAL, 1050);

    expect(tooSoon.draw).toBe(false);
  });

  it('draws that change once the interval has passed', () => {
    const first = meterTick(newMeterState(), 0.1, WIDTH, INTERVAL, 1000);
    const tooSoon = meterTick(first.next, 0.9, WIDTH, INTERVAL, 1050);
    const later = meterTick(tooSoon.next, 0.9, WIDTH, INTERVAL, 1200);

    expect(later.draw).toBe(true);
  });

  it('caps redraws at the interval however fast readings arrive', () => {
    // A second of noisy readings at 60/s: at most ten redraws.
    let state = newMeterState();
    let draws = 0;
    for (let i = 0; i < 60; i++) {
      const noisy = i % 2 === 0 ? 0.2 : 0.8;
      const decision = meterTick(state, noisy, WIDTH, INTERVAL, 1000 + i * (1000 / 60));
      state = decision.next;
      if (decision.draw) draws++;
    }

    expect(draws).toBeLessThanOrEqual(10);
  });

  it('never redraws at all while the microphone is silent', () => {
    let state = newMeterState();
    let draws = 0;
    for (let i = 0; i < 100; i++) {
      const decision = meterTick(state, 0, WIDTH, INTERVAL, 1000 + i * 16);
      state = decision.next;
      if (decision.draw) draws++;
    }

    // The very first reading establishes the empty bar; nothing after it.
    expect(draws).toBe(1);
  });

  it('shows ordinary speech as a meaningful part of the bar', () => {
    // Speech is around 0.05-0.2 RMS. Linearly that is one block of twelve,
    // which reads as a meter that does not work.
    const speech = meterTick(newMeterState(), 0.1, WIDTH, INTERVAL, 1000);

    expect(Math.round(speech.level * WIDTH)).toBeGreaterThanOrEqual(4);
  });

  it('keeps silence at nothing and a shout at everything', () => {
    expect(perceptualLevel(0)).toBe(0);
    expect(perceptualLevel(1)).toBe(1);
  });

  it('still rises with loudness', () => {
    expect(perceptualLevel(0.2)).toBeGreaterThan(perceptualLevel(0.05));
  });

  it('clamps readings outside 0..1 instead of drawing nonsense', () => {
    expect(meterTick(newMeterState(), 5, WIDTH, INTERVAL, 1000).level).toBe(1);
    expect(meterTick(newMeterState(), -2, WIDTH, INTERVAL, 1000).level).toBe(0);
    expect(meterTick(newMeterState(), NaN, WIDTH, INTERVAL, 1000).level).toBe(0);
  });
});
