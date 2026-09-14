/**
 * Door chatter that says nothing to a 40-column caller.
 *
 * TWO kinds, and both are text a door writes into a slot nobody filled in:
 * a phrase inside a row (blanked in place, the rest of the row kept) and a
 * whole row of placeholder (blanked entirely). See the two tables below.
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

/**
 * Whole rows that are a door's placeholder for a slot NOBODY HAS WRITTEN IN.
 *
 * dRE!WAll fills its unused wall slots with `VIRGIN LINE VIRGIN LINE ...`
 * against the author `dR.dRE!/tRSi`. Each one is a `record` row, so each costs
 * the 40-column caller TWO rows - measured on the corpus fixture, seven
 * placeholders spend 14 of the 31 rows the screen needs, and 25 is what he
 * has. The seven real comments below them cost one row each.
 *
 * Blanked whole, not trimmed: there is no part of the row worth a column, and
 * unlike ctop's numbered slots there is no number to keep the list aligned.
 *
 * Two "VIRGIN LINE"s in a row is the test, not one: it is the door's own
 * repeated filler, and a caller who writes `virgin line` on the wall keeps it.
 */
export const NARROW_PLACEHOLDER_ROWS: RegExp[] = [
  /VIRGIN LINE\s+VIRGIN LINE/i,
  // ctop and conftop number every slot of their table whether anyone has
  // uploaded into it or not, so an empty conference is thirteen rows reading
  // ` 1.` through `13.` and nothing else. Each costs the caller a row of the
  // 25 he has. The whole row must be the number - an entry with an uploader on
  // it has a username after the dot and never matches.
  /^\s*\d{1,3}\.\s*$/,
];

/** The row's text, exactly as wide as the row. */
function textOf(row: ReadonlyArray<Readonly<Cell>>): string {
  return row.map((c) => c.ch).join('');
}

/**
 * A row whose only ink is its BOX RAILS, with nothing between them.
 *
 * The third kind, and the only structural one: JoinCnf frames its conference
 * list in a box and leaves four interior rows empty - `|` then 77 blanks then
 * `|`, 79 columns wide. The ladder answers `crop`, because the only ink past
 * column 40 is the closing rail, and crop keeps columns 0-39: the opening
 * rail and nothing else. Four of the caller's 25 rows went on four lone
 * pipes, and no row of that box has a right-hand rail to pair them with -
 * every CONTENT row in it is a `narrow` row, and narrow drops both rails.
 *
 * An empty box row has nothing to frame, so at this width it is blank. Four
 * blanks in a row then cost ONE, because `collapseLongBlankRuns` already
 * rules that a run of three or more is a hole rather than a door's spacing.
 *
 * RAILS, not any punctuation: the same rail set the record rung recognises,
 * first and last ink on the row and nothing between them. A row with a
 * single `|` and no partner is left alone - it is not a box, and blanking it
 * would be this function guessing.
 */
const BOX_RAILS = ['|', '\u00a6', '!', ':'];

function isEmptyBoxRow(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  const rail = trimmed[0];
  if (!BOX_RAILS.includes(rail)) return false;
  if (trimmed[trimmed.length - 1] !== rail) return false;
  return trimmed.slice(1, -1).trim() === '';
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
    let out: Cell[] | null = null;
    let text = textOf(row);

    // PHRASES FIRST, THEN THE WHOLE-ROW TEST ON WHAT IS LEFT.
    //
    // Order matters, and getting it wrong is visible on the caller's screen:
    // ctop writes its empty-conference notice on the SAME row as an entry
    // number, so the row starts as
    //   ` 5.            - NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE -`
    // The bare-number rule does not match THAT, and the first version of this
    // function tested it against the original text and stopped - leaving ` 5.`
    // alone in the middle of a screen whose other slots had been blanked.
    // Reported from the live board 2026-09-07 as a stray number.
    for (const pattern of NARROW_NOISE) {
      const match = pattern.exec(text);
      if (!match) continue;
      hit = true;
      out = out ?? row.map((c) => ({ ...c }));
      for (let i = match.index; i < match.index + match[0].length; i += 1) {
        out[i] = blankCell();
      }
      text = textOf(out);
    }

    if (NARROW_PLACEHOLDER_ROWS.some((pattern) => pattern.test(text)) || isEmptyBoxRow(text)) {
      hit = true;
      return row.map(() => blankCell());
    }
    return out ?? row;
  });
  return hit ? { ...frame, cells } : frame;
}
