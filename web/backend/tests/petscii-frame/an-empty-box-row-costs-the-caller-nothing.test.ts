/**
 * "the box has four empty rows and a stray rail" - the sysop's 40-column
 * JoinCnf walk, 2026-09-14.
 *
 * JoinCnf frames its conference list in a box and leaves four of its
 * interior rows empty: `|` + 77 blanks + `|`, 79 columns wide. The ladder
 * answers `crop` (the only ink past column 40 is the closing rail), and
 * crop keeps columns 0-39 - which is the opening rail and nothing else. The
 * caller spent four of his 25 rows on four lone pipes, with no right-hand
 * rail anywhere on the screen to pair them with: every CONTENT row of that
 * box is a `narrow` row, and narrow drops both rails.
 *
 * An empty box row has nothing to frame. It is blank at this width, and
 * four blanks in a row are then one, because collapseLongBlankRuns already
 * says a run of three or more is a hole rather than spacing.
 */
import { stripNarrowNoise } from '../../src/server/c64-door-noise';
import { collapseLongBlankRuns } from '../../src/server/c64-door-fit';
import { textToFrame, type Frame } from '@amiexpress/bbs-door-sdk/petscii/frame';

const rowText = (frame: Frame, y: number) =>
  frame.cells[y].map((c) => c.ch).join('').replace(/ +$/, '');

/** JoinCnf's box: a top rule, four empty interior rows, one entry, a bottom. */
function joincnfBox(): Frame {
  const empty = '|' + ' '.repeat(77) + '|';
  return textToFrame(
    [
      '+' + '-'.repeat(38) + '+' + '-'.repeat(38) + '+',
      empty,
      empty,
      empty,
      empty,
      '|' + ' '.repeat(21) + '[01] .................. Lamer Zone' + ' '.repeat(22) + '|',
      '+' + '-'.repeat(38) + '^' + '-'.repeat(38) + '+',
    ],
    80,
    7,
  );
}

describe('an empty box row at 40 columns', () => {
  it('is blank, not a lone rail', () => {
    const stripped = stripNarrowNoise(joincnfBox());
    for (const y of [1, 2, 3, 4]) {
      expect({ y, text: rowText(stripped, y) }).toEqual({ y, text: '' });
    }
  });

  it('leaves a row that frames CONTENT alone', () => {
    const stripped = stripNarrowNoise(joincnfBox());
    expect(rowText(stripped, 5)).toContain('Lamer Zone');
    expect(rowText(stripped, 5).trim().startsWith('|')).toBe(true);
    // ...and the box's own rules are still rules.
    expect(rowText(stripped, 0)).toMatch(/^\+-+\+-+\+$/);
    expect(rowText(stripped, 6)).toMatch(/^\+-+\^-+\+$/);
  });

  it('four of them cost the caller ONE row, not four', () => {
    const squeezed = collapseLongBlankRuns(stripNarrowNoise(joincnfBox()));
    const painted = squeezed.cells
      .map((row) => row.map((c) => c.ch).join('').replace(/ +$/, ''))
      .filter((t) => t !== '');
    // top rule, the entry, bottom rule - and ONE blank between the first two.
    expect(painted).toHaveLength(3);
    const blanks = squeezed.cells.slice(0, 4)
      .filter((row) => row.every((c) => c.ch === ' ')).length;
    expect(blanks).toBe(1);
  });
});
