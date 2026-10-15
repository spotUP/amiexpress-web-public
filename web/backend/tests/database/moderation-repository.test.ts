/**
 * Moderation Repository Tests
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: { writeUserFiles: jest.fn(), updateUserDataFile: jest.fn() }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
  }
}));

import { ModerationRepository } from '../../src/database/moderation-repository';

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

describe('ModerationRepository', () => {
  let repo: ModerationRepository;
  let rawDb: any;
  const ROOM_ID = `test-room-${Date.now()}`;
  const USER_ID = `test-mod-user-${Date.now()}`;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new ModerationRepository(rawDb);

    // Insert prerequisites: user + chat_room (FK constraints)
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud)
      VALUES ('modroom-owner', 'modroom_owner', 'Mod Owner', 'hash', 255, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run();
    rawDb.prepare(`
      INSERT OR IGNORE INTO chat_rooms (room_id, room_name, created_by, created_by_username, is_public)
      VALUES (?, ?, 'modroom-owner', 'modroom_owner', 1)
    `).run(ROOM_ID, `modtest-room-${Date.now()}`);

    rawDb.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud
      ) VALUES (?, ?, 'Mod User', 'hash', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(USER_ID, `moduser_${Date.now()}`);
  }, 30000);

  beforeEach(() => {
    rawDb.exec(`DELETE FROM room_bans WHERE room_id = '${ROOM_ID}'`);
    rawDb.exec(`DELETE FROM room_mutes WHERE room_id = '${ROOM_ID}'`);
  });

  describe('ban/unban', () => {
    it('banUser makes isBanned return true', async () => {
      await repo.banUser(ROOM_ID, USER_ID, 'sysop', 'Test ban');
      expect(await repo.isBanned(ROOM_ID, USER_ID)).toBe(true);
    });

    it('unbanUser makes isBanned return false', async () => {
      await repo.banUser(ROOM_ID, USER_ID, 'sysop');
      await repo.unbanUser(ROOM_ID, USER_ID);
      expect(await repo.isBanned(ROOM_ID, USER_ID)).toBe(false);
    });

    it('isBanned returns false when not banned', async () => {
      expect(await repo.isBanned(ROOM_ID, 'unknown-user')).toBe(false);
    });

    it('getRoomBans lists active bans', async () => {
      await repo.banUser(ROOM_ID, USER_ID, 'sysop');
      const bans = await repo.getRoomBans(ROOM_ID);
      expect(bans.some((b: any) => b.userId === USER_ID || b.user_id === USER_ID)).toBe(true);
    });
  });

  describe('mute/unmute', () => {
    it('muteUser makes isMuted return true', async () => {
      await repo.muteUser(ROOM_ID, USER_ID, 'sysop', 60);
      expect(await repo.isMuted(ROOM_ID, USER_ID)).toBe(true);
    });

    it('unmuteUser makes isMuted return false', async () => {
      await repo.muteUser(ROOM_ID, USER_ID, 'sysop');
      await repo.unmuteUser(ROOM_ID, USER_ID);
      expect(await repo.isMuted(ROOM_ID, USER_ID)).toBe(false);
    });

    it('getRoomMutes lists active mutes', async () => {
      await repo.muteUser(ROOM_ID, USER_ID, 'sysop');
      const mutes = await repo.getRoomMutes(ROOM_ID);
      expect(mutes.length).toBeGreaterThan(0);
    });
  });
});
