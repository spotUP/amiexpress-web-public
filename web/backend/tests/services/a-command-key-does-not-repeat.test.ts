/**
 * A KEY IN A MENU IS A COMMAND, AND COMMANDS DO NOT AUTO-REPEAT.
 *
 * "pressing v flicks back directly" (sysop, 2026-09-15). V turns the card
 * lobby's lower panel over to the cards in front of you. The browser repeats
 * a HELD key - after 400ms, then every 30ms in `game` repeat and every 120ms
 * in `application` - and both paths a key takes to a door passed those
 * repeats straight through: the byte path in `socket-handlers.ts` and the
 * client-door bridge, neither of which looked at `repeat`. So the panel
 * turned over once per repeat and landed back where it started.
 *
 * This rule is on the SERVER, deliberately. The first fix put it in the
 * browser, and the sysop's next report arrived from a tab still running the
 * previous bundle - the repeats came through at 129ms apart, the application
 * rate, with the fix sitting in JavaScript his browser had not fetched. A
 * rule a stale client can opt out of is not a rule.
 */

import { repeatReachesDoor } from '../../src/services/game-mode.service';

describe('an auto-repeat reaching a door', () => {
  it('is dropped for a command key in a door whose screen is a table', () => {
    for (const key of ['v', 'V', '1', '9', '0', 'c', 'd', 'x', 'q']) {
      expect(repeatReachesDoor('application', key)).toBe(false);
    }
  });

  it('is kept for the keys that steer, which is what the slower rate is for', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageDown']) {
      expect(repeatReachesDoor('application', key)).toBe(true);
    }
  });

  it('is kept for every key in an arcade door - its movement is built on them', () => {
    for (const key of ['v', '1', 'ArrowLeft', 'z']) {
      expect(repeatReachesDoor('game', key)).toBe(true);
    }
  });

  it('is kept when a door declared nothing, which is how every door behaved before', () => {
    expect(repeatReachesDoor(undefined, 'v')).toBe(true);
  });
});
