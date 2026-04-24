/**
 * Search Repository Tests
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

import { SearchRepository } from '../../src/database/search-repository';

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

describe('SearchRepository', () => {
  let repo: SearchRepository;

  beforeAll(async () => {
    const db = await waitForTestDb();
    repo = new SearchRepository((db as any).db);
  }, 30000);

  describe('searchMessages', () => {
    it('returns an array for a simple text query', async () => {
      const results = await repo.searchMessages({ query: 'test' });
      expect(Array.isArray(results)).toBe(true);
    });

    it('returns empty array when no matches', async () => {
      const results = await repo.searchMessages({ query: 'xyzzy_impossible_string_12345' });
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('getRecentSearches', () => {
    it('returns an array', async () => {
      const searches = await repo.getRecentSearches('user-1');
      expect(Array.isArray(searches)).toBe(true);
    });

    it('respects limit parameter', async () => {
      const searches = await repo.getRecentSearches('user-1', 5);
      expect(searches.length).toBeLessThanOrEqual(5);
    });
  });
});
