/**
 * R and the scans write the caller's pointer into his Conf.DB record - the
 * pointer's one home (express.e:4971-4972 `cb.confYM:=lastMsgReadConf`,
 * `cb.confRead:=lastNewReadConf`) - and `conf_base` only mirrors it.
 *
 * Before 2026-10-04 the SQL row was the pointer and the disk record a
 * best-effort copy, so a door's SAVE_CONFDB was ignored at the next join.
 */

const records = new Map<string, any>();
jest.mock('../../src/services/MessagePointerFileManager', () => {
  const actual = jest.requireActual('../../src/services/MessagePointerFileManager');
  return {
    ...actual,
    messagePointerFileManager: {
      readRecordOrZero: jest.fn((conf: number, slot: number) =>
        ({ ...(records.get(`${conf}:${slot}`) ?? actual.deserializeConfBase(Buffer.alloc(74))) })),
      patchRecord: jest.fn((conf: number, slot: number, patch: any) => {
        const key = `${conf}:${slot}`;
        records.set(key, { ...(records.get(key) ?? actual.deserializeConfBase(Buffer.alloc(74))), ...patch });
      }),
    },
  };
});

import { updateReadPointer, updateScanPointer } from '../../src/utils/message-pointers.util';
import { messagePointerFileManager } from '../../src/services/MessagePointerFileManager';

async function waitForTestDb(): Promise<any> {
  let attempts = 0;
  while (!(global as any).testDb && attempts < 30) {
    await new Promise(r => setTimeout(r, 500));
    attempts++;
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db;
}

describe('message-pointer disk-sync wiring', () => {
  let db: any;
  let userId: string;
  const SLOT = 17;
  const CONF_ID = 2;
  const MB_ID = 1;

  beforeAll(async () => {
    db = await waitForTestDb();

    // Create a user with a known slotNumber. The util will look this up via
    // db.getUserById and pass slotNumber to the manager.
    userId = `user-confdb-${Date.now()}`;
    await db.run(
      `INSERT INTO users (id, username, passwordhash, realname, seclevel, slotnumber, created, updated)
       VALUES (?, ?, ?, ?, ?, ?, strftime('%s','now'), strftime('%s','now'))`,
      [userId, 'confdb-test', 'x', 'CONFDB Tester', 100, SLOT],
    );
  });

  beforeEach(() => {
    records.clear();
    (messagePointerFileManager.patchRecord as jest.Mock).mockClear();
  });

  test("R's read pointer lands in the caller's record (confYM), and the mirror follows", async () => {
    await updateReadPointer(userId, CONF_ID, MB_ID, 4242);

    expect(records.get(`${CONF_ID}:${SLOT}`)?.confYM).toBe(4242);
    expect(records.get(`${CONF_ID}:${SLOT}`)?.confRead).toBe(0);
    const { rows } = await db.query(
      `SELECT last_msg_read_conf FROM conf_base WHERE user_id = ? AND conference_id = ? AND message_base_id = ?`,
      [userId, CONF_ID, MB_ID],
    );
    expect(rows[0]?.last_msg_read_conf).toBe(4242);
  });

  test('the read pointer never moves back', async () => {
    await updateReadPointer(userId, CONF_ID, MB_ID, 50);
    await updateReadPointer(userId, CONF_ID, MB_ID, 10);
    expect(records.get(`${CONF_ID}:${SLOT}`)?.confYM).toBe(50);
  });

  test("the scan pointer lands in the caller's record (confRead)", async () => {
    await updateScanPointer(userId, CONF_ID, MB_ID, 9999);

    expect(records.get(`${CONF_ID}:${SLOT}`)?.confRead).toBe(9999);
    expect(records.get(`${CONF_ID}:${SLOT}`)?.confYM).toBe(0);
  });

  test('an account without a slot holds no pointers (express.e:4921-4925)', async () => {
    const slotlessId = `slotless-${Date.now()}`;
    await db.run(
      `INSERT INTO users (id, username, passwordhash, realname, seclevel, slotnumber, created, updated)
       VALUES (?, ?, ?, ?, ?, 0, strftime('%s','now'), strftime('%s','now'))`,
      [slotlessId, 'no-slot', 'x', 'Slotless Tester', 10],
    );

    await updateReadPointer(slotlessId, CONF_ID, MB_ID, 100);

    expect(messagePointerFileManager.patchRecord).not.toHaveBeenCalled();
  });
});
