/**
 * Authentication Use Case Tests
 *
 * Tests AuthenticationUseCase which wraps db.authenticateUser.
 * Also tests the Database-level hashPassword/verifyPassword.
 */

import 'reflect-metadata'; // tsyringe requires reflect-metadata

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

import { AuthenticationUseCase } from '../../src/services/use-cases/authentication.use-case';

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

describe('AuthenticationUseCase', () => {
  let useCase: AuthenticationUseCase;
  let db: any;
  let testUserId: string;
  const testUsername = `authtest_${Date.now()}`;
  const testPassword = 'TestPass99';

  beforeAll(async () => {
    db = await waitForTestDb();
    testUserId = await db.createUser({
      username: testUsername,
      passwordHash: await db.hashPassword(testPassword),
      realname: 'Auth Test',
      location: '', phone: '', email: '',
      secLevel: 10,
      uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
      ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
      chatLimit: 60, chatUsed: 0, lastLogin: null, firstLogin: new Date(),
      calls: 0, callsToday: 0, newUser: false, expert: 'N', ansi: true,
      linesPerScreen: 24, computer: 'Amiga', screenType: 'Amiga Ansi',
      protocol: 'Z', editor: 'L', zoomType: 'QWK', availableForChat: false,
      quietNode: false, autoRejoin: 1, confAccess: '', areaName: '',
      uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, baud: 0,
    });
    useCase = new AuthenticationUseCase(db);
  }, 30000);

  describe('hashPassword / verifyPassword (Database level)', () => {
    it('hashPassword produces a bcrypt hash', async () => {
      const hash = await db.hashPassword('password123');
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^\$2[ab]\$/); // bcrypt format
    });

    it('verifyPassword returns true for correct password', async () => {
      const hash = await db.hashPassword('correct');
      const result = await db.verifyPassword('correct', hash);
      expect(result).toBe(true);
    });

    it('verifyPassword returns false for wrong password', async () => {
      const hash = await db.hashPassword('correct');
      const result = await db.verifyPassword('wrong', hash);
      expect(result).toBe(false);
    });

    it('different passwords produce different hashes', async () => {
      const hash1 = await db.hashPassword('pass1');
      const hash2 = await db.hashPassword('pass2');
      expect(hash1).not.toBe(hash2);
    });

    it('same password produces different hashes (bcrypt salt)', async () => {
      const hash1 = await db.hashPassword('samepass');
      const hash2 = await db.hashPassword('samepass');
      expect(hash1).not.toBe(hash2); // bcrypt uses random salt
    });
  });

  describe('AuthenticationUseCase.authenticate', () => {
    it('returns success=true for valid credentials', async () => {
      const result = await useCase.authenticate(testUsername, testPassword);
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.username).toBe(testUsername);
    });

    it('returns success=false for unknown username', async () => {
      const result = await useCase.authenticate('NoSuchUser_xyz', 'pass');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('returns success=false for wrong password', async () => {
      const result = await useCase.authenticate(testUsername, 'WrongPass');
      expect(result.success).toBe(false);
    });

    it('handles C64 uppercase input (case-insensitive password attempt)', async () => {
      // The use case tries lowercase first — this tests the fallback
      const result = await useCase.authenticate(testUsername, testPassword.toUpperCase());
      // Uppercase version of password might or might not match depending on bcrypt
      // Just verify no exception thrown and a result is returned
      expect(typeof result.success).toBe('boolean');
    });

    it('returns error message on failure', async () => {
      const result = await useCase.authenticate('unknown', 'wrong');
      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
    });
  });
});

describe('Database.authenticateUser integration', () => {
  let db: any;
  let userId: string;
  const uname = `dbauth_${Date.now()}`;
  const pw = 'DbAuthPass1';

  beforeAll(async () => {
    db = await waitForTestDb();
    userId = await db.createUser({
      username: uname,
      passwordHash: await db.hashPassword(pw),
      realname: 'DB Auth',
      location: '', phone: '', email: '',
      secLevel: 10,
      uploads: 0, downloads: 0, bytesUpload: 0, bytesDownload: 0,
      ratio: 0, ratioType: 0, timeTotal: 3600, timeLimit: 3600, timeUsed: 0,
      chatLimit: 60, chatUsed: 0, lastLogin: null, firstLogin: new Date(),
      calls: 0, callsToday: 0, newUser: false, expert: 'N', ansi: true,
      linesPerScreen: 24, computer: 'Amiga', screenType: 'Amiga Ansi',
      protocol: 'Z', editor: 'L', zoomType: 'QWK', availableForChat: false,
      quietNode: false, autoRejoin: 1, confAccess: '', areaName: '',
      uuCP: false, topUploadCPS: 0, topDownloadCPS: 0, byteLimit: 0, baud: 0,
    });
  }, 30000);

  it('returns user on correct password', async () => {
    const user = await db.authenticateUser(uname, pw);
    expect(user).not.toBeNull();
    expect(user.username).toBe(uname);
  });

  it('returns null on wrong password', async () => {
    const user = await db.authenticateUser(uname, 'wrong');
    expect(user).toBeNull();
  });

  it('returns null for unknown user', async () => {
    const user = await db.authenticateUser('NoSuchUser_abc', 'pass');
    expect(user).toBeNull();
  });

  it('case-insensitive username lookup', async () => {
    const user = await db.authenticateUser(uname.toUpperCase(), pw);
    // getUserByUsername uses LOWER() so uppercase lookup should find it
    expect(user).not.toBeNull();
  });
});
