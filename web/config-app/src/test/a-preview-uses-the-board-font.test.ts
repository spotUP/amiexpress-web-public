/**
 * A screen preview has to draw in the face the caller will see.
 *
 * `ScreenPreview` asked xterm for `IBM VGA, Consolas, monospace` - a PC font
 * the admin does not ship at all - so every preview of this board's Amiga art
 * rendered in whatever monospace the browser happened to pick. The sysop,
 * 2026-09-14: "the previews dont use topaz".
 *
 * The board's default is `TopazPlus_a1200` (`DEFAULT_BBS_FONT`,
 * packages/terminal/src/utils/session-font.ts:34), and the admin shipped only
 * plain `Topaz_a1200` - a DIFFERENT file, not merely a different name. Both
 * halves had to change: ship the face, then ask for it.
 *
 * Read off the source rather than rendered, because the defect is which font
 * is NAMED and which file is SHIPPED. A jsdom render resolves no webfont and
 * would pass on the broken version.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..');

describe('the screen preview', () => {
  it('asks for the font the board actually serves', () => {
    const src = readFileSync(join(SRC, 'components/ScreenPreview.tsx'), 'utf8');

    expect(src).toMatch(/fontFamily:\s*"'TopazPlus_a1200'/);
  });

  it('does not ask for a PC font', () => {
    // The one it had: a DOS-era face, not shipped here, so naming it was the
    // same as naming nothing.
    //
    // Asserted against the VALUE rather than the file: the comment above the
    // fontFamily explains what was wrong and names the old font to do it,
    // and a test that forbids the word forbids the explanation with it.
    const src = readFileSync(join(SRC, 'components/ScreenPreview.tsx'), 'utf8');
    const family = /fontFamily:\s*"([^"]+)"/.exec(src)?.[1] ?? '';

    expect(family).not.toMatch(/IBM VGA|Consolas/);
  });

  it('ships the file it names', () => {
    // Naming a family the stylesheet never registers is the quieter half of
    // the same bug: the browser falls back and nothing says so.
    expect(existsSync(join(SRC, 'fonts/TopazPlus_a1200_v1.0.ttf'))).toBe(true);
  });

  it('registers it as a webface', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8');

    expect(css).toContain("font-family: 'TopazPlus_a1200'");
    expect(css).toContain('TopazPlus_a1200_v1.0.ttf');
  });

  it('keeps plain Topaz as the fallback, not the first choice', () => {
    // Same metrics, different face - worth having behind TopazPlus, wrong in
    // front of it.
    const src = readFileSync(join(SRC, 'components/ScreenPreview.tsx'), 'utf8');
    const family = /fontFamily:\s*"([^"]+)"/.exec(src)?.[1] ?? '';

    expect(family.indexOf('TopazPlus_a1200')).toBeLessThan(family.indexOf('Topaz_a1200'));
  });
});
