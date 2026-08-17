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
        indexed_at          INTEGER DEFAULT (strftime('%s','now'))
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

  describe('renderListTxt', () => {
    it('produces the exact byte format: header, 6-field pipe rows, CRLF endings, escaping + truncation', () => {
      const { buildManifest, renderListTxt } = mod();
      const m = buildManifest();
      const txt = renderListTxt(m);
      expect(Buffer.isBuffer(txt)).toBe(true);

      const asLatin1 = txt.toString('latin1');
      const lines = asLatin1.split('\r\n');
      expect(lines[0]).toBe(`DOORREPO|1|${m.revision}|${m.doors.length}`);

      // Every data line has exactly 6 pipe-delimited fields.
      const dataLines = lines.slice(1).filter((l: string) => l.length > 0);
      expect(dataLines).toHaveLength(m.doors.length);
      for (const line of dataLines) {
        expect(line.split('|')).toHaveLength(6);
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
  });
});
