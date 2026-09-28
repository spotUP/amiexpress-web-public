/**
 * Replays the server's modem pacing after the network has bunched it.
 *
 * At a real modem speed the SERVER meters a web caller's output
 * (web/backend/src/utils/modem-emulator.util.ts) and the browser's own pacer
 * stands aside (ModemEmulator.serverPaces). The server's spacing is right
 * when it leaves; a WebSocket over a jittery network delivers it in bunches,
 * and a bunch painted on arrival is a stutter. So each metered chunk carries
 * the moment the server meant it to reach the caller (`pacedAt`, on the
 * server's monotonic clock), and this buffer writes it at that moment plus a
 * small delay - a jitter buffer. The server stays the only clock: nothing
 * here decides a rate.
 *
 *  - offset: local time minus server time, the smallest seen in a burst -
 *    the clock difference plus the fastest network trip.
 *  - delay: how late chunks have been arriving beyond that, tracked as a
 *    decaying maximum and capped, so a steady network costs no latency and
 *    a jittery one costs only what it needs.
 *
 * A chunk with no stamp (flushed text, a pre-paced frame) waits behind the
 * stamped ones in front of it and is written the moment they are: the order
 * of what the caller sees never changes.
 */

/** A jittery network may cost this much latency, never more. */
export const MAX_JITTER_DELAY_MS = 250;
/** How fast the delay forgets a late burst: per millisecond of arrivals. */
const DELAY_DECAY_PER_MS = 0.02;
/** A gap this long starts a new burst: the clock offset is measured again. */
const BURST_GAP_MS = 1000;

interface Pending {
  data: string;
  due: number;
}

export class PlayoutBuffer {
  private queue: Pending[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private offset = Infinity;
  private delay = 0;
  private lastArrival = -Infinity;
  private lastDue = -Infinity;

  constructor(private readonly write: (data: string) => void) {}

  /** A chunk the server paced, stamped with when it meant it to arrive. */
  paced(data: string, pacedAt: number): void {
    const now = performance.now();
    if (now - this.lastArrival > BURST_GAP_MS && this.queue.length === 0) {
      this.offset = Infinity;
      this.delay = 0;
    }
    const sample = now - pacedAt;
    if (sample < this.offset) this.offset = sample;
    const lateness = sample - this.offset;
    const decayed = this.delay - DELAY_DECAY_PER_MS * Math.max(0, now - this.lastArrival);
    this.delay = Math.min(MAX_JITTER_DELAY_MS, Math.max(lateness, decayed, 0));
    this.lastArrival = now;
    this.enqueue(data, pacedAt + this.offset + this.delay);
  }

  /** A chunk with no stamp: written now, or behind what is still waiting. */
  unpaced(data: string): void {
    if (this.queue.length === 0) {
      this.write(data);
      return;
    }
    this.enqueue(data, this.lastDue);
  }

  /** Everything waiting goes out now, in order (a door starts, the speed changes). */
  flush(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const pending = this.queue;
    this.queue = [];
    for (const item of pending) this.write(item.data);
  }

  /** Stop without writing: the terminal is going away. */
  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
  }

  private enqueue(data: string, due: number): void {
    // Never earlier than what is in front of it: the queue is FIFO.
    this.lastDue = Math.max(due, this.lastDue);
    this.queue.push({ data, due: this.lastDue });
    this.drain();
  }

  private drain(): void {
    if (this.timer !== null) return;
    const now = performance.now();
    while (this.queue.length > 0 && this.queue[0].due <= now) {
      this.write(this.queue.shift()!.data);
    }
    if (this.queue.length === 0) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.drain();
    }, Math.max(0, this.queue[0].due - now));
  }
}
