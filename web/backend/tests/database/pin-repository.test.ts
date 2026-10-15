/**
 * Pin Repository Tests
 */

import { PinRepository } from '../../src/database/pin-repository';

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

describe('PinRepository', () => {
  let repo: PinRepository;
  let rawDb: any;
  const ROOM_ID = `pin-room-${Date.now()}`;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new PinRepository(rawDb);

    rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud)
      VALUES ('pin-room-owner', 'pin_room_owner', 'Pin Owner', 'hash', 255, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run();
    rawDb.prepare(`
      INSERT OR IGNORE INTO chat_rooms (room_id, room_name, created_by, created_by_username, is_public)
      VALUES (?, ?, 'pin-room-owner', 'pin_room_owner', 1)
    `).run(ROOM_ID, `pinroom_${Date.now()}`);

    // Insert a chat_room_message for pin FK constraints (use pin-room-owner as sender)
    rawDb.prepare(`
      INSERT OR IGNORE INTO chat_room_messages (id, room_id, sender_id, sender_username, message)
      VALUES (1, ?, 'pin-room-owner', 'pin_room_owner', 'test message')
    `).run(ROOM_ID);
    rawDb.prepare(`
      INSERT OR IGNORE INTO chat_room_messages (id, room_id, sender_id, sender_username, message)
      VALUES (2, ?, 'pin-room-owner', 'pin_room_owner', 'test message 2')
    `).run(ROOM_ID);
  }, 30000);

  beforeEach(() => {
    rawDb.exec(`DELETE FROM pinned_messages WHERE room_id = '${ROOM_ID}'`);
  });

  const MSG_ID = 1; // use any numeric id; no FK on message_id in pins table

  it('pinMessage and isPinned return true', async () => {
    await repo.pinMessage(ROOM_ID, MSG_ID, 'sysop');
    expect(await repo.isPinned(ROOM_ID, MSG_ID)).toBe(true);
  });

  it('unpinMessage makes isPinned false', async () => {
    await repo.pinMessage(ROOM_ID, MSG_ID, 'sysop');
    await repo.unpinMessage(ROOM_ID, MSG_ID);
    expect(await repo.isPinned(ROOM_ID, MSG_ID)).toBe(false);
  });

  it('getPinnedMessages returns pinned list', async () => {
    await repo.pinMessage(ROOM_ID, MSG_ID, 'sysop');
    const pins = await repo.getPinnedMessages(ROOM_ID);
    expect(pins.length).toBeGreaterThan(0);
  });

  it('getPinCount returns correct count', async () => {
    await repo.pinMessage(ROOM_ID, MSG_ID, 'sysop');
    await repo.pinMessage(ROOM_ID, MSG_ID + 1, 'sysop');
    const count = await repo.getPinCount(ROOM_ID);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('isPinned returns false when not pinned', async () => {
    expect(await repo.isPinned(ROOM_ID, 999999)).toBe(false);
  });
});
