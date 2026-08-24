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
    // Second run: every command is already claimed, so every row (both of
    // them, no duplicates in this fixture) loses its contest to the row
    // recorded by the first run.
    expect(second.migrated + second.skippedDuplicate + second.skippedNoCommand).toBe(2);
  });

  it('skips a row whose installed_as is empty, because a command name is required', () => {
    const db = new Database(dbFile);
    db.prepare(`INSERT INTO door_catalog (id, archive_name, archive_path, name, installed, installed_as)
                VALUES ('c4','BAD.LHA','A/BAD.LHA','Bad',1,NULL)`).run();
    db.close();
    const counts = backfillDoorInstalls(dbFile);
    expect(counts.skippedNoCommand).toBeGreaterThanOrEqual(1);
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
    // ACCV103, so only one of them can land - migrated + skipped* must
    // still account for every installed=1 row, and the row count must not
    // exceed the number of distinct commands.
    expect(counts.migrated + counts.skippedDuplicate + counts.skippedNoCommand).toBe(3);
    expect(counts.migrated).toBe(2);
    expect(counts.skippedDuplicate).toBe(1);
    expect(counts.skippedNoCommand).toBe(0);

    const check = new Database(dbFile, { readonly: true });
    const n = (check.prepare('SELECT COUNT(*) AS n FROM door_installs').get() as { n: number }).n;
    check.close();
    expect(n).toBe(2);
  });

  it('prefers the version the on-disk .info actually points at, not the newest catalog row', () => {
    // Two rows claim command ED; the .info says the v1.10 directory is installed.
    const db = new Database(dbFile);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, door_type, name, md5,
         description, category, version, release_group, installed, installed_as, install_dir)
       VALUES ('e1','5D-ED110.LHA','A/5D-ED110.LHA','XIM','Editor','aa','Ed 110',NULL,'1.10',NULL,1,'ED','Doors/ED110'),
              ('e2','5D-ED121.LHA','A/5D-ED121.LHA','XIM','Editor','bb','Ed 121',NULL,'1.21',NULL,1,'ED','Doors/ED121')`
    ).run();
    db.close();
    const cmds = fs.mkdtempSync(path.join(os.tmpdir(), 'cmds-'));
    fs.writeFileSync(path.join(cmds, 'ED.info'),
      'TYPE=XIM\nLOCATION=Doors:ED110/ed\nSTACK=8192\nACCESS=0\n');

    backfillDoorInstalls(dbFile, { commandsDir: cmds });

    const check = new Database(dbFile, { readonly: true });
    const row = check.prepare('SELECT archive_name, version FROM door_installs WHERE command = ?').get('ED') as Record<string, unknown>;
    check.close();
    fs.rmSync(cmds, { recursive: true, force: true });
    expect(row).toMatchObject({ archive_name: '5D-ED110.LHA', version: '1.10' });
  });

  it('falls back to the most recently indexed row when no .info names a winner', () => {
    const db = new Database(dbFile);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, door_type, name, md5,
         description, category, version, release_group, installed, installed_as, install_dir)
       VALUES ('f1','OLD.LHA','A/OLD.LHA','XIM','Thing','aa',NULL,NULL,'1.0',NULL,1,'THING','Doors/OLD'),
              ('f2','NEW.LHA','A/NEW.LHA','XIM','Thing','bb',NULL,NULL,'2.0',NULL,1,'THING','Doors/NEW')`
    ).run();
    db.close();
    backfillDoorInstalls(dbFile);   // no commandsDir at all
    const check = new Database(dbFile, { readonly: true });
    const row = check.prepare('SELECT archive_name FROM door_installs WHERE command = ?').get('THING') as Record<string, unknown>;
    check.close();
    expect(row.archive_name).toBe('NEW.LHA');
  });

  it('counts a lost contest separately from a row that had no command name', () => {
    const db = new Database(dbFile);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, name, installed, installed_as)
       VALUES ('g1','DUP-A.LHA','A/DUP-A.LHA','Dup',1,'DUP'),
              ('g2','DUP-B.LHA','A/DUP-B.LHA','Dup',1,'DUP'),
              ('g3','NOCMD.LHA','A/NOCMD.LHA','NoCmd',1,NULL)`
    ).run();
    db.close();
    const counts = backfillDoorInstalls(dbFile);
    expect(counts.skippedDuplicate).toBeGreaterThanOrEqual(1);
    expect(counts.skippedNoCommand).toBeGreaterThanOrEqual(1);
  });

  it('names the contested commands rather than silently picking one', () => {
    const db = new Database(dbFile);
    db.prepare(
      `INSERT INTO door_catalog (id, archive_name, archive_path, name, installed, installed_as, install_dir)
       VALUES ('z1','A.LHA','A/A.LHA','Z',1,'Z','Doors/Z'),
              ('z2','B.LHA','A/B.LHA','Z',1,'Z','Doors/Z'),
              ('z3','C.LHA','A/C.LHA','Z',1,'Z','Doors/Z')`
    ).run();
    db.close();
    const counts = backfillDoorInstalls(dbFile);
    const z = counts.contested.find((c) => c.command === 'Z');
    expect(z).toBeDefined();
    expect(z!.losers).toHaveLength(2);
    expect(z!.resolvedBy).toBe('fallback');
    expect([...z!.losers, z!.winner].sort()).toEqual(['A.LHA', 'B.LHA', 'C.LHA']);
  });
});
