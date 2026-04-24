/**
 * File Repository Tests
 */

jest.mock('../../src/services/FileAreaManager', () => ({
  fileAreaManager: {
    addFileEntry: jest.fn(),
    updateFileEntry: jest.fn(),
    removeFileEntry: jest.fn(),
  }
}));

import { FileRepository } from '../../src/database/file-repository';

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

// Use seeded area IDs 1-3
const TEST_AREA_ID = 1;

function makeFileEntry(overrides: any = {}) {
  return {
    filename: `test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.zip`,
    description: 'Test file',
    size: 1024,
    uploader: 'testuser',
    uploadDate: new Date(),
    downloads: 0,
    areaId: TEST_AREA_ID,
    fileIdDiz: '',
    rating: 0,
    votes: 0,
    status: 'active' as const,
    checked: 'N' as const,
    comment: '',
    ...overrides,
  };
}

describe('FileRepository', () => {
  let repo: FileRepository;
  let rawDb: any;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new FileRepository(rawDb);
  }, 30000);

  beforeEach(() => {
    rawDb.exec(`DELETE FROM file_entries WHERE uploader = 'testuser'`);
  });

  describe('createFileEntry', () => {
    it('returns a numeric id', async () => {
      const id = await repo.createFileEntry(makeFileEntry());
      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });
  });

  describe('getFileEntry / getFileEntries', () => {
    it('retrieves by id', async () => {
      const id = await repo.createFileEntry(makeFileEntry({ description: 'Round-trip test' }));
      const entry = await repo.getFileEntry(id);
      expect(entry).not.toBeNull();
      expect(entry!.description).toBe('Round-trip test');
    });

    it('returns null for unknown id', async () => {
      const entry = await repo.getFileEntry(999999);
      expect(entry).toBeNull();
    });

    it('getFileEntries returns entries for area', async () => {
      await repo.createFileEntry(makeFileEntry());
      await repo.createFileEntry(makeFileEntry());
      const entries = await repo.getFileEntries(TEST_AREA_ID);
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThanOrEqual(2);
    });

    it('getFileEntries with limit', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.createFileEntry(makeFileEntry());
      }
      const limited = await repo.getFileEntries(TEST_AREA_ID, { limit: 2 });
      expect(limited.length).toBeLessThanOrEqual(2);
    });
  });

  describe('updateFileEntry', () => {
    it('updates download count', async () => {
      const id = await repo.createFileEntry(makeFileEntry({ downloads: 0 }));
      await repo.updateFileEntry(id, { downloads: 5 });
      const entry = await repo.getFileEntry(id);
      expect(entry!.downloads).toBe(5);
    });

    it('updates status field', async () => {
      const id = await repo.createFileEntry(makeFileEntry({ status: 'held', checked: 'N' }));
      await repo.updateFileEntry(id, { status: 'active' });
      const entry = await repo.getFileEntry(id);
      expect(entry!.status).toBe('active');
    });
  });

  describe('deleteFileEntry', () => {
    it('removes the row', async () => {
      const id = await repo.createFileEntry(makeFileEntry());
      await repo.deleteFileEntry(id);
      const entry = await repo.getFileEntry(id);
      expect(entry).toBeNull();
    });
  });

  describe('incrementDownloadCount', () => {
    it('increments by 1', async () => {
      const id = await repo.createFileEntry(makeFileEntry({ downloads: 3 }));
      await repo.incrementDownloadCount(id);
      const entry = await repo.getFileEntry(id);
      expect(entry!.downloads).toBe(4);
    });
  });

  describe('getFilesByArea (search by area)', () => {
    it('finds files by area', async () => {
      await repo.createFileEntry(makeFileEntry());
      const files = await repo.getFilesByArea(TEST_AREA_ID);
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });
  });
});
