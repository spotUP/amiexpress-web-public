/**
 * The file index's WRITES, against the real database class.
 *
 * THE BUG THIS PINS. `upsertFileIndex` and `clearDirIndex` went through
 * `db.query()`, which prepares the statement and calls better-sqlite3's
 * `.all()`. That method throws on any statement that returns no rows:
 *
 *   TypeError: This statement does not return data. Use run() instead
 *
 * So neither write could ever run. It shipped because the only tests over this
 * module hand it a fake whose `query` answers anything at all, and a fake that
 * cannot fail the way the driver fails proves nothing about the driver. The
 * sysop's first backfill on the live board died on the very first DELETE.
 *
 * This suite therefore uses the REAL `Database` (tests/setup.ts's shared
 * instance, which creates `file_index` in its own schema) and reads each write
 * back through the module's own reader.
 */
import {
  upsertFileIndex,
  clearDirIndex,
  lookupFileFacts,
  dirIsStale,
  type FileFacts,
  type IndexDb,
} from '../../src/services/file-index.service';
import { DESCRIBE_CONTRACT_VERSION } from '../../src/utils/describe.generated';

async function realDb(): Promise<IndexDb> {
  for (let attempt = 0; attempt < 30 && !(global as any).testDb; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const db = (global as any).testDb;
  if (!db) throw new Error('Test database not initialized');
  return db as IndexDb;
}

/** A conference number of this suite's own, so a shared database cannot collide. */
const CONF = 90_000 + Math.floor(Math.random() * 1000);

/** The corpus fingerprint every row here is written under, and read back under. */
const TAGS_SHA = 'tags-sha';

const facts = (over: Partial<FileFacts> = {}): FileFacts => ({
  description: 'A door from the Outlaws',
  version: '2.1',
  requiresBbs: null,
  author: null,
  releaseGroup: 'Outlaws',
  groupSource: 'prefix',
  category: null,
  dizSha1: null,
  tagsSha1: TAGS_SHA,
  extractorVer: DESCRIBE_CONTRACT_VERSION,
  ...over,
});

describe('the file index writes through the real database', () => {
  it('upserts a row and reads it back', async () => {
    const db = await realDb();
    await upsertFileIndex(db, { confId: CONF, dirNumber: 1, filename: 'OTL-DOOR.LHA' }, facts());
    const got = await lookupFileFacts(db, CONF, 'OTL-DOOR.LHA', TAGS_SHA);
    expect(got?.version).toBe('2.1');
    // A FileIndexRow is the DB row, so its columns are the table's own names.
    expect(got?.release_group).toBe('Outlaws');
  });

  it('a second upsert of the same file corrects the row instead of doubling it', async () => {
    const db = await realDb();
    const key = { confId: CONF, dirNumber: 2, filename: 'OTL-TOOL.LHA' };
    await upsertFileIndex(db, key, facts({ version: '1.0' }));
    await upsertFileIndex(db, key, facts({ version: '3.0' }));
    const { rows } = await (db as any).query(
      `SELECT version FROM file_index WHERE conf_id = $1 AND dir_number = $2 AND filename = $3`,
      [key.confId, key.dirNumber, key.filename],
    );
    expect(rows.map((r: any) => r.version)).toEqual(['3.0']);
  });

  it('clearing a DIR removes its rows and leaves the other DIR alone', async () => {
    const db = await realDb();
    await upsertFileIndex(db, { confId: CONF, dirNumber: 3, filename: 'GONE.LHA' }, facts());
    await upsertFileIndex(db, { confId: CONF, dirNumber: 4, filename: 'STAYS.LHA' }, facts());
    await clearDirIndex(db, CONF, 3);
    expect(await lookupFileFacts(db, CONF, 'GONE.LHA', TAGS_SHA)).toBeNull();
    expect(await lookupFileFacts(db, CONF, 'STAYS.LHA', TAGS_SHA)).not.toBeNull();
  });

  it('a DIR that has been indexed is no longer stale, which is what the backfill asks', async () => {
    const db = await realDb();
    await upsertFileIndex(db, { confId: CONF, dirNumber: 5, filename: 'FRESH.LHA' }, facts());
    expect(await dirIsStale(db, CONF, 5, 1000)).toBe(false);
    expect(await dirIsStale(db, CONF, 6, 1000)).toBe(true);
  });
});
