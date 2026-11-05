/**
 * SCREENTHEME on all three screens.
 *
 * The door registers `MIN_COLUMNS=40`, which is a promise the C64 gate
 * enforces, so it has to be proven at 40 and not merely believed. The rows,
 * the note and the hints are built by exported builders, so these assertions
 * are on the real strings the door hands to the List - not on a source pin.
 *
 * The 80-column branch is asserted literally: a compact change that alters
 * what an 80-column board paints is a regression, not a feature.
 */
import { getCompactProfile } from '../../../../../sdk/engines/ui/blessed/core/responsive-constants';

const {
  BOARD_ART,
  buildThemeItems,
  buildNote,
  buildFooterHints,
  choicesForWidth,
} = require('../../../../../board/Doors/screen-theme-picker/app');

/** Printable width, escape sequences removed. */
const printable = (s: string): number => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;

// Identity styles: the builders only wrap text, so this keeps the assertions
// about LAYOUT rather than about whichever door theme happens to be active.
const plainStyles = {
  accent: (t: string) => t,
  dim: (t: string) => t,
  ink: (t: string) => t,
};

const THEMES = [
  { slug: 'neon', title: 'Neon', author: 'Skope', widths: [80], status: 'live' },
  { slug: 'petscii-nights', title: 'PETSCII Nights', author: 'Tango', widths: [40], status: 'live' },
  { slug: 'both', title: 'Both Ways', author: 'Mo', widths: [80, 40], status: 'draft' },
  { slug: 'undeclared', title: 'Undeclared', author: '', widths: [], status: 'live' },
];

describe('which themes a caller is offered', () => {
  it("always offers the board's own art, so a caller can take a theme off", () => {
    // `default` is not a directory - it IS the board's screens - so it is never
    // in the list the registry returns. Without this row the only way off a
    // theme was for a sysop to retire it.
    expect(choicesForWidth([], 80)[0]).toEqual(BOARD_ART);
    expect(choicesForWidth(THEMES, 80).filter((t: { slug: string }) => t.slug === 'default')).toHaveLength(1);
  });

  it('hides an 80-column-only theme from a C64 caller', () => {
    const slugs = choicesForWidth(THEMES, 40).map((t: { slug: string }) => t.slug);

    expect(slugs).not.toContain('neon');
    expect(slugs).toContain('petscii-nights');
    expect(slugs).toContain('both');
  });

  it('hides a 40-column-only theme from an 80-column caller', () => {
    const slugs = choicesForWidth(THEMES, 80).map((t: { slug: string }) => t.slug);

    expect(slugs).toContain('neon');
    expect(slugs).not.toContain('petscii-nights');
  });

  it('offers a theme that declares no width at every width', () => {
    // An empty declaration is a theme that has not said, not one that said no.
    for (const width of [40, 80, 132]) {
      expect(choicesForWidth(THEMES, width).map((t: { slug: string }) => t.slug)).toContain('undeclared');
    }
  });
});

describe('screen-theme-picker compact (40-column) layout', () => {
  const compact = getCompactProfile(40);

  it('every row fits a 40-column screen', () => {
    const rows = buildThemeItems(choicesForWidth(THEMES, 40), 'default', plainStyles, compact, 40);

    for (const row of rows) expect(printable(row)).toBeLessThanOrEqual(40);
  });

  it('the 40-column row is the mark plus the title, with no artist column', () => {
    const [first] = buildThemeItems(choicesForWidth(THEMES, 40), 'default', plainStyles, compact, 40);

    expect(first).toBe("[*] The board's own art");
    expect(first).not.toContain('by ');
  });

  it('a long title is clipped to the SCREEN, never folded onto the next row', () => {
    const long = [{ slug: 'x', title: 'A Theme Title Far Longer Than Any Screen Allows', author: 'Somebody With A Long Handle', widths: [], status: 'live' }];

    for (const width of [40, 32, 24]) {
      const [row] = buildThemeItems(long, 'none', plainStyles, getCompactProfile(width), width);
      expect(printable(row)).toBeLessThanOrEqual(width);
    }
  });

  it('the note and the footer hints fit 40 columns', () => {
    expect(printable(buildNote(plainStyles, compact))).toBeLessThanOrEqual(40);

    const hints = buildFooterHints(compact);
    const rendered = ' ' + hints.map((h: { key: string; does: string }) => `${h.key}: ${h.does}`).join('  ');
    expect(printable(rendered)).toBeLessThanOrEqual(40);
  });

  it('every glyph it paints is plain ASCII, which the PETSCII table can map', () => {
    const painted = [
      ...buildThemeItems(choicesForWidth(THEMES, 40), 'default', plainStyles, compact, 40),
      buildNote(plainStyles, compact),
      ...buildFooterHints(compact).map((h: { key: string; does: string }) => `${h.key}: ${h.does}`),
    ].join('');

    // Anything outside this range prints `?` on a C64
    // (sdk/petscii/unicode-to-petscii.ts).
    expect(painted).toMatch(/^[\x20-\x7e]*$/);
  });
});

describe('screen-theme-picker at 80 columns', () => {
  const wide = getCompactProfile(80);

  it('keeps the artist beside the title', () => {
    const rows = buildThemeItems(choicesForWidth(THEMES, 80), 'neon', plainStyles, wide, 80);

    expect(rows[0]).toContain("The board's own art");
    expect(rows.find((r: string) => r.includes('Neon'))).toContain('by Skope');
  });

  it('marks the theme in force, not the row the cursor is on', () => {
    const rows = buildThemeItems(choicesForWidth(THEMES, 80), 'neon', plainStyles, wide, 80);

    expect(rows.filter((r: string) => r.startsWith('[*]'))).toHaveLength(1);
    expect(rows.find((r: string) => r.startsWith('[*]'))).toContain('Neon');
  });

  it('says a draft is a draft, so nobody wonders why callers cannot see it', () => {
    const rows = buildThemeItems(choicesForWidth(THEMES, 80), 'default', plainStyles, wide, 80);

    expect(rows.find((r: string) => r.includes('Both Ways'))).toContain('(draft)');
  });

  it('grows the title column with the screen at 132 columns', () => {
    // A title long enough that the artist's name is cut off at 80 and not at
    // 132: a wide screen is not an 80-column screen with padding.
    const long = [{
      slug: 'long', widths: [80], status: 'live', author: 'Tango',
      title: 'A Theme Whose Title Runs Most Of The Way Across An Eighty Column Board',
    }];

    const at80 = buildThemeItems(long, 'none', plainStyles, wide, 80);
    const at132 = buildThemeItems(long, 'none', plainStyles, getCompactProfile(132), 132);

    expect(printable(at80[0])).toBeLessThanOrEqual(80);
    expect(printable(at132[0])).toBeLessThanOrEqual(132);
    expect(at80[0]).not.toContain('by Tango');
    expect(at132[0]).toContain('by Tango');
  });
});
