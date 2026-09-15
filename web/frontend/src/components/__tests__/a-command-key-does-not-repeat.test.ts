/**
 * A KEY IN A MENU IS A COMMAND, NOT A SCROLL.
 *
 * "pressing v flicks back directly" (sysop, 2026-09-15). V turns the card
 * lobby's lower panel over to the cards in front of you. A press held past
 * the 400ms repeat delay sent the key again - and at the arcade rate, again
 * every 30ms - so the panel turned over an even number of times and landed
 * back where it started, too fast to see as anything but a flick. The same
 * repeat throws a second card, now that pressing a card key twice plays the
 * card it picked.
 *
 * The door had never said which repeat it wanted. `KEY_REPEAT=application`
 * exists, is read (`declaredKeyRepeatMode`) and is sent to the browser - and
 * not one door in the tree declared it, so every door including this one ran
 * at the arcade rate. The card lobby declares it now, and application mode
 * means what it says here: only the keys that STEER repeat.
 */

import { describe, it, expect } from 'vitest';
import { mayAutoRepeat } from '@amiexpress/terminal';

describe('auto-repeat', () => {
  it('does not repeat a command key in a door whose screen is a list', () => {
    for (const key of ['v', 'V', '1', '9', '0', 'c', 'd', 'x', 'q']) {
      expect(mayAutoRepeat(key, 'application')).toBe(false);
    }
  });

  it('repeats the keys that steer, which is what the slower rate is for', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageDown']) {
      expect(mayAutoRepeat(key, 'application')).toBe(true);
    }
  });

  it('leaves an arcade door alone - its movement is built on the repeats', () => {
    expect(mayAutoRepeat('v', 'game')).toBe(true);
    expect(mayAutoRepeat('ArrowLeft', 'game')).toBe(true);
    expect(mayAutoRepeat('1', 'game')).toBe(true);
  });

  it('never repeats the keys no door wants repeated, in either mode', () => {
    for (const mode of ['game', 'application'] as const) {
      for (const key of ['Enter', 'Escape', 'Tab', ' ', 'w', 'a', 's', 'd', 'Shift']) {
        expect(mayAutoRepeat(key, mode)).toBe(false);
      }
    }
  });
});
