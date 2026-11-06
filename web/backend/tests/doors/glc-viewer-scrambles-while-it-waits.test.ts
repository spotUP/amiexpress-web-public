/**
 * The list arrives rather than appearing.
 *
 * The sysop, 2026-09-16: "it would be cool if the skeleton loaders animated
 * scrambled text while waiting for the data that gradually stopped on the real
 * characters randomly".
 *
 * The two rules that make it safe rather than pretty are pinned first: an
 * escape sequence is never scrambled, and the last frame IS the real row.
 */
import {
  SCRAMBLE_ALPHABET, nothingSettled, scrambleFrame, visibleLength,
} from '../../../../board/Doors/glc-viewer/src/scramble';
import { paintOnto, waitingScramble, SCRAMBLE_FRAME_MS } from '../../../../board/Doors/glc-viewer/src/settle-paint';

/** A deterministic `random` so a frame can be asserted at all. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const ROW = '\x1b[36mSpot \x1b[34m:\x1b[32muPtOWN';

describe('what a frame may touch', () => {
  it('leaves every escape sequence exactly where it was', () => {
    const frame = scrambleFrame(ROW, nothingSettled(visibleLength(ROW)), sequence([0.5]));
    // The pens are the row's; only the letters between them moved.
    expect(frame).toContain('\x1b[36m');
    expect(frame).toContain('\x1b[34m');
    expect(frame).toContain('\x1b[32m');
    expect(frame.match(/\x1b\[/g)).toHaveLength(3);
  });

  it('counts PRINTABLE characters, not bytes, when it counts at all', () => {
    // 'Spot ' + ':' + 'uPtOWN' - the escapes are not characters on the screen.
    expect(visibleLength(ROW)).toBe(12);
    expect(visibleLength('\x1b[36m')).toBe(0);
    expect(visibleLength('abc')).toBe(3);
  });

  it('keeps the spaces, so the table keeps its shape while it waits', () => {
    const frame = scrambleFrame('ab cd', nothingSettled(5), sequence([0.1]));
    expect(frame[2]).toBe(' ');
  });

  it('draws noise from an alphabet a C64 and an ANSI terminal both have', () => {
    const frame = scrambleFrame('abcdef', nothingSettled(6), sequence([0.1, 0.4, 0.9]));
    for (const character of frame) {
      expect(SCRAMBLE_ALPHABET).toContain(character);
    }
  });
});

describe('painting the table over its placeholders', () => {
  /** A wire that remembers everything written to it. */
  const wire = () => {
    const written: string[] = [];
    return { written, emit: (_event: string, payload: string) => written.push(payload) };
  };

  const TABLE = ['\x1b[36mONE', '\x1b[36mTWO'];

  it('writes the real table at once: rewind, then each row, nothing else', () => {
    const w = wire();
    paintOnto(w, TABLE, 2);
    expect(w.written[0]).toBe('\x1b[A\x1b[A');
    expect(w.written.slice(1).map((line) => line.replace('\x1b[K', ''))).toEqual(
      TABLE.map((line) => line + '\r\n'),
    );
  });

  it('clears each row before drawing on it, so a shorter value cannot leave a tail', () => {
    const w = wire();
    paintOnto(w, TABLE, 2);
    for (const line of w.written.filter((l) => !l.startsWith('\x1b[A'))) {
      expect(line.startsWith('\x1b[K')).toBe(true);
    }
  });

  it('reports how many rows it left on screen, so the rest can be cleared', () => {
    expect(paintOnto(wire(), TABLE, 9)).toBe(2);
  });
});

describe('the answer arriving ends the animation in the same tick', () => {
  it('writes the final table with zero further frame timers once the wait is stopped', async () => {
    jest.useFakeTimers();
    try {
      const written: string[] = [];
      const w = { emit: (_e: string, p: string) => { written.push(p); } };
      const placeholders = ['\x1b[36m......', '\x1b[36m......'];

      // The wait: noise on the shared cadence.
      const stop = waitingScramble(w, placeholders, [false, false]);
      jest.advanceTimersByTime(SCRAMBLE_FRAME_MS * 3);
      expect(written.length).toBeGreaterThan(0);

      // The answer lands: the door stops the wait and paints, synchronously.
      stop();
      const before = written.length;
      paintOnto(w, ['\x1b[36mREAL1', '\x1b[36mREAL2'], placeholders.length);
      expect(written.slice(before).join('')).toContain('REAL2');
      const afterPaint = written.length;

      // No frame is pending: not a timer, not a microtask-scheduled write.
      expect(jest.getTimerCount()).toBe(0);
      await Promise.resolve();
      jest.advanceTimersByTime(SCRAMBLE_FRAME_MS * 20);
      expect(written).toHaveLength(afterPaint);
    } finally {
      jest.useRealTimers();
    }
  });
});
