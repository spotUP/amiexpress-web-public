/**
 * Button/Element focus-visibility regression tests.
 *
 * Symptom these guard against (GRANDMASTER lobby, 2026-08-24): a row of
 * lobby buttons (Start/Leave/Bots/Force Start) each kept their own
 * fully-saturated caller-chosen bg (yellow/red/cyan) at all times, and the
 * only focus cue was a color swap defined per-caller (often the same blue
 * reused elsewhere on screen for unrelated things). Users could not tell
 * which button currently had keyboard focus - everything looked equally
 * "highlighted". Fixed with two independent, composable defaults:
 *  - Element.getEffectiveContentStyle() forces `bold` on focus by default.
 *  - Button's `ghostWhenIdle` opt-in mutes bg/fg to white-on-black while
 *    unfocused, so only the current Tab target shows its real color.
 *    (Originally used 'gray' - #808080 read as invisible against black in
 *    practice and made a whole button row disappear; switched to white.)
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Screen, Button } from '../engines/ui/blessed';

describe('Focus visibility', () => {
  let screen: Screen;

  beforeEach(() => {
    screen = new Screen({ title: 'Focus Style Test' });
  });

  afterEach(() => {
    if (screen && !screen.destroyed) {
      screen.destroy();
    }
  });

  describe('Element.getEffectiveContentStyle - forced focus bold', () => {
    it('forces bold when focused even if the caller only overrides color', () => {
      const button = new Button({
        parent: screen,
        content: ' Start ',
        style: { bg: 'yellow', fg: 'black', focus: { bg: 'blue' } },
      });

      expect(button.getEffectiveContentStyle().bold).toBeUndefined();
      button.focus();
      expect(button.getEffectiveContentStyle().bold).toBe(true);
      expect(button.getEffectiveContentStyle().bg).toBe('blue');
    });

    it('honors an explicit bold:false in the caller focus style', () => {
      const button = new Button({
        parent: screen,
        content: ' Start ',
        style: { bg: 'yellow', fg: 'black', focus: { bg: 'blue', bold: false } },
      });

      button.focus();
      expect(button.getEffectiveContentStyle().bold).toBe(false);
    });

    it('does not force bold while merely hovered, not focused', () => {
      const button = new Button({
        parent: screen,
        content: ' Start ',
        style: { bg: 'yellow', fg: 'black', focus: { bg: 'blue' }, hover: { bg: 'cyan' } },
      });

      (button as any)._hovered = true;
      expect(button.getEffectiveContentStyle().bold).toBeUndefined();
    });
  });

  describe('Button ghostWhenIdle', () => {
    it('mutes bg/fg to white-on-black while unfocused when ghostWhenIdle is true', () => {
      const button = new Button({
        parent: screen,
        content: ' Leave ',
        style: { bg: 'red', fg: 'white', focus: { bg: 'blue' } },
        ghostWhenIdle: true,
      } as any);

      expect(button.style.bg).toBe('black');
      expect(button.style.fg).toBe('white');
    });

    it('restores the caller color once focused', () => {
      const button = new Button({
        parent: screen,
        content: ' Leave ',
        style: { bg: 'red', fg: 'white', focus: { bg: 'blue' } },
        ghostWhenIdle: true,
      } as any);

      button.focus();
      expect(button.getEffectiveContentStyle().bg).toBe('blue');
    });

    it('keeps full color idle by default (ghostWhenIdle unset)', () => {
      const button = new Button({
        parent: screen,
        content: ' Ready ',
        style: { bg: 'green', fg: 'white', focus: { bg: 'blue' } },
      });

      // Regression guard: a Ready/Not-Ready toggle button repaints its own
      // idle bg at runtime (button.style.bg = 'blue' / 'green') to show
      // persistent app state, not focus. Ghosting must never be the
      // default, or that state becomes invisible whenever focus moves
      // elsewhere.
      expect(button.style.bg).toBe('green');
      expect(button.style.fg).toBe('white');
    });
  });

  describe('Button height vs the touch-friendly minimum', () => {
    // Symptom (GRANDMASTER lobby, 2026-08-24): Button hardcodes
    // `touchFriendly: !isInline`, and ResponsiveBehavior.applyTouchFriendlySizing()
    // enforces MIN_TOUCH_HEIGHT (3 rows) unconditionally at init - it never
    // checks isMobile - so a non-inline `height: 1` button silently grows to
    // 3 rows even on an 80-col desktop terminal. The 2 extra rows ate into
    // what looked like blank margin below the lobby's button row, until a
    // footer hint was added there and visibly collided with them.
    it('silently grows a non-inline height:1 button to the touch minimum', () => {
      const button = new Button({
        parent: screen,
        content: ' Start ',
        height: 1,
      });

      expect(button.height).toBe(3);
    });

    it('leaves an inline height:1 button at its declared height', () => {
      const button = new Button({
        parent: screen,
        content: ' Start ',
        height: 1,
        inline: true,
      });

      expect(button.height).toBe(1);
    });
  });
});
