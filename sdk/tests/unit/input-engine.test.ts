/**
 * Unit tests for the InputEngine — keyboard binding/dispatch system used
 * by example doors.
 *
 * The previous version of this file targeted an older API (mapKey,
 * clearMapping, addMacro, isMacroTriggered, resetMacro, clearMacro,
 * clearAllMappings) that no longer exists on the class. The actual
 * surface is much smaller — bindAction / processInput / unbindAction /
 * clear / reset / dispose — so the rewrite covers what's there now.
 */

import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { InputEngine } from '../../engines/input/input-engine';
import type { KeyEvent } from '../../core/types';

function k(key: string, opts: Partial<KeyEvent> = {}): KeyEvent {
  return { key, ctrl: false, alt: false, shift: false, code: 0, ...opts };
}

describe('InputEngine', () => {
  let input: InputEngine;

  beforeEach(() => {
    input = new InputEngine();
  });

  describe('bindAction + processInput', () => {
    test('a key bound once fires its callback when the key is processed', () => {
      const cb = jest.fn();
      input.bindAction('move-up', 'ArrowUp', cb);
      input.processInput(k('ArrowUp'));
      expect(cb).toHaveBeenCalledTimes(1);
    });

    test('an unbound key does nothing', () => {
      const cb = jest.fn();
      input.bindAction('move-up', 'ArrowUp', cb);
      input.processInput(k('ArrowDown'));
      expect(cb).not.toHaveBeenCalled();
    });

    test('processing the same key multiple times fires the callback each time', () => {
      const cb = jest.fn();
      input.bindAction('shoot', ' ', cb);
      input.processInput(k(' '));
      input.processInput(k(' '));
      input.processInput(k(' '));
      expect(cb).toHaveBeenCalledTimes(3);
    });

    test('multiple actions on the same key all fire (in registration order)', () => {
      const order: string[] = [];
      input.bindAction('a', 'x', () => order.push('a'));
      input.bindAction('b', 'x', () => order.push('b'));
      input.bindAction('c', 'x', () => order.push('c'));
      input.processInput(k('x'));
      expect(order).toEqual(['a', 'b', 'c']);
    });

    test('two different keys do not collide', () => {
      const upCb = jest.fn();
      const downCb = jest.fn();
      input.bindAction('up', 'ArrowUp', upCb);
      input.bindAction('down', 'ArrowDown', downCb);
      input.processInput(k('ArrowUp'));
      expect(upCb).toHaveBeenCalledTimes(1);
      expect(downCb).not.toHaveBeenCalled();
    });

    test('modifier flags are not part of the key match (only KeyEvent.key is)', () => {
      // The current implementation indexes by `keyEvent.key` only — it
      // doesn't look at ctrl/alt/shift. Both events fire the same callback.
      const cb = jest.fn();
      input.bindAction('zoom', '+', cb);
      input.processInput(k('+', { ctrl: true }));
      input.processInput(k('+', { shift: true }));
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe('unbindAction', () => {
    test('removes a single action by name and leaves the others on the same key intact', () => {
      const a = jest.fn();
      const b = jest.fn();
      input.bindAction('a', 'x', a);
      input.bindAction('b', 'x', b);
      input.unbindAction('a');
      input.processInput(k('x'));
      expect(a).not.toHaveBeenCalled();
      expect(b).toHaveBeenCalledTimes(1);
    });

    test('removes the key entry entirely when the last action is removed', () => {
      const a = jest.fn();
      input.bindAction('only', 'x', a);
      input.unbindAction('only');
      input.processInput(k('x'));
      expect(a).not.toHaveBeenCalled();
      // Internal: actions Map should not retain an empty array under 'x'.
      expect((input as any).actions.has('x')).toBe(false);
    });

    test("unbinding a name that isn't bound is a no-op", () => {
      const a = jest.fn();
      input.bindAction('a', 'x', a);
      input.unbindAction('not-bound');
      input.processInput(k('x'));
      expect(a).toHaveBeenCalledTimes(1);
    });

    test('actions bound with the same name on multiple keys all unbind together', () => {
      // bindAction allows the same action name on multiple keys (e.g., a
      // "shoot" action mapped to both Space and Enter). unbindAction by
      // name strips it from every key.
      const cb = jest.fn();
      input.bindAction('shoot', ' ', cb);
      input.bindAction('shoot', 'Enter', cb);
      input.unbindAction('shoot');
      input.processInput(k(' '));
      input.processInput(k('Enter'));
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('clear / reset / dispose', () => {
    test('clear() removes every binding', () => {
      const a = jest.fn();
      const b = jest.fn();
      input.bindAction('a', 'x', a);
      input.bindAction('b', 'y', b);
      input.clear();
      input.processInput(k('x'));
      input.processInput(k('y'));
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    test('reset() is an alias for clear()', () => {
      const a = jest.fn();
      input.bindAction('a', 'x', a);
      input.reset();
      input.processInput(k('x'));
      expect(a).not.toHaveBeenCalled();
    });

    test('dispose() is an alias for reset()', () => {
      const a = jest.fn();
      input.bindAction('a', 'x', a);
      input.dispose();
      input.processInput(k('x'));
      expect(a).not.toHaveBeenCalled();
    });

    test('after clear(), new bindings work normally', () => {
      const a = jest.fn();
      input.bindAction('a', 'x', jest.fn());
      input.clear();
      input.bindAction('a', 'x', a);
      input.processInput(k('x'));
      expect(a).toHaveBeenCalledTimes(1);
    });
  });

  describe('callback errors do not corrupt the action list', () => {
    test('a callback that throws does not prevent later bindings from firing', () => {
      // Current behavior: forEach in processInput runs callbacks in order
      // and a thrown callback propagates out of processInput. The test
      // must catch the throw to keep the assertion useful — but bindings
      // for OTHER keys must still be intact afterward.
      const survivor = jest.fn();
      input.bindAction('boom', 'x', () => { throw new Error('boom'); });
      input.bindAction('survivor', 'y', survivor);

      expect(() => input.processInput(k('x'))).toThrow('boom');

      // The Map shouldn't have been corrupted; 'y' still works.
      input.processInput(k('y'));
      expect(survivor).toHaveBeenCalledTimes(1);
    });
  });
});
