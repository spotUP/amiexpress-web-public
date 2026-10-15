/**
 * Seeing the board as art rather than as files.
 *
 * 1,155 screen files here and 34 of them unique; `logoff.txt` exists 93 times
 * in 5 versions. A list of 93 rows is not a thing anyone maintains, and the
 * per-file editing that list invites is what produced the 5 versions.
 *
 * Readership decides whether an edit matters at all: 215 of this board's nodes
 * carry `SCREENS=BBS:Screens/Node/`, so one file there is what they display
 * and the per-node copies beside it are read by nobody.
 */
import { describe, expect, it } from 'vitest';
import { duplicateGroups, describeReadership, describeGroup } from '../pages/screen-duplicates';
import type { ScreenIndexShape, ScreenFileShape, ScreenReaderShape } from '../pages/screen-index-view';

const reader = (over: Partial<ScreenReaderShape> = {}): ScreenReaderShape => ({
  screen: 'LOGOFF', scope: 'node', id: 1, via: 'resolved', ...over,
});

const file = (relPath: string, sha256: string, readBy: ScreenReaderShape[] = []): ScreenFileShape => ({
  relPath, sha256, bytes: 100, format: 'ansi', mci: [], readBy,
});

const indexOf = (...files: ScreenFileShape[]): ScreenIndexShape => ({
  screens: [], unused: [], builtAt: '', files: Object.fromEntries(files.map(f => [f.relPath, f])),
});

describe('grouping the board by what the art actually is', () => {
  it('reports copies as a number, never as a list of rows', () => {
    const shared = file('Screens/Node/Logoff.txt', 'aaa',
      Array.from({ length: 215 }, (_, i) => reader({ id: i + 7 })));
    const copies = Array.from({ length: 38 }, (_, i) => file(`Node${i + 7}/Logoff.txt`, 'aaa'));

    const [group] = duplicateGroups(indexOf(shared, ...copies));

    expect(group.fileCount).toBe(39);
    expect(group.versions).toHaveLength(1);
    expect(describeGroup(group)).toBe('39 copies, all identical');
  });

  it('splits a name into its versions, worst-maintained first', () => {
    const groups = duplicateGroups(indexOf(
      file('Node1/Logoff.txt', 'aaa', [reader({ id: 1 })]),
      file('Node2/Logoff.txt', 'aaa', [reader({ id: 2 })]),
      file('Node3/Logoff.txt', 'bbb', [reader({ id: 3 })]),
      file('Node1/Join.txt', 'ccc'),
      file('Node2/Join.txt', 'ccc'),
    ));

    expect(groups.map(g => g.name.toLowerCase())).toEqual(['logoff.txt', 'join.txt']);
    expect(groups[0].versions).toHaveLength(2);
    expect(groups[0].uniform).toBe(false);
    expect(describeGroup(groups[0])).toBe('3 copies in 2 versions');
  });

  it('a file nothing carries a name-twin of is not a duplicate at all', () => {
    expect(duplicateGroups(indexOf(file('Screens/uprough.txt', 'aaa')))).toEqual([]);
  });

  it('matches names case-insensitively, because the Amiga\'s filesystem does', () => {
    const [group] = duplicateGroups(indexOf(
      file('Node1/Logoff.txt', 'aaa'),
      file('Screens/LOGOFF.TXT', 'bbb'),
    ));

    expect(group.fileCount).toBe(2);
  });

  it('points the edit at a copy something reads, not at whichever came first', () => {
    const [group] = duplicateGroups(indexOf(
      file('Node9/Logoff.txt', 'aaa'),
      file('Screens/Node/Logoff.txt', 'aaa', [reader({ id: 7 }), reader({ id: 8 })]),
    ));

    expect(group.versions[0].editPath).toBe('Screens/Node/Logoff.txt');
  });

  it('orders versions by how many scopes display them', () => {
    const [group] = duplicateGroups(indexOf(
      file('Node1/Logoff.txt', 'rare', [reader({ id: 1 })]),
      file('Screens/Node/Logoff.txt', 'common',
        Array.from({ length: 40 }, (_, i) => reader({ id: i + 7 }))),
    ));

    expect(group.versions[0].sha256).toBe('common');
    expect(group.versions[0].readerCount).toBe(40);
    expect(group.versions[1].readerCount).toBe(1);
  });

  it('carries the screen name, so a group can be offered the deep fix', () => {
    // Pointing every node at one directory needs the SCREEN, not just a file:
    // it is express.e's own SCREENS tooltype (ACP.e:2666) and the only thing
    // that makes the next edit one file instead of eighty.
    const [group] = duplicateGroups(indexOf(
      file('Screens/Node/Logoff.txt', 'aaa', [reader({ screen: 'LOGOFF', id: 7 })]),
      file('Node9/Logoff.txt', 'aaa'),
    ));

    expect(group.screen).toBe('LOGOFF');
  });

  it('has no screen name when nothing displays the group, because there is nothing to share', () => {
    const [group] = duplicateGroups(indexOf(
      file('Node1/Screens/Logoff.txt', 'aaa'),
      file('Node2/Screens/Logoff.txt', 'aaa'),
    ));

    expect(group.screen).toBeUndefined();
  });

  it('says when a whole group is displayed by nothing', () => {
    const [group] = duplicateGroups(indexOf(
      file('Node1/Screens/Logoff.txt', 'aaa'),
      file('Node2/Screens/Logoff.txt', 'aaa'),
    ));

    expect(group.anyRead).toBe(false);
    expect(group.versions[0].readership).toBe('read by nothing');
  });
});

describe('who displays a version, in one line', () => {
  it('counts scopes rather than files, so a shared file reads as its audience', () => {
    const readers = Array.from({ length: 215 }, (_, i) => reader({ id: i + 7 }));
    expect(describeReadership(readers)).toBe('read by 215 nodes');
  });

  it('names a single node rather than counting to one', () => {
    expect(describeReadership([reader({ id: 3 })])).toBe('read by node 3');
  });

  it('adds conferences and the board when they apply', () => {
    expect(describeReadership([
      reader({ id: 1 }), reader({ id: 2 }),
      reader({ scope: 'conf', id: 5 }),
      reader({ scope: 'board', id: null }),
    ])).toBe('read by 2 nodes and 1 conference and the whole board');
  });

  it('does not count a mention as a display', () => {
    // `via: 'include'` means another screen NAMES this file, not that a node
    // displays it - counting those would say a dead file has an audience.
    expect(describeReadership([])).toBe('read by nothing');
  });
});
