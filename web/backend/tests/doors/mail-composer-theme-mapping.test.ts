/**
 * A door bar is grounded in the theme's `bar` token.
 *
 * This file used to prove Mail Composer's literal-to-token migration by
 * checking that `classic` still produced the old colour names. The sysop
 * removed classic on 2026-10-17, so those checks had nothing left to
 * compare against; the bar rule below holds for every theme the board ships.
 */
process.env.SKIP_DB_INIT = '1';

import { THEMES, footerStyle } from '../../../../sdk/engines/ui/theme';

/**
 * A BAR's ground is the `bar` token, not the accent.
 *
 * Decided 2026-09-15 while migrating dopewars, whose header and action bars
 * were white-on-blue. Two things in the SDK disagree about what a bar is:
 *
 *   - the `bar` STYLE role is `{fg: ground, bg: accent}` 
 *   - the `bar`/`barInk` TOKENS are documented "header and footer bars" /
 *     "text on a bar"
 *
 * `footerStyle()` - the SDK's own helper, used by the doors that already
 * took the chrome - is `{fg: dim, bg: tokens.bar}`. So the token is what a
 * bar's ground actually is. That is the rule the migration follows.
 */
describe('a bar takes the bar tokens', () => {
  it("agrees with the SDK's own footerStyle, which grounds a bar in the bar token", () => {
    for (const theme of THEMES) {
      expect(`${theme.id}:${footerStyle(theme).bg}`).toBe(`${theme.id}:${theme.tokens.bar}`);
    }
  });

  it('is NOT the accent, which the bar style role uses and would restyle the door', () => {
    for (const theme of THEMES) {
      expect(`${theme.id}:${theme.tokens.bar}`).not.toBe(`${theme.id}:${theme.tokens.accent}`);
    }
  });

  it('gives every theme a bar ground distinct from its text', () => {
    for (const theme of THEMES) {
      expect(`${theme.id}:${theme.tokens.bar}`).not.toBe(`${theme.id}:${theme.tokens.barInk}`);
    }
  });
});
