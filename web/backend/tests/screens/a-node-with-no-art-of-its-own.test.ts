/**
 * THE SHARED NODE DIRECTORY IS THE FLOOR UNDER EVERY NODE.
 *
 * The image collapses node screens: 544 files that are 16 distinct screens
 * move into `Screens/Node/`, and each `Node<n>.info` is given
 * `SCREENS=BBS:Screens/Node/`. A board built after that reads the shared
 * directory. A board built BEFORE it keeps node icons with no such tooltype,
 * so the resolver answers `Node<n>/` and everything the image ships only in
 * the shared directory is invisible.
 *
 * That is what happened to the 239 generated PETSCII screens on 2026-09-16:
 * they were in `Screens/Node/` on the live volume and no C64 caller could
 * reach one. Mirroring them into 71 node directories by hand fixed the nodes
 * that existed; it does nothing for the next node the board creates.
 *
 * So the shared directory is searched LAST, under the node's own: a node with
 * its own art keeps it, and only a screen the node does not have falls
 * through.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { screenSearchLocations } from '../../src/screens/screen-resolution';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-node-'));
  fs.mkdirSync(path.join(root, 'Node1'), { recursive: true });
  fs.mkdirSync(path.join(root, 'Screens', 'Node'), { recursive: true });
});

const dirsFor = (nodeId: number) =>
  screenSearchLocations(root, 'BBSTITLE', { nodeId }).map((l) => path.resolve(l.dir));

describe('where a node screen is looked for', () => {
  it('ends at the directory every node shares', () => {
    const dirs = dirsFor(1);
    // RED before the fix: the list stopped at Node1.
    expect(dirs).toContain(path.resolve(root, 'Screens', 'Node'));
  });

  it('puts the node\'s own directory FIRST, so its own art is never shadowed', () => {
    const dirs = dirsFor(1);
    expect(dirs.indexOf(path.resolve(root, 'Node1')))
      .toBeLessThan(dirs.indexOf(path.resolve(root, 'Screens', 'Node')));
  });

  it('covers a node directory that does not exist yet', () => {
    // The next node the board creates has no directory at all, and its caller
    // still has screens to read.
    expect(dirsFor(42)).toContain(path.resolve(root, 'Screens', 'Node'));
  });

  it('names it once when a node icon already points there', () => {
    fs.writeFileSync(
      path.join(root, 'Node2.info'),
      'SCREENS=BBS:Screens/Node/\n',
      'latin1',
    );
    const dirs = dirsFor(2);
    const shared = dirs.filter((d) => d === path.resolve(root, 'Screens', 'Node'));
    expect(shared).toHaveLength(1);
  });
});
