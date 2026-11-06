/**
 * The list arriving, rather than appearing.
 *
 * The sysop, 2026-09-16: "it would be cool if the skeleton loaders animated
 * scrambled text while waiting for the data that gradually stopped on the real
 * characters randomly".
 *
 * So the placeholder rows are not dots any more while the scenewall is being
 * asked - they are noise, and when the answer lands each CHARACTER stops on
 * its real value at its own moment. The row settles the way a departure board
 * does, which is the point: a caller can see that something is happening and
 * roughly how far along it is.
 *
 * TWO RULES THIS MODULE OBEYS, and both are why it is pure:
 *
 *  - ESCAPES ARE NEVER SCRAMBLED. A row is `ESC[36m` + text + `ESC[34m:` + ...;
 *    scrambling the bytes of a colour code paints the screen a random colour
 *    or worse, leaves a half-written sequence on the wire. Only PRINTABLE
 *    characters are replaced, and the pens land exactly where they landed.
 *  - THE LAST FRAME IS THE REAL ROW, byte for byte. An animation that ends
 *    near the answer is a bug that looks like a feature; `isSettled` filling
 *    up is the only way it can finish.
 */

/**
 * What noise is made of.
 *
 * Uppercase, digits and a little punctuation: every one of them exists in
 * both PETSCII banks and in latin-1, so the same frames go to a C64 and to an
 * ANSI terminal without a translation table in between.
 */
export const SCRAMBLE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#*+-=/\\<>';

/** A CSI sequence: `ESC[`, parameters, one final letter. */
const CSI = /^\x1b\[[0-9;?]*[A-Za-z]/;

/** Deterministic in a test, random on the board. */
export type Random = () => number;

function glyph(random: Random): string {
  const index = Math.floor(random() * SCRAMBLE_ALPHABET.length) % SCRAMBLE_ALPHABET.length;
  return SCRAMBLE_ALPHABET[index] ?? '#';
}

/** How many printable characters a line has - the length of its settle mask. */
export function visibleLength(line: string): number {
  let count = 0;
  for (let i = 0; i < line.length; ) {
    const escape = CSI.exec(line.slice(i));
    if (escape) { i += escape[0].length; continue; }
    count++; i++;
  }
  return count;
}

/**
 * One frame: `line`'s escapes and settled characters, noise everywhere else.
 *
 * `settled[n]` is about the nth PRINTABLE character, not the nth byte, so a
 * mask outlives a change of pen.
 */
export function scrambleFrame(line: string, settled: readonly boolean[], random: Random): string {
  const out: string[] = [];
  let visible = 0;

  for (let i = 0; i < line.length; ) {
    const escape = CSI.exec(line.slice(i));
    if (escape) {
      out.push(escape[0]);
      i += escape[0].length;
      continue;
    }
    const character = line[i];
    // A space stays a space: scrambling the gaps between columns turns a
    // table into a wall and the caller loses the shape he is waiting for.
    if (character === ' ' || settled[visible]) out.push(character);
    else out.push(glyph(random));
    visible++; i++;
  }
  return out.join('');
}

/** Nothing settled yet, for a row of `length` printable characters. */
export function nothingSettled(length: number): boolean[] {
  return Array.from({ length }, () => false);
}
