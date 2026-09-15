/**
 * The new-files screen rebuilds when somebody uploads, and only then.
 *
 * QuickNew takes about thirty seconds on the live board - two vCPUs shared with
 * the BBS - and runs on every logoff, with batch doors deliberately serialised,
 * so that time sits in front of the next caller's logoff too.
 *
 * It cannot move to a timer:
 *
 *     "it needs to be rebuilt per caller if a caller uploads something,
 *      trading is competitive"   - the sysop, 2026-09-15
 *
 * So the rule is not "less often", it is "when it would produce something
 * different". A caller who uploaded nothing leaves every listing untouched and
 * the door would rewrite the bytes already on disk; a caller who uploaded
 * changes a listing and the screen is stale immediately. The trader's guarantee
 * is intact - what goes is the thirty seconds nobody was buying anything with.
 */

import { quickNewIsStale } from '../../src/services/quicknew-freshness';

const at = (iso: string) => new Date(iso);
const NOON = at('2026-09-15T12:00:00');

describe('deciding whether to run QuickNew', () => {
  it('rebuilds when a caller has uploaded', () => {
    // The case the sysop cares about: a listing newer than the screen.
    const verdict = quickNewIsStale({
      screenMtime: at('2026-09-15T11:00:00'),
      listingMtimes: [at('2026-09-15T11:30:00'), at('2026-09-14T09:00:00')],
      now: NOON,
    });

    expect(verdict.stale).toBe(true);
    expect(verdict.reason).toMatch(/listing/);
  });

  it('skips when nobody uploaded', () => {
    const verdict = quickNewIsStale({
      screenMtime: at('2026-09-15T11:00:00'),
      listingMtimes: [at('2026-09-15T10:00:00'), at('2026-09-14T09:00:00')],
      now: NOON,
    });

    expect(verdict.stale).toBe(false);
  });

  it('rebuilds after midnight even with no uploads', () => {
    // The door prints today's date and counts "last @D days", so the same
    // listings render differently on a new day.
    const verdict = quickNewIsStale({
      screenMtime: at('2026-09-14T23:50:00'),
      listingMtimes: [at('2026-09-14T09:00:00')],
      now: at('2026-09-15T00:10:00'),
    });

    expect(verdict.stale).toBe(true);
    expect(verdict.reason).toMatch(/earlier day/);
  });

  it('rebuilds when the screen has never been written', () => {
    const verdict = quickNewIsStale({
      screenMtime: null,
      listingMtimes: [at('2026-09-15T09:00:00')],
      now: NOON,
    });

    expect(verdict.stale).toBe(true);
  });

  it('rebuilds when no listing could be read at all', () => {
    // A board whose listings have vanished is a situation to rebuild into and
    // see, not one to freeze the screen on for ever.
    const verdict = quickNewIsStale({
      screenMtime: at('2026-09-15T11:00:00'),
      listingMtimes: [],
      now: NOON,
    });

    expect(verdict.stale).toBe(true);
  });

  it('treats an upload in the same second as an upload', () => {
    // Trading is competitive; a tie goes to rebuilding, not to skipping.
    const t = at('2026-09-15T11:00:00');
    const later = new Date(t.getTime() + 1);

    expect(quickNewIsStale({ screenMtime: t, listingMtimes: [later], now: NOON }).stale).toBe(true);
  });

  it('says why either way, so a skipped logoff is explicable', () => {
    const skipped = quickNewIsStale({
      screenMtime: at('2026-09-15T11:00:00'),
      listingMtimes: [at('2026-09-15T10:00:00')],
      now: NOON,
    });

    expect(skipped.reason.length).toBeGreaterThan(0);
  });
});
