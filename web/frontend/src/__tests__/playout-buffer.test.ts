/**
 * The jitter buffer replays the server's modem pacing.
 *
 * At a real modem speed the server meters a web caller and stamps each chunk
 * with the moment it meant it to arrive (`pacedAt`). The network bunches
 * them; painted on arrival a bunch is a stutter (the sysop, 2026-09-28:
 * "ok fix it"). The buffer writes each chunk at its stamp plus a delay that
 * is only as large as the network's lateness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayoutBuffer, MAX_JITTER_DELAY_MS } from '../../../../packages/terminal/src/utils/playout-buffer';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

function recorder() {
  const writes: Array<{ at: number; data: string }> = [];
  const buffer = new PlayoutBuffer((data) => writes.push({ at: performance.now(), data }));
  return { buffer, writes };
}

describe('the playout buffer', () => {
  it('spreads a bunch the network delivered at once back over the server spacing', async () => {
    const { buffer, writes } = recorder();
    // A steady first chunk sets the clock offset: server 1000 arrives at local now.
    buffer.paced('a', 1000);
    // The next nine were sent 10 ms apart but arrive together, 90 ms later.
    await vi.advanceTimersByTimeAsync(90);
    for (let i = 1; i <= 9; i++) buffer.paced(String(i), 1000 + i * 10);

    const writtenAtArrival = writes.filter((w) => w.at === writes[1]?.at).length;
    await vi.advanceTimersByTimeAsync(500);

    expect(writes.map((w) => w.data).join('')).toBe('a123456789');
    expect(`bunch painted in one frame: ${writtenAtArrival >= 9}`).toBe('bunch painted in one frame: false');
    const gaps = writes.slice(2).map((w, i) => w.at - writes[i + 1].at);
    expect(gaps.every((g) => g >= 9 && g <= 11)).toBe(true);
  });

  it('adds no latency when the network keeps time', async () => {
    const { buffer, writes } = recorder();
    for (let i = 0; i < 5; i++) {
      buffer.paced(String(i), 5000 + i * 20);
      expect(writes.length).toBe(i + 1);
      await vi.advanceTimersByTimeAsync(20);
    }
  });

  it('never holds a chunk longer than the cap, however late the network was', async () => {
    const { buffer, writes } = recorder();
    buffer.paced('a', 0);
    await vi.advanceTimersByTimeAsync(900);
    buffer.paced('b', 10); // 890 ms late: written on arrival, delay capped
    buffer.paced('c', 900); // on time, but now held behind the capped delay
    expect(writes.map((w) => w.data).join('')).toBe('ab');
    await vi.advanceTimersByTimeAsync(MAX_JITTER_DELAY_MS - 1);
    expect(writes.map((w) => w.data).join('')).toBe('ab');
    await vi.advanceTimersByTimeAsync(2);
    expect(writes.map((w) => w.data).join('')).toBe('abc');
  });

  it('an unstamped chunk waits behind a stamped one still held, never overtaking it', async () => {
    const { buffer, writes } = recorder();
    buffer.paced('a', 0);
    await vi.advanceTimersByTimeAsync(100);
    buffer.paced('b', 50); // late: goes now
    buffer.paced('c', 60); // held to its spacing after b
    buffer.unpaced('d');
    expect(writes.map((w) => w.data).join('')).toBe('ab');
    await vi.advanceTimersByTimeAsync(300);
    expect(writes.map((w) => w.data).join('')).toBe('abcd');
  });

  it('flush writes everything waiting, in order, now', async () => {
    const { buffer, writes } = recorder();
    buffer.paced('a', 0);
    await vi.advanceTimersByTimeAsync(100);
    buffer.paced('b', 50);
    buffer.paced('c', 60);
    buffer.flush();
    expect(writes.map((w) => w.data).join('')).toBe('abc');
  });
});
