/**
 * What the browser's screen was actually given, in order - kept so a draw
 * that goes wrong "sometimes" can be captured instead of guessed at.
 *
 * Two open bugs have the same shape (2026-09-27): Global Last Callers draws
 * with its header gone and its rows at the top of the screen, and a PETSCII
 * screen renders offset. Both happen only in the browser, only now and then,
 * and a telnet run of the same door draws perfectly - so the evidence lives
 * in the browser and nowhere else. The screenshot of the Global Last Callers
 * page is exactly what a clear-and-home landing in the middle of the door's
 * draw produces, but nothing in the server log can say where that clear came
 * from.
 *
 * So the terminal keeps the last few hundred kilobytes of what reached it -
 * every write, every reset, clear and resize, and every PETSCII byte batch -
 * with a timestamp each. After a bad draw the sysop saves it from the
 * browser console:
 *
 *     __BBS_WIRE__.save()      // downloads bbs-wire-<time>.jsonl
 *     __BBS_WIRE__.dump()      // the same lines as one string
 *     __BBS_WIRE__.clear()
 *
 * A ring, not a log: the oldest events fall out once the budget is spent, so
 * it costs a bounded amount of memory however long the session runs.
 */

/** One thing the screen was given. `data` is the text or bytes, as written. */
export interface WireEvent {
  /** Milliseconds since the page loaded (performance.now()). */
  t: number;
  kind: string;
  data?: string;
}

export interface WireRecorder {
  record(kind: string, data?: string): void;
  events(): readonly WireEvent[];
  /** One JSON object per line; control bytes stay escaped, so ESC reads as \u001b. */
  dump(): string;
  clear(): void;
}

/** 512 KB of payload: several full screens of art plus the door drawn over it. */
export const DEFAULT_WIRE_BUDGET = 512 * 1024;

export function createWireRecorder(
  budget: number = DEFAULT_WIRE_BUDGET,
  now: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
): WireRecorder {
  let ring: WireEvent[] = [];
  let held = 0;
  const cost = (event: WireEvent) => event.kind.length + (event.data?.length ?? 0);

  return {
    record(kind, data) {
      const event: WireEvent = data === undefined ? { t: now(), kind } : { t: now(), kind, data };
      ring.push(event);
      held += cost(event);
      while (held > budget && ring.length > 1) {
        held -= cost(ring.shift() as WireEvent);
      }
    },
    events: () => ring,
    dump: () => ring.map((event) => JSON.stringify(event)).join('\n'),
    clear() {
      ring = [];
      held = 0;
    },
  };
}

/** The part of an xterm Terminal the recorder wraps. */
export interface RecordableTerminal {
  write(data: string | Uint8Array, callback?: () => void): void;
  reset(): void;
  clear(): void;
  resize(cols: number, rows: number): void;
}

/** Bytes as latin-1 text, so a dump keeps every byte and stays readable. */
function bytesAsText(bytes: Uint8Array | readonly number[]): string {
  let out = '';
  for (const byte of bytes) out += String.fromCharCode(byte & 0xff);
  return out;
}

/**
 * Wrap the terminal's writers so every one of them is recorded before it
 * acts. Wrapping the terminal rather than each caller is the point: a clear
 * can come from anywhere in the component, and the one place they all pass
 * through is here.
 */
export function recordTerminal(term: RecordableTerminal, recorder: WireRecorder): void {
  const write = term.write.bind(term);
  const reset = term.reset.bind(term);
  const clear = term.clear.bind(term);
  const resize = term.resize.bind(term);
  term.write = (data, callback) => {
    recorder.record('write', typeof data === 'string' ? data : bytesAsText(data));
    write(data, callback);
  };
  term.reset = () => {
    recorder.record('reset');
    reset();
  };
  term.clear = () => {
    recorder.record('clear');
    clear();
  };
  term.resize = (cols, rows) => {
    recorder.record('resize', `${cols}x${rows}`);
    resize(cols, rows);
  };
}

/** A PETSCII byte batch, recorded the same way as a write. */
export function recordPetscii(recorder: WireRecorder, bytes: Uint8Array | readonly number[]): void {
  recorder.record('petscii', bytesAsText(bytes));
}

/** `window.__BBS_WIRE__`: the console handle the sysop saves a capture with. */
export function exposeWireRecorder(recorder: WireRecorder, target: Record<string, unknown>): void {
  target.__BBS_WIRE__ = {
    dump: () => recorder.dump(),
    clear: () => recorder.clear(),
    save: () => {
      const blob = new Blob([recorder.dump() + '\n'], { type: 'application/jsonl' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `bbs-wire-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    },
  };
}
