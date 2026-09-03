/**
 * Storage Columns Tests
 *
 * The catalog needs to know which volume holds which file. NULL on both
 * new columns means "local disk" - the state of every row on every board
 * that has not configured a bucket.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import { FileRepository } from '../../src/database/file-repository';
import { Database as BbsDatabase } from '../../src/database';

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

    it('round-trips storageVolume/objectKey when createFileEntry is given them directly', async () => {
      // Later tasks create the catalog row for a file that has just been
      // uploaded straight to a bucket - the INSERT must not silently drop
      // these two fields on the floor.
      const filename = uniqueFilename();
      const objectKey = `objects/${filename}`;
      const id = await repo.createFileEntry({
        filename,
        description: 'Uploaded straight to a bucket',
        size: 4096,
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
        storageVolume: 3,
        objectKey,
      });

      const entry = await repo.getFileEntry(id);
      expect(entry).not.toBeNull();
      expect(entry!.storageVolume).toBe(3);
      expect(entry!.objectKey).toBe(objectKey);

      // The write path and the read path must agree on the same columns.
      const onVolume = repo.entriesOnVolume(3);
      expect(onVolume.some((e) => e.filename === filename)).toBe(true);
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

    it('throws instead of silently no-oping when no catalog row matches (filename, areaId)', () => {
      // A caller that has just finished uploading to S3 must not be able to
      // believe the location was recorded when zero rows actually updated -
      // e.g. because the filename's case differs from what is catalogued
      // (download lookups elsewhere match on LOWER(filename), so catalog
      // filenames are not case-canonical here).
      const filename = uniqueFilename();
      expect(() => repo.recordLocation(filename, TEST_AREA_ID, 5, `objects/${filename}`)).toThrow(
        /no file_entries row/
      );
    });

    it('is an idempotent update on a repeat call for the same (filename, areaid)', () => {
      const filename = uniqueFilename();
      rawDb
        .prepare('INSERT INTO file_entries (filename, size, uploader, areaid) VALUES (?, 1, ?, ?)')
        .run(filename, 'sysop', TEST_AREA_ID);

      expect(() => repo.recordLocation(filename, TEST_AREA_ID, 11, 'objects/first')).not.toThrow();
      expect(() => repo.recordLocation(filename, TEST_AREA_ID, 11, 'objects/second')).not.toThrow();

      const entries = repo.entriesOnVolume(11);
      const match = entries.find((e) => e.filename === filename);
      expect(match).toBeDefined();
      expect(match!.objectKey).toBe('objects/second');
    });
  });
});

describe('storage columns migration (pre-existing tables that predate them)', () => {
  let tempDir: string;
  let originalDatabaseDir: string | undefined;
  let originalDatabaseFile: string | undefined;
  let migratedDb: BbsDatabase | undefined;

  afterAll(async () => {
    if (migratedDb) {
      await migratedDb.close();
    }
    if (originalDatabaseDir === undefined) {
      delete process.env.DATABASE_DIR;
    } else {
      process.env.DATABASE_DIR = originalDatabaseDir;
    }
    if (originalDatabaseFile === undefined) {
      delete process.env.DATABASE_FILE;
    } else {
      process.env.DATABASE_FILE = originalDatabaseFile;
    }
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 30000);

  it('adds storage_volume/object_key/volume_class_pref via ALTER TABLE, not just CREATE TABLE', async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'amiexpress-migration-'));
    const dbFile = 'legacy.db';
    const dbPath = path.join(tempDir, dbFile);

    // Pre-create file_areas/file_entries in exactly the pre-Task-5 shape -
    // no storage_volume, object_key, or volume_class_pref columns at all.
    // A raw better-sqlite3 handle, not the app's Database class: nothing
    // here should go through createTables().
    const legacy = new BetterSqlite3(dbPath);
    legacy.exec(`
      CREATE TABLE file_areas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        path TEXT NOT NULL,
        conferenceid INTEGER NOT NULL,
        maxfiles INTEGER DEFAULT 100,
        uploadaccess INTEGER DEFAULT 10,
        downloadaccess INTEGER DEFAULT 1,
        created INTEGER DEFAULT (strftime('%s', 'now')),
        updated INTEGER DEFAULT (strftime('%s', 'now')),
        UNIQUE(name, conferenceid)
      )
    `);
    legacy.exec(`
      CREATE TABLE file_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        description TEXT,
        size INTEGER NOT NULL,
        uploader TEXT NOT NULL,
        uploaddate INTEGER DEFAULT (strftime('%s', 'now')),
        downloads INTEGER DEFAULT 0,
        areaid INTEGER NOT NULL,
        fileiddiz TEXT,
        rating REAL DEFAULT 0,
        votes INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        checked TEXT DEFAULT 'N',
        comment TEXT,
        UNIQUE(filename, areaid)
      )
    `);

    // Prove the pre-migration shape really lacks the columns, before
    // trusting anything the migration claims to have done.
    const preEntryCols = (
      legacy.prepare('PRAGMA table_info(file_entries)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    const preAreaCols = (
      legacy.prepare('PRAGMA table_info(file_areas)').all() as Array<{ name: string }>
    ).map((c) => c.name);
    expect(preEntryCols).not.toContain('storage_volume');
    expect(preEntryCols).not.toContain('object_key');
    expect(preAreaCols).not.toContain('storage_volume');
    expect(preAreaCols).not.toContain('volume_class_pref');
    legacy.close();

    // Point a fresh Database instance at that pre-existing file. Its
    // createTables() is CREATE TABLE IF NOT EXISTS - a no-op against tables
    // that already exist - so only runMigrations()'s ALTER TABLE path can
    // add the columns here.
    originalDatabaseDir = process.env.DATABASE_DIR;
    originalDatabaseFile = process.env.DATABASE_FILE;
    process.env.DATABASE_DIR = tempDir;
    process.env.DATABASE_FILE = dbFile;

    migratedDb = new BbsDatabase();
    await migratedDb.init();

    const raw = (migratedDb as any).db;
    const entryCols = (raw.prepare('PRAGMA table_info(file_entries)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );
    const areaCols = (raw.prepare('PRAGMA table_info(file_areas)').all() as Array<{ name: string }>).map(
      (c) => c.name
    );

    expect(entryCols).toContain('storage_volume');
    expect(entryCols).toContain('object_key');
    expect(areaCols).toContain('storage_volume');
    expect(areaCols).toContain('volume_class_pref');
  }, 30000);
});
