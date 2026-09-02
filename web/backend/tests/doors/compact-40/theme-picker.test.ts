/**
 * theme-picker at 40x25 (C64/PETSCII XXS tier) - C64 40-col plan, Task 6.
 *
 * RED, captured from the real door through a 40x25 BBS stub before this
 * change (scratch harness, byte stream rendered into a 40x25 grid):
 *
 *   02|>>[*] Classic          The original Ami
 *   03|  Express look and feel            <-- the row folded
 *   04|  [ ] Midnight         Low-light theme
 *   (the third theme never appeared; the note and the footer both clipped)
 *
 * The rows are built by exported builders so the assertion is on the real
 * strings the door hands to the List, not on a source pin. The 80-column
 * branch is pinned literally: a compact change that alters an 80-column
 * board's screen is a regression, not a feature.
 */
import { getCompactProfile } from '../../../../../sdk/engines/ui/blessed/core/responsive-constants';

const {
  buildThemeItems,
  buildNote,
  buildFooterHints,
} = require('../../../../../Doors/theme-picker/app');

/** Printable width, escape sequences removed. */
const printable = (s: string): number => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').length;

// A no-op style bag: the builders only ever wrap text, so an identity style
// makes the assertions about LAYOUT, not about the active theme's colours.
const plainStyles = {
  accent: (t: string) => t,
  dim: (t: string) => t,
  ink: (t: string) => t,
};

const THEMES = [
  { id: 'classic', name: 'Classic', blurb: 'The original AmiExpress look and feel' },
  { id: 'midnight', name: 'Midnight', blurb: 'Low-light theme with muted accents' },
  { id: 'amber', name: 'Amber', blurb: 'Monochrome amber phosphor, like a VT' },
];

describe('theme-picker compact (40-column) layout', () => {
  const compact = getCompactProfile(40);
  const wide = getCompactProfile(80);

  it('every theme row fits a 40-column screen', () => {
    const items = buildThemeItems(THEMES, 'classic', plainStyles, compact);
    expect(items).toHaveLength(3);
    for (const item of items) {
      expect(printable(item)).toBeLessThanOrEqual(40);
    }
  });

  it('the 40-column row is the mark plus the name, with no blurb column', () => {
    const [first] = buildThemeItems(THEMES, 'classic', plainStyles, compact);
    expect(first).toBe('[*] Classic');
    expect(first).not.toContain('The original');
  });

  it('a long theme name is clipped, never folded onto the next row', () => {
    const [row] = buildThemeItems(
      [{ id: 'x', name: 'A Theme Name Far Longer Than Forty Columns Allows', blurb: 'b' }],
      'none',
      plainStyles,
      compact
    );
    expect(printable(row)).toBeLessThanOrEqual(40);
  });

  it('the note and the footer hints fit 40 columns', () => {
    expect(printable(buildNote(plainStyles, compact))).toBeLessThanOrEqual(40);
    const hints = buildFooterHints(compact);
    // ' ' + 'Key: Does' joined by two spaces is what the footer renders.
    const rendered = ' ' + hints.map(h => `${h.key}: ${h.does}`).join('  ');
    expect(printable(rendered)).toBeLessThanOrEqual(40);
  });

  it('the 80-column rows, note and hints are byte-identical to the pre-change door', () => {
    expect(buildThemeItems(THEMES, 'classic', plainStyles, wide)).toEqual([
      '[*] Classic          The original AmiExpress look and feel',
      '[ ] Midnight         Low-light theme with muted accents',
      '[ ] Amber            Monochrome amber phosphor, like a VT',
    ]);
    expect(buildNote(plainStyles, wide)).toBe('  A theme applies the next time a door draws.');
    expect(buildFooterHints(wide)).toEqual([
      { key: 'Up/Down', does: 'Choose' },
      { key: 'Enter', does: 'Use it' },
      { key: 'Q', does: 'Leave' },
    ]);
  });
});
