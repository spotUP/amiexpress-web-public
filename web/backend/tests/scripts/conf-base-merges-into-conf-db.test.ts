/**
 * The one-time merge of `conf_base` into the callers' Conf.DB records.
 *
 * The board now reads pointers and scan flags from Conf.DB (express.e:4882-
 * 4973); on live the SQL copy was ahead in some rows and the disk copy in
 * others. The merge keeps the larger pointer and the union of the scan bits,
 * touches nothing else, backs the file up first, and changes nothing when
 * run a second time - it runs once before the deploy and once after.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import BetterSqlite3 from 'better-sqlite3';

import { runMerge } from '../../src/scripts/merge-conf-base-into-conf-db';
import {
  CONFBASE_RECORD_SIZE,
  deserializeConfBase,
  serializeConfBase,
} from '../../src/services/MessagePointerFileManager';

const SIZE = CONFBASE_RECORD_SIZE;

describe('merge-conf-base-into-conf-db', () => {
  let root: string;
  let dbFile: string;
  const confDb = () => path.join(root, 'Conf1', 'Conf.DB');
  const recordAt = (slot: number) => deserializeConfBase(fs.readFileSync(confDb()), (slot - 1) * SIZE);
  const run = (...args: string[]) => {
    const out: string[] = [];
    const code = runMerge(['--root', root, '--db', dbFile, '--date', '2026-10-04', ...args], l => out.push(l));
    return { code, out: out.join('\n') };
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'merge-confbase-'));
    dbFile = path.join(root, 'amiexpress.db');
    fs.mkdirSync(path.join(root, 'Conf1'));

    // Disk: slot 1 ahead of SQL on both pointers, has zoom on; slot 2 behind
    // SQL, has MAILSCAN_ALL and a vote bit, and a ratio that must survive.
    const file = Buffer.alloc(SIZE * 3);
    const zero = deserializeConfBase(Buffer.alloc(SIZE));
    serializeConfBase({ ...zero, confRead: 200, confYM: 150, handle: Buffer.from([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }).copy(file, 0);
    serializeConfBase({ ...zero, confRead: 10, confYM: 5, ratio: 3, messagesPosted: 7, handle: Buffer.from([128, 0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) }).copy(file, SIZE);
    fs.writeFileSync(confDb(), file);

    const db = new BetterSqlite3(dbFile);
    db.exec(`
      CREATE TABLE users (id TEXT PRIMARY KEY, username TEXT, slotnumber INTEGER);
      CREATE TABLE message_bases (id INTEGER PRIMARY KEY, name TEXT, conferenceid INTEGER);
      CREATE TABLE conf_base (user_id TEXT, conference_id INTEGER, message_base_id INTEGER,
        last_new_read_conf INTEGER, last_msg_read_conf INTEGER, scan_flags INTEGER, messages_posted INTEGER);
      INSERT INTO users VALUES ('a','ahead',1), ('b','behind',2), ('n','noslot',0);
      INSERT INTO message_bases VALUES (1,'Main',1), (2,'Main',2);
      INSERT INTO conf_base VALUES
        ('a',1,1, 20, 10, 12, 0),
        ('b',1,1, 90, 80, 4|8|128|64, 99),
        ('b',1,2, 999, 999, 12, 0),
        ('n',1,1, 500, 500, 12, 0);
    `);
    db.close();
  });

  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  test('pointers take the larger copy and the scan bits the union; nothing else moves', () => {
    expect(run().code).toBe(0);

    const ahead = recordAt(1);
    expect(ahead.confRead).toBe(200);       // disk was ahead
    expect(ahead.confYM).toBe(150);
    expect(ahead.handle[0]).toBe(2 | 4 | 8); // zoom from disk, mail+file from SQL

    const behind = recordAt(2);
    expect(behind.confRead).toBe(90);       // SQL was ahead
    expect(behind.confYM).toBe(80);
    expect(behind.handle[0]).toBe(128 | 4 | 8); // MAILSCAN_ALL kept; SQL's 128/64 not taken
    expect(behind.handle[1]).toBe(0x40);    // vote bits untouched
    expect(behind.ratio).toBe(3);           // not a pointer: untouched
    expect(behind.messagesPosted).toBe(7);  // SQL's 99 not taken

    // The stray row (base 2 is conference 2's) and the slotless account did nothing.
    expect(recordAt(3).confRead).toBe(0);
  });

  test('the file is backed up before the first write, as .backup', () => {
    const before = fs.readFileSync(confDb());
    run();
    const backup = `${confDb()}.pre-merge-2026-10-04.backup`;
    expect(fs.readFileSync(backup)).toEqual(before);
  });

  test('a second run changes nothing and keeps the first backup', () => {
    run();
    const merged = fs.readFileSync(confDb());
    const backup = fs.readFileSync(`${confDb()}.pre-merge-2026-10-04.backup`);

    const second = run();

    expect(second.out).toContain('Nothing to change');
    expect(fs.readFileSync(confDb())).toEqual(merged);
    expect(fs.readFileSync(`${confDb()}.pre-merge-2026-10-04.backup`)).toEqual(backup);
  });

  test('--dry-run reports per conference and writes nothing', () => {
    const before = fs.readFileSync(confDb());

    const { out } = run('--dry-run');

    expect(out).toContain('Conference 1: 2 record(s) changed, 2 caller(s)');
    expect(out).toContain('scan pointer delta total: +80');
    expect(out).toContain('scan bits added: mail +2, file +2');
    expect(fs.readFileSync(confDb())).toEqual(before);
    expect(fs.existsSync(`${confDb()}.pre-merge-2026-10-04.backup`)).toBe(false);
  });
});
