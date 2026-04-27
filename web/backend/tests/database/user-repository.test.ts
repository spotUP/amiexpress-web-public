/**
 * User Repository Tests
 */

jest.mock('../../src/services/UserFileManager', () => ({
  userFileManager: {
    writeUserFiles: jest.fn(),
    updateUserDataFile: jest.fn(),
    deleteUserSlot: jest.fn(),
  }
}));
jest.mock('../../src/services/UserDatabaseManager', () => ({
  userDatabaseManager: {
    getUserCount: jest.fn().mockReturnValue(0),
    userToStruct: jest.fn().mockReturnValue({ slotNumber: 0 }),
    userToKeys: jest.fn().mockReturnValue({}),
    userToMisc: jest.fn().mockReturnValue({}),
    appendUser: jest.fn(),
    updateUser: jest.fn(),
    deleteUser: jest.fn(),
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

function makeUserData(overrides: any = {}) {
  return {
    username: `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    passwordHash: 'hash123',
    realname: 'Test User',
    location: 'London',
    phone: '555-1234',
    email: 'test@test.com',
    secLevel: 10,
    uploads: 0,
    downloads: 0,
    bytesUpload: 0,
    bytesDownload: 0,
    ratio: 0,
    ratioType: 0,
    timeTotal: 3600,
    timeLimit: 3600,
    timeUsed: 0,
    chatLimit: 60,
    chatUsed: 0,
    lastLogin: null,
    firstLogin: new Date(),
    calls: 0,
    callsToday: 0,
    newUser: false,
    expert: 'N',
    ansi: true,
    linesPerScreen: 24,
    computer: 'Amiga',
    screenType: 0,
    protocol: 'Z',
    editor: 'L',
    zoomType: 0,
    availableForChat: false,
    quietNode: false,
    autoRejoin: 1,
    confAccess: '',
    areaName: '',
    uuCP: false,
    topUploadCPS: 0,
    topDownloadCPS: 0,
    byteLimit: 0,
    baud: 0,
    ...overrides,
  };
}

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeAll(async () => {
    const db = await waitForTestDb();
    repo = new UserRepository((db as any).db);
  }, 30000);

  describe('createUser', () => {
    it('returns a UUID string', async () => {
      const id = await repo.createUser(makeUserData());
      expect(typeof id).toBe('string');
      expect(id).toMatch(/^[0-9a-f-]{36}$/i);
    });

    it('persists standard fields and reads back via getUserById', async () => {
      const data = makeUserData({ realname: 'Alice Smith', secLevel: 50 });
      const id = await repo.createUser(data);
      const user = await repo.getUserById(id);

      expect(user).not.toBeNull();
      expect(user!.username).toBe(data.username);
      expect(user!.realname).toBe('Alice Smith');
      expect(user!.secLevel).toBe(50);
    });

    it('persists GDPR fields when provided', async () => {
      const now = new Date().toISOString();
      const data = makeUserData({
        gdprConsentAt: now,
        gdprNoticeVersion: '1.0',
        gdprConsentSource: 'registration',
      });
      const id = await repo.createUser(data);
      const user = await repo.getUserById(id);

      expect(user!.gdprConsentAt).toBe(now);
      expect(user!.gdprNoticeVersion).toBe('1.0');
      expect(user!.gdprConsentSource).toBe('registration');
    });

    it('stores null GDPR fields as undefined on read', async () => {
      const id = await repo.createUser(makeUserData());
      const user = await repo.getUserById(id);

      expect(user!.gdprConsentAt).toBeUndefined();
      expect(user!.gdprNoticeVersion).toBeUndefined();
      expect(user!.gdprConsentSource).toBeUndefined();
    });

    it('does NOT write to disk (appendUser/writeUserFiles must not be called)', async () => {
      // Regression: createUser() was calling userDatabaseManager.appendUser() on every
      // user creation, polluting user.data with test users, admin API users, etc.
      // The disk write belongs exclusively in appendUserToDisk() called from the BBS
      // new-user registration flow.
      const { userDatabaseManager } = require('../../src/services/UserDatabaseManager');
      const { userFileManager } = require('../../src/services/UserFileManager');
      (userDatabaseManager.appendUser as jest.Mock).mockClear();
      (userFileManager.writeUserFiles as jest.Mock).mockClear();

      await repo.createUser(makeUserData());

      expect(userDatabaseManager.appendUser).not.toHaveBeenCalled();
      expect(userFileManager.writeUserFiles).not.toHaveBeenCalled();
    });
  });

  describe('getUserByUsername', () => {
    it('finds user case-insensitively', async () => {
      const data = makeUserData({ username: `CasedUser_${Date.now()}` });
      await repo.createUser(data);

      const upper = await repo.getUserByUsername(data.username.toUpperCase());
      const lower = await repo.getUserByUsername(data.username.toLowerCase());

      expect(upper).not.toBeNull();
      expect(lower).not.toBeNull();
      expect(upper!.username).toBe(lower!.username);
    });

    it('returns null for unknown username', async () => {
      const result = await repo.getUserByUsername('DefinitelyDoesNotExist_xyzzy');
      expect(result).toBeNull();
    });
  });

  describe('getUserById', () => {
    it('returns null for unknown id', async () => {
      const result = await repo.getUserById('00000000-0000-0000-0000-000000000000');
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('applies partial updates without touching other fields', async () => {
      const id = await repo.createUser(makeUserData({ secLevel: 10, realname: 'Before' }));
      await repo.updateUser(id, { realname: 'After' });

      const user = await repo.getUserById(id);
      expect(user!.realname).toBe('After');
      expect(user!.secLevel).toBe(10); // unchanged
    });

    it('can update GDPR fields', async () => {
      const id = await repo.createUser(makeUserData());
      const ts = new Date().toISOString();
      await repo.updateUser(id, { gdprConsentAt: ts, gdprNoticeVersion: '2.0' });

      const user = await repo.getUserById(id);
      expect(user!.gdprConsentAt).toBe(ts);
      expect(user!.gdprNoticeVersion).toBe('2.0');
    });
  });

  describe('getUsers', () => {
    it('returns all users when no filter', async () => {
      // At least the ones we created in this test run
      const users = await repo.getUsers();
      expect(Array.isArray(users)).toBe(true);
      expect(users.length).toBeGreaterThan(0);
    });

    it('filters by secLevel (returns users >= level)', async () => {
      const uniqueLevel = 147;
      await repo.createUser(makeUserData({ secLevel: uniqueLevel }));
      const filtered = await repo.getUsers({ secLevel: uniqueLevel });
      // getUsers secLevel filter returns seclevel >= value
      expect(filtered.every((u: any) => u.secLevel >= uniqueLevel)).toBe(true);
      expect(filtered.length).toBeGreaterThan(0);
    });

    it('limit caps result set', async () => {
      const all = await repo.getUsers();
      if (all.length > 2) {
        const limited = await repo.getUsers({ limit: 2 });
        expect(limited.length).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('deleteUser', () => {
    it('removes the user row', async () => {
      const id = await repo.createUser(makeUserData());
      await repo.deleteUser(id);
      const user = await repo.getUserById(id);
      expect(user).toBeNull();
    });
  });
});
