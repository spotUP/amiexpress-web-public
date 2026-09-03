/**
 * Storage Columns Tests
 *
 * The catalog needs to know which volume holds which file. NULL on both
 * new columns means "local disk" - the state of every row on every board
 * that has not configured a bucket.
 */

import { FileRepository } from '../../src/database/file-repository';

// Use seeded area IDs 1-3 (same convention as file-repository.test.ts)
const TEST_AREA_ID = 1;

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

function uniqueFilename(): string {
  return `storage_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.lha`;
}

describe('storage columns', () => {
  let rawDb: any;
  let repo: FileRepository;

  beforeAll(async () => {
    const db = await waitForTestDb();
    rawDb = (db as any).db;
    repo = new FileRepository(rawDb);
  }, 30000);

  it('adds storage_volume and object_key to file_entries, defaulting to local', () => {
    const cols = (rawDb.prepare('PRAGMA table_info(file_entries)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    expect(cols).toContain('storage_volume');
    expect(cols).toContain('object_key');

    const filename = uniqueFilename();
    rawDb
      .prepare('INSERT INTO file_entries (filename, size, uploader, areaid) VALUES (?, 1, ?, ?)')
      .run(filename, 'sysop', TEST_AREA_ID);

    const row = rawDb.prepare('SELECT storage_volume, object_key FROM file_entries WHERE filename = ?').get(
      filename
    ) as { storage_volume: number | null; object_key: string | null };
    expect(row.storage_volume).toBeNull();
    expect(row.object_key).toBeNull();
  });

  it('adds storage_volume and volume_class_pref to file_areas', () => {
    const cols = (rawDb.prepare('PRAGMA table_info(file_areas)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    expect(cols).toContain('storage_volume');
    expect(cols).toContain('volume_class_pref');
  });

  describe('FileRepository.recordLocation / entriesOnVolume', () => {
    it('leaves storageVolume/objectKey undefined for a plain local entry', async () => {
      const filename = uniqueFilename();
      const id = await repo.createFileEntry({
        filename,
        description: 'Local entry',
        size: 1024,
        uploader: 'testuser',
        uploadDate: new Date(),
        downloads: 0,
        areaId: TEST_AREA_ID,
        fileIdDiz: '',
        rating: 0,
        votes: 0,
        status: 'active',
        checked: 'N',
        comment: '',
      });

      const entry = await repo.getFileEntry(id);
      expect(entry).not.toBeNull();
      expect(entry!.storageVolume).toBeUndefined();
      expect(entry!.objectKey).toBeUndefined();
    });

    it('records which drive and object key hold a file, and reports it back', async () => {
      const filename = uniqueFilename();
      await repo.createFileEntry({
        filename,
        description: 'Pooled entry',
        size: 2048,
        uploader: 'testuser',
        uploadDate: new Date(),
        downloads: 0,
        areaId: TEST_AREA_ID,
        fileIdDiz: '',
        rating: 0,
        votes: 0,
        status: 'active',
        checked: 'N',
        comment: '',
      });

      repo.recordLocation(filename, TEST_AREA_ID, 7, `objects/${filename}`);

      const entries = repo.entriesOnVolume(7);
      const match = entries.find((e) => e.filename === filename);
      expect(match).toBeDefined();
      expect(match!.storageVolume).toBe(7);
      expect(match!.objectKey).toBe(`objects/${filename}`);
    });

    it('entriesOnVolume returns every row on the drive, not a page of them', () => {
      const filenames = Array.from({ length: 5 }, () => uniqueFilename());
      for (const filename of filenames) {
        rawDb
          .prepare('INSERT INTO file_entries (filename, size, uploader, areaid) VALUES (?, 1, ?, ?)')
          .run(filename, 'sysop', TEST_AREA_ID);
        repo.recordLocation(filename, TEST_AREA_ID, 42, `objects/${filename}`);
      }

      const entries = repo.entriesOnVolume(42);
      expect(entries.length).toBeGreaterThanOrEqual(filenames.length);
      for (const filename of filenames) {
        expect(entries.some((e) => e.filename === filename)).toBe(true);
      }
    });

    it('does not return entries belonging to a different volume', () => {
      const filename = uniqueFilename();
      rawDb
        .prepare('INSERT INTO file_entries (filename, size, uploader, areaid) VALUES (?, 1, ?, ?)')
        .run(filename, 'sysop', TEST_AREA_ID);
      repo.recordLocation(filename, TEST_AREA_ID, 99, `objects/${filename}`);

      const entries = repo.entriesOnVolume(98);
      expect(entries.some((e) => e.filename === filename)).toBe(false);
    });
  });
});
