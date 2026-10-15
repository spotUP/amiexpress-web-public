/**
 * A middle removal must not eat the conference above it.
 *
 * mail_stats, conf_base and the vote tables are ON DELETE CASCADE, and
 * cascade actions are not deferred by defer_foreign_keys. The first version
 * shifted children down (4 -> 3) BEFORE deleting the parent row 3, so the
 * cascade on that delete wiped the rows that had just moved in - every
 * middle removal silently destroyed the read pointers and mail stats of
 * conference removed+1. Probe-confirmed on 2026-08-31.
 *
 * And three referencing tables were missing from the list entirely: a vote
 * row keyed to the old LAST conference then dangled at COMMIT, failed the
 * deferred FK check, and rolled back the WHOLE migration while the API
 * reported success.
 */

process.env.SKIP_DB_INIT = '1';

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ConferenceRemovalService } from '../../src/services/conference-removal.service';

function makeBoard(conferences: number): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-cascade-'));
  const lines = [`NCONFS=${conferences}`];
  for (let i = 1; i <= conferences; i += 1) {
    lines.push(`NAME.${i}=Conference ${i}`, `LOCATION.${i}=BBS:Conf${i}`);
    fs.writeFileSync(path.join(root, `Conf${i}.info`), `NDIRS=1\n`);
  }
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
  return root;
}

function makeDb(conferences: number) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE conferences (id INTEGER PRIMARY KEY, name TEXT UNIQUE);
    CREATE TABLE message_bases (id INTEGER PRIMARY KEY, conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE messages (id INTEGER PRIMARY KEY, conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE file_areas (id INTEGER PRIMARY KEY, conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE bulletins (id INTEGER PRIMARY KEY, conferenceid INTEGER NOT NULL REFERENCES conferences(id));
    CREATE TABLE mail_stats (conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      message_base_id INTEGER, PRIMARY KEY (conference_id, message_base_id));
    CREATE TABLE conf_base (user_id TEXT,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
      message_base_id INTEGER, PRIMARY KEY (user_id, conference_id, message_base_id));
    CREATE TABLE vote_topics (id INTEGER PRIMARY KEY,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE);
    CREATE TABLE vote_status (id INTEGER PRIMARY KEY,
      conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE);
    CREATE TABLE conference_config (id INTEGER PRIMARY KEY,
      conference_id INTEGER NOT NULL UNIQUE REFERENCES conferences(id) ON DELETE CASCADE);
  `);
  for (let i = 1; i <= conferences; i += 1) {
    db.prepare('INSERT INTO conferences (id, name) VALUES (?, ?)').run(i, `Conference ${i}`);
    db.prepare('INSERT INTO conf_base (user_id, conference_id, message_base_id) VALUES (?, ?, 1)').run('sysop', i);
    db.prepare('INSERT INTO mail_stats (conference_id, message_base_id) VALUES (?, 1)').run(i);
    db.prepare('INSERT INTO conference_config (conference_id) VALUES (?)').run(i);
  }
  // A vote row on the LAST conference - the one that used to dangle at COMMIT.
  db.prepare('INSERT INTO vote_topics (conference_id) VALUES (?)').run(conferences);
  return db;
}

describe('removing conference 3 of 5, against a real database', () => {
  let root: string;

  beforeEach(() => { root = makeBoard(5); });
  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  it('keeps the conference above alive in every cascading table', async () => {
    const db = makeDb(5);
    const service = new ConferenceRemovalService(root, { sqlite: db as never });

    await service.remove(3);

    // Old 4 and 5 live on as 3 and 4 - the cascade must not have eaten them.
    expect(db.prepare('SELECT conference_id FROM conf_base ORDER BY conference_id').all())
      .toEqual([{ conference_id: 1 }, { conference_id: 2 }, { conference_id: 3 }, { conference_id: 4 }]);
    expect(db.prepare('SELECT conference_id FROM mail_stats ORDER BY conference_id').all())
      .toEqual([{ conference_id: 1 }, { conference_id: 2 }, { conference_id: 3 }, { conference_id: 4 }]);
    expect(db.prepare('SELECT COUNT(*) n FROM conferences').get()).toEqual({ n: 4 });
  });

  it('shifts the vote and config rows instead of rolling the whole migration back', async () => {
    const db = makeDb(5);
    const service = new ConferenceRemovalService(root, { sqlite: db as never });

    await service.remove(3);

    // The vote row sat on conference 5; it is conference 4 now, and its
    // presence must not have aborted the COMMIT.
    expect(db.prepare('SELECT conference_id FROM vote_topics').all()).toEqual([{ conference_id: 4 }]);
    expect(db.prepare('SELECT conference_id FROM conference_config ORDER BY conference_id').all())
      .toEqual([{ conference_id: 1 }, { conference_id: 2 }, { conference_id: 3 }, { conference_id: 4 }]);
  });
});
