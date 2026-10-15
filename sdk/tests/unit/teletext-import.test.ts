/**
 * Turning a published archive into a pack.
 *
 * Archives carry READMEs, thumbnails, nested folders and files that never
 * recovered. The contract is: keep the pages, name everything else that was
 * left behind, and never let an archive write outside the pack.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { importIntoPack, sourceKind } from '../../teletext/import';
import { loadService, readManifest, clearServiceCache, pageNumberFromFilename } from '../../teletext/library';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const AdmZip = require('adm-zip');

const FIXTURE_PAGES = path.join(__dirname, '..', 'fixtures', 'teletext', 'ceefax-test', 'pages');

let scratch: string;
let root: string;

beforeEach(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'teletext-import-test-'));
  root = path.join(scratch, 'Teletext');
  clearServiceCache();
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function archiveDir(): string {
  // An archive as published: pages in a subfolder, a readme beside them, and
  // one file that will not parse.
  const from = path.join(scratch, 'archive');
  fs.mkdirSync(path.join(from, 'pages'), { recursive: true });
  for (const name of ['P100-0000.tti', 'P101-0000.t42', 'P102-0000.tti']) {
    fs.copyFileSync(path.join(FIXTURE_PAGES, name), path.join(from, 'pages', name));
  }
  fs.copyFileSync(path.join(FIXTURE_PAGES, 'P1FF-0000.t42'), path.join(from, 'pages', 'P1FF-0000.t42'));
  fs.writeFileSync(path.join(from, 'README.md'), 'how this recovery was made\n');
  return from;
}

describe('what a source can be', () => {
  it('is a directory, a zip or a single page file', () => {
    const from = archiveDir();
    expect(sourceKind(from)).toBe('directory');
    expect(sourceKind(path.join(from, 'pages', 'P100-0000.tti'))).toBe('file');
    const zip = path.join(scratch, 'pack.zip');
    new AdmZip().writeZip(zip);
    expect(sourceKind(zip)).toBe('zip');
  });

  it('refuses anything else', () => {
    const readme = path.join(scratch, 'notes.txt');
    fs.writeFileSync(readme, 'not a page');
    expect(() => sourceKind(readme)).toThrow(/not a directory/);
  });
});

describe('importing a directory', () => {
  it('keeps the pages and names what it left behind', () => {
    const result = importIntoPack(archiveDir(), { id: 'ceefax-88', root, title: 'Ceefax 88' });

    expect(result.imported.sort()).toEqual(['P100-0000.tti', 'P101-0000.t42', 'P102-0000.tti']);
    const reasons = Object.fromEntries(result.skipped.map(s => [s.file, s.reason]));
    // The archive's README is the recovery's notes, so it is kept rather
    // than skipped - the credit belongs with the pages.
    expect(reasons['README.md']).toBeUndefined();
    expect(result.notesFile).toBe('RECOVERY-NOTES.txt');
    // A file that parses to nothing is refused at the door rather than
    // reported on every load for the rest of the pack's life.
    expect(reasons['P1FF-0000.t42']).toMatch(/no readable page|T42/);
    expect(fs.existsSync(path.join(result.dir, 'pages', 'P1FF-0000.t42'))).toBe(false);
  });

  it('produces a pack the board can load straight away', () => {
    const result = importIntoPack(archiveDir(), { id: 'ceefax-88', root });
    const loaded = loadService(result.dir);
    expect(loaded.index.pageNumbers).toEqual([0x100, 0x101, 0x102]);
    expect(loaded.errors).toEqual([]);
  });

  it('writes the attribution into the manifest', () => {
    // Teletext survives because people did this work. A pack that does not
    // say whose it is loses that.
    importIntoPack(archiveDir(), {
      id: 'ceefax-88',
      root,
      title: 'Ceefax 1988',
      source: 'https://example.invalid/ceefax-1988.zip',
      credit: 'recovered from VHS by someone',
      licence: 'see the archive',
      homePage: '101',
      subset: 'english',
    });
    const manifest = readManifest(path.join(root, 'ceefax-88'));
    expect(manifest?.title).toBe('Ceefax 1988');
    expect(manifest?.source).toBe('https://example.invalid/ceefax-1988.zip');
    expect(manifest?.credit).toBe('recovered from VHS by someone');
    expect(manifest?.homePage).toBe('101');
    expect(loadService(path.join(root, 'ceefax-88')).index.homePage).toBe(0x101);
  });
});

describe('importing a zip', () => {
  function archiveZip(): string {
    const zip = new AdmZip();
    zip.addLocalFile(path.join(FIXTURE_PAGES, 'P100-0000.tti'), 'ceefax/pages');
    zip.addLocalFile(path.join(FIXTURE_PAGES, 'P101-0000.t42'), 'ceefax/pages');
    zip.addFile('ceefax/readme.txt', Buffer.from('notes'));
    const at = path.join(scratch, 'ceefax.zip');
    zip.writeZip(at);
    return at;
  }

  it('reads the pages out of it', () => {
    const result = importIntoPack(archiveZip(), { id: 'from-zip', root });
    expect(result.imported.sort()).toEqual(['P100-0000.tti', 'P101-0000.t42']);
    expect(loadService(result.dir).index.pageNumbers).toEqual([0x100, 0x101]);
  });

  it('never writes outside the pack', () => {
    // A zip entry is free to call itself ../../evil.tti. Only the basename
    // is ever used, so there is nowhere for it to go.
    const zip = new AdmZip();
    zip.addFile('../../escaped.tti', fs.readFileSync(path.join(FIXTURE_PAGES, 'P100-0000.tti')));
    const at = path.join(scratch, 'evil.zip');
    zip.writeZip(at);

    const result = importIntoPack(at, { id: 'safe', root });
    expect(result.imported).toEqual(['escaped.tti']);
    expect(fs.existsSync(path.join(scratch, 'escaped.tti'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'safe', 'pages', 'escaped.tti'))).toBe(true);
  });
});

describe('importing twice', () => {
  it('refuses an existing pack unless told otherwise', () => {
    importIntoPack(archiveDir(), { id: 'ceefax-88', root });
    expect(() => importIntoPack(archiveDir(), { id: 'ceefax-88', root })).toThrow(/already exists/);
  });

  it('keeps both recoveries of the same page when forced', () => {
    // Two tapes of the same magazine carry the same page numbers, and the
    // second recovery is often the half the first one lost.
    importIntoPack(archiveDir(), { id: 'ceefax-88', root });
    const second = importIntoPack(archiveDir(), { id: 'ceefax-88', root, force: true });
    expect(second.imported).toContain('P100-0000~2.tti');
    expect(fs.existsSync(path.join(root, 'ceefax-88', 'pages', 'P100-0000.tti'))).toBe(true);
  });

  it('keeps what the sysop already wrote in the manifest', () => {
    importIntoPack(archiveDir(), { id: 'ceefax-88', root, credit: 'the original recoverer' });
    importIntoPack(archiveDir(), { id: 'ceefax-88', root, force: true, title: 'Ceefax 1988' });
    const manifest = readManifest(path.join(root, 'ceefax-88'));
    expect(manifest?.credit).toBe('the original recoverer');
    expect(manifest?.title).toBe('Ceefax 1988');
  });
});

describe('what the recovery says about itself', () => {
  function restoredArchive(): string {
    // The shape teletext-restoration publishes: a restored/ folder, pages
    // named Pmpp-ssss-hhmm-hhmm, some marked uncertain, and a notes file
    // carrying the recovery credit.
    const from = path.join(scratch, 'restored-archive');
    fs.mkdirSync(path.join(from, 'restored'), { recursive: true });
    const page = fs.readFileSync(path.join(FIXTURE_PAGES, 'P100-0000.tti'));
    fs.writeFileSync(path.join(from, 'restored', 'P100-0000-1355-1415.tti'), page);
    fs.writeFileSync(path.join(from, 'restored', 'P101-0000-1355-1415-maybe.tti'), page);
    fs.writeFileSync(path.join(from, 'restored', 'P102-0000-1355-1415-nocrc.tti'), page);
    fs.writeFileSync(path.join(from, 'notes.txt'), 'Recovered from VHS by somebody.\n');
    return from;
  }

  it('keeps the -maybe and -nocrc marks the restorers put there', () => {
    // That is the recovery's own statement of confidence. Flattening it
    // would present a guess as a record.
    const result = importIntoPack(restoredArchive(), { id: 'restored', root });
    expect(result.imported).toHaveLength(3);
    expect(result.uncertain.sort()).toEqual([
      'P101-0000-1355-1415-maybe.tti',
      'P102-0000-1355-1415-nocrc.tti',
    ]);
  });

  it('keeps the recovery notes with the pack', () => {
    const result = importIntoPack(restoredArchive(), { id: 'restored', root });
    expect(result.notesFile).toBe('RECOVERY-NOTES.txt');
    expect(fs.readFileSync(path.join(result.dir, 'RECOVERY-NOTES.txt'), 'utf8')).toMatch(/Recovered from VHS/);
    expect(readManifest(result.dir)).toMatchObject({ notesFile: 'RECOVERY-NOTES.txt' });
  });

  it('still reads the page number out of a restored filename', () => {
    expect(pageNumberFromFilename('P1a0-0000-1355-1415-maybe.t42')).toBe(0x1a0);
  });
});

describe('the pack id', () => {
  it('has to be usable as a directory name', () => {
    for (const bad of ['../escape', 'with/slash', '', ' ']) {
      expect(() => importIntoPack(archiveDir(), { id: bad, root })).toThrow(/usable service id/);
    }
  });
});
