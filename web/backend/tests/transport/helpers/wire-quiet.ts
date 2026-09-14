/**
 * Waiting for a real socket to go QUIET, instead of hoping it already has.
 *
 * A byte-for-byte reachability pin opens its window by clearing the capture
 * and emitting:
 *
 *     chunks.length = 0;
 *     emitter.emit('ansi-output', payload, attrs);
 *     await settle(250);
 *
 * Both halves of that are a guess. Bytes from the PREVIOUS phase - the
 * banner, the prompt, a telnet negotiation - may still be in flight when the
 * capture is cleared, and they land inside the window and count as payload.
 * And 250 ms is only long enough on an unloaded machine.
 *
 * That is why `reachability-r1-telnet` and `reachability-r2b-cp437` read two
 * bytes over on a busy tree, and why the same test passed alone and failed
 * beside another: it tracks machine load, not code (traced 2026-09-14 with a
 * temporary probe inside `encodeForWire` - the encoder produced 19 bytes in
 * every run; the test captured 21).
 *
 * A quiet wire is the honest barrier. Nothing has arrived for `quietMs`, so
 * the previous phase is over and the window can open.
 */
import type { EventEmitter } from 'events';

export interface QuietOptions {
  /** How long the wire must say nothing before it counts as quiet. */
  quietMs?: number;
  /** Give up after this, so a wedged socket fails the test rather than hanging it. */
  maxMs?: number;
}

/**
 * Resolve once no 'data' event has arrived for `quietMs`.
 *
 * Rejects at `maxMs` - a socket that never stops talking is a finding, not
 * something to wait out.
 */
export function untilQuiet(
  client: EventEmitter,
  opts: QuietOptions = {},
): Promise<void> {
  const quietMs = opts.quietMs ?? 200;
  const maxMs = opts.maxMs ?? 10_000;
  return new Promise<void>((resolve, reject) => {
    let idle: NodeJS.Timeout;
    const deadline = setTimeout(() => {
      client.removeListener('data', onData);
      clearTimeout(idle);
      reject(new Error(`the wire never went quiet for ${quietMs}ms within ${maxMs}ms`));
    }, maxMs);
    const done = () => {
      client.removeListener('data', onData);
      clearTimeout(deadline);
      resolve();
    };
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(done, quietMs);
    };
    const onData = () => arm();
    client.on('data', onData);
    arm();
  });
}

/**
 * Open a capture window on a quiet wire: wait for silence, then clear.
 *
 * The pair belongs together - clearing without waiting is the bug this
 * module exists for.
 */
export async function openWindow(client: EventEmitter, chunks: unknown[], opts?: QuietOptions): Promise<void> {
  await untilQuiet(client, opts);
  chunks.length = 0;
}

/**
 * Wait for the payload to finish arriving: quiet again, and at least
 * `atLeast` bytes captured if a size is known.
 */
export async function untilDelivered(
  client: EventEmitter,
  chunks: Buffer[],
  atLeast = 0,
  opts?: QuietOptions,
): Promise<void> {
  const deadline = Date.now() + (opts?.maxMs ?? 10_000);
  for (;;) {
    await untilQuiet(client, opts);
    if (Buffer.concat(chunks).length >= atLeast) return;
    if (Date.now() > deadline) {
      throw new Error(`only ${Buffer.concat(chunks).length} of ${atLeast} bytes arrived before the wire went quiet`);
    }
  }
}

/**
 * The same barrier for a capture that is not an event emitter.
 *
 * A leg that accumulates into an array (or a socket.io client, or an SSH
 * stream wrapped in a helper) can still say how many bytes it holds. Resolve
 * once that number has stopped moving for `quietMs`.
 *
 * This is what makes a two-transport comparison honest. Both legs paint the
 * same prompt and the same trailing ESC 7 (DECSC, `line-input.util.ts:354`),
 * but a reader that snapshots the instant its sentinel appears catches
 * whatever happened to be in that TCP chunk - so telnet keeps the ESC 7 and
 * SSH, framed differently, does not, and the two "identical" paints differ by
 * two bytes for a reason that is not about the board at all.
 */
export function untilSettled(size: () => number, opts: QuietOptions = {}): Promise<void> {
  const quietMs = opts.quietMs ?? 200;
  const maxMs = opts.maxMs ?? 10_000;
  return new Promise<void>((resolve, reject) => {
    const started = Date.now();
    let last = size();
    let lastChange = Date.now();
    const tick = setInterval(() => {
      const now = size();
      if (now !== last) { last = now; lastChange = Date.now(); }
      if (Date.now() - lastChange >= quietMs) { clearInterval(tick); resolve(); return; }
      if (Date.now() - started >= maxMs) {
        clearInterval(tick);
        reject(new Error(`the capture never settled for ${quietMs}ms within ${maxMs}ms (at ${now} bytes)`));
      }
    }, 25);
  });
}
