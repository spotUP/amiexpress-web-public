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
  // What the board rewrites on a schedule. A theme copy WINS the screen walk,
  // so any of these left unmarked freezes at the moment a theme is seeded -
  // which is exactly what happened to the achievements bulletin on the live
  // board on 2026-09-08.
  write('Screens/quicknew.txt', 'FILE.LHA  12345  a new file\n');
  write('Screens/AchieveTop.txt', 'the leaderboards\n');
  write('Screens/AchieveTop.Header', 'the masthead an artist drew\n');
  write('Screens/records.txt', '\x0c  Area       Record   Date\n------------------------------\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/**
 * The whole class, not one name at a time.
 *
 * Audited after the achievements bulletin froze on live: every file the board
 * rewrites on a schedule has to be marked, or the next theme seeded copies it
 * and the copy - which wins the global screen walk - never changes again.
 */
describe('files the board rewrites on a schedule', () => {
  test('the batch jobs\' quicknew list is runtime, not art', () => {
    expect(buildScreenIndex(root).files['Screens/quicknew.txt']?.generated).toBe('runtime');
  });

  test('the achievements bulletin is runtime', () => {
    expect(buildScreenIndex(root).files['Screens/AchieveTop.txt']?.generated).toBe('runtime');
  });

  test('but its art slot is the artist\'s, and stays art', () => {
    expect(buildScreenIndex(root).files['Screens/AchieveTop.Header']?.generated).toBeUndefined();
  });

  test('S-AmiLog\'s record table is caught by its header, whatever it is called', () => {
    // The batch writes this one to a path the sysop names, so only the
    // content can identify it.
    expect(buildScreenIndex(root).files['Screens/records.txt']?.generated).toBe('runtime');
  });

  test('real art is still art', () => {
    expect(buildScreenIndex(root).files['Screens/uprough.txt']?.generated).toBeUndefined();
  });
});

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

/**
 * Bulletins a door rewrites every boot.
 *
 * "Many auto generated bulletin screens are shown in the screen gallery they
 * should not." On this board bulletins 1 to 6 are rewritten at every start -
 * five by MultiTop-II and one by a last-callers generator. For those the
 * names say nothing and the content says everything.
 *
 * `bull9.txt` is the exception that needs the other rule. It IS generated -
 * the REQUESTS door writes it between the sysop's header and tail art - but
 * the art is the sysop's own and carries no marker, so nothing in the bytes
 * gives it away. It is caught by name instead (screen-tables'
 * BOARD_WRITTEN_NAME). This test used to assert the opposite, on the strength
 * of the file having sat unchanged since January; it had sat unchanged
 * because the door that wrote it had been unwired, not because it was art.
 */
describe('bulletins written by a door', () => {
  test('a MultiTop stats bulletin is runtime, not art', () => {
    write('Bulletins/bull1.txt', '  MultiTop-II   Design Created (c)1994 Bobo/Mystic\nNo# Username\n');

    const index = buildScreenIndex(root);

    expect(index.files['Bulletins/bull1.txt']?.generated).toBe('runtime');
  });

  test('a last-callers bulletin is runtime too', () => {
    write('Bulletins/bull6.txt', 'lAST cALLERS\n1. spot\n');

    const index = buildScreenIndex(root);

    expect(index.files['Bulletins/bull6.txt']?.generated).toBe('runtime');
  });

  test('the requests bulletin is runtime even though its art is the sysop own', () => {
    // The same bytes the test below calls art. Only the NAME separates them.
    write('Bulletins/bull9.txt', '  _______\n _\\______   \\ ____\n');

    const index = buildScreenIndex(root);

    expect(index.files['Bulletins/bull9.txt']?.generated).toBe('runtime');
  });

  test('hand-drawn art in the same directory is left alone', () => {
    write('Bulletins/bull10.txt', '  _______\n _\\______   \\ ____\n');

    const index = buildScreenIndex(root);

    expect(index.files['Bulletins/bull10.txt']?.generated).toBeUndefined();
  });
});
