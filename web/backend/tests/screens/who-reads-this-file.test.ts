/**
 * Which screen reads which file - and therefore which files nothing reads.
 *
 * The sysop, looking at the manager's "read by nothing" list: "there is a huge
 * read by nothing tab that i really doubt are really read by nothing. i dont
 * dare delete them." Right to doubt it.
 *
 * A file was counted as read only if it was THE file the loader picks for some
 * screen when asked at security level 255. Everything else in the directory
 * was "read by nothing" - which swept up:
 *
 * - security variants: `bull20.txt` is what a level-20..24 caller sees
 *   (express.e:6273-6290 rounds down to a multiple of five and walks down),
 * - screen-type variants: `menu250.txt.GR` is the graphics version,
 * - PETSCII and RIP variants: `.SEQ`, `.RIP`,
 * - files pulled in by another screen's `~SS_`/`~SR_` include.
 *
 * All of those are read by the board. This is the rule that says so, and says
 * WHO reads each one - which is the metadata the manager needs anyway: a sysop
 * opening a file should be told what it is for.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScreenIndex } from '../../src/screens/screen-index.service';

let root: string;

const write = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body, 'latin1');
};

function writeConfConfig(entries: { name: string; location: string }[]): void {
  const lines = [`NCONFS=${entries.length}`];
  entries.forEach((entry, i) => {
    lines.push(`NAME.${i + 1}=${entry.name}`);
    lines.push(`LOCATION.${i + 1}=${entry.location}`);
  });
  fs.writeFileSync(path.join(root, 'ConfConfig.info'), lines.join('\n') + '\n');
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'readers-'));
  write('Node1/BBSTITLE.txt', 'title\n');
  // The live board's shape: conference 1 lives in Conf2, and its join bulletin
  // is a security variant.
  write('Conf2/bull20.txt', 'the join bulletin\n');
  write('Conf2/Menu.txt', 'menu\n');
  write('Conf2/menu250.txt.GR', 'sysop menu, graphics\n');
  write('Screens/leftover.txt', 'nothing reads me\n');
  writeConfConfig([{ name: 'Amiga Demoscene', location: 'BBS:Conf2/' }]);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('who reads a file', () => {
  test('a security variant is read by its screen, at its level', () => {
    const index = buildScreenIndex(root);
    const bull = index.files['Conf2/bull20.txt'];

    expect(bull.readBy).toEqual([
      expect.objectContaining({ screen: 'CONF_BULL', scope: 'conf', id: 1, securityLevel: 20 }),
    ]);
  });

  test('a screen-type variant is read by its screen, in that type', () => {
    const index = buildScreenIndex(root);
    const menu = index.files['Conf2/menu250.txt.GR'];

    expect(menu.readBy[0]).toMatchObject({ screen: 'MENU', securityLevel: 250, screenType: 'GR' });
  });

  test('the plain file is read too, by callers no variant covers', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Conf2/Menu.txt'].readBy[0]).toMatchObject({ screen: 'MENU', scope: 'conf' });
  });

  test('a file nothing names is the only one reported as unread', () => {
    const index = buildScreenIndex(root);

    expect(index.unused.map(f => f.relPath)).toEqual(['Screens/leftover.txt']);
  });

  test('a file included by another screen counts as read', () => {
    write('Node1/LOGON.TXT', '~SS_BBS:Screens/uprough.txt\n');
    write('Screens/uprough.txt', 'the logo\n');

    const index = buildScreenIndex(root);

    expect(index.unused.map(f => f.relPath)).not.toContain('Screens/uprough.txt');
    expect(index.files['Screens/uprough.txt'].readBy[0]).toMatchObject({
      screen: 'LOGON', via: 'include',
    });
  });
});

describe('what the board calls its conferences', () => {
  test('the index carries each conference name and directory', () => {
    const index = buildScreenIndex(root);

    expect(index.conferences).toEqual([
      { id: 1, name: 'Amiga Demoscene', dir: 'Conf2' },
    ]);
  });
});
