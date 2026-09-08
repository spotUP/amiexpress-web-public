/**
 * "the admin page turned white now?" - and it was this file.
 *
 * A `@font-face` was added at the TOP of the stylesheet, above
 * `@import './styles/tokens.css'`. CSS requires `@import` to precede every
 * other rule, so the browser dropped the import, every design token went with
 * it, and the admin rendered unstyled.
 *
 * Nothing about that is visible in a component test - the app renders fine,
 * with no colours - so the rule is pinned here, on the file itself.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

/** Where each at-rule first appears, ignoring comments. */
const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('the admin stylesheet', () => {
  it('imports the design tokens before any other rule', () => {
    const firstImport = withoutComments.indexOf('@import');
    expect(firstImport).toBeGreaterThanOrEqual(0);

    for (const rule of ['@font-face', '@tailwind', '@media', '@layer']) {
      const at = withoutComments.indexOf(rule);
      if (at === -1) continue;
      // Red before: the PetMe64 face sat above the import, which made the
      // import invalid and took every token off the page.
      expect(at).toBeGreaterThan(firstImport);
    }
  });

  it('still declares both fonts it draws with', () => {
    expect(css).toContain("font-family: 'PetMe64'");
    expect(css).toContain("font-family: 'Topaz_a1200'");
  });
});
