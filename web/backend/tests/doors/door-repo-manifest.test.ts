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
