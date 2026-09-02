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
  // Nothing reads this one - no screen name, no variant, no include.
  write('Screens/leftover.txt', 'art nobody points at\n');
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

/**
 * And the health check says it too.
 *
 * "Can these cases be reported in the bbs health check? can we auto fix them?"
 * Yes to reporting both, and to fixing the damaged ones - putting an escape
 * byte back is mechanical and reversible. Not to the unread ones: a file
 * nothing reads today is still somebody's art, and deleting it is a decision.
 */
import { BBSHealthCheckService } from '../../src/services/bbs-health-check.service';

describe('the board health check', () => {
  test('reports a screen whose colour codes lost their escape byte, as fixable', async () => {
    const report = await new BBSHealthCheckService(root).runFullHealthCheck();
    const screens = report.categories.find(c => c.category === 'Screen Contents');
    const damaged = screens?.issues.find(i => i.description.includes('LOGON.TXT'));

    expect(damaged?.description).toMatch(/no escape byte/);
    expect(damaged?.autoFixable).toBe(true);
  });

  test('reports an empty screen, and does not offer to fix it', async () => {
    const report = await new BBSHealthCheckService(root).runFullHealthCheck();
    const screens = report.categories.find(c => c.category === 'Screen Contents');
    const empty = screens?.issues.find(i => i.description.includes('LOGOFF.TXT'));

    expect(empty?.description).toMatch(/empty/);
    expect(empty?.autoFixable).toBe(false);
  });

  test('counts the files nothing reads, without offering to delete them', async () => {
    const report = await new BBSHealthCheckService(root).runFullHealthCheck();
    const screens = report.categories.find(c => c.category === 'Screen Contents');
    const unread = screens?.issues.find(i => i.description.includes('no screen reads'));

    expect(unread?.autoFixable).toBe(false);
    expect(unread?.fixAction).toMatch(/still art/i);
  });
});
