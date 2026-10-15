/**
 * door-repo-manifest: builds a DoorRepoManifest from door_catalog and
 * renders it to a byte-exact list.txt (ISO-8859-1, CRLF line endings)
 * that legacy AmigaDOS door-repo clients can parse without a JSON parser.
 *
 * Checksums are sourced from Task 1's getArchiveChecksums (door-repo-checksums.ts)
 * and are lazy/best-effort: a missing archive file yields null md5/sha256,
 * not a thrown error — the row still appears in the manifest (a consumer
 * attempting to download it 404s at that point, which is the loud failure,
 * not manifest generation).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

describe('door-repo-manifest', () => {
  let tmpDir: string;
  let dbPath: string;
  let archiveDir: string;
  let db: Database.Database;
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'door-repo-manifest-'));
    archiveDir = path.join(tmpDir, 'Archives');
    fs.mkdirSync(archiveDir, { recursive: true });
    dbPath = path.join(tmpDir, 'test.sqlite');
    process.env.DOOR_ARCHIVES_ROOT = archiveDir;
    process.env.DATABASE_DIR = tmpDir;
    process.env.DATABASE_FILE = 'test.sqlite';

    db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS door_catalog (
        id                  TEXT PRIMARY KEY,
        archive_name        TEXT NOT NULL UNIQUE,
        archive_path        TEXT NOT NULL,
        binary_name         TEXT,
        door_type           TEXT DEFAULT 'XIM',
        name                TEXT NOT NULL,
        version             TEXT,
        author              TEXT,
        release_group       TEXT,
        description         TEXT,
        file_id_diz         TEXT,
        doc_filename        TEXT,
        doc_raw             TEXT,
        suggested_tooltypes TEXT,
        category            TEXT,
        archive_size        INTEGER DEFAULT 0,
        junk_count          INTEGER DEFAULT 0,
        installed           INTEGER DEFAULT 0,
        installed_as        TEXT,
        install_dir         TEXT,
        corpus_id           TEXT,
        source              TEXT DEFAULT 'scan',
        indexed_at          INTEGER DEFAULT (strftime('%s','now')),
        md5                 TEXT,
        sha256               TEXT
      )
    `);
    // Real deployments always have this table (same migration as
    // door_catalog); the manifest reads the live per-file ad count from it
    // in preference to door_catalog.junk_count, which is a denormalised
    // copy that can lag. A fixture WITHOUT the table is covered separately
    // by the fallback test below.
    db.exec(`
      CREATE TABLE IF NOT EXISTS door_catalog_files (
        catalog_id TEXT NOT NULL,
        path       TEXT NOT NULL,
        size       INTEGER DEFAULT 0,
        is_junk    INTEGER DEFAULT 0,
        junk_reason TEXT,
        PRIMARY KEY (catalog_id, path)
      )
    `);

    // Row 1: real archive file on disk, checksum coverage.
    fs.writeFileSync(path.join(archiveDir, 'foo.lha'), Buffer.from('hello'));
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-1',
      'FOO_XIM.LHA',
      'foo.lha',
      'XIM',
      'Foo Door',
      'Some Author',
      'SomeGroup',
      'Games',
      ('a|b'.repeat(60)),
      'Foo file_id.diz',
      12345
    );

    // Row 2: missing archive on disk (never written) -> null checksums.
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-2',
      'MISSING_DDD.LHA',
      'missing.lha',
      'DD',
      'Missing Door',
      'Nobody',
      null,
      'Utils',
      'A door whose archive vanished',
      null,
      999
    );

    // Row 3: REXX door — must be included like any other row.
    db.prepare(
      `INSERT INTO door_catalog
        (id, archive_name, archive_path, door_type, name, author, release_group, category, description, file_id_diz, archive_size)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      'id-3',
      'REXX_SCRIPT.LHA',
      'rexx-script.lha',
      'REXX',
      'Rexx Script',
      'Scripter',
      null,
      'Scripts',
      'A simple AREXX script',
      null,
      42
    );
    fs.writeFileSync(path.join(archiveDir, 'rexx-script.lha'), Buffer.from('rexx-body'));

    // Documentation: only id-1 carries any. id-3 has an EMPTY doc_raw, which
    // must read as "no documentation" exactly like NULL — a client gating a
    // [V]iew key on this flag would otherwise offer an empty viewer.
    db.prepare('UPDATE door_catalog SET doc_raw = ?, doc_filename = ? WHERE id = ?')
      .run('Foo docs, line one', 'foo.doc', 'id-1');
    db.prepare('UPDATE door_catalog SET doc_raw = ? WHERE id = ?').run('', 'id-3');

    // Per-file rows: id-1 has 2 ad files among 3, id-2 has none. The stale
    // junk_count column is seeded to a DIFFERENT number on purpose so the
    // tests can tell which of the two sources the manifest actually used.
    const insFile = db.prepare(
      'INSERT INTO door_catalog_files (catalog_id, path, size, is_junk) VALUES (?, ?, ?, ?)'
    );
    insFile.run('id-1', 'foo/FOO', 1024, 0);
    insFile.run('id-1', 'foo/BBSAD.TXT', 200, 1);
    insFile.run('id-1', 'foo/ADVERT.TXT', 300, 1);
    insFile.run('id-2', 'missing/MISSING', 10, 0);
    db.prepare('UPDATE door_catalog SET junk_count = 99 WHERE id = ?').run('id-1');

    db.close();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
    jest.resetModules();
  });

  function mod() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('../../src/doors/door-repo-manifest');
  }

  it('buildManifest returns formatVersion 1 and one ManifestDoor per catalog row', () => {
    const m = mod().buildManifest();
    expect(m.formatVersion).toBe(1);
    expect(typeof m.revision).toBe('string');
    expect(typeof m.generatedAt).toBe('string');
    expect(m.doors).toHaveLength(3);
    const foo = m.doors.find((d: { archiveName: string }) => d.archiveName === 'FOO_XIM.LHA');
    expect(foo).toBeDefined();
    expect(foo.doorType).toBe('XIM');
    expect(foo.name).toBe('Foo Door');
    expect(foo.author).toBe('Some Author');
    expect(foo.releaseGroup).toBe('SomeGroup');
    expect(foo.category).toBe('Games');
    expect(foo.fileIdDiz).toBe('Foo file_id.diz');
    expect(foo.archiveSize).toBe(12345);
  });

  it('computes real md5/sha256 for an archive that exists on disk', () => {
    const m = mod().buildManifest();
    const foo = m.doors.find((d: { archiveName: string }) => d.archiveName === 'FOO_XIM.LHA');
    // md5("hello")
    expect(foo.md5).toBe('5d41402abc4b2a76b9719d911017c592');
    expect(typeof foo.sha256).toBe('string');
    expect(foo.sha256).toHaveLength(64);
  });

  it('returns null checksums (not a throw) when the archive file is missing', () => {
    const m = mod().buildManifest();
    const missing = m.doors.find((d: { archiveName: string }) => d.archiveName === 'MISSING_DDD.LHA');
    expect(missing).toBeDefined();
    expect(missing.md5).toBeNull();
    expect(missing.sha256).toBeNull();
  });

  it('includes REXX-type doors like any other catalog content', () => {
    const m = mod().buildManifest();
    const rexx = m.doors.find((d: { archiveName: string }) => d.archiveName === 'REXX_SCRIPT.LHA');
    expect(rexx).toBeDefined();
    expect(rexx.doorType).toBe('REXX');
  });

  it('type filter restricts to exact door_type match', () => {
    const m = mod().buildManifest({ type: 'DD' });
    expect(m.doors).toHaveLength(1);
    expect(m.doors[0].archiveName).toBe('MISSING_DDD.LHA');
  });

  it('q filter substring-matches name/author/etc case-insensitively', () => {
    const m = mod().buildManifest({ q: 'scripter' });
    expect(m.doors).toHaveLength(1);
    expect(m.doors[0].archiveName).toBe('REXX_SCRIPT.LHA');
  });

  it('q filter returns no rows for a non-matching query', () => {
    const m = mod().buildManifest({ q: 'zzz_no_such_thing_zzz' });
    expect(m.doors).toHaveLength(0);
  });

  it('getRepoRevision returns a non-empty string (falls back to "unknown" outside a built image)', () => {
    const rev = mod().getRepoRevision();
    expect(typeof rev).toBe('string');
    expect(rev.length).toBeGreaterThan(0);
  });

  it('getDoorCount returns a plain row count without touching checksums', () => {
    // 3 rows seeded in beforeEach: FOO_XIM.LHA, MISSING_DDD.LHA, REXX_SCRIPT.LHA.
    const count = mod().getDoorCount();
    expect(count).toBe(3);
  });

  // Perf guard for the live defect this task fixes: on a cold cache,
  // synchronously hashing every archive per buildManifest() call blocked
  // the event loop for ~22 seconds against the real 3669-file catalog.
  // Precomputed md5/sha256 columns (populated at index time by
  // dev/scripts/door-corpus/build-door-catalog.ts) must make buildManifest()
  // read the digest straight off the row instead. jest.doMock (not
  // jest.spyOn) mirrors tests/api/door-repo-routes.test.ts's pattern for the
  // same reason noted there: swc compiles named exports as non-configurable
  // getters, so spyOn can't redefine getArchiveChecksums.
  describe('stored-digest fast path (no per-request hashing)', () => {
    afterEach(() => {
      jest.dontMock('../../src/doors/door-repo-checksums');
    });

    it('uses the row\'s stored md5/sha256 and never calls getArchiveChecksums for that row when both are populated', () => {
      // Other seeded rows (MISSING_DDD.LHA, REXX_SCRIPT.LHA) still have NULL
      // md5/sha256 and legitimately hit the lazy-hash fallback below — the
      // assertion is scoped to FOO_XIM.LHA's own archive path, proving THAT
      // row's stored digest short-circuits hashing, not that nothing in the
      // whole manifest call ever hashes anything.
      const db2 = new Database(dbPath);
      db2.prepare('UPDATE door_catalog SET md5 = ?, sha256 = ? WHERE id = ?').run(
        '5d41402abc4b2a76b9719d911017c592', // md5("hello") — matches foo.lha's real content
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
        'id-1'
      );
      db2.close();

      const checksumSpy = jest.fn();
      jest.doMock('../../src/doors/door-repo-checksums', () => ({
        getArchiveChecksums: checksumSpy,
        _clearChecksumCacheForTests: jest.fn(),
      }));

      const m = mod().buildManifest();
      const foo = m.doors.find((d: { archiveName: string }) => d.archiveName === 'FOO_XIM.LHA');

      expect(foo.md5).toBe('5d41402abc4b2a76b9719d911017c592');
      expect(foo.sha256).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
      const fooPathCalls = checksumSpy.mock.calls.filter((call) => String(call[0]).includes('foo.lha'));
      expect(fooPathCalls).toHaveLength(0);
    });

    it('still falls back to hashing (and still warns) for a row with NULL md5/sha256, bounded to LAZY_CHECKSUM_FALLBACK_LIMIT rows per call', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

      const db2 = new Database(dbPath);
      const insert = db2.prepare(
        `INSERT INTO door_catalog
          (id, archive_name, archive_path, door_type, name, archive_size)
         VALUES (?, ?, ?, 'XIM', ?, ?)`
      );
      const { LAZY_CHECKSUM_FALLBACK_LIMIT } = mod();
      const bulkCount = LAZY_CHECKSUM_FALLBACK_LIMIT + 3;
      for (let i = 0; i < bulkCount; i++) {
        const n = String(i).padStart(3, '0');
        const archiveName = `BULK_${n}.LHA`;
        const rel = `bulk-${n}.lha`;
        fs.writeFileSync(path.join(archiveDir, rel), Buffer.from(`bulk-${n}`));
        insert.run(`bulk-${n}`, archiveName, rel, `Bulk ${n}`, 10);
      }
      db2.close();

      const m = mod().buildManifest({ q: 'BULK_' });
      expect(m.doors).toHaveLength(bulkCount);

      const hashed = m.doors.filter((d: { md5: string | null }) => d.md5 !== null);
      const notHashed = m.doors.filter((d: { md5: string | null }) => d.md5 === null);
      expect(hashed).toHaveLength(LAZY_CHECKSUM_FALLBACK_LIMIT);
      expect(notHashed).toHaveLength(bulkCount - LAZY_CHECKSUM_FALLBACK_LIMIT);
      for (const d of notHashed) expect(d.sha256).toBeNull();

      const warnedBoundReached = logSpy.mock.calls.some((call) =>
        String(call[0]).includes('lazy-fallback limit') && String(call[0]).includes(String(LAZY_CHECKSUM_FALLBACK_LIMIT))
      );
      expect(warnedBoundReached).toBe(true);

      logSpy.mockRestore();
    });
  });

  describe('junkCount / hasDoc', () => {
    it('reports the live per-file ad count, not the denormalised junk_count column', () => {
      const m = mod().buildManifest();
      const foo = m.doors.find((d: any) => d.archiveName === 'FOO_XIM.LHA');
      // The fixture seeds junk_count = 99 against 2 real is_junk rows.
      expect(foo.junkCount).toBe(2);
      const missing = m.doors.find((d: any) => d.archiveName === 'MISSING_DDD.LHA');
      expect(missing.junkCount).toBe(0);
    });

    it('sets hasDoc only for a non-empty doc_raw', () => {
      const m = mod().buildManifest();
      const byName = (n: string) => m.doors.find((d: any) => d.archiveName === n);
      expect(byName('FOO_XIM.LHA').hasDoc).toBe(true);
      expect(byName('REXX_SCRIPT.LHA').hasDoc).toBe(false); // doc_raw = ''
      expect(byName('MISSING_DDD.LHA').hasDoc).toBe(false); // doc_raw IS NULL
    });

    it('falls back to the junk_count column when door_catalog_files does not exist', () => {
      // A door_catalog-only database (several other fixtures build one). The
      // subquery would be a prepare-time "no such table" error, taking out
      // the whole manifest rather than one field.
      const d2 = new Database(dbPath);
      d2.exec('DROP TABLE door_catalog_files');
      d2.close();

      const m = mod().buildManifest();
      const foo = m.doors.find((d: any) => d.archiveName === 'FOO_XIM.LHA');
      expect(foo.junkCount).toBe(99); // the column's value, not a throw
    });
  });

  describe('renderListTxtCached', () => {
    it('returns byte-identical output to an uncached render', () => {
      const { renderListTxt, renderListTxtCached, buildManifest, _clearListCacheForTests } = mod();
      _clearListCacheForTests();
      const direct = renderListTxt(buildManifest());
      const cached = renderListTxtCached();
      expect(cached.equals(direct)).toBe(true);
    });

    it('does not rebuild the catalog for a repeat request', () => {
      // The point of the cache: every door start fetches list.txt, and
      // rebuilding it meant re-querying and re-rendering 3301 rows every
      // time. Asserted on buffer IDENTITY - a rebuild necessarily produces a
      // new Buffer, so the same reference proves nothing was rebuilt. (A
      // jest spy cannot show this: renderListTxtCached calls buildManifest
      // through the module's own internal binding, which a spy on the
      // exports object never intercepts.)
      const { renderListTxtCached, _clearListCacheForTests } = mod();
      _clearListCacheForTests();

      const first = renderListTxtCached();
      const second = renderListTxtCached();
      expect(second).toBe(first);

      // ...and a cleared cache does rebuild, so the assertion above is
      // testing the cache rather than a coincidence.
      _clearListCacheForTests();
      const third = renderListTxtCached();
      expect(third).not.toBe(first);
      expect(third.equals(first)).toBe(true);
    });

    it('serves a different body for a different filter', () => {
      const { renderListTxtCached, _clearListCacheForTests } = mod();
      _clearListCacheForTests();
      const all = renderListTxtCached().toString('latin1');
      const dd = renderListTxtCached({ type: 'DD' }).toString('latin1');
      expect(all).not.toBe(dd);
      expect(dd.split('\r\n')[0]).toContain('|1'); // still a well-formed header
    });

    it('re-renders once the catalog revision changes', () => {
      const { renderListTxtCached, _clearListCacheForTests } = mod();
      _clearListCacheForTests();
      const before = renderListTxtCached().toString('latin1');
      expect(before).not.toContain('LATE_ARRIVAL.LHA');

      // A new row changes both the count and max(indexed_at), which is what
      // getCatalogRevision() fingerprints.
      const db2 = new Database(dbPath);
      db2.prepare(
        `INSERT INTO door_catalog
          (id, archive_name, archive_path, door_type, name, archive_size, indexed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run('id-late', 'LATE_ARRIVAL.LHA', 'late.lha', 'XIM', 'Late Arrival', 1,
            Math.floor(Date.now() / 1000) + 60);
      db2.close();

      const after = renderListTxtCached().toString('latin1');
      expect(after).toContain('LATE_ARRIVAL.LHA');
    });
  });

  describe('renderListTxt', () => {
    it('produces the exact byte format: header, 10-field pipe rows, CRLF endings, escaping + truncation', () => {
      const { buildManifest, renderListTxt } = mod();
      const m = buildManifest();
      const txt = renderListTxt(m);
      expect(Buffer.isBuffer(txt)).toBe(true);

      const asLatin1 = txt.toString('latin1');
      const lines = asLatin1.split('\r\n');
      expect(lines[0]).toBe(`DOORREPO|1|${m.revision}|${m.doors.length}`);

      // Every data line has exactly 10 pipe-delimited fields: the original
      // six, plus the 2026-08-18 append (author, releaseGroup, junkCount,
      // hasDoc).
      const dataLines = lines.slice(1).filter((l: string) => l.length > 0);
      expect(dataLines).toHaveLength(m.doors.length);
      for (const line of dataLines) {
        expect(line.split('|')).toHaveLength(10);
      }

      // The FOO_XIM row's description was seeded as 'a|b'.repeat(60): pipes
      // must be escaped to '!' and the field truncated to <=120 chars.
      const fooLine = dataLines.find((l: string) => l.startsWith('FOO_XIM.LHA|'));
      expect(fooLine).toBeDefined();
      const fields = fooLine!.split('|');
      expect(fields[0]).toBe('FOO_XIM.LHA');
      expect(fields[1]).toBe('XIM');
      expect(fields[2]).toBe('12345');
      expect(fields[3]).toBe('5d41402abc4b2a76b9719d911017c592');
      expect(fields[4]).toBe('Foo Door');
      expect(fields[5]).not.toContain('|');
      expect(fields[5].length).toBeLessThanOrEqual(120);
      expect(fields[5]).toContain('!'); // escaped pipe from the source description

      // Missing-archive row: md5 field is empty string, not "null".
      const missingLine = dataLines.find((l: string) => l.startsWith('MISSING_DDD.LHA|'));
      expect(missingLine).toBeDefined();
      expect(missingLine!.split('|')[3]).toBe('');

      expect(asLatin1.endsWith('\r\n')).toBe(true);
    });

    it('appends author, releaseGroup, junkCount and hasDoc as fields 7-10 without moving fields 1-6', () => {
      const { buildManifest, renderListTxt } = mod();
      const txt = renderListTxt(buildManifest()).toString('latin1');
      const rows = txt.split('\r\n').slice(1).filter((l: string) => l.length > 0);

      const foo = rows.find((l: string) => l.startsWith('FOO_XIM.LHA|'))!.split('|');
      // Fields 1-6, unchanged in position and value — this is the promise
      // the append-only contract makes to already-deployed clients.
      expect(foo.slice(0, 6)).toEqual([
        'FOO_XIM.LHA',
        'XIM',
        '12345',
        '5d41402abc4b2a76b9719d911017c592',
        'Foo Door',
        foo[5],
      ]);
      expect(foo[6]).toBe('Some Author');
      expect(foo[7]).toBe('SomeGroup');
      expect(foo[8]).toBe('2'); // live is_junk rows, NOT the seeded junk_count of 99
      expect(foo[9]).toBe('1'); // doc_raw is non-empty

      // A row with NULL author/releaseGroup emits empty fields, never the
      // string "null" — same rule the md5 field already follows.
      const missing = rows.find((l: string) => l.startsWith('MISSING_DDD.LHA|'))!.split('|');
      expect(missing[6]).toBe('Nobody');
      expect(missing[7]).toBe('');
      expect(missing[8]).toBe('0');
      expect(missing[9]).toBe('0');

      // Empty-string doc_raw is "no documentation", like NULL.
      const rexx = rows.find((l: string) => l.startsWith('REXX_SCRIPT.LHA|'))!.split('|');
      expect(rexx[9]).toBe('0');
    });

    it('escapes a literal pipe and collapses newlines in author and releaseGroup', () => {
      const { renderListTxt } = mod();
      const out = renderListTxt({
        formatVersion: 1 as const,
        revision: 'rev',
        generatedAt: new Date().toISOString(),
        doors: [
          {
            archiveName: 'A.LHA',
            doorType: 'XIM',
            name: 'A',
            author: 'Bad|Author\nSecond line',
            releaseGroup: 'Gr|oup',
            category: null,
            description: 'd',
            fileIdDiz: null,
            archiveSize: 1,
            md5: 'x',
            sha256: 'y',
            junkCount: 0,
            hasDoc: false,
          },
        ],
      }).toString('latin1');

      const fields = out.split('\r\n')[1].split('|');
      expect(fields).toHaveLength(10);
      expect(fields[6]).toBe('Bad!Author Second line');
      expect(fields[7]).toBe('Gr!oup');
    });

    it('caps author at 48 and releaseGroup at 32 characters so one row stays one line', () => {
      const { renderListTxt } = mod();
      const out = renderListTxt({
        formatVersion: 1 as const,
        revision: 'rev',
        generatedAt: new Date().toISOString(),
        doors: [
          {
            archiveName: 'A.LHA',
            doorType: 'XIM',
            name: 'A',
            author: 'z'.repeat(200),
            releaseGroup: 'g'.repeat(200),
            category: null,
            description: 'd',
            fileIdDiz: null,
            archiveSize: 1,
            md5: 'x',
            sha256: 'y',
            junkCount: 0,
            hasDoc: false,
          },
        ],
      }).toString('latin1');

      const fields = out.split('\r\n')[1].split('|');
      expect(fields[6]).toHaveLength(48);
      expect(fields[7]).toHaveLength(32);
    });

    it('collapses CR/LF/tab runs in the description to single spaces', () => {
      const { renderListTxt } = mod();
      const manifest = {
        formatVersion: 1 as const,
        revision: 'deadbeef',
        generatedAt: new Date().toISOString(),
        doors: [
          {
            archiveName: 'X.LHA',
            doorType: 'XIM',
            name: 'X',
            author: null,
            releaseGroup: null,
            category: null,
            description: 'line one\r\nline two\ttabbed',
            fileIdDiz: null,
            archiveSize: 1,
            md5: null,
            sha256: null,
          },
        ],
      };
      const out = renderListTxt(manifest).toString('latin1');
      const dataLine = out.split('\r\n')[1];
      const desc = dataLine.split('|')[5];
      expect(desc).toBe('line one line two tabbed');
    });

    // I6: a raw CR/LF/TAB in archiveName or name (not just description)
    // would otherwise emit an extra physical line, desyncing the header's
    // `count` field from the real number of data lines -- exactly the
    // failure mode the byte-exact contract exists to prevent for any
    // naive line-by-line C parser. Two separate rows (one embeds the
    // newline in archiveName, the other in name) so each field is proven
    // independently, plus a whole-manifest header/count consistency check.
    it('collapses CR/LF/TAB in archiveName and name to single lines each, keeping the header count in sync', () => {
      const { renderListTxt } = mod();
      const manifest = {
        formatVersion: 1 as const,
        revision: 'deadbeef',
        generatedAt: new Date().toISOString(),
        doors: [
          {
            archiveName: 'WEIRD\r\nNAME.LHA',
            doorType: 'XIM',
            name: 'Normal Name',
            author: null,
            releaseGroup: null,
            category: null,
            description: null,
            fileIdDiz: null,
            archiveSize: 1,
            md5: null,
            sha256: null,
          },
          {
            archiveName: 'NORMAL.LHA',
            doorType: 'XIM',
            name: 'Weird\tName\r\nWith Break',
            author: null,
            releaseGroup: null,
            category: null,
            description: null,
            fileIdDiz: null,
            archiveSize: 1,
            md5: null,
            sha256: null,
          },
        ],
      };

      const buf = renderListTxt(manifest);
      const decoded = buf.toString('latin1');
      const lines = decoded.split('\r\n');

      // Header count still matches the actual number of data lines --
      // this is exactly what an embedded newline would desync.
      expect(lines[0]).toBe(`DOORREPO|1|deadbeef|2`);
      const dataLines = lines.slice(1).filter((l: string) => l.length > 0);
      expect(dataLines).toHaveLength(2);

      const archiveNameLine = dataLines.find((l: string) => l.startsWith('WEIRD'));
      expect(archiveNameLine).toBeDefined();
      expect(archiveNameLine!.split('|')[0]).toBe('WEIRD NAME.LHA');

      const nameLine = dataLines.find((l: string) => l.startsWith('NORMAL.LHA'));
      expect(nameLine).toBeDefined();
      expect(nameLine!.split('|')[4]).toBe('Weird Name With Break');

      expect(decoded.endsWith('\r\n')).toBe(true);
    });

    // Task 2b: against the real 3301-row catalog, 4 rows contain metadata
    // bytes outside ISO-8859-1 (e.g. a door name that renders as
    // "Cp_n\u00e4h\u00e4_Du!!" -- but it is not the latin1-safe precomposed
    // 'a-umlaut' (U+00E4); it is NFD "a" + a combining diaeresis (U+0308),
    // which IS outside the latin1 range). `Buffer.from(str, 'latin1')` does
    // NOT throw or drop such characters: it silently truncates each UTF-16
    // code unit to its low byte, so e.g. U+0416 (Cyrillic Zhe) would become
    // byte 0x16 (a control character) -- not an error, and not a '?'. Since
    // the bytes are parsed by a real Amiga client, silent corruption is
    // worse than an explicit, visible '?' substitution.
    //
    // Non-latin1 characters below are built entirely from \u escapes rather
    // than typed as literal glyphs, so the expected values are unambiguous
    // no matter how this source file itself is saved/read:
    //   COMBINING_DIAERESIS = U+0308 (the real-world "a-umlaut" case above)
    //   CYRILLIC_ZHE        = U+0416 (an ordinary out-of-range letter)
    //   GAME_EMOJI          = U+1F3AE, an astral char = one surrogate PAIR
    //                         (2 UTF-16 code units) -- must still collapse
    //                         to a SINGLE '?', not two.
    const COMBINING_DIAERESIS = '\u0308';
    const CYRILLIC_ZHE = '\u0416';
    const GAME_EMOJI = '\uD83C\uDFAE';

    it('replaces characters outside ISO-8859-1 with a single "?" per character (no silent byte corruption)', () => {
      const { renderListTxt } = mod();
      const archiveName = `W${CYRILLIC_ZHE}IRD.LHA`;
      const name = `Cp_na${COMBINING_DIAERESIS}h${CYRILLIC_ZHE}_Du!!`;
      const description = `emoji test ${GAME_EMOJI} end`;
      const manifest = {
        formatVersion: 1 as const,
        revision: 'deadbeef',
        generatedAt: new Date().toISOString(),
        doors: [
          {
            archiveName,
            doorType: 'XIM',
            name,
            author: null,
            releaseGroup: null,
            category: null,
            description,
            fileIdDiz: null,
            archiveSize: 1,
            md5: null,
            sha256: null,
          },
        ],
      };
      const buf = renderListTxt(manifest);
      const decoded = buf.toString('latin1');
      const dataLine = decoded.split('\r\n')[1];
      const fields = dataLine.split('|');

      expect(fields[0]).toBe('W?IRD.LHA');
      expect(fields[4]).toBe('Cp_na?h?_Du!!');
      // The astral emoji (a surrogate PAIR, 2 UTF-16 code units) collapses
      // to exactly one '?' -- "single ? per character", not one per code unit.
      expect(fields[5]).toBe('emoji test ? end');

      // Round-trip: every byte in the buffer is a valid latin1 code point
      // by construction, so decoding and re-encoding is a stable fixed
      // point (no further loss on a second pass).
      expect(Buffer.from(decoded, 'latin1').equals(buf)).toBe(true);
    });

    it('applies the "?" substitution BEFORE the 120-char truncation, so the boundary counts output characters', () => {
      const { renderListTxt } = mod();
      // 119 latin1-safe 'A's, then one astral (2-code-unit) emoji, then more
      // filler. Truncating at code-unit index 120 BEFORE substitution would
      // slice through the middle of the emoji's surrogate pair, leaving an
      // unpaired surrogate that Buffer.from(..., 'latin1') mangles into an
      // arbitrary byte -- not a clean, visible '?'. Substituting first
      // collapses the emoji to a single '?' (1 code unit), so the correct
      // 120-char boundary lands exactly on "119 A's + '?'" with nothing
      // from the filler beyond it.
      const description = 'A'.repeat(119) + GAME_EMOJI + 'B'.repeat(10);
      const manifest = {
        formatVersion: 1 as const,
        revision: 'deadbeef',
        generatedAt: new Date().toISOString(),
        doors: [
          {
            archiveName: 'TRUNC.LHA',
            doorType: 'XIM',
            name: 'Trunc',
            author: null,
            releaseGroup: null,
            category: null,
            description,
            fileIdDiz: null,
            archiveSize: 1,
            md5: null,
            sha256: null,
          },
        ],
      };
      const decoded = renderListTxt(manifest).toString('latin1');
      const dataLine = decoded.split('\r\n')[1];
      const desc = dataLine.split('|')[5];

      expect(desc).toBe('A'.repeat(119) + '?');
      expect(desc.length).toBe(120);
    });
  });
});
