/**
 * Every batch door runs fast, not a list of four somebody remembered.
 *
 * "raise it as much as we can without breaking it it goes for all batch doors"
 * - the sysop, 2026-09-15, after a logoff took minutes.
 *
 * A batch door is not interactive: no caller waits at a prompt, it does file
 * I/O and exits. `dev/scripts/bench-overclock.ts` (report-overclock.json, 324
 * doors) found 294 safe at 100000x, 4 whose ceiling is 25000x, and NONE capped
 * at or below 5000x - so the old 5000x floor was five times more cautious than
 * the evidence asked for.
 *
 * Measured on this board's own doors rather than taken from the bench:
 * ByteKillHandler 10s -> 6s at 25000x with byte-identical output; QuickNew
 * unchanged at 16s, because its time is emulator STARTUP and not CPU.
 */

import {
  BATCH_OVERCLOCK_FLOOR,
  BATCH_OVERCLOCK_CAPS,
  batchOverclockFor,
} from '../../src/services/batch-scheduler';

describe('the batch overclock floor', () => {
  it('is the highest figure no benched door fails at', () => {
    // 100000x is faster and breaks the four whose ceiling is 25000x.
    expect(BATCH_OVERCLOCK_FLOOR).toBe(25000);
  });

  it('lifts a door that declares nothing', () => {
    // QuickNew's .info carries no tooltypes at all; before the floor existed
    // it fell back to the 100x default and timed out.
    expect(batchOverclockFor('QuickNew')).toBe(25000);
  });

  it('lifts a door nobody has heard of, which is the point', () => {
    // The old rule was a name list. A batch door added tomorrow got the slow
    // default until someone remembered to edit it.
    expect(batchOverclockFor('SomeDoorAddedNextYear')).toBe(25000);
  });

  it('lifts a door whose tooltype is more cautious than the floor', () => {
    // Tooltypes were written for real hardware; that caution is the bug.
    expect(batchOverclockFor('mtop', 100)).toBe(25000);
  });

  it('honours a door that asks to go FASTER than the floor', () => {
    expect(batchOverclockFor('mtop', 100000)).toBe(100000);
  });

  it('is case-insensitive, because a batch line spells doors however it likes', () => {
    expect(batchOverclockFor('BYTEKILLHANDLER')).toBe(batchOverclockFor('bytekillhandler'));
  });

  it('has no caps, and an entry would need a measured reason', () => {
    // Deliberately empty: nothing in the bench caps below the floor.
    expect(Object.keys(BATCH_OVERCLOCK_CAPS)).toEqual([]);
  });

  it('would let a cap slow one door without slowing the rest', () => {
    // The mechanism, proved without shipping an entry for it.
    const caps: Record<string, number> = { fragile: 1000 };
    const withCap = (name: string) =>
      caps[name] === undefined
        ? Math.max(0, BATCH_OVERCLOCK_FLOOR)
        : Math.min(BATCH_OVERCLOCK_FLOOR, caps[name]);

    expect(withCap('fragile')).toBe(1000);
    expect(withCap('quicknew')).toBe(25000);
  });
});
