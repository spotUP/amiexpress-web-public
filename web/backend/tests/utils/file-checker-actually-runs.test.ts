/**
 * A file checker the sysop configured has to RUN.
 *
 * Nothing tested that one ever did, and on the live board none ever had.
 * Two faults, stacked, either of which alone was enough:
 *
 * 1. The loader joined `Fcheck` raw. express.e writes that spelling and this
 *    board's volume holds `FCheck`; on the Amiga's case-insensitive
 *    filesystem they are one directory, on the Linux container they are two.
 *    So the loader read ENOENT and logged "using built-in checkers only",
 *    with all fifteen of the board's checkers ignored. The ADMIN's own
 *    service had already been fixed with resolveDirectory for exactly this;
 *    the half that runs them was missed.
 *
 * 2. It read the file with InfoFileParser, which splits the file on NUL
 *    bytes. A plain-text .info - the form the admin writes - has none, so the
 *    WHOLE FILE comes back as one entry and the first `=` wins: the first
 *    tooltype swallows every one after it. A one-tooltype checker survives by
 *    accident, which is why this hid; the board's real checkers carry
 *    &CHECKER AND SOPTIONS, and the options were being eaten.
 *
 * The assertion is a SENTINEL the checker itself creates. Asserting SUCCESS
 * alone would pass on the built-in fallback, which is what made this
 * invisible: the built-in ZIP check answers for a real zip whether or not the
 * sysop's checker ever ran.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The checker path reaches child_process.exec; the database is only consulted
// for the FILECHECK system command, which these boards do not configure.
jest.mock('../../src/database', () => ({
  db: { query: async () => ({ rows: [] }) },
}));

import {
  parseOrCreateInfoFile,
  updateTooltype,
  writeInfoFile,
} from '../../src/utils/info-file.util';
import { config as appConfig } from '../../src/config';

const { testFile, TestResult, clearFileCheckerCache } = require('../../src/utils/file-test.util');

describe('a configured file checker', () => {
  let root: string;
  let previousDataDir: string;
  let sentinel: string;

  /** Write a checker the way the admin does: a plain-text .info. */
  function installChecker(
    directoryName: string,
    extension: string,
    options?: string,
  ): void {
    const dir = path.join(root, directoryName);
    fs.mkdirSync(dir, { recursive: true });

    const infoPath = path.join(dir, `${extension}.info`);
    // A command that leaves proof it ran, and succeeds.
    // An ABSOLUTE path: the runner skips a checker whose executable it
    // cannot stat, and a bare `sh` does not resolve.
    const command = `/bin/sh -c "printf ran > '${sentinel}'"`;

    let info = updateTooltype(parseOrCreateInfoFile(infoPath), 'CHECKER', command, false);
    if (options !== undefined) {
      info = updateTooltype(info, 'OPTIONS', options, false);
    }
    writeInfoFile(info);
  }

  /** What the loader made of the file on disk. */
  function loadedChecker(extension: string): { checker: string; options: string } {
    const { loadFileCheckersForTesting } = require('../../src/utils/file-test.util');
    return loadFileCheckersForTesting().get(extension.toUpperCase());
  }

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'fcheck-'));
    sentinel = path.join(root, 'the-checker-ran');
    previousDataDir = appConfig.get('dataDir');
    appConfig.set('dataDir', root);
    clearFileCheckerCache();
  });

  afterEach(() => {
    appConfig.set('dataDir', previousDataDir);
    clearFileCheckerCache();
    fs.rmSync(root, { recursive: true, force: true });
  });

  // The live board's spelling.
  it('runs when the directory on disk is FCheck', async () => {
    installChecker('FCheck', 'ZIP');
    const upload = path.join(root, 'UPLOAD.ZIP');
    fs.writeFileSync(upload, 'not really a zip');

    const result = await testFile(upload, root);

    expect(fs.existsSync(sentinel)).toBe(true);
    expect(result).toBe(TestResult.SUCCESS);
  });

  // express.e's spelling, which a board restored from an Amiga will have.
  it('runs when the directory on disk is Fcheck', async () => {
    installChecker('Fcheck', 'ZIP');
    const upload = path.join(root, 'UPLOAD.ZIP');
    fs.writeFileSync(upload, 'not really a zip');

    const result = await testFile(upload, root);

    expect(fs.existsSync(sentinel)).toBe(true);
    expect(result).toBe(TestResult.SUCCESS);
  });

  it('reads a checker written as plain text, which is what the admin writes', () => {
    installChecker('FCheck', 'LHA');

    // Proof of the FORM, so the next reader does not reach for a NUL-splitting
    // parser again: what was written is text, not an Amiga icon.
    const written = fs.readFileSync(path.join(root, 'FCheck', 'LHA.info'), 'utf8');
    expect(written).toContain('CHECKER=');
    expect(written.charCodeAt(0)).not.toBe(0xe3); // an icon starts 0xE310
  });

  it('leaves a file with no checker to the built-in path', async () => {
    // No FCheck directory at all: the fallback still has to answer, or fixing
    // the loader would break every board that has no checkers configured.
    const upload = path.join(root, 'UPLOAD.ZIP');
    fs.writeFileSync(upload, 'not really a zip');

    const result = await testFile(upload, root);

    expect(fs.existsSync(sentinel)).toBe(false);
    expect(result).not.toBeUndefined();
  });

  it('ignores an AppleDouble sidecar rather than loading it as a checker', async () => {
    installChecker('FCheck', 'ZIP');
    // A Mac-written volume carries these beside every real file.
    fs.writeFileSync(path.join(root, 'FCheck', '._ZIP.info'), 'junk');

    const upload = path.join(root, 'UPLOAD.ZIP');
    fs.writeFileSync(upload, 'not really a zip');

    await expect(testFile(upload, root)).resolves.toBeDefined();
    expect(fs.existsSync(sentinel)).toBe(true);
  });

  // The shape the board actually has: &CHECKER and SOPTIONS together. Split on
  // NUL bytes, a text .info is ONE entry and CHECKER's value swallows the
  // options line - so the checker ran with the wrong arguments, or the options
  // vanished. A single-tooltype file survives that by accident, which is
  // exactly why this went unseen.
  it('keeps every tooltype when the checker declares more than one', () => {
    installChecker('FCheck', 'ZIP', 'TYPE=ZIP PACKER=zip');

    const loaded = loadedChecker('ZIP');

    expect(loaded.options).toBe('TYPE=ZIP PACKER=zip');
    expect(loaded.checker).toContain('/bin/sh');
    // The value must stop at the end of its own line.
    expect(loaded.checker).not.toContain('OPTIONS');
    expect(loaded.checker).not.toContain('\n');
  });

  // The directory fault cannot be caught by behaviour on a Mac: HFS+ is
  // case-insensitive, so path.join(root, 'Fcheck') finds FCheck here and the
  // test above passes on the broken code. It only fails on Linux, which is
  // where the board runs and where CI runs - and "invisible on the sysop's
  // Mac" is how it survived in the first place. So the spelling is pinned at
  // the source instead, the way the door guards are.
  it('asks the disk how the directory is spelled', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'utils', 'file-test.util.ts'),
      'utf8',
    );

    expect(source).toContain("resolveDirectory(bbsRoot, 'Fcheck')");
    // A raw join is the bug: it takes express.e's spelling to a filesystem
    // that does not agree with it.
    expect(source).not.toMatch(/path\.join\([^)]*'Fcheck'/);
  });
});
