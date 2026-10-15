/**
 * The app stylesheet must not set a font-size on xterm's own elements.
 *
 * xterm writes `.xterm-rows { font-size: <options.fontSize>px }` into its
 * own <style>; an `!important` rule on the same selectors in index.css beat
 * it, and went unnoticed for a year because the canvas renderer draws from
 * the option and ignores CSS. The first session to take the DOM renderer -
 * teletext, whose mosaics the canvas atlas draws a pixel short - shrank
 * every row to 16px (sysop, 2026-09-14).
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');

/** Every rule whose selector mentions xterm, as [selector, body] pairs. */
function xtermRules(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selector = m[1].trim();
    if (/xterm|#terminal\b/.test(selector)) out.push([selector, m[2]]);
  }
  return out;
}

describe('index.css leaves the terminal font size to xterm', () => {
  it('has xterm rules at all, so the check is looking at something', () => {
    expect(xtermRules().length).toBeGreaterThan(0);
  });

  it('sets no font-size and no line-height on any xterm selector', () => {
    const offenders = xtermRules()
      .filter(([, body]) => /(^|[\s;])(font-size|line-height)\s*:/.test(body))
      .map(([selector]) => selector);
    expect(offenders).toEqual([]);
  });
});
