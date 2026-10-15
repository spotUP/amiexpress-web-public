/**
 * "Nu kraschar den på confscan istället. CTRL-C funkar inte, enter funkar
 * inte" (a caller via the sysop, 2026-09-30): the logon mail scan stopped at
 * "Scanning Conference: Requests -" and no key did anything.
 *
 * conf_base (the read and scan pointers) has a FOREIGN KEY to
 * message_bases(id). The ids are the ones the disk loader hands out - one per
 * base, across every conference - and the table held only its three seeded
 * rows. Saving the scan pointer in conference 4's base (id 4) failed with
 * "FOREIGN KEY constraint failed", the rejection escaped, and the caller was
 * left in a reader with nothing to read.
 *
 * The mirror now follows the disk at boot (syncMessageBasesFromDisk).
 */
process.env.SKIP_DB_INIT = '1';

import Database from 'better-sqlite3';
import { ConferenceRepository } from '../../src/database/conference-repository';

function liveShapedMirror() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE conferences (id INTEGER PRIMARY KEY, name TEXT UNIQUE, description TEXT);
    CREATE TABLE message_bases (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      conferenceid INTEGER NOT NULL REFERENCES conferences(id), UNIQUE(name, conferenceid));
    CREATE TABLE conf_base (user_id TEXT NOT NULL,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      message_base_id INTEGER NOT NULL REFERENCES message_bases(id) ON DELETE CASCADE,
      last_new_read_conf INTEGER DEFAULT 0, PRIMARY KEY (user_id, conference_id, message_base_id));
  `);
  for (const [id, name] of [[1, 'Amiga Demoscene!'], [2, 'C64 Demoscene'], [3, 'Console Demoscene'], [4, 'Requests'], [5, 'Up Rough Internal']] as const) {
    db.prepare('INSERT INTO conferences (id, name) VALUES (?, ?)').run(id, name);
  }
  // The live table: three rows seeded long ago.
  db.prepare("INSERT INTO message_bases (id, name, conferenceid) VALUES (1, 'Main', 1), (2, 'Off Topic', 1), (3, 'Support', 2)").run();
  return db;
}

function repoOver(db: InstanceType<typeof Database>) {
  const repo = Object.create(ConferenceRepository.prototype) as ConferenceRepository & { prepare: (sql: string) => any };
  repo.prepare = (sql: string) => db.prepare(sql);
  return repo;
}

const savePointer = (db: InstanceType<typeof Database>, conf: number, base: number) =>
  db.prepare('INSERT INTO conf_base (user_id, conference_id, message_base_id, last_new_read_conf) VALUES (?, ?, ?, ?)')
    .run('randy', conf, base, 10);

describe('the message_bases mirror', () => {
  it('had no row for Requests\' base, so its scan pointer could not be saved', () => {
    const db = liveShapedMirror();
    expect(() => savePointer(db, 4, 4)).toThrow(/FOREIGN KEY/);
  });

  it('follows the disk, and the pointer saves', async () => {
    const db = liveShapedMirror();
    const disk = [1, 2, 3, 4, 5].map((n) => ({ id: n, conferenceId: n, name: `Message Base 1` }));
    const result = await repoOver(db).syncMessageBasesFromDisk(disk);
    expect(result).toEqual({ inserted: 2, updated: 3 });
    expect(() => savePointer(db, 4, 4)).not.toThrow();
    expect(db.prepare('SELECT conferenceid FROM message_bases WHERE id = 5').get()).toEqual({ conferenceid: 5 });
  });

  it('removes no row, so no caller loses a pointer', async () => {
    const db = liveShapedMirror();
    savePointer(db, 1, 2);
    await repoOver(db).syncMessageBasesFromDisk([{ id: 1, conferenceId: 1, name: 'Message Base 1' }]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM message_bases').get()).toEqual({ n: 3 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM conf_base').get()).toEqual({ n: 1 });
  });
});
