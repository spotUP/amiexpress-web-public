/**
 * Mail Composer's migration to theme tokens must not change `classic`.
 *
 * The 23-door migration rests on one claim (2026-09-01-theme-borders plan):
 * "each literal is now the TOKEN that was standing behind it, so `classic`
 * renders exactly as before (its tokens ARE those names)". That is only true
 * if each literal is mapped to the RIGHT token, and classic makes it easy to
 * get backwards:
 *
 *     accent    = 'yellow'
 *     accentAlt = 'cyan'
 *
 * which is the opposite of the order the names suggest. Mapping cyan onto
 * `accent` would have swapped every label and border in the door under the
 * one theme the migration promises not to touch - caught here on 2026-09-15
 * while migrating it.
 *
 * This pins the mapping table the door was migrated against. It is not a
 * source-text pin: it asserts what the tokens RESOLVE to, so the door can be
 * rewritten freely as long as classic still looks like classic.
 */
process.env.SKIP_DB_INIT = '1';

import { themeById, themeStyles, THEMES, footerStyle } from '../../../../sdk/engines/ui/theme';

describe('the literals the door migration replaces', () => {
  const classic = themeById('classic');
  const T = classic.tokens;

  it("maps 'cyan' to accentAlt, not accent", () => {
    expect(T.accentAlt).toBe('cyan');
    expect(T.accent).not.toBe('cyan');
  });

  it("maps 'yellow' to accent, not accentAlt", () => {
    expect(T.accent).toBe('yellow');
    expect(T.accentAlt).not.toBe('yellow');
  });

  it("maps white-on-blue inputs to the selection pair", () => {
    expect(T.selectionInk).toBe('white');
    expect(T.selectionBg).toBe('blue');
  });

  it("maps 'gray' hints to dim and plain text to ink", () => {
    expect(T.dim).toBe('gray');
    expect(T.ink).toBe('white');
  });

  it('draws the composer frame in the theme\'s accent, which is the convention', () => {
    // NOT a preserved literal, and worth being explicit about: the container
    // was `border: { fg: 'cyan' }` and S.frame's rule is the ACCENT token, so
    // under classic this border goes cyan -> yellow. That is the migration
    // working rather than a slip. DOORMAN did the same when it moved to
    // T.accent; a door that keeps its own border colour is a door the theme
    // still does not reach, which is the whole thing being fixed.
    const S = themeStyles(classic);
    expect((S.frame.style as any).border.fg).toBe(T.accent);
  });

  it('keeps the frame visible in every theme, which is why it is a frame', () => {
    // The point of the role: a dialog must not sink into the ground on the
    // two themes that deliberately draw no panel borders.
    for (const theme of THEMES) {
      const S = themeStyles(theme);
      const rule = (S.frame.style as any).border.fg;
      expect(`${theme.id}:${rule}`).not.toBe(`${theme.id}:${theme.tokens.ground}`);
    }
  });

  it('covers the two borderless themes specifically', () => {
    for (const id of ['quiet-phosphor', 'phosphor-muted']) {
      const theme = themeById(id);
      expect(theme.border).toBe('none');
      const rule = (themeStyles(theme).frame.style as any).border.fg;
      expect(`${id}:${rule}`).not.toBe(`${id}:${theme.tokens.ground}`);
    }
  });
});

/**
 * A BAR's ground is the `bar` token, not the accent.
 *
 * Decided 2026-09-15 while migrating dopewars, whose header and action bars
 * were white-on-blue. Two things in the SDK disagree about what a bar is:
 *
 *   - the `bar` STYLE role is `{fg: ground, bg: accent}` - black on yellow
 *     under classic
 *   - the `bar`/`barInk` TOKENS are documented "header and footer bars" /
 *     "text on a bar", and are blue/white under classic
 *
 * `footerStyle()` - the SDK's own helper, used by the doors that already
 * took the chrome - is `{fg: dim, bg: tokens.bar}`. So the token is what a
 * bar's ground actually is, and it is also the mapping that leaves classic
 * untouched. That is the rule the migration follows.
 */
describe('a bar takes the bar tokens', () => {
  const classic = themeById('classic');

  it('is white on blue under classic, which is what the doors had', () => {
    expect(classic.tokens.bar).toBe('blue');
    expect(classic.tokens.barInk).toBe('white');
  });

  it("agrees with the SDK's own footerStyle, which grounds a bar in the bar token", () => {
    expect(footerStyle(classic).bg).toBe(classic.tokens.bar);
  });

  it('is NOT the accent, which the bar style role uses and would restyle the door', () => {
    expect(classic.tokens.bar).not.toBe(classic.tokens.accent);
  });

  it('gives every theme a bar ground distinct from its text', () => {
    for (const theme of THEMES) {
      expect(`${theme.id}:${theme.tokens.bar}`).not.toBe(`${theme.id}:${theme.tokens.barInk}`);
    }
  });
});
