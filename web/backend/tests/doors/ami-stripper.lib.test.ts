/**
 * Regression tests for ami-stripper.lib.ts's port off the native `lha` CLI
 * onto the portable extractor stack (Task #16).
 *
 * The library used to shell out to /opt/homebrew/bin/lha (or an Alpine
 * lhasa binary) for archive listing/extraction, and to `lha a` to repack a
 * cleaned archive. Both are gone: listing/extraction goes through the
 * shared getExtractorForFile factory (mocked below), and repacking writes a
 * portable ZIP via adm-zip (lhasa on Linux cannot create archives at all,
 * and the pure-JS lha.js reader has no writer).
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const mockGetExtractorForFile = jest.fn();
jest.mock('../../src/utils/archive-extractor', () => ({
  getExtractorForFile: (...args: unknown[]) => mockGetExtractorForFile(...args),
}));

/**
 * Turn the live scene-strip-patterns.json's first pattern into a concrete
 * filename guaranteed to classify as junk via the real (unmocked) pattern
 * DB — without hardcoding any of its actual content, so this stays correct
 * even as the seed data changes. Wildcards become literal filler chars that
 * still satisfy the pattern's own regex (`*` -> `.*`, `?` -> `.`).
 */
function firstJunkFilename(): string {
  const patternsPath = path.join(__dirname, '..', '..', 'seeds', 'scene-strip-patterns.json');
  const db = JSON.parse(fs.readFileSync(patternsPath, 'utf-8'));
  const pattern: string = db.filenamePatterns[0];
  return pattern.replace(/\*/g, 'x').replace(/\?/g, 'y');
}

import {
  classifyFile,
  deriveStripPlan,
  analyzeArchive,
  analyzeDirectory,
  extractClean,
  stripArchive,
  stripFilesFromDirectory,
  FingerprintDb,
} from '../../src/doors/ami-stripper.lib';

describe('ami-stripper.lib: no native lha CLI dependency', () => {
  it('does not shell out to child_process (regression guard against reverting to the lha CLI)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'ami-stripper.lib.ts'),
      'utf-8'
    );
    expect(src).not.toMatch(/require\(['"]child_process['"]\)/);
    expect(src).not.toMatch(/from ['"]child_process['"]/);
    expect(src).not.toMatch(/spawnSync\(/);
  });
});

describe('ami-stripper.lib: classifyFile (pure junk detection)', () => {
  const patterns = ['*read_this_first*', 'ad-*.txt'];
  const fingerprints: FingerprintDb = {
    // md5 of "known-junk-bytes"
    [require('crypto').createHash('md5').update('known-junk-bytes').digest('hex')]: {
      filename: 'fingerprinted.txt',
      archiveCount: 12,
    },
  };

  it('flags a filename matching a scene-strip pattern', () => {
    const verdict = classifyFile('READ_THIS_FIRST.txt', Buffer.from('hello'), patterns, {});
    expect(verdict).toBe('pattern');
  });

  it('flags a filename matching an MD5 fingerprint regardless of its own name', () => {
    const verdict = classifyFile('totally-innocuous.dat', Buffer.from('known-junk-bytes'), [], fingerprints);
    expect(verdict).toBe('md5');
  });

  it('keeps a file that matches neither a pattern nor a fingerprint', () => {
    const verdict = classifyFile('DOOR.FIM', Buffer.from('binary door bytes'), patterns, fingerprints);
    expect(verdict).toBeNull();
  });

  it('protects a genuine Workbench .info icon even if its name matches a strip pattern', () => {
    const iconBuf = Buffer.concat([Buffer.from([0x00, 0x00, 0x03, 0xe7]), Buffer.from('icon data')]);
    const verdict = classifyFile('ad-this-is-junk.info', iconBuf, ['ad-*.info'], {});
    expect(verdict).toBeNull();
  });

  it('protects a genuine AmigaDOS hunk binary with no extension', () => {
    const hunkBuf = Buffer.concat([Buffer.from([0x00, 0x00, 0x03, 0xf3]), Buffer.from('code')]);
    expect(classifyFile('MYDOOR', hunkBuf, ['*'], {})).toBeNull();
  });

  it('protects a genuine AmigaGuide document', () => {
    const guideBuf = Buffer.from('@database MyDoc\n@node Main\nHello\n@endnode\n');
    expect(classifyFile('manual.guide', guideBuf, ['*.guide'], {})).toBeNull();
  });

  it('protects a binary .cfg but allows a text .cfg through to pattern/md5 checks', () => {
    const binaryCfg = Buffer.from([0x01, 0x02, 0xff, 0xfe, 0x00, 0x10]);
    expect(classifyFile('door.cfg', binaryCfg, ['door.cfg'], {})).toBeNull();

    const textCfg = Buffer.from('access=100\n');
    expect(classifyFile('door.cfg', textCfg, ['door.cfg'], {})).toBe('pattern');
  });

  it('always protects file_id.diz', () => {
    expect(classifyFile('file_id.diz', Buffer.from('call us at +1 555-1234'), ['file_id.diz'], {})).toBeNull();
  });
});

describe('ami-stripper.lib: deriveStripPlan (strip-plan derivation)', () => {
  it('sorts entries into kept/stripped and records the reason per stripped path', () => {
    const plan = deriveStripPlan(
      [
        { path: 'DOOR.FIM', size: 100, buf: Buffer.from('binary door bytes') },
        { path: 'read_this_first.txt', size: 20, buf: Buffer.from('call the BBS at 555-1234') },
        { path: 'file_id.diz', size: 10, buf: Buffer.from('A cool door!') },
      ],
      ['read_this_first.txt'],
      {}
    );

    expect(plan.kept.map(e => e.path).sort()).toEqual(['DOOR.FIM', 'file_id.diz']);
    expect(plan.stripped.map(e => e.path)).toEqual(['read_this_first.txt']);
    expect(plan.reason['read_this_first.txt']).toBe('pattern');
  });

  it('computes a real md5 for every entry regardless of verdict', () => {
    const buf = Buffer.from('some content');
    const expectedMd5 = require('crypto').createHash('md5').update(buf).digest('hex');
    const plan = deriveStripPlan([{ path: 'a.txt', size: buf.length, buf }], [], {});
    expect(plan.kept[0].md5).toBe(expectedMd5);
  });

  it('returns everything kept for an empty pattern/fingerprint db', () => {
    const plan = deriveStripPlan(
      [{ path: 'anything.txt', size: 1, buf: Buffer.from('x') }],
      [],
      {}
    );
    expect(plan.stripped).toEqual([]);
    expect(plan.kept).toHaveLength(1);
  });
});

describe('ami-stripper.lib: analyzeDirectory (installed-door strip, always portable)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ami-stripper-dir-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('scans nested directories and reports POSIX-style relative paths', async () => {
    fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'DOOR.FIM'), 'binary bytes');
    fs.writeFileSync(path.join(dir, 'sub', 'file_id.diz'), 'A door');

    const result = await analyzeDirectory(dir);
    const paths = [...result.kept, ...result.stripped].map(e => e.path).sort();
    expect(paths).toEqual(['DOOR.FIM', 'sub/file_id.diz']);
  });
});

describe('ami-stripper.lib: analyzeArchive (portable archive read)', () => {
  afterEach(() => {
    mockGetExtractorForFile.mockReset();
  });

  it('throws a clear error when the archive format is unsupported', async () => {
    mockGetExtractorForFile.mockResolvedValue(null);
    await expect(analyzeArchive('/whatever/archive.unknown')).rejects.toThrow(/unsupported/i);
  });

  it('skips directory-marker entries', async () => {
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [{ name: 'dir/', size: 0 }, { name: 'dir/file.txt', size: 3 }],
      extractFile: async (_fp: string, name: string) => (name === 'dir/file.txt' ? Buffer.from('abc') : null),
    });
    const result = await analyzeArchive('/whatever/archive.lha');
    const paths = [...result.kept, ...result.stripped].map(e => e.path);
    expect(paths).toEqual(['dir/file.txt']);
  });

  it('extracts using the RAW backslash-separated entry name but reports a normalized (/-separated) path', async () => {
    // Regression: the pure-JS LHA reader's "directory" extended header joins
    // path segments with a literal backslash. extractFile() on the real
    // LhaExtractor does an exact/case-insensitive match against its own raw
    // listing — calling it with the normalized (forward-slash) name instead
    // of the raw name would silently fail to find the entry.
    const extractFile = jest.fn(async (_fp: string, name: string) =>
      name === 'nested\\dir\\door.fim' ? Buffer.from('binary bytes') : null
    );
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [{ name: 'nested\\dir\\door.fim', size: 5 }],
      extractFile,
    });

    const result = await analyzeArchive('/whatever/archive.lha');
    expect(extractFile).toHaveBeenCalledWith('/whatever/archive.lha', 'nested\\dir\\door.fim');
    expect([...result.kept, ...result.stripped].map(e => e.path)).toEqual(['nested/dir/door.fim']);
  });

  it('skips an entry whose content could not be read instead of throwing', async () => {
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [{ name: 'broken.txt', size: 3 }],
      extractFile: async () => null,
    });
    const result = await analyzeArchive('/whatever/archive.lha');
    expect(result.kept).toEqual([]);
    expect(result.stripped).toEqual([]);
  });
});

describe('ami-stripper.lib: extractClean (portable, honors preservePaths)', () => {
  let destDir: string;

  beforeEach(() => {
    destDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ami-stripper-clean-'));
  });

  afterEach(() => {
    fs.rmSync(destDir, { recursive: true, force: true });
    mockGetExtractorForFile.mockReset();
  });

  it('writes kept files and drops junk files, keeping a preserved junk file anyway', async () => {
    const junkName = firstJunkFilename();
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [
        { name: 'DOOR.FIM', size: 5 },
        { name: junkName, size: 5 },
      ],
      extractFile: async (_fp: string, name: string) => {
        if (name === 'DOOR.FIM') return Buffer.from('binary door bytes');
        if (name === junkName) return Buffer.from('junk content');
        return null;
      },
    });

    await extractClean('/whatever/archive.lha', destDir);
    expect(fs.readFileSync(path.join(destDir, 'DOOR.FIM'), 'utf8')).toBe('binary door bytes');
    expect(fs.existsSync(path.join(destDir, junkName))).toBe(false); // dropped, not preserved

    fs.rmSync(destDir, { recursive: true, force: true });
    await extractClean('/whatever/archive.lha', destDir, new Set([junkName]));
    expect(fs.readFileSync(path.join(destDir, junkName), 'utf8')).toBe('junk content'); // preserved
  });

  it('does not write outside destDir for a zip-slip-style entry name', async () => {
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [{ name: '../../etc/evil', size: 3 }],
      extractFile: async () => Buffer.from('bad'),
    });
    await extractClean('/whatever/archive.lha', destDir);
    expect(fs.existsSync(path.join(path.dirname(destDir), 'etc', 'evil'))).toBe(false);
  });
});

describe('ami-stripper.lib: stripArchive (portable ZIP repack)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ami-stripper-repack-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    mockGetExtractorForFile.mockReset();
  });

  it('forces the output extension to .zip regardless of the requested outPath extension', async () => {
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [{ name: 'DOOR.FIM', size: 5 }],
      extractFile: async () => Buffer.from('binary door bytes'),
    });
    const requested = path.join(tmpDir, 'clean.lha');
    const result = await stripArchive('/whatever/archive.lha', requested);
    expect(result.outputPath).toBe(path.join(tmpDir, 'clean.zip'));
    expect(fs.existsSync(result.outputPath)).toBe(true);
    expect(fs.existsSync(requested)).toBe(false); // never wrote LHA bytes under the .lha name
  });

  it('drops a file classified as junk from the repacked archive, unless preserved', async () => {
    const junkName = firstJunkFilename();
    const keepBuf = Buffer.from('binary door bytes');
    const junkBuf = Buffer.from('junk content');
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [
        { name: 'DOOR.FIM', size: keepBuf.length },
        { name: junkName, size: junkBuf.length },
      ],
      extractFile: async (_fp: string, name: string) =>
        name === 'DOOR.FIM' ? keepBuf : name === junkName ? junkBuf : null,
    });

    const outPath = path.join(tmpDir, 'clean-out');
    const result = await stripArchive('/whatever/archive.lha', outPath);
    expect(result.stripped.map(e => e.path)).toEqual([junkName]);

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(result.outputPath);
    const zipNames = zip.getEntries().map((e: any) => e.entryName);
    expect(zipNames).toEqual(['DOOR.FIM']);
    expect(zipNames).not.toContain(junkName);
  });

  it('keeps a flagged file in the repacked archive when its path is in preservePaths', async () => {
    const junkName = firstJunkFilename();
    mockGetExtractorForFile.mockResolvedValue({
      getEntries: async () => [{ name: junkName, size: 5 }],
      extractFile: async () => Buffer.from('junk content'),
    });

    const outPath = path.join(tmpDir, 'clean-out2');
    const result = await stripArchive('/whatever/archive.lha', outPath, new Set([junkName]));
    expect(result.stripped.map(e => e.path)).toEqual([junkName]); // still reported as flagged...

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(result.outputPath);
    const zipNames = zip.getEntries().map((e: any) => e.entryName);
    expect(zipNames).toContain(junkName); // ...but kept in the output because it was preserved
  });
});

describe('ami-stripper.lib: stripFilesFromDirectory (installed-door delete)', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ami-stripper-delete-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('deletes only the listed relative paths, leaving everything else', () => {
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'keep');
    fs.writeFileSync(path.join(dir, 'junk.txt'), 'junk');

    stripFilesFromDirectory(dir, ['junk.txt']);

    expect(fs.existsSync(path.join(dir, 'keep.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'junk.txt'))).toBe(false);
  });

  it('silently ignores a path that does not exist', () => {
    expect(() => stripFilesFromDirectory(dir, ['missing.txt'])).not.toThrow();
  });
});
