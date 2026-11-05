/**
 * Regression: SDK List widget's 50ms keypress debounce must apply ONLY to
 * navigation keys (arrows / page / home / end / vi hjkl-gG), not to
 * type-to-search, enter, or escape.
 *
 * Background:
 *   The original code had a blanket gate at the top of List._onKeypress:
 *
 *     const now = Date.now();
 *     if (now - this._lastKeyTime < 50) return true; // Handled (ignored)
 *     this._lastKeyTime = now;
 *
 *   With every key gated identically, type-to-search lost characters when
 *   the user typed faster than 20Hz. It also silently dropped Enter/Escape
 *   that landed within 50ms of an arrow press, contributing to the
 *   "frozen" feeling reported in the DOORMAN session — keys queued during
 *   a render pause arrived in bursts and most got eaten by the gate.
 *
 *   The fix scopes the debounce to navigation keys only.
 *
 * This test pairs with tests/server/sdk-list-debounce-scope.test.ts in
 * the backend suite — the backend test is a source-level guard, this one
 * is a behavioral test that drives the actual widget.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Screen, List } from '../engines/ui/blessed';

describe('List._onKeypress debounce — navigation only', () => {
  let screen: Screen;
  let list: List;

  beforeEach(() => {
    screen = new Screen({ title: 'List Debounce Test' });
    list = new List({
      parent: screen,
      top: 0,
      left: 0,
      width: 30,
      height: 10,
      keys: true,
      mouse: false,
      tags: true,
    });
    list.setItems(['Apple', 'Banana', 'Cherry', 'Doors', 'Eel']);
    list.focus();
  });

  afterEach(() => {
    if (screen && !screen.destroyed) {
      screen.destroy();
    }
  });

  // Helper: invoke the private _onKeypress directly. The dispatch path
  // through screen → focused element involves blessed's full event system,
  // which adds noise unrelated to what this test guards.
  function press(name: string, ch: string = ''): boolean {
    const handler = (list as any)._onKeypress.bind(list);
    return handler(ch, { name, full: name, sequence: ch || name });
  }

  describe('navigation keys ARE debounced', () => {
    it('a fresh-state down arrow always fires', () => {
      const widget = list as any;
      widget._lastKeyTime = 0;
      const before = list.selected;
      expect(press('down')).toBe(true);
      expect(list.selected).toBeGreaterThan(before);
    });

    it('two down arrows within 50ms — second is dropped', () => {
      const widget = list as any;
      widget._lastKeyTime = Date.now();
      const before = list.selected;
      const result = press('down');
      // Returns true (handled) but selection didn't advance.
      expect(result).toBe(true);
      expect(list.selected).toBe(before);
    });
  });

  describe('non-navigation keys are NEVER debounced', () => {
    it('type-to-search letter fires immediately after an arrow', () => {
      const widget = list as any;
      widget._lastKeyTime = Date.now();
      // 'd' should jump to 'Doors' at index 3.
      const result = press('d', 'd');
      expect(result).toBe(true);
      expect(list.selected).toBe(3);
    });

    it('rapid type-to-search letters all process', () => {
      const widget = list as any;
      widget._lastKeyTime = Date.now();
      list.select(4); // Eel
      expect(press('a', 'a')).toBe(true);
      expect(list.selected).toBe(0); // Apple
      expect(press('b', 'b')).toBe(true);
      expect(list.selected).toBe(1); // Banana
      expect(press('c', 'c')).toBe(true);
      expect(list.selected).toBe(2); // Cherry
    });

    it('enter is not blocked by a recent arrow', () => {
      const widget = list as any;
      widget._lastKeyTime = Date.now();
      let selectFired = false;
      list.on('select', () => { selectFired = true; });
      const result = press('enter', '\r');
      // Enter intentionally returns false to propagate to screen.key
      // handlers — see the comment in list.ts. The point of THIS test is
      // that the gate didn't swallow it (a swallowed key would return
      // true without firing the 'select' event).
      expect(result).toBe(false);
      expect(selectFired).toBe(true);
    });

    it('escape is not blocked by a recent arrow', () => {
      const widget = list as any;
      widget._lastKeyTime = Date.now();
      let cancelFired = false;
      list.on('cancel', () => { cancelFired = true; });
      const result = press('escape', '\x1b');
      expect(result).toBe(true);
      expect(cancelFired).toBe(true);
    });
  });
});
