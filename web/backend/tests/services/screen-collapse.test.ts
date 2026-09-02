/**
 * Collapsing a board's per-node screen copies into one shared directory.
 *
 * Original AmiExpress addressed 32 nodes (axcommon.e:28 MAX_NODES=32); this
 * port addresses 255. A copy of every screen per node is an annoyance at 32
 * and unmaintainable at 255 - this project's own board carries 1,155 screen
 * files of which 34 are unique.
 *
 * AmiExpress's own answer is used rather than a new one: `SCREENS=<dir>` on
 * `Node<n>.info` points a node at a directory, and with no tooltype a node
 * reads `Node<n>/` (ACP.e:2666-2673). No symlinks, and nothing a real
 * AmiExpress could not read.
 *
 * The rule that matters: only byte-identical copies collapse, and a node that
 * keeps anything of its own keeps EVERYTHING of its own - because SCREENS
 * points a node at one directory, not at one screen.
 */

import * as path from 'path';
import { planScreenCollapse } from '../../src/services/screen-collapse';

const art = (text: string) => Buffer.from(text, 'latin1');

/** The same screen on n nodes, identical. */
function identical(name: string, nodes: number[], body = 'ART') {
  return nodes.map(n => ({ relPath: path.join(`Node${n}`, name), content: art(body) }));
}

test('one shared copy replaces the per-node ones', () => {
  const plan = planScreenCollapse(identical('LOGON.TXT', [1, 2, 3]));

  expect(plan.write.map(w => w.relPath)).toEqual([path.join('Screens', 'Node', 'LOGON.TXT')]);
  expect(plan.collapsed).toEqual([{ name: 'LOGON.TXT', copies: 3 }]);
});

test('every node is pointed at the shared directory, in AmiExpress\'s own terms', () => {
  const plan = planScreenCollapse(identical('LOGON.TXT', [1, 2, 3]));

  expect(plan.pointNodesAt).toEqual([
    { node: 1, screens: 'BBS:Screens/Node/' },
    { node: 2, screens: 'BBS:Screens/Node/' },
    { node: 3, screens: 'BBS:Screens/Node/' },
  ]);
});

test('a node that is deliberately different keeps its own, and the rest still share', () => {
  // The shared directory holds the version the most nodes have. Node 3
  // disagrees, so it goes on reading Node3/ and its file is untouched; nodes
  // 1 and 2 share theirs. Refusing to share anything because one node differs
  // would leave forty nodes maintaining forty copies for the sake of one.
  const screens = [
    ...identical('LOGON.TXT', [1, 2]),
    { relPath: path.join('Node3', 'LOGON.TXT'), content: art('NODE 3 IS SPECIAL') },
  ];

  const plan = planScreenCollapse(screens);
  const written = plan.write.map(w => w.relPath);

  expect(plan.collapsed).toEqual([{ name: 'LOGON.TXT', copies: 2 }]);
  expect(written).toContain(path.join('Screens', 'Node', 'LOGON.TXT'));
  expect(written).toContain(path.join('Node3', 'LOGON.TXT'));
  expect(plan.pointNodesAt.map(p => p.node)).toEqual([1, 2]);

  // And node 3's own art is the art it had, not the shared one.
  const node3 = plan.write.find(w => w.relPath === path.join('Node3', 'LOGON.TXT'))!;
  expect(node3.content.toString('latin1')).toBe('NODE 3 IS SPECIAL');
});

test('a node that keeps one screen keeps ALL of its screens', () => {
  // SCREENS points a node at ONE directory. If node 3 reads Node3/ because
  // its LOGON differs, its BBSTITLE has to be there too - sharing the others
  // would take them away from it.
  const screens = [
    ...identical('BBSTITLE.txt', [1, 2, 3]),
    ...identical('LOGON.TXT', [1, 2]),
    { relPath: path.join('Node3', 'LOGON.TXT'), content: art('DIFFERENT') },
  ];

  const plan = planScreenCollapse(screens);
  const written = plan.write.map(w => w.relPath);

  expect(written).toContain(path.join('Screens', 'Node', 'BBSTITLE.txt'));
  expect(written).toContain(path.join('Node3', 'BBSTITLE.txt'));
  expect(plan.pointNodesAt.map(p => p.node)).toEqual([1, 2]);
});

test('a screen only one node has is not duplication and is left where it is', () => {
  const plan = planScreenCollapse([
    { relPath: path.join('Node7', 'ONLY.TXT'), content: art('ART') },
  ]);

  expect(plan.collapsed).toEqual([]);
  expect(plan.write.map(w => w.relPath)).toEqual([path.join('Node7', 'ONLY.TXT')]);
});

test('conference and board screens are never touched', () => {
  const plan = planScreenCollapse([
    ...identical('LOGON.TXT', [1, 2]),
    { relPath: path.join('Conf2', 'Screens', 'Menu.txt'), content: art('MENU') },
    { relPath: path.join('Screens', 'uprough.txt'), content: art('LOGO') },
  ]);

  const written = plan.write.map(w => w.relPath);
  expect(written).toContain(path.join('Conf2', 'Screens', 'Menu.txt'));
  expect(written).toContain(path.join('Screens', 'uprough.txt'));
});

test('names match case-insensitively, because the Amiga\'s filesystem does', () => {
  const plan = planScreenCollapse([
    { relPath: path.join('Node1', 'Logon.txt'), content: art('ART') },
    { relPath: path.join('Node2', 'LOGON.TXT'), content: art('ART') },
  ]);

  expect(plan.collapsed).toHaveLength(1);
});

test('collapsing keeps the bytes exactly, including high-bit art', () => {
  const bytes = Buffer.from([0x1b, 0x5b, 0x33, 0x31, 0x6d, 0xa1, 0xb0, 0xdb]);
  const plan = planScreenCollapse([
    { relPath: path.join('Node1', 'LOGON.TXT'), content: bytes },
    { relPath: path.join('Node2', 'LOGON.TXT'), content: bytes },
  ]);

  expect(plan.write[0].content.equals(bytes)).toBe(true);
});

test('a node keeping a screen only IT has is not pointed away from it', () => {
  // Found by review: a screen one node has is written back to Node<n>/, but
  // that node was still pointed at the shared directory - where its screen is
  // not. SCREENS points a node at ONE directory, so it would simply stop
  // seeing it.
  const screens = [
    ...identical('LOGON.TXT', [1, 2]),
    { relPath: path.join('Node1', 'ONLY_MINE.TXT'), content: art('NODE 1 EXTRA') },
  ];

  const plan = planScreenCollapse(screens);
  const written = plan.write.map(w => w.relPath);

  expect(written).toContain(path.join('Node1', 'ONLY_MINE.TXT'));
  // Node 1 must go on reading its own directory, and therefore keep its LOGON
  // there too.
  expect(plan.pointNodesAt.map(p => p.node)).not.toContain(1);
  expect(written).toContain(path.join('Node1', 'LOGON.TXT'));
});

test('nothing to collapse means nothing is pointed anywhere', () => {
  const plan = planScreenCollapse([
    { relPath: path.join('Screens', 'uprough.txt'), content: art('LOGO') },
  ]);

  expect(plan.pointNodesAt).toEqual([]);
  expect(plan.collapsed).toEqual([]);
});
