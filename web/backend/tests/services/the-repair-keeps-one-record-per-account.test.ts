/**
 * The repair for the append-and-renumber damage, planned before it writes.
 *
 * The live board held 46 accounts in 100 populated records across three
 * appended blocks, with user.misc still keyed to the first of them. The plan
 * decides three things and each can be wrong in a way that loses an account,
 * so each is pinned here rather than discovered on the board.
 */
process.env.SKIP_DB_INIT = '1';

import { planRepair } from '../../src/scripts/repair-user-files';
import { userFileManager } from '../../src/services/UserFileManager';

const DATA_REC = 232;
const MISC_REC = 248;

/** A user.data buffer with the given names, at the given slots. */
function dataWith(records: Array<{ slot: number; name: string; calls: number }>): Buffer {
  const slots = Math.max(...records.map((r) => r.slot));
  const buf = Buffer.alloc(slots * DATA_REC);
  for (const r of records) {
    const struct = userFileManager.deserializeUserStruct(Buffer.alloc(DATA_REC), 0);
    struct.name = r.name;
    struct.timesCalled = r.calls;
    const rec = userFileManager.serializeUserStruct(struct);
    rec.copy(buf, (r.slot - 1) * DATA_REC, 0, DATA_REC);
  }
  return buf;
}

const miscWith = (slots: number, locks: Array<{ slot: number; locked: number; attempts: number }> = []) => {
  const buf = Buffer.alloc(slots * MISC_REC);
  for (const l of locks) {
    buf[(l.slot - 1) * MISC_REC + 0x94] = l.locked;
    buf[(l.slot - 1) * MISC_REC + 0x95] = l.attempts;
  }
  return buf;
};

describe('the repair plan', () => {
  it('keeps one record per account and drops the rest', () => {
    const data = dataWith([
      { slot: 1, name: 'coffe', calls: 10 },
      { slot: 48, name: 'coffe', calls: 3 },
      { slot: 74, name: 'coffe', calls: 1 },
    ]);
    const plan = planRepair(data, miscWith(74));
    expect(plan.keep).toHaveLength(1);
    expect(plan.drop.map((d) => d.slot).sort((a, b) => a - b)).toEqual([48, 74]);
  });

  it('keeps the liveliest record, not simply the first it met', () => {
    const data = dataWith([
      { slot: 1, name: 'coffe', calls: 2 },
      { slot: 48, name: 'coffe', calls: 99 },
    ]);
    const plan = planRepair(data, miscWith(48));
    expect(plan.keep[0]!.fromSlot).toBe(48);
  });

  it('puts it back on the LOWEST slot it ever had, so slot references hold', () => {
    const data = dataWith([
      { slot: 13, name: 'coffe', calls: 2 },
      { slot: 60, name: 'coffe', calls: 99 },
    ]);
    const plan = planRepair(data, miscWith(60));
    // Content from the lively record, at the account's original home.
    expect(plan.keep[0]).toMatchObject({ fromSlot: 60, toSlot: 13 });
  });

  it('does not move accounts that were never duplicated', () => {
    const data = dataWith([
      { slot: 13, name: 'coffe', calls: 5 },
      { slot: 14, name: 'dalton', calls: 5 },
    ]);
    const plan = planRepair(data, miscWith(14));
    expect(plan.keep).toEqual([
      { name: 'coffe', fromSlot: 13, toSlot: 13, calls: 5 },
      { name: 'dalton', fromSlot: 14, toSlot: 14, calls: 5 },
    ]);
    expect(plan.drop).toEqual([]);
  });

  it('names every lock it is going to clear', () => {
    const data = dataWith([{ slot: 14, name: 'dalton', calls: 1 }]);
    const misc = miscWith(14, [{ slot: 14, locked: 1, attempts: 2 }]);
    expect(planRepair(data, misc).locksCleared).toEqual([14]);
  });

  it('sizes the files to the highest slot kept, not to what was there', () => {
    const data = dataWith([
      { slot: 2, name: 'BL', calls: 1 },
      { slot: 90, name: 'BL', calls: 9 },
      { slot: 5, name: 'DiNO', calls: 1 },
    ]);
    const plan = planRepair(data, miscWith(90));
    // BL folds back to slot 2; the file need only reach DiNO at 5.
    expect(plan.slots).toBe(5);
  });
});
