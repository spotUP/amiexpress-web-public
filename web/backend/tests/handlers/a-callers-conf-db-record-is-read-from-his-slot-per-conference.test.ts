/**
 * masterLoadPointers (express.e:8583-8593) loads the caller's Conf.DB record
 * for every conference and message base (loadConfDB(slot,i,m,cb,TRUE)). This
 * port keeps no confBases array: loadMsgPointers reads the same record from
 * the slot, per conference, on demand. Each conference gets its own record.
 */
const records = new Map<string, any>();
jest.mock('../../src/services/MessagePointerFileManager', () => {
  const actual = jest.requireActual('../../src/services/MessagePointerFileManager');
  return {
    ...actual,
    messagePointerFileManager: {
      readRecordOrZero: jest.fn((conf: number, slot: number) =>
        ({ ...(records.get(`${conf}:${slot}`) ?? actual.deserializeConfBase(Buffer.alloc(74))) })),
    },
  };
});

import { loadMsgPointers } from '../../src/utils/message-pointers.util';
import { messagePointerFileManager } from '../../src/services/MessagePointerFileManager';

const SLOT = 23;

test('each conference yields the record at the caller slot', async () => {
  let db: any;
  for (let i = 0; i < 30 && !(global as any).testDb; i++) await new Promise(r => setTimeout(r, 500));
  db = (global as any).testDb;
  const id = `user-mlp-${Date.now()}`;
  await db.run(
    `INSERT INTO users (id, username, passwordhash, realname, seclevel, slotnumber, created, updated)
     VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
    [id, 'mlp-test', 'x', 'MLP', 100, SLOT],
  );
  const base = (messagePointerFileManager as any).readRecordOrZero(9, 1);
  records.set(`1:${SLOT}`, { ...base, confYM: 11, confRead: 12 });
  records.set(`2:${SLOT}`, { ...base, confYM: 21, confRead: 22 });
  const c1 = await loadMsgPointers(id, 1, 1);
  const c2 = await loadMsgPointers(id, 2, 1);
  expect([c1.lastMsgReadConf, c1.lastNewReadConf]).toEqual([11, 12]);
  expect([c2.lastMsgReadConf, c2.lastNewReadConf]).toEqual([21, 22]);
  expect((messagePointerFileManager as any).readRecordOrZero).toHaveBeenCalledWith(2, SLOT);
});
