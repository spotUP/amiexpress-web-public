/**
 * A collapsed node still holds its old screens, and nothing can read them.
 *
 * A node reads ONE directory - its own, or whatever `SCREENS` names. When the
 * board is collapsed onto `Screens/Node`, every file left in `Node<n>/` goes
 * dark: the loader never looks there again. Measured on the live board,
 * 2026-09-08: 249 nodes read the shared directory and their own directories
 * still hold 238 files identical to what they read and 264 that differ.
 *
 * That is not cosmetic. Those files look like art in the admin, a sysop can
 * open one and edit it, and nothing will ever serve what he drew - which is
 * exactly how an evening went into "i uploaded a petscii bbs title now but it
 * doesnt display".
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { planNodeScreenSweep, sweepRedundantNodeScreens } from '../../src/screens/node-screen-sweep';

let root: string;

const write = (rel: string, body: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body, 'latin1');
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'node-sweep-'));

  // The shared directory the collapsed nodes read.
  write('Screens/Node/BBSTITLE.txt', 'the shared title\r\n');
  write('Screens/Node/Logon.txt', '~\r\n');

  // Node 1: pointed at the shared directory, and still holding three files -
  // one identical to what it reads, one with different art, one the shared
  // directory has never heard of.
  write('Node1/.keep', '');
  fs.writeFileSync(path.join(root, 'Node1.info'), 'SCREENS=BBS:Screens/Node/\n');
  write('Node1/BBSTITLE.txt', 'the shared title\r\n');
  write('Node1/Logon.txt', '~\r\n\r\n~CC_wall|\r\n');
  write('Node1/OWNART.txt', 'nobody else has this\r\n');
  // Not a screen: runtime state, and none of this may touch it.
  write('Node1/CallersLog', 'somebody called\r\n');

  // Node 2: no tooltype, so it reads its own directory. Nothing is stranded.
  write('Node2/BBSTITLE.txt', 'node two draws its own\r\n');
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

test('a file identical to what the node now reads is redundant', () => {
  const plan = planNodeScreenSweep(root);

  expect(plan.pointedNodes).toEqual([1]);
  expect(plan.redundant.map(f => f.relPath)).toEqual([path.join('Node1', 'BBSTITLE.txt')]);
  expect(plan.redundant[0].readsInstead).toBe(path.join('Screens', 'Node', 'BBSTITLE.txt'));
});

test('a file with different bytes is ORPHANED, never proposed for deletion', () => {
  const plan = planNodeScreenSweep(root);

  const orphans = plan.orphaned.map(f => f.relPath).sort();
  // node 1 runs a door at logon that the shared copy does not; and OWNART
  // exists nowhere else. Both are art or behaviour somebody would lose.
  expect(orphans).toEqual([path.join('Node1', 'Logon.txt'), path.join('Node1', 'OWNART.txt')].sort());
});

test('a node that reads its own directory has nothing stranded', () => {
  const plan = planNodeScreenSweep(root);

  expect(plan.pointedNodes).not.toContain(2);
  expect([...plan.redundant, ...plan.orphaned].some(f => f.node === 2)).toBe(false);
});

test('the sweep removes the redundant copies and NOTHING else', () => {
  const plan = planNodeScreenSweep(root);
  const removed = sweepRedundantNodeScreens(root, plan);

  expect(removed).toEqual([path.join('Node1', 'BBSTITLE.txt')]);
  expect(fs.existsSync(path.join(root, 'Node1', 'BBSTITLE.txt'))).toBe(false);
  // The two that differ, the runtime state, and the shared copy itself.
  expect(fs.existsSync(path.join(root, 'Node1', 'Logon.txt'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'Node1', 'OWNART.txt'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'Node1', 'CallersLog'))).toBe(true);
  expect(fs.readFileSync(path.join(root, 'Screens', 'Node', 'BBSTITLE.txt'), 'latin1'))
    .toBe('the shared title\r\n');
});

test('a board with no nodes at all is not an error', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-nodes-'));
  try {
    const plan = planNodeScreenSweep(empty);
    expect(plan).toEqual({ pointedNodes: [], redundant: [], orphaned: [], orphanGroups: [] });
  } finally {
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('identical orphans are ONE decision, not thirty-four', () => {
  // What the live board holds: the same stale generation left in many nodes.
  for (const node of [3, 4, 5]) {
    write(`Node${node}/.keep`, '');
    fs.writeFileSync(path.join(root, `Node${node}.info`), 'SCREENS=BBS:Screens/Node/\n');
    write(`Node${node}/BBSTITLE.txt`, 'last years title\r\n');
  }

  const plan = planNodeScreenSweep(root);
  const stale = plan.orphanGroups.find(g => g.name.toLowerCase() === 'bbstitle.txt');

  expect(stale?.copies).toBe(3);
  expect(stale?.nodes).toEqual([3, 4, 5]);
  expect(stale?.sample).toBe(path.join('Node3', 'BBSTITLE.txt'));
  // Node 1's Logon.txt is its own thing and stays a group of one.
  expect(plan.orphanGroups.find(g => g.name.toLowerCase() === 'logon.txt')?.copies).toBe(1);
});
