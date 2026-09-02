/**
 * Screens a designer never edits.
 *
 * "We have one big flaw with our screen admin page. it shows generated screens
 * as well. those are not relevant."
 *
 * Three kinds, and they are not the same kind of not-relevant:
 *
 * - BACKUPS and leftovers: `BBSTITLE.TXT.bak.stale`,
 *   `bbstitle.txt.backup-20260104-225018`, `Menu.old`. Objectively detectable
 *   by name, and never art anybody works on.
 * - RUNTIME files: what the board writes for itself. `Node<n>/CallersLog` has
 *   no screen extension and was never listed, but `Screens/Callers.txt` is.
 * - COPIES: 71 identical BBSTITLE.txt, one per node. Each one is real - the board
 *   reads them - but they are one piece of art, provisioned 71 times.
 *
 * Flagged, never dropped: a file the manager refuses to show is a file a sysop
 * cannot find, and this board has already been told once that its live screens
 * were "read by nothing".
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
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'generated-'));
  write('Node1/BBSTITLE.txt', 'the title\n');
  // The suffixed backups (.bak.stale, .backup-<stamp>, .old) never had a
  // screen extension, so the index never listed them. What DOES reach the page
  // is a leftover that still looks like a screen.
  write('Conf2/Menu copy.txt', 'a duplicate menu\n');
  write('Conf2/menu.txt.old.txt', 'an older menu\n');
  write('Screens/Callers.txt', 'the last callers\n');
  write('Screens/uprough.txt', 'real art\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('what the manager calls generated', () => {
  test('names a leftover copy as a backup, even when it still ends in .txt', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Conf2/Menu copy.txt']?.generated).toBe('backup');
    expect(index.files['Conf2/menu.txt.old.txt']?.generated).toBe('backup');
  });

  test('names a file the board writes for itself', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Screens/Callers.txt']?.generated).toBe('runtime');
  });

  test('leaves real art alone', () => {
    const index = buildScreenIndex(root);

    expect(index.files['Node1/BBSTITLE.txt']?.generated).toBeUndefined();
    expect(index.files['Screens/uprough.txt']?.generated).toBeUndefined();
  });

  test('lists them anyway - hiding a file is how a sysop loses one', () => {
    const index = buildScreenIndex(root);

    expect(Object.keys(index.files)).toContain('Conf2/Menu copy.txt');
  });
});
