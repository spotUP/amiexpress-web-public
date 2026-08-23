import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { backfillDoorInstalls } from '../../../../dev/scripts/backfill-door-installs';

describe('backfillDoorInstalls', () => {
  let dir: string;
  let dbFile: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-'));
    dbFile = path.join(dir, 'bbs.db');
    const db = new Database(dbFile);
    db.exec(`
      CREATE TABLE door_catalog (
        id TEXT PRIMARY KEY, archive_name TEXT NOT NULL UNIQUE, archive_path TEXT NOT NULL,
        door_type TEXT, name TEXT NOT NULL, md5 TEXT, description TEXT, category TEXT,
        version TEXT, release_group TEXT,
        installed INTEGER DEFAULT 0, installed_as TEXT, install_dir TEXT);
    `);
    db.exec(fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'door-installs.schema.sql'), 'utf-8'));
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, door_type, name, md5,
         description, category, version, release_group, installed, installed_as, install_dir)
       VALUES ('c1','ACC-V103.LHA','A/ACC-V103.LHA','AIM','Account Ed','ef28','Editor','Utility','1.03','VTL',1,'ACCV103','Doors/ACCV103'),
              ('c2','OTHER.LHA','A/OTHER.LHA','XIM','Other','aa11',NULL,NULL,NULL,NULL,0,NULL,NULL),
              ('c3','THIRD.LHA','A/THIRD.LHA','XIM','Third','bb22',NULL,NULL,NULL,NULL,1,'THIRD','Doors/THIRD')`
    ).run();
    db.close();
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('migrates only the rows marked installed', () => {
    const counts = backfillDoorInstalls(dbFile);
    expect(counts.migrated).toBe(2);
    const db = new Database(dbFile, { readonly: true });
    const rows = db.prepare('SELECT command, archive_name FROM door_installs ORDER BY command').all();
    db.close();
    expect(rows).toEqual([
      { command: 'ACCV103', archive_name: 'ACC-V103.LHA' },
      { command: 'THIRD', archive_name: 'THIRD.LHA' },
    ]);
  });

  it('carries the catalog id, type and digest across', () => {
    backfillDoorInstalls(dbFile);
    const db = new Database(dbFile, { readonly: true });
    const row = db.prepare('SELECT * FROM door_installs WHERE command = ?').get('ACCV103') as Record<string, unknown>;
    db.close();
    expect(row).toMatchObject({
      catalog_id: 'c1', door_type: 'AIM', md5: 'ef28', install_dir: 'Doors/ACCV103',
      description: 'Editor', category: 'Utility', version: '1.03', release_group: 'VTL',
    });
  });

  it('is idempotent - a second run adds nothing', () => {
    backfillDoorInstalls(dbFile);
    const second = backfillDoorInstalls(dbFile);
    const db = new Database(dbFile, { readonly: true });
    const n = (db.prepare('SELECT COUNT(*) AS n FROM door_installs').get() as { n: number }).n;
    db.close();
    expect(n).toBe(2);
    expect(second.migrated + second.skipped).toBe(2);
  });

  it('skips a row whose installed_as is empty, because a command name is required', () => {
    const db = new Database(dbFile);
    db.prepare(`INSERT INTO door_catalog (id, archive_name, archive_path, name, installed, installed_as)
                VALUES ('c4','BAD.LHA','A/BAD.LHA','Bad',1,NULL)`).run();
    db.close();
    const counts = backfillDoorInstalls(dbFile);
    expect(counts.skipped).toBeGreaterThanOrEqual(1);
    const check = new Database(dbFile, { readonly: true });
    const n = (check.prepare('SELECT COUNT(*) AS n FROM door_installs').get() as { n: number }).n;
    check.close();
    expect(n).toBe(2);
  });

  // Regression test: the live database has 14 commands where more than one
  // door_catalog row is marked installed = 1 for the same installed_as (28
  // rows total, discovered dry-running this script against a copy of it).
  // door_installs.command is UNIQUE, so ON CONFLICT(command) DO NOTHING
  // silently drops every row after the first for a given command - a naive
  // `migrated++` after every insert.run() call overstates the true count by
  // exactly that many rows (79 reported vs 51 actually written). The counts
  // this test asserts must reflect what actually landed in the table, and a
  // second catalog row for an already-claimed command must count as skipped,
  // not migrated.
  it('counts a duplicate installed_as as skipped, not migrated, and keeps only one row', () => {
    const db = new Database(dbFile);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, door_type, name, md5,
         description, category, version, release_group, installed, installed_as, install_dir)
       VALUES ('c5','ACC-V102.LHA','A/ACC-V102.LHA','AIM','Account Ed','ef00','Old Editor','Utility','1.02','VTL',1,'ACCV103','Doors/ACCV103-old')`
    ).run();
    db.close();

    const counts = backfillDoorInstalls(dbFile);
    // 3 installed=1 rows total now (c1, c3, c5); c1 and c5 share command
    // ACCV103, so only one of them can land - migrated + skipped must still
    // account for every installed=1 row, and the row count must not exceed
    // the number of distinct commands.
    expect(counts.migrated + counts.skipped).toBe(3);
    expect(counts.migrated).toBe(2);
    expect(counts.skipped).toBe(1);

    const check = new Database(dbFile, { readonly: true });
    const n = (check.prepare('SELECT COUNT(*) AS n FROM door_installs').get() as { n: number }).n;
    check.close();
    expect(n).toBe(2);
  });
});
