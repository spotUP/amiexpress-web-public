/**
 * A DECK AN ARTIST CAN DRAW.
 *
 * A card's appearance used to be a set of enums - two styles, two sizes, four
 * backs - so every board got the same deck. csol reads its cards from a theme
 * file, and on a board whose sysop hand-draws its ANSI and PETSCII that is
 * plainly the right way round (sysop, 2026-09-15).
 *
 * The fixtures are csol's OWN themes, unmodified, because a reader that only
 * handles files written to suit it proves nothing.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { parseCardTheme, renderThemedCardLines } from '../engines/cards/card-theme';

const load = (name: string) =>
  parseCardTheme(readFileSync(join(__dirname, 'assets', `${name}.theme`), 'utf8'));

/** The visible width of every row, which a card must hold to sit beside another. */
const widths = (lines: string[]): number[] => lines.map((line) => line.length);

describe('a card theme', () => {
  it('reads csol\'s own file, quoted title and all', () => {
    const theme = load('default');

    expect(theme.name).toBe('default');
    expect(theme.title).toBe('Default theme');       // quoted, with spaces
    expect(theme.width).toBe(6);
    expect(theme.height).toBe(4);
    expect(theme.suits.heart).toBe('♥');
    expect(theme.red.fg).toBe('red');
    expect(theme.back.bg).toBe('blue');
  });

  it('keeps the frame lines exactly as the artist drew them', () => {
    // The whole point: what is in the file is what lands on the screen.
    const theme = load('default');
    expect(theme.red.top).toBe('┌────┐');
    expect(theme.red.middle).toBe('│    │');
    expect(theme.red.bottom).toBe('└────┘');
  });

  it('draws a card of the height the theme asks for', () => {
    const theme = load('default');
    const lines = renderThemedCardLines({ rank: 'A', suit: 'S' }, theme);

    expect(lines).toHaveLength(4);
    expect(widths(lines)).toEqual([6, 6, 6, 6]);
  });

  it('puts the rank and suit where the text blocks say', () => {
    const theme = load('corners');
    const lines = renderThemedCardLines({ rank: 'A', suit: 'S' }, theme);

    // Four text blocks, four corners: rank top-left, suit top-right, suit
    // bottom-left, rank bottom-right.
    expect(lines[0]).toContain('A');
    expect(lines[0].trimEnd().endsWith('♠')).toBe(true);
    expect(lines[lines.length - 1]).toContain('♠');
    expect(lines[lines.length - 1].trimEnd().endsWith('A')).toBe(true);
  });

  it('counts a negative position back from the far edge', () => {
    /*
     * This is what lets ONE theme corner a card of any size: csol's
     * `corners` is four text blocks and nothing else, and it would need a
     * rewrite per width without it.
     */
    const theme = load('corners');
    const wide = { ...theme, width: 12 };

    const narrow = renderThemedCardLines({ rank: '10', suit: 'H' }, theme);
    const broad = renderThemedCardLines({ rank: '10', suit: 'H' }, wide);

    expect(narrow[0].trimEnd().endsWith('♥')).toBe(true);
    expect(broad[0].trimEnd().endsWith('♥')).toBe(true);
    expect(broad[0]).toHaveLength(12);
  });

  it('draws red suits and black suits from their own layouts', () => {
    const theme = load('default');
    // The default theme frames them alike but colours them apart; the choice
    // of LAYOUT is what a theme with different frames would rely on.
    expect(theme.red.fg).toBe('red');
    expect(theme.black.fg).toBe('black');

    const heart = renderThemedCardLines({ rank: '7', suit: 'H' }, theme);
    const spade = renderThemedCardLines({ rank: '7', suit: 'S' }, theme);
    expect(heart).toHaveLength(spade.length);
  });

  it('draws a back and an empty slot with no rank on them', () => {
    const theme = load('corners');

    const back = renderThemedCardLines({ rank: 'A', suit: 'S' }, theme, { face: 'back' });
    const empty = renderThemedCardLines({ rank: 'A', suit: 'S' }, theme, { face: 'empty' });

    expect(back.join('')).not.toContain('A');
    expect(empty.join('')).not.toContain('A');
    expect(widths(back)).toEqual(widths(empty));
  });

  it('refuses a theme that would draw nothing', () => {
    /*
     * A file with no name, or with no card layouts, is a deck nobody can
     * play with - and a silent one is worse than an error.
     *
     * Written across lines because the format IS line-oriented: a layout
     * value carries spaces inside it (`middle │    │`), so a key owns the
     * rest of its line and `theme { ... }` on one line is not this format.
     */
    expect(() => parseCardTheme('theme {\n  title Nameless\n}')).toThrow(/needs a name/);
    expect(() => parseCardTheme('theme {\n  name bare\n}')).toThrow(/draws no cards/);
    expect(() => parseCardTheme('name oops')).toThrow(/starts with/);
  });
});

describe('the card engine', () => {
  it('draws a themed card when it is given a theme', async () => {
    // The seam that makes any of this reach a screen: a door hands the
    // engine a theme and every card it draws is the artist's, not this
    // file's.
    const { CardEngine } = await import('../engines/cards/card-engine');
    const theme = parseCardTheme(
      readFileSync(join(__dirname, 'assets', 'corners.theme'), 'utf8'),
    );
    const engine = new CardEngine();

    const themed = engine.renderCardLines({ rank: 'A', suit: '♠' }, { theme } as never);
    const built = engine.renderCardLines({ rank: 'A', suit: '♠' });

    expect(themed).toHaveLength(theme.height);
    expect(themed[0]).toHaveLength(theme.width);
    expect(themed.join('\n')).not.toBe(built.join('\n'));
  });
});
