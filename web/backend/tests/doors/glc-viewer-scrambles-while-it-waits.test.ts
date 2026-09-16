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
  SCRAMBLE_ALPHABET, nothingSettled, scrambleFrame, settleFrames, settleSome,
  stillMoving, visibleLength,
} from '../../../../Doors/glc-viewer/src/scramble';
import { settleOnto } from '../../../../Doors/glc-viewer/src/settle-paint';

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

describe('settling', () => {
  it('stops a character on its real value, and leaves it stopped', () => {
    const settled = settleSome(nothingSettled(4), 4, sequence([0]));
    expect(scrambleFrame('WXYZ', settled, sequence([0.5]))).toBe('WXYZ');
  });

  it('settles at random rather than left to right - it is a value being found', () => {
    // Settle one of four, with a `random` that picks the last of what is left.
    const settled = settleSome(nothingSettled(4), 1, sequence([0.99]));
    expect(settled).toEqual([false, false, false, true]);
  });

  it('knows when there is nothing left moving', () => {
    expect(stillMoving(nothingSettled(3))).toBe(true);
    expect(stillMoving(settleSome(nothingSettled(3), 3, sequence([0])))).toBe(false);
  });

  it('cannot settle more than there is', () => {
    const settled = settleSome(nothingSettled(2), 99, sequence([0.3]));
    expect(settled).toEqual([true, true]);
  });
});

describe('the whole settling of a row', () => {
  const random = sequence([0.2, 0.7, 0.4, 0.9, 0.1]);

  it('ends on the real row, byte for byte', () => {
    const frames = settleFrames(ROW, 6, random);
    // An animation that ends NEAR the answer is a bug that looks like a
    // feature.
    expect(frames[frames.length - 1]).toBe(ROW);
  });

  it('is noise before it is the answer', () => {
    const frames = settleFrames(ROW, 6, random);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames[0]).not.toBe(ROW);
  });

  it('never changes the width of the row it is settling', () => {
    for (const frame of settleFrames(ROW, 6, random)) {
      expect(visibleLength(frame)).toBe(visibleLength(ROW));
    }
  });

  it('ends on the real row even when asked for no frames at all', () => {
    expect(settleFrames(ROW, 0, random)).toEqual([ROW]);
  });
});

describe('painting the table over its placeholders', () => {
  /** A wire that remembers everything written to it. */
  const wire = () => {
    const written: string[] = [];
    return { written, emit: (_event: string, payload: string) => written.push(payload) };
  };

  const TABLE = ['\x1b[36mONE', '\x1b[36mTWO'];

  it('ends with the real table, whatever the frames did', () => {
    const w = wire();
    settleOnto(w, TABLE, 2, { animate: true, frames: 3, random: sequence([0.1, 0.6]) });

    const tail = w.written.slice(-2).map((line) => line.replace('\x1b[K', ''));
    expect(tail).toEqual(TABLE.map((line) => line + '\r\n'));
  });

  it('walks back over the placeholders before its first frame', () => {
    const w = wire();
    settleOnto(w, TABLE, 2, { animate: true, frames: 2, random: sequence([0.3]) });
    // Two rows on screen, two cursor-ups, before anything is drawn.
    expect(w.written[0]).toBe('\x1b[A\x1b[A');
  });

  it('writes each later frame over the frame before it, not over the placeholders', () => {
    const w = wire();
    settleOnto(w, ['\x1b[36mABCDEFGH'], 5, { animate: true, frames: 3, random: sequence([0.2, 0.8]) });

    const rewinds = w.written.filter((line) => line.startsWith('\x1b[A'));
    // The first rewind clears five placeholder rows; every one after it
    // steps back over the ONE row this table has.
    expect(rewinds[0]).toBe('\x1b[A'.repeat(5));
    for (const rewind of rewinds.slice(1)) expect(rewind).toBe('\x1b[A');
  });

  it('clears each row before drawing on it, so a shorter value cannot leave a tail', () => {
    const w = wire();
    settleOnto(w, TABLE, 2, { animate: false });
    for (const line of w.written.filter((l) => !l.startsWith('\x1b[A'))) {
      expect(line.startsWith('\x1b[K')).toBe(true);
    }
  });

  it('draws once when the board asked for no animation', () => {
    const w = wire();
    settleOnto(w, TABLE, 2, { animate: false });
    // One rewind, two rows, and nothing else on the wire.
    expect(w.written).toHaveLength(3);
  });

  it('reports how many rows it left on screen, so the rest can be cleared', () => {
    const w = wire();
    expect(settleOnto(w, TABLE, 9, { animate: false })).toBe(2);
  });
});
