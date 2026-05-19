/**
 * Integration test: SQL pointer update → disk Conf.DB write wiring.
 *
 * Asserts that the public `updateReadPointer` / `updateScanPointer` entry
 * points (in `message-pointers.util.ts`) actually call the
 * `MessagePointerFileManager` with the right (conferenceId, slotNumber, value)
 * after looking up the user's slot via `db.getUserById`.
 *
 * Complements the unit tests in
 * `tests/services/message-pointer-file-manager.test.ts` which only cover
 * the manager itself. Together: unit proves the bytes go to the right
 * offset; this proves the SQL handlers actually invoke the manager.
 */

// Capture manager calls. jest.mock factory must be self-contained because
// hoisted before imports.
jest.mock('../../src/services/MessagePointerFileManager', () => {
  return {
    CONFBASE_RECORD_SIZE: 74,
    messagePointerFileManager: {
      updateReadPointer: jest.fn(),
      updateScanPointer: jest.fn(),
      patchRecord: jest.fn(),
      readRecord: jest.fn().mockReturnValue(null),
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
    (messagePointerFileManager.updateReadPointer as jest.Mock).mockClear();
    (messagePointerFileManager.updateScanPointer as jest.Mock).mockClear();
  });

  test('updateReadPointer SQL hook calls manager.updateReadPointer with correct (conf, slot, msgNum)', async () => {
    await updateReadPointer(userId, CONF_ID, MB_ID, 4242);

    expect(messagePointerFileManager.updateReadPointer).toHaveBeenCalledTimes(1);
    expect(messagePointerFileManager.updateReadPointer).toHaveBeenCalledWith(CONF_ID, SLOT, 4242);
    // Scan pointer must NOT be touched by the read-pointer SQL path.
    expect(messagePointerFileManager.updateScanPointer).not.toHaveBeenCalled();
  });

  test('updateScanPointer SQL hook calls manager.updateScanPointer with correct (conf, slot, msgNum)', async () => {
    await updateScanPointer(userId, CONF_ID, MB_ID, 9999);

    expect(messagePointerFileManager.updateScanPointer).toHaveBeenCalledTimes(1);
    expect(messagePointerFileManager.updateScanPointer).toHaveBeenCalledWith(CONF_ID, SLOT, 9999);
    expect(messagePointerFileManager.updateReadPointer).not.toHaveBeenCalled();
  });

  test('user without slotNumber is skipped (no manager call)', async () => {
    const slotlessId = `slotless-${Date.now()}`;
    await db.run(
      `INSERT INTO users (id, username, passwordhash, realname, seclevel, slotnumber, created, updated)
       VALUES (?, ?, ?, ?, ?, 0, strftime('%s','now'), strftime('%s','now'))`,
      [slotlessId, 'no-slot', 'x', 'Slotless Tester', 10],
    );

    await updateReadPointer(slotlessId, CONF_ID, MB_ID, 100);

    expect(messagePointerFileManager.updateReadPointer).not.toHaveBeenCalled();
  });

  test('SQL row is still written even when manager call would be skipped (db is authoritative)', async () => {
    const noSlotId = `noslot2-${Date.now()}`;
    await db.run(
      `INSERT INTO users (id, username, passwordhash, realname, seclevel, slotnumber, created, updated)
       VALUES (?, ?, ?, ?, ?, 0, strftime('%s','now'), strftime('%s','now'))`,
      [noSlotId, 'no-slot-2', 'x', 'Slotless 2', 10],
    );

    await updateReadPointer(noSlotId, CONF_ID, MB_ID, 7777);

    // Confirm SQL upsert happened regardless of disk skip.
    const { rows } = await db.query(
      `SELECT last_msg_read_conf FROM conf_base
       WHERE user_id = ? AND conference_id = ? AND message_base_id = ?`,
      [noSlotId, CONF_ID, MB_ID],
    );
    expect(rows[0]?.last_msg_read_conf).toBe(7777);
    expect(messagePointerFileManager.updateReadPointer).not.toHaveBeenCalled();
  });
});
