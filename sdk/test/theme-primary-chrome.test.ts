/**
 * The primary colour carries the chrome.
 *
 * "the menu bg color should be the primary theme color and the texts and
 * slashes black. all borders in the app needs to use the themes primary
 * color as well ... this goes for all apps using themes" (sysop,
 * 2026-09-03).
 *
 * Every themed door draws its panels, frames, lists and bars from
 * themeStyles, so the rule belongs here rather than in each door - and a
 * test that walks EVERY theme is what stops the next theme from being added
 * with the old mapping.
 */

import { describe, it, expect } from '@jest/globals';
import { THEMES, themeStyles } from '../engines/ui/theme';

describe('every theme', () => {
  for (const theme of THEMES) {
    describe(theme.id, () => {
      const s = themeStyles(theme);
      const t = theme.tokens;

      it('paints the bar in the primary colour, with the ground on top', () => {
        expect(s.bar.style.bg).toBe(t.accent);
        expect(s.bar.style.fg).toBe(t.ground);
        // Every theme's ground is black, which is what "texts and slashes
        // black" asked for; if a theme ever arrives with a light ground,
        // this is where that decision has to be made again.
        expect(t.ground).toBe('black');
      });

      it('draws every border in the primary colour', () => {
        for (const role of ['panel', 'frame', 'list'] as const) {
          const border = s[role].style.border?.fg;
          if (role !== 'panel' && role !== 'list') {
            expect(border).toBe(t.accent);
            continue;
          }
          // A borderless theme sinks the rule into the ground on purpose.
          expect(border).toBe(theme.border === 'none' ? t.ground : t.accent);
        }
      });

      it('keeps a focused border visible by making it brighter, not another hue', () => {
        // With every idle border already the accent, focus in the accent
        // would be invisible. ink is the brightest thing a theme has.
        for (const role of ['panel', 'frame', 'list'] as const) {
          expect(s[role].style.focus?.border?.fg).toBe(t.ink);
        }
      });

      it('never leaves a chrome value undefined', () => {
        expect(s.bar.style.bg).toBeTruthy();
        expect(s.bar.style.fg).toBeTruthy();
        expect(s.panel.style.border?.fg).toBeTruthy();
      });
    });
  }
});

describe('classic, which used to promise it would never change', () => {
  it('now takes the same rule as the rest', () => {
    const classic = THEMES.find((theme) => theme.id === 'classic')!;
    const s = themeStyles(classic);

    // Was blue with white text; the sysop asked for the primary colour
    // across every themed door, and classic is not exempt from that.
    expect(s.bar.style.bg).toBe('yellow');
    expect(s.bar.style.fg).toBe('black');
    expect(s.panel.style.border?.fg).toBe('yellow');
  });
});
