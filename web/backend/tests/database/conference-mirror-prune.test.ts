/**
 * The mirror is a mirror: what is not on disk is not in the table.
 *
 * syncConferencesFromDisk inserted and renamed and never removed, so a board
 * that went from fourteen conferences to twelve kept fourteen rows - and
 * every path that reads the mirror went on offering two conferences the sysop
 * had deleted. That is what "my deleted conf still shows in the bbs" was.
 *
 * Pruning is opt-in, per call: only the boot and admin-write paths pass the
 * WHOLE board, and only for those does a row missing from the list mean the
 * conference is gone. The repository's own older tests sync fragments with
 * synthetic ids, and pruning those would delete the rest of the table - which
 * is exactly what the first version of this did.
 *
 * The rows referencing a pruned conference have to go with it: foreign keys
 * are ON and four of the six referencing tables have no cascade, so otherwise
 * the DELETE fails and the stale conference simply stays.
 */

process.env.SKIP_DB_INIT = '1';

import Database from 'better-sqlite3';
import { ConferenceRepository } from '../../src/database/conference-repository';

function makeMirror(conferences: number) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE conferences (id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT);
    CREATE TABLE message_bases (id INTEGER PRIMARY KEY, name TEXT,
      conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE messages (id INTEGER PRIMARY KEY,
      conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE file_areas (id INTEGER PRIMARY KEY, name TEXT,
      conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE bulletins (id INTEGER PRIMARY KEY, filename TEXT,
      conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE mail_stats (conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      message_base_id INTEGER, PRIMARY KEY (conference_id, message_base_id));
    CREATE TABLE conf_base (user_id TEXT,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      message_base_id INTEGER, PRIMARY KEY (user_id, conference_id, message_base_id));
  `);

  for (let i = 1; i <= conferences; i += 1) {
    db.prepare('INSERT INTO conferences (id, name) VALUES (?, ?)').run(i, `Conference ${i}`);
    db.prepare('INSERT INTO message_bases (name, conferenceid) VALUES (?, ?)').run(`base ${i}`, i);
    db.prepare('INSERT INTO messages (conferenceid) VALUES (?)').run(i);
  }

  return db;
}

/** The repository, over a hand-built mirror. */
function makeRepo(db: InstanceType<typeof Database>) {
  const repo = Object.create(ConferenceRepository.prototype) as ConferenceRepository & {
    prepare: (sql: string) => ReturnType<InstanceType<typeof Database>['prepare']>;
  };
  repo.prepare = (sql: string) => db.prepare(sql);
  return repo;
}

function disk(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Conference ${i + 1}`,
    location: `BBS:Conf${i + 1}`,
  }));
}

describe('syncing the conference mirror from disk', () => {
  it('removes the rows for conferences the disk no longer has', async () => {
    const db = makeMirror(14);
    const repo = makeRepo(db);

    const result = await repo.syncConferencesFromDisk(disk(12), { complete: true });

    expect(result.pruned).toBe(2);
    const ids = db.prepare('SELECT id FROM conferences ORDER BY id').all().map((r: any) => r.id);
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('takes the rows that referenced them, which is what made the delete fail', async () => {
    const db = makeMirror(14);
    const repo = makeRepo(db);

    await repo.syncConferencesFromDisk(disk(12), { complete: true });

    const bases = db.prepare('SELECT COUNT(*) AS n FROM message_bases WHERE conferenceid > 12').get() as any;
    const messages = db.prepare('SELECT COUNT(*) AS n FROM messages WHERE conferenceid > 12').get() as any;
    expect(bases.n).toBe(0);
    expect(messages.n).toBe(0);
  });

  it('prunes nothing at all unless the caller says it has the whole board', async () => {
    const db = makeMirror(14);
    const repo = makeRepo(db);

    // A fragment: two conferences out of fourteen, which says nothing about
    // the other twelve.
    const result = await repo.syncConferencesFromDisk(disk(2));

    expect(result.pruned).toBe(0);
    const count = db.prepare('SELECT COUNT(*) AS n FROM conferences').get() as any;
    expect(count.n).toBe(14);
  });

  it('goes by what the disk lists, not by counting to it', async () => {
    const db = makeMirror(3);
    const repo = makeRepo(db);

    // A board numbered 1, 2, 4 has three conferences and a row at id 3 that
    // the disk does not list. Counting would keep it and drop 4.
    db.prepare('INSERT INTO conferences (id, name) VALUES (?, ?)').run(4, 'Conference 4');
    const result = await repo.syncConferencesFromDisk(
      [
        { id: 1, name: 'Conference 1' },
        { id: 2, name: 'Conference 2' },
        { id: 4, name: 'Conference 4' },
      ],
      { complete: true }
    );

    expect(result.pruned).toBe(1);
    const ids = db.prepare('SELECT id FROM conferences ORDER BY id').all().map((r: any) => r.id);
    expect(ids).toEqual([1, 2, 4]);
  });

  it('leaves a board that matches the disk completely alone', async () => {
    const db = makeMirror(12);
    const repo = makeRepo(db);

    const result = await repo.syncConferencesFromDisk(disk(12), { complete: true });

    expect(result).toEqual({ inserted: 0, renamed: 0, pruned: 0 });
    const count = db.prepare('SELECT COUNT(*) AS n FROM conferences').get() as any;
    expect(count.n).toBe(12);
  });

  it('still inserts what the disk has and the mirror does not', async () => {
    const db = makeMirror(2);
    const repo = makeRepo(db);

    const result = await repo.syncConferencesFromDisk(disk(4), { complete: true });

    expect(result.inserted).toBe(2);
    expect(result.pruned).toBe(0);
    const count = db.prepare('SELECT COUNT(*) AS n FROM conferences').get() as any;
    expect(count.n).toBe(4);
  });
});
