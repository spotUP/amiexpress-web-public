/**
 * Whether a screen file is in a state the board can actually display.
 *
 * Found while chasing "Screens/Logon24hrs.txt loads as plain text in the ansi
 * editor": it IS plain text now. The file holds `[0;1;31m` with the ESC byte
 * gone, so a caller sees the codes printed literally. 47 files on the live
 * board are in that state, 41 of them copies of the same NODE_BULL.TXT.
 *
 * And "Screens/MAILSCAN.TXT empty in ansi editor": it is zero bytes. The
 * editor was right both times; the manager just never said so.
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

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-health-'));
  write('Node1/BBSTITLE.txt', '\x1b[31mred title\n');
  write('Node1/LOGON.TXT', '[0;1;31m_____ colour codes with no escape\n');
  write('Node1/LOGOFF.TXT', '');
  write('Node1/JOIN.TXT', 'plain words, no colour at all\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('a screen the board cannot display properly', () => {
  test('names a file whose colour codes lost their escape byte', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Node1/LOGON.TXT'].problems).toContain('colour-codes-without-escape');
  });

  test('names an empty file, which draws nothing', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Node1/LOGOFF.TXT'].problems).toContain('empty');
  });

  test('says nothing about a healthy ANSI screen', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Node1/BBSTITLE.txt'].problems).toEqual([]);
  });

  test('plain text with no colour is not a problem - many screens are plain', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Node1/JOIN.TXT'].problems).toEqual([]);
  });
});
