/**
 * "At real modem speeds the client throttle drip-feeds each wipe frame."
 *
 * A screen wipe is an animation the SERVER paces: `getWipeFrames` builds
 * the frames, `screen.handler`'s play loop sleeps the builder's delay
 * between them and emits each frame as ONE `ansi-output` write through
 * `socket._directEmit`, past every server-side pacer. The client's
 * ModemEmulator then metered those same bytes a second time at the
 * caller's baud. Measured (ledger
 * `.superpowers/sdd/2026-09-03-wipe-client-pacing/progress.md`): a `~WR`
 * radial wipe of `Conf1/Menu.txt` is 26 frames wanting 625 ms in total and
 * carrying 4,176 printable characters - 2,910 ms at 14400 and 17,400 ms at
 * 2400 through the client pacer, each frame arriving a fraction at a time.
 *
 * The wire now carries the fact explicitly: `ansi-output`'s second
 * argument (`PRE_PACED`, web/backend/src/utils/output-pacing.ts) marks a
 * payload the server already paced, and `ModemEmulator.write(data, {
 * prePaced: true })` writes it through WITHOUT metering while keeping its
 * place in the queue - the queue is strict FIFO and a frame must never
 * overtake text queued before it.
 *
 * These tests drive the real ModemEmulator from packages/terminal source
 * (a stale dist/ cannot make them pass). The BBSTerminal side of the seam
 * is pinned by components/__tests__/bbsterminal-pre-paced-frames.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ModemEmulator } from '../../../../packages/terminal/src/utils/modem-emulator';
import type { Terminal } from '@xterm/xterm';

/** Records every write xterm would have received, in order. */
function recordingTerminal(): { term: Terminal; writes: string[]; text: () => string } {
  const writes: string[] = [];
  const term = { write: (s: string) => { writes.push(s); } } as unknown as Terminal;
  return { term, writes, text: () => writes.join('') };
}

/** One wipe frame's worth of bytes: a clear, a paint, an attribute run. */
const FRAME = '\x1b[2J\x1b[H' + 'F'.repeat(2000) + '\x1b[0m';

beforeEach(() => {
  // `performance` too: the emulator budgets from performance.now(), so
  // without it the byte budget would follow the wall clock of whatever
  // machine runs the suite instead of the clock this test controls.
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date', 'performance'],
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('the client modem pacer and pre-paced payloads', () => {
  it('a pre-paced frame is not throttled but keeps its place in the queue', async () => {
    const { term, writes, text } = recordingTerminal();
    const modem = new ModemEmulator(term);
    modem.enable(2400); // 240 bytes/sec

    // 240 printable characters = exactly one second of 2400 bps.
    const queuedFirst = 'T'.repeat(240);
    modem.write(queuedFirst);
    modem.write(FRAME, { prePaced: true });

    // Mid-flight: the frame must NOT have jumped the text ahead of it.
    await vi.advanceTimersByTimeAsync(200);
    expect(`frame overtook queued text: ${text().includes('FFFF')}`)
      .toBe('frame overtook queued text: false');

    // Unmarked, FRAME's 2,000 printable characters would need 8.3 s at
    // 2400 bps on top of the text's second. Marked, it costs nothing.
    await vi.advanceTimersByTimeAsync(1100);

    const out = text();
    expect(`text delivered: ${(out.match(/T/g) || []).length}`).toBe('text delivered: 240');
    expect(`frame delivered whole: ${out.includes(FRAME)}`).toBe('frame delivered whole: true');
    expect(`frame after the text: ${out.indexOf('F') > out.lastIndexOf('T')}`)
      .toBe('frame after the text: true');

    // ONE write, not re-cut into 64-byte chunks the way paced text is.
    expect(writes.filter((w) => w === FRAME)).toHaveLength(1);
  });

  it('a pre-paced frame written to an idle queue goes straight through', async () => {
    const { term, writes } = recordingTerminal();
    const modem = new ModemEmulator(term);
    modem.enable(2400);

    modem.write(FRAME, { prePaced: true });

    // No timer advance at all: nothing is queued ahead of it, so its place
    // in the queue is now.
    expect(writes).toEqual([FRAME]);
  });

  it("a pre-paced frame's bytes are not charged to the baud budget", async () => {
    const { term, text } = recordingTerminal();
    const modem = new ModemEmulator(term);
    modem.enable(2400);

    modem.write(FRAME, { prePaced: true });
    modem.write('P'.repeat(24)); // 100 ms of text at 240 bytes/sec
    await vi.advanceTimersByTimeAsync(150);

    // Charging the frame's 2,000 characters would have held this prompt
    // back by 8.3 seconds.
    expect(`prompt delivered: ${(text().match(/P/g) || []).length}`).toBe('prompt delivered: 24');
  });

  it('a normal payload is still paced at 2400', async () => {
    const { term, writes, text } = recordingTerminal();
    const modem = new ModemEmulator(term);
    modem.enable(2400); // 240 bytes/sec

    modem.write('N'.repeat(2400)); // ten seconds of it

    await vi.advanceTimersByTimeAsync(1000);
    const afterOneSecond = (text().match(/N/g) || []).length;
    // A token bucket, not a stopwatch: allow one 64-byte chunk of slack
    // either side of the second's 240 bytes.
    expect(`paced after 1 s (240 +/- 64): ${afterOneSecond > 176 && afterOneSecond < 304}`)
      .toBe('paced after 1 s (240 +/- 64): true');
    // ...and delivered in chunks, not in one write.
    expect(writes.length).toBeGreaterThan(1);
    expect(Math.max(...writes.map((w) => w.length))).toBeLessThanOrEqual(64);

    await vi.advanceTimersByTimeAsync(9500);
    expect(`all delivered: ${(text().match(/N/g) || []).length}`).toBe('all delivered: 2400');
  });
});
