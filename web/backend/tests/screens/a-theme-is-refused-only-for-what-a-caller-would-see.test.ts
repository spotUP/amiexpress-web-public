/**
 * WHAT STOPS A THEME GOING LIVE, and what is merely worth saying.
 *
 * Publishing `h7` answered "38 problems have to be fixed before this theme can
 * go live" (sysop, 2026-09-18). Twenty-eight were BACKUPS - `bull20.txt.backup`,
 * `BBSTITLE.txt.blink-backup-20260915`, `Logon100.txt.removed-20260914`, copies
 * the admin itself writes beside a file it replaces. Two were PETSCII screens
 * reported as holding "colour codes with the escape byte missing", which a
 * `.seq` cannot hold. Five named includes that are right there on the board,
 * and one named a code that does not exist.
 *
 * The gate answers one question: would a caller wearing this theme be served
 * broken art? A file the loader never opens cannot break anything for a
 * caller.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { fileFindings } from '../../src/screens/theme-validation';
import { parseMciReferences } from '../../src/screens/mci-references';
import { invalidateScreenIndex } from '../../src/screens/screen-index.service';
import { config } from '../../src/config';

let root: string;
let themeRoot: string;
let previousDataDir: string;

const write = (rel: string, bytes: string) => {
  const abs = path.join(themeRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, bytes, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'theme-gate-'));
  previousDataDir = config.get('dataDir');
  config.set('dataDir', root);
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), '');
  themeRoot = path.join(root, 'Themes', 'h7');
  fs.mkdirSync(themeRoot, { recursive: true });
  invalidateScreenIndex();
});
afterEach(() => {
  config.set('dataDir', previousDataDir);
  fs.rmSync(root, { recursive: true, force: true });
  invalidateScreenIndex();
});

const severities = (rel: string) => fileFindings(root, themeRoot, rel).map(f => f.severity);

describe('a theme is refused only for what a caller would see', () => {
  it('does not block on the copies the admin leaves beside a replaced file', () => {
    for (const rel of [
      'Conf/1/bull20.txt.backup',
      'Node/BBSTITLE.txt.blink-backup-20260915',
      'Node/Logon100.txt.removed-20260914',
      'Node/logon20.txt.bull6-backup-20260916',
    ]) {
      write(rel, 'an old copy\r\n');
      expect(severities(rel)).toEqual(['advisory']);
      expect(fileFindings(root, themeRoot, rel)[0].message).toMatch(/old copy/);
    }
  });

  it('still says a stray file is not art, without refusing the theme for it', () => {
    write('Node/logo.png', 'PNG');

    const [finding] = fileFindings(root, themeRoot, 'Node/logo.png');
    expect(finding.severity).toBe('advisory');
    expect(finding.message).toMatch(/not a screen file/);
  });

  it('blocks on art a caller really would be shown broken', () => {
    write('Node/BBSTITLE.txt', '');
    expect(severities('Node/BBSTITLE.txt')).toEqual(['blocking']);

    write('Node/logon20.txt', '[0;1;31mRED WITHOUT AN ESCAPE\r\n');
    expect(severities('Node/logon20.txt')).toEqual(['blocking']);
  });

  it('reports a C64 rule in its own words, and does not refuse the theme for it', () => {
    // `$8E` is the graphics bank: served exactly as drawn, so it is a thing to
    // know rather than a reason to refuse.
    write('Conf/2/bull20.seq', '\x8eGRAPHICS BANK ART\r');

    const [finding] = fileFindings(root, themeRoot, 'Conf/2/bull20.seq');
    expect(finding.severity).toBe('advisory');
    expect(finding.message).toMatch(/graphics bank/);
    expect(finding.message).not.toMatch(/escape byte/);
  });
});

describe('an include names the file it names', () => {
  it('stops the target at the escape byte the art writes after it', () => {
    const refs = parseMciReferences('~SS_BBS:bulletins/bull9.txt\x1b[37m\r\n');

    expect(refs.map(r => ({ code: r.code, target: r.target })))
      .toEqual([{ code: 'SS', target: 'BBS:bulletins/bull9.txt' }]);
  });

  it('reads a numbered random include as one, not as a file called R_...', () => {
    const refs = parseMciReferences('~2SR_WORK:bbs/Screens/logoff/logoff\r\n');

    expect(refs.map(r => ({ code: r.code, target: r.target })))
      .toEqual([{ code: 'SR', target: 'WORK:bbs/Screens/logoff/logoff' }]);
  });
});
