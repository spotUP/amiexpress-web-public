/**
 * Door chatter that says nothing to a 40-column caller.
 *
 * `ctop` and `conftop` print
 *
 *   ` 5.            - NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE -`
 *
 * on the SAME 64-column row as an entry number. The rule ladder answers
 * `banner` and spends THREE of the caller's 25 rows on it - the number alone,
 * then the sentence over two lines - and an empty list has already said the
 * same thing. The sysop asked for it gone at 40 columns on 2026-09-07.
 *
 * What is removed is the SENTENCE, not the row: the entry number stays where
 * it is, so the slot still lines up with the numbered slots above and below
 * it, and the row that reaches the ladder is 40 columns or fewer and passes
 * through untouched (`chooseRule` answers `crop`, the identity at that width).
 *
 * This is deliberately a PRESENTATION decision at ONE width, so it lives here
 * rather than in the ladder: an 80-column caller still sees the notice,
 * because nothing adapts his screen at all. Match on the whole phrase - a
 * looser test would eat a real uploader's line.
 */
import type { Frame, Cell } from '@amiexpress/bbs-door-sdk/petscii/frame';
import { blankCell } from '@amiexpress/bbs-door-sdk/petscii/frame';

/** Phrases a 40-column caller is better off not spending rows on. */
export const NARROW_NOISE: RegExp[] = [
  /-\s*NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE\s*-/i,
];

/** The row's text, exactly as wide as the row. */
function textOf(row: ReadonlyArray<Readonly<Cell>>): string {
  return row.map((c) => c.ch).join('');
}

/**
 * The frame with every noise phrase blanked out in place.
 *
 * Returns the SAME frame object when nothing matched, so the common case
 * allocates nothing.
 */
export function stripNarrowNoise(frame: Frame): Frame {
  let hit = false;
  const cells = frame.cells.map((row) => {
    const text = textOf(row);
    let out: Cell[] | null = null;
    for (const pattern of NARROW_NOISE) {
      const match = pattern.exec(text);
      if (!match) continue;
      hit = true;
      out = out ?? row.map((c) => ({ ...c }));
      for (let i = match.index; i < match.index + match[0].length; i += 1) {
        out[i] = blankCell();
      }
    }
    return out ?? row;
  });
  return hit ? { ...frame, cells } : frame;
}
