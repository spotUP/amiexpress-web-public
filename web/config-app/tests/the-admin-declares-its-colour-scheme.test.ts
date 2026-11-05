/**
 * The admin tells the browser it is dark.
 *
 * Everything the browser paints itself - scrollbars, a number input's
 * spinner, a date picker, a textarea's resize grip - comes from the
 * document's colour scheme, not from our tokens. Nothing declared one, so
 * they were all drawn from the light palette on a page whose every surface
 * is `#0b0e14`: "the scrollbars in the admin ui dont have a dark theme they
 * are light" (sysop, 2026-09-14).
 *
 * Read off the stylesheet rather than a rendered page: jsdom implements
 * neither `color-scheme` nor a scrollbar, so a DOM test here would assert
 * nothing. The property IS the fix.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '..', 'src', 'index.css'), 'utf8');
const tokens = readFileSync(resolve(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');

describe('the admin declares its colour scheme', () => {
  it('says dark, so the browser draws its own widgets dark', () => {
    expect(css).toMatch(/color-scheme:\s*dark/);
  });

  it('has one palette for this to be true of - no light theme to contradict it', () => {
    expect(tokens).not.toMatch(/prefers-color-scheme:\s*light/);
    expect(tokens).not.toMatch(/\[data-theme=['"]?light/);
  });
});

describe('and the scrollbars come from the ramp', () => {
  /** Every colour a scrollbar rule sets, so none of them can be a hex. */
  const scrollbarRules = css.match(/::-webkit-scrollbar[^{]*\{[^}]*\}/g) ?? [];

  it('styles the track, the thumb and the corner', () => {
    const selectors = scrollbarRules.join(' ');
    expect(selectors).toMatch(/::-webkit-scrollbar-track/);
    expect(selectors).toMatch(/::-webkit-scrollbar-thumb/);
    // Two scrollbars meeting is a light square until this is set.
    expect(selectors).toMatch(/::-webkit-scrollbar-corner/);
  });

  it('names tokens, never a colour of its own', () => {
    expect(scrollbarRules.length).toBeGreaterThan(0);
    for (const rule of scrollbarRules) {
      expect(rule).not.toMatch(/#[0-9a-f]{3,8}\b/i);
      expect(rule).not.toMatch(/\brgba?\(\s*\d/);
    }
  });

  it('answers Firefox too, which ignores the WebKit rules', () => {
    expect(css).toMatch(/scrollbar-color:\s*rgb\(var\(--/);
    expect(css).toMatch(/scrollbar-width:/);
  });
});
