/**
 * The logo is one block, in one colour, aligned as it is drawn.
 *
 * Sysop, 2026-09-15: "grandmaster works but the top row of the logo is
 * offset". Two faults, both in the same four lines of ASCII art:
 *
 *   COLOUR. The art carried `{bold}{yellow-fg}` on its FIRST line only. A
 *   blessed attribute does not survive the newline, so line one was yellow
 *   and the other three took the box's style - invisible while the box was
 *   yellow too, and a two-tone logo the moment the theme moved.
 *
 *   ALIGNMENT. `align: center` pads each line by half of its OWN slack. The
 *   top rule was 70 characters against 71 for the letters, so it was padded
 *   one column further right - on top of the one column the art itself puts
 *   there - and the rule sat two columns off the letters under it.
 *
 * Both are properties of the art, so both are checked on the art.
 */

import assert from 'assert';
import { Screen } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
import { themeById } from '@amiexpress/bbs-door-sdk/engines/ui/theme';
import { MenuScreen } from '../ui/menu';
import { applyTheme } from '../door-theme';

const sounds: any = { playSfx() {}, playMusic() {}, stop() {}, stopMusic() {} };
const state: any = { playerName: 'sysop', settings: {}, stats: {} };

function art(): string[] {
  const screen: any = new Screen({ title: 'logo', width: 80, height: 25 } as any);
  const menu: any = new MenuScreen(screen, state, sounds);
  try {
    return String(menu.getTitleArt()).split('\n');
  } finally { screen.destroy(); }
}

/** Equal-length lines are what makes a centred block a block. */
export async function everyLineOfTheLogoIsTheSameLength(): Promise<void> {
  const lines = art();
  assert.strictEqual(lines.length, 4, 'the logo is four rows');
  const widths = lines.map(l => l.length);
  assert.strictEqual(new Set(widths).size, 1,
    `align: center pads each line by half its own slack, so unequal lines `
    + `drift apart - got ${widths.join(', ')}`);
}

/** The top rule sits exactly one column in, which is how the font draws it. */
export async function theTopRuleSitsOneColumnRightOfTheLetters(): Promise<void> {
  const lines = art();
  const indent = (l: string) => l.length - l.trimStart().length;
  assert.strictEqual(indent(lines[0]) - indent(lines[1]), 1,
    'the rule is one column right of the uprights, not two');
}

/**
 * No colour inside the art: the box's style carries it, for all four lines.
 */
export async function theLogoCarriesNoColourOfItsOwn(): Promise<void> {
  for (const line of art()) {
    assert.ok(!/\{[^}]*-(fg|bg)\}/.test(line),
      `a tag inside the art colours ONE line and leaves the rest to the box: ${line}`);
    assert.ok(!line.includes('{bold}'),
      'weight comes from the style too, or line one is bold and the rest are not');
  }
}

/** And the style is the theme's, so the whole logo moves with it. */
export async function theWholeLogoTakesTheThemeAccent(): Promise<void> {
  const neon = themeById('uprough-neon');
  applyTheme(neon);
  try {
    const screen: any = new Screen({ title: 'logo-style', width: 80, height: 25 } as any);
    const menu: any = new MenuScreen(screen, state, sounds);
    void menu.show();
    await new Promise(r => setTimeout(r, 260));
    try {
      const title = screen.children.find((c: any) =>
        String(c.getContent?.() ?? '').includes('_____'));
      assert.ok(title, 'the menu draws the logo');
      assert.strictEqual(title.style.fg, neon.tokens.accent,
        'the logo takes the theme accent');
      assert.strictEqual(title.style.bold, true,
        'and the weight the tag used to carry');
    } finally { screen.destroy(); }
  } finally { applyTheme(themeById('classic')); }
}
