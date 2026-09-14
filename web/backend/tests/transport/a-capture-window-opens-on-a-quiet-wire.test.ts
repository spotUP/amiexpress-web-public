/**
 * The barrier the byte-for-byte pins stand on.
 *
 * R1, R2b, the three-transport walk and R14 all compare bytes to a file or to
 * each other, and all of them used to open their capture window by clearing an
 * array and sleeping a fixed 250 ms. Bytes still draining from the previous
 * phase landed inside the window and were counted as payload, so R1 read two
 * bytes over, and the walk's two legs disagreed about a trailing ESC 7 - both
 * only when the machine was busy. The failures tracked load, not code.
 *
 * `helpers/wire-quiet.ts` replaced the guess with a barrier. These are the
 * assertions that say the barrier is real: each one passes with the barrier and
 * fails against the "clear it and hope" version it replaced.
 */
import { EventEmitter } from 'events';
import { openWindow, untilQuiet, untilSettled } from './helpers/wire-quiet';

jest.setTimeout(20000);

/** A wire that speaks `count` times at `everyMs`, then stops for good. */
function chatter(count: number, everyMs: number): { wire: EventEmitter; spoken: () => number } {
  const wire = new EventEmitter();
  let spoken = 0;
  const tick = setInterval(() => {
    spoken += 1;
    wire.emit('data', Buffer.from([spoken]));
    if (spoken >= count) clearInterval(tick);
  }, everyMs);
  return { wire, spoken: () => spoken };
}

describe('a capture window opens on a quiet wire', () => {
  it('holds the window shut until the previous phase has finished speaking', async () => {
    const { wire, spoken } = chatter(10, 30);
    const chunks: Buffer[] = [];
    wire.on('data', (c: Buffer) => chunks.push(c));

    await openWindow(wire, chunks, { quietMs: 120 });

    // The wire had said all ten before the window opened, so the clear took
    // every one of them. A window that opened immediately would have cleared
    // one and kept the nine that followed.
    expect(spoken()).toBe(10);
    expect(chunks).toHaveLength(0);

    // And nothing arrives afterwards to refill it.
    await new Promise((r) => setTimeout(r, 200));
    expect(chunks).toHaveLength(0);
  });

  it('does not call a wire quiet while it is still talking', async () => {
    const { wire } = chatter(8, 40);
    const started = Date.now();
    await untilQuiet(wire, { quietMs: 150 });
    // Eight chunks at 40 ms is 320 ms of talking, plus the 150 ms of silence.
    expect(Date.now() - started).toBeGreaterThanOrEqual(320 + 150 - 40);
  });

  it('gives up rather than hanging when a wire never stops', async () => {
    const wire = new EventEmitter();
    const tick = setInterval(() => wire.emit('data', Buffer.from([0])), 20);
    try {
      await expect(untilQuiet(wire, { quietMs: 200, maxMs: 600 }))
        .rejects.toThrow(/never went quiet/);
    } finally {
      clearInterval(tick);
    }
  });

  it('waits for a growing capture to stop growing, for legs that are not sockets', async () => {
    // The SSH and socket.io legs accumulate into an array rather than a
    // socket, so the barrier there watches the size instead of the events.
    let size = 0;
    const tick = setInterval(() => { size += 7; }, 30);
    setTimeout(() => clearInterval(tick), 300);

    await untilSettled(() => size, { quietMs: 120 });
    const settledAt = size;
    expect(settledAt).toBeGreaterThan(0);

    await new Promise((r) => setTimeout(r, 150));
    expect(size).toBe(settledAt);
  });
});
