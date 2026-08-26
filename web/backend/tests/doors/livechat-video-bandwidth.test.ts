/**
 * Video is paced by BYTES, not by frame count alone.
 *
 * Reported 2026-08-26: "the browser with the fullscreen chat has frozen
 * twice now".
 *
 * A frame is one ASCII picture of the tile, and a big tile makes a big
 * picture - measured at 10KB each for a full-window tile, from the door's own
 * logs. Ten of those a second is 100KB/s of text written into the terminal
 * and diffed by the door on every frame; with frames also being misrouted at
 * the time, the fullscreen tile was receiving two such streams at once.
 *
 * The frame interval is a FLOOR now and the byte budget is the real limit: a
 * small tile still runs at full rate, a large one slows down instead of
 * drowning the terminal. Slower video beats a frozen page.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const client = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'Doors', 'livechat', 'client.ts'),
  'utf8'
);

/** The pacing arithmetic, as the client does it. */
function waitFor(bytes: number, intervalMs: number, budgetPerSecond: number): number {
  return Math.max(intervalMs, Math.ceil((bytes / budgetPerSecond) * 1000));
}

const BUDGET = 48 * 1024;

describe('the pacing', () => {
  it('leaves a small frame at full rate', () => {
    // A 1KB frame at 10fps is 10KB/s - far under budget, so nothing changes.
    expect(waitFor(1024, 100, BUDGET)).toBe(100);
  });

  it('slows a large frame down', () => {
    // The 10KB frames measured on the fullscreen tile.
    const wait = waitFor(10 * 1024, 100, BUDGET);

    expect(wait).toBeGreaterThan(100);
    expect(wait).toBeCloseTo(208, -1);
  });

  it('keeps the throughput at the budget however big the frame is', () => {
    for (const bytes of [5_000, 10_000, 40_000, 120_000]) {
      const wait = waitFor(bytes, 100, BUDGET);
      const throughput = bytes / (wait / 1000);

      expect(throughput).toBeLessThanOrEqual(BUDGET + 1);
    }
  });

  it('never waits less than the frame interval', () => {
    // The budget can only ever slow things down, not speed them past the
    // rate the quality profile asked for.
    expect(waitFor(0, 100, BUDGET)).toBe(100);
    expect(waitFor(10, 100, BUDGET)).toBe(100);
  });
});

describe('the client', () => {
  it('declares a byte budget', () => {
    expect(client).toMatch(/const VIDEO_BYTES_PER_SECOND = 48 \* 1024/);
  });

  it('measures each frame it sends', () => {
    expect(client).toMatch(/private sendVideoFrame\([^)]*\): number/);
    // The frame is measured after packing, so the size read is the packet's.
    expect(client).toMatch(/return (frame\.length|packet\.byteLength)/);
  });

  it('schedules the next frame from the last one\'s size', () => {
    expect(client).toMatch(/bytes \/ VIDEO_BYTES_PER_SECOND/);
    expect(client).toMatch(/Math\.max\(intervalMs, Math\.ceil\(budgetMs\)\)/);
  });

  it('stops when the camera is gone', () => {
    // A self-scheduling loop has to check, where setInterval was simply
    // cleared.
    const tick = client.slice(client.indexOf('const tick = () =>'));

    expect(tick.slice(0, 200)).toMatch(/if \(!this\.videoStream\) return;/);
  });
});
