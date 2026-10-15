/**
 * Nothing outside xterm's own stylesheet may force the cursor's colour.
 *
 * Four reports in one evening - "the cursor is white and dont blink" - and
 * five fixes aimed at focus, at the DOM renderer's focus class and at the
 * theme, none of which changed what the sysop saw. The browser finally said
 * why, when asked which rules matched the cursor span:
 *
 *     [.xterm .xterm-cursor]{bg=rgb(255, 255, 255)!}
 *
 * An inline <style> in index.html - "Authentic BBS cursor styling", from the
 * first commit - set `background-color: #fff !important` on `.xterm-cursor`.
 * `!important` is the one thing in the cascade that outranks a running CSS
 * animation, and xterm's DOM renderer blinks the cursor with exactly such an
 * animation. So the cursor was painted solid white, never blinked, and no
 * change to focus, theme or renderer state could have made any difference.
 *
 * That file is invisible to every component test and to a grep over src/,
 * which is why this test reads it directly.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const INDEX_HTML = resolve(__dirname, '../../../index.html');

function inlineStyles(html: string): string {
  return [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
}

/** Strip comments, so the note explaining the removal cannot trip the pin. */
function withoutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('the cursor is the theme\'s to paint', () => {
  const css = withoutComments(inlineStyles(readFileSync(INDEX_HTML, 'utf8')));

  it('index.html declares no rule for the xterm cursor at all', () => {
    expect(css).not.toMatch(/xterm-cursor/);
  });

  it('index.html forces no background with !important on anything inside .xterm but the viewport', () => {
    // The viewport ground is the page's to hold black; the cursor and the
    // cells are the theme's and the renderer's.
    const forced = [...css.matchAll(/([^{}]+)\{[^}]*background[^;}]*!important[^}]*\}/g)]
      .map(m => m[1].trim())
      .filter(sel => /\.xterm/.test(sel) && !/xterm-viewport|xterm-selection/.test(sel));
    expect(forced).toEqual([]);
  });
});
