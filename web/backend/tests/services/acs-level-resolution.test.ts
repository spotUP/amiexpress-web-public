/**
 * Which ACS file actually serves a user at a given level.
 *
 * The Security page listed the FILES in Access/ and nothing else. On this
 * board that is 10, 20, 50 and 255 - so a sysop whose new users are level 30
 * saw four levels, none of them 30, and no way to tell which one their users
 * were getting. It reads as an invented list.
 *
 * express.e:3025-3034 - findAcsLevel computes `secStatus/5*5` and walks DOWN
 * in fives until a file exists, falling back to 0.
 */

process.env.SKIP_DB_INIT = '1';

import { acsLevelServing } from '../../src/services/config-services/acs-level-file.service';

describe('the level a caller is actually served from', () => {
  // What this board has in Access/.
  const BOARD = [10, 20, 50, 255];

  it('serves a level-30 user out of ACS.20', () => {
    // 30 -> 30 (no file) -> 25 (no file) -> 20. The reported case.
    expect(acsLevelServing(30, BOARD)).toBe(20);
  });

  it('serves a level from its own file when one exists', () => {
    expect(acsLevelServing(10, BOARD)).toBe(10);
    expect(acsLevelServing(255, BOARD)).toBe(255);
  });

  it('rounds down to a multiple of five first', () => {
    // express.e:3025 is `secStatus/5*5` in integer arithmetic.
    expect(acsLevelServing(54, BOARD)).toBe(50);
    expect(acsLevelServing(24, BOARD)).toBe(20);
  });

  it('answers null when nothing matches, which is express.e falling back to 0', () => {
    expect(acsLevelServing(5, BOARD)).toBeNull();
    expect(acsLevelServing(9, BOARD)).toBeNull();
  });

  it('uses ACS.0 when the board has one', () => {
    expect(acsLevelServing(5, [0, 10])).toBe(0);
    expect(acsLevelServing(3, [0])).toBe(0);
  });

  it('never serves a level ABOVE the caller', () => {
    // Walking down is the whole point: a level-30 user must not get ACS.50.
    for (const level of [10, 21, 30, 44, 49]) {
      const served = acsLevelServing(level, BOARD);
      if (served !== null) expect(served).toBeLessThanOrEqual(level);
    }
  });
});
