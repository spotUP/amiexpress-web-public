// @ts-nocheck
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

import { UserRepository } from '../../src/database/user-repository';

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

describe('UserRepository GDPR consent persistence', () => {
  let repo: UserRepository;
  let rawDb: any;
  let userId: string;
  const username = `gdpr_persist_${Date.now()}`;

  beforeAll(async () => {
    rawDb = (await waitForTestDb() as any).db;
    repo = new UserRepository(rawDb);

    // Insert a fresh user via raw SQL to skip side effects
    userId = `gdpr-${Date.now()}`;
    rawDb.prepare(`
      INSERT OR IGNORE INTO users (
        id, username, realname, passwordhash, seclevel, firstlogin,
        timetotal, timelimit, timeused, calls, uploads, downloads,
        bytesupload, bytesdownload, ratio, ratiotype, chatlimit, chatused,
        callstoday, expert, autorejoin, baud
      ) VALUES (?, ?, 'GDPR', 'h', 10, 0, 3600, 3600, 0, 0, 0, 0, 0, 0, 0, 0, 60, 0, 0, 0, 1, 0)
    `).run(userId, username);
  }, 30000);

  afterAll(() => {
    try { rawDb.prepare('DELETE FROM users WHERE id = ?').run(userId); } catch (_) {}
  });

  it('updateUser persists gdpr_consent_at and getUserByUsername returns it', async () => {
    const stamp = '2026-04-25T12:00:00.000Z';
    await repo.updateUser(userId, {
      gdprConsentAt: stamp,
      gdprNoticeVersion: '1.0',
      gdprConsentSource: 'relogin',
    } as any);

    const reloaded = await repo.getUserByUsername(username);
    expect(reloaded).not.toBeNull();
    expect((reloaded as any).gdprConsentAt).toBe(stamp);
    expect((reloaded as any).gdprNoticeVersion).toBe('1.0');
    expect((reloaded as any).gdprConsentSource).toBe('relogin');

    // Raw DB read confirms column was actually written
    const row = rawDb.prepare('SELECT gdpr_consent_at, gdpr_notice_version, gdpr_consent_source FROM users WHERE id = ?').get(userId) as any;
    expect(row.gdpr_consent_at).toBe(stamp);
    expect(row.gdpr_notice_version).toBe('1.0');
    expect(row.gdpr_consent_source).toBe('relogin');
  });

  it('updateUser of unrelated fields does NOT clear gdpr_consent_at', async () => {
    // Subsequent unrelated update must preserve the consent stamp.
    // This catches the bug where lastLogin/calls bumps would wipe gdpr fields.
    await repo.updateUser(userId, { calls: 42, callsToday: 7 } as any);
    const row = rawDb.prepare('SELECT gdpr_consent_at FROM users WHERE id = ?').get(userId) as any;
    expect(row.gdpr_consent_at).toBe('2026-04-25T12:00:00.000Z');
  });
});
