/**
 * The levels the admin offers are the board's, not a table somebody typed.
 *
 * The Security page was fixed for this once: it offered a hardcoded
 * [10, 20, 50, 100, 200, 255] that matched neither the files on disk nor the
 * users, so level 30 - where this board's users actually sit - could not be
 * chosen at all. Two other pages kept their own copies of that invention,
 * each with its own labels ("20 - New User" on a board whose new users are
 * 30). One builder now, from what the board reports.
 */
import { describe, expect, it } from 'vitest';
import { securityLevelOptions } from '../pages/security-level-options';

const levels = [10, 20, 50, 255];
const inUse = [
  { level: 20, users: 2, servedBy: 20 },
  { level: 30, users: 30, servedBy: 20 },
  { level: 255, users: 1, servedBy: 255 },
];

describe('the security levels the admin offers', () => {
  it('offers every level that has a file and every level a user holds', () => {
    expect(securityLevelOptions(levels, inUse).map(o => o.value)).toEqual([10, 20, 30, 50, 255]);
  });

  it('says a level has no ACS file of its own, and which file serves it', () => {
    const thirty = securityLevelOptions(levels, inUse).find(o => o.value === 30);

    expect(thirty).toMatchObject({ hasFile: false, servedBy: 20, users: 30 });
    expect(thirty?.label).toBe('30 - no ACS file, served by ACS.20.info, 30 users');
  });

  it('names a level with its own file as having one', () => {
    const twenty = securityLevelOptions(levels, inUse).find(o => o.value === 20);

    expect(twenty).toMatchObject({ hasFile: true, servedBy: 20, users: 2 });
    expect(twenty?.label).toBe('20 - own ACS file, 2 users');
  });

  it('leaves the user count off a level nobody holds', () => {
    expect(securityLevelOptions(levels, inUse).find(o => o.value === 10)?.label)
      .toBe('10 - own ACS file');
  });

  it('says so when nothing serves a level at all', () => {
    const options = securityLevelOptions([], [{ level: 30, users: 4, servedBy: null }]);

    expect(options[0].label).toBe('30 - no ACS file, nothing serves it, 4 users');
  });

  it('keeps a configured level selectable even when the board has no such level', () => {
    // A board configured to make new users level 40 must not silently lose
    // that setting because the form stopped offering 40.
    const options = securityLevelOptions(levels, inUse, [40]);

    expect(options.map(o => o.value)).toEqual([10, 20, 30, 40, 50, 255]);
    expect(options.find(o => o.value === 40)?.label).toBe('40 - no ACS file, served by ACS.20.info');
  });

  it('does not repeat a level that is already there', () => {
    expect(securityLevelOptions(levels, inUse, [20, 30]).map(o => o.value))
      .toEqual([10, 20, 30, 50, 255]);
  });

  it('answers with nothing when the board has answered with nothing', () => {
    // Mid-load the query has no data; a form must render empty rather than
    // fall back to an invented list.
    expect(securityLevelOptions([], [])).toEqual([]);
  });
});
